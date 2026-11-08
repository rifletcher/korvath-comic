const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getMetaTab, CDPClient } = require('./cdp_helper');
const { sanitizePromptForMetaAI } = require('./meta_engine');

const PRIMED_THREAD_URL = process.env.META_THREAD_URL || 'https://www.meta.ai/prompt/69afed44-341b-470a-9887-663f3fd8dd17';

function getAllExistingHashes(rootDir) {
  const hashes = new Set();
  const searchDirs = [
    path.join(rootDir, '02_Assets', 'Episode_01_meta', 'selected'),
    path.join(rootDir, '02_Assets', 'Episode_02_meta', 'selected')
  ];
  for (const d of searchDirs) {
    if (fs.existsSync(d)) {
      const files = fs.readdirSync(d).filter(f => f.endsWith('.webp') || f.endsWith('.jpg'));
      for (const f of files) {
        try {
          const buf = fs.readFileSync(path.join(d, f));
          hashes.add(crypto.createHash('md5').update(buf).digest('hex'));
        } catch (e) {}
      }
    }
  }
  return hashes;
}

async function renderDirectorPanel(episodeNum, panelId, options = {}) {
  const rootDir = path.join(__dirname, '..');
  const epFile = path.join(rootDir, '01_Script', 'episodes', `episode_${String(episodeNum).padStart(2, '0')}.json`);
  const ep = JSON.parse(fs.readFileSync(epFile, 'utf8'));
  const p = ep.find(x => x.panelId === panelId);

  if (!p) throw new Error(`Panel #${panelId} not found in episode_${episodeNum}.json`);

  const outDir = path.join(rootDir, '02_Assets', `Episode_${String(episodeNum).padStart(2, '0')}_meta`, 'selected');
  fs.mkdirSync(outDir, { recursive: true });
  const pad = String(panelId).padStart(2, '0');
  const outFile = path.join(outDir, `panel_${pad}.webp`);

  const existingHashes = getAllExistingHashes(rootDir);

  const { sanitized, modified, modifications } = sanitizePromptForMetaAI(p.prompt);

  console.log(`\n======================================================`);
  console.log(`🎬 DIRECTOR RENDER GATE: EPISODE ${episodeNum} — PANEL #${panelId}`);
  console.log(`Scene: "${p.beat?.name || 'Scene'}"`);
  console.log(`Action: "${p.action}"`);
  console.log(`======================================================`);
  if (modified) {
    console.log(`🛡️ Sanitized ${modifications.length} trigger tokens: ${modifications.join(', ')}`);
  }

  const tab = await getMetaTab();
  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();

  try {
    // 0. Ensure we are in the continuous primed Frazetta thread (Protocol 3 Single-Thread Rule)
    const currentUrl = await client.evaluate('window.location.href');
    if (!currentUrl.includes(PRIMED_THREAD_URL.split('/').pop())) {
      console.log(`🔄 Navigating to primed Frazetta thread (${PRIMED_THREAD_URL})...`);
      await client.send('Page.navigate', { url: PRIMED_THREAD_URL });
      await new Promise(r => setTimeout(r, 3500));
    }

    // 1. Snapshot all existing image URLs and alt timestamps before dispatching
    const preFlightData = await client.evaluate(`
      (() => {
        const imgs = Array.from(document.querySelectorAll('img'))
          .filter(i => i.src.includes('scontent') && i.src.includes('.webp'));
        const alts = imgs.map(i => i.alt).filter(Boolean);
        const urls = imgs.map(i => i.src);
        return { alts, urls };
      })()
    `) || { alts: [], urls: [] };
    console.log(`📸 Pre-flight snapshot: ${preFlightData.urls.length} existing images registered in thread.`);

    // 2. Focus composer
    const focused = await client.evaluate(`
      (() => {
        const el = document.querySelector('div[contenteditable="true"]');
        if (el) {
          el.focus();
          document.execCommand('selectAll', false, null);
          return true;
        }
        return false;
      })()
    `);

    if (!focused) {
      // Fallback: click composer coordinates (around y=630)
      await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 550, y: 630, button: 'left', clickCount: 1 });
      await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 550, y: 630, button: 'left', clickCount: 1 });
      await new Promise(r => setTimeout(r, 300));
    }

    // Clear composer
    await client.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
    await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
    await new Promise(r => setTimeout(r, 200));

    // 3. Insert prompt via CDP Input.insertText
    const promptText = `/imagine ${sanitized}`;
    console.log(`📝 Dispatching verified prompt (${promptText.length} chars)...`);
    await client.send('Input.insertText', { text: promptText });
    await new Promise(r => setTimeout(r, 500));

    // 4. Click Send button
    const submitted = await client.evaluate(`
      (() => {
        const btn = document.querySelector('button[aria-label="Send"]') ||
                    document.querySelector('[data-testid="composer-send-button"]');
        if (btn && !btn.disabled) {
          btn.click();
          return true;
        }
        return false;
      })()
    `);

    if (!submitted) {
      console.log('Send button not directly clicked, pressing Enter...');
      await client.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', windowsVirtualKeyCode: 13, unmodifiedText: '\r', text: '\r' });
      await client.send('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 13 });
    }

    // 5. Poll for new generated image with STRICT validation
    console.log('⏳ Waiting for Meta AI generation (Director QA Watchdog)...');
    const startTime = Date.now();
    let approvedBase64 = null;
    let attempts = 0;

    const preUrlsJson = JSON.stringify(preFlightData.urls);
    const preAltsJson = JSON.stringify(preFlightData.alts);

    while (Date.now() - startTime < 90000) {
      await new Promise(r => setTimeout(r, 2500));
      attempts++;

      // Meta AI generation takes at least 8-10 seconds. Do not accept anything before 8 seconds!
      if (Date.now() - startTime < 8000) {
        process.stdout.write('.');
        continue;
      }

      const candidate = await client.evaluate(`
        (() => {
          const preUrls = ${preUrlsJson};
          const preAlts = ${preAltsJson};
          const imgs = Array.from(document.querySelectorAll('img'))
            .filter(i => i.src.includes('scontent') && i.src.includes('.webp') && i.naturalWidth >= 1000);
          const newImgs = imgs.filter(i => !preUrls.includes(i.src) && (!i.alt || !preAlts.includes(i.alt)));
          if (newImgs.length > 0) {
            const latest = newImgs[newImgs.length - 1];
            return { url: latest.src, alt: latest.alt };
          }
          return null;
        })()
      `);

      if (candidate && candidate.url) {
        // Fetch candidate as base64
        const base64 = await client.evaluate(`
          (async () => {
            try {
              const res = await fetch("${candidate.url}");
              const blob = await res.blob();
              return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result.split(',')[1]);
                reader.readAsDataURL(blob);
              });
            } catch(e) { return null; }
          })()
        `);

        if (base64 && base64.length > 50000) {
          const buf = Buffer.from(base64, 'base64');
          const hash = crypto.createHash('md5').update(buf).digest('hex');

          // Strict Hash Check: is this a duplicate of ANY panel already in the project?
          if (existingHashes.has(hash)) {
            console.log(`\n⚠️ Detected duplicate image hash (${hash.slice(0, 8)}). Waiting for genuine new render...`);
            continue;
          }

          approvedBase64 = base64;
          console.log(`\n✨ Candidate passed hash uniqueness check! (${hash.slice(0, 8)}) [${candidate.alt || 'alt'}]`);
          break;
        }
      }
      process.stdout.write('.');
    }

    if (!approvedBase64) {
      const lastText = await client.evaluate(`
        (() => {
          const msgs = Array.from(document.querySelectorAll('div[dir="auto"], p')).map(p => p.innerText.trim()).filter(t => t.length > 10);
          return msgs.slice(-2);
        })()
      `);
      console.log('\n⚠️ Last messages from Meta AI:', lastText);
      throw new Error(`Director Timeout: No unique image generated for Panel #${panelId}`);
    }

    fs.writeFileSync(outFile, Buffer.from(approvedBase64, 'base64'));
    const sz = (fs.statSync(outFile).size / 1024).toFixed(1);
    console.log(`✅ [DIRECTOR APPROVED]: Panel #${panelId} saved (${sz} KB) -> ${outFile}`);

    // Sync to docs/assets
    const docsDir = path.join(rootDir, 'docs', 'assets', `ep${episodeNum}_meta`);
    fs.mkdirSync(docsDir, { recursive: true });
    fs.copyFileSync(outFile, path.join(docsDir, `panel_${pad}.webp`));

    return outFile;
  } finally {
    client.close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const ep = parseInt(args[0] || '1', 10);

  if (args.includes('--range')) {
    const rangeIdx = args.indexOf('--range');
    const start = parseInt(args[rangeIdx + 1], 10);
    const end = parseInt(args[rangeIdx + 2], 10);

    console.log(`🚀 Starting batch render for Episode ${ep}, Panels ${start} through ${end}...`);
    for (let p = start; p <= end; p++) {
      console.log(`\n▶️ Starting Panel ${p}/${end}...`);
      try {
        await renderDirectorPanel(ep, p);
      } catch (err) {
        console.error(`❌ Failed rendering Panel ${p}:`, err.message);
        console.log(`Retrying panel ${p} in 5 seconds...`);
        await new Promise(r => setTimeout(r, 5000));
        await renderDirectorPanel(ep, p);
      }
      console.log(`⏸️ Cooling down for 4s before next panel...`);
      await new Promise(r => setTimeout(r, 4000));
    }
    console.log(`\n🎉 Episode ${ep} batch range [${start} - ${end}] complete!`);
  } else {
    const panel = parseInt(args[1] || '3', 10);
    await renderDirectorPanel(ep, panel);
    console.log('Director Panel Complete!');
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { renderDirectorPanel };
