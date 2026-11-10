const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getMetaTab, CDPClient } = require('./cdp_helper');
const { sanitizePromptForMetaAI } = require('./meta_engine');

function getAllExistingHashes() {
  const hashes = new Set();
  const searchDirs = [
    path.join(__dirname, '..', '02_Assets', 'Episode_01_meta', 'selected'),
    path.join(__dirname, '..', '02_Assets', 'Episode_02_meta', 'selected')
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

async function renderPanel(panelId) {
  const rootDir = path.join(__dirname, '..');
  const epFile = path.join(rootDir, '01_Script', 'episodes', 'episode_02.json');
  const ep = JSON.parse(fs.readFileSync(epFile, 'utf8'));
  const p = ep.find(x => x.panelId === panelId);

  if (!p) throw new Error(`Panel #${panelId} not found in episode_02.json`);

  const pad = String(panelId).padStart(2, '0');
  const outFile = path.join(rootDir, '02_Assets', 'Episode_02_meta', 'selected', `panel_${pad}.webp`);
  const docsFile = path.join(rootDir, 'docs', 'assets', 'ep2_meta', `panel_${pad}.webp`);

  const existingHashes = getAllExistingHashes();
  if (fs.existsSync(outFile)) {
    const curHash = crypto.createHash('md5').update(fs.readFileSync(outFile)).digest('hex');
    existingHashes.delete(curHash);
  }

  const { sanitized } = sanitizePromptForMetaAI(p.prompt);

  console.log(`\n======================================================`);
  console.log(`🎬 BULLETPROOF RENDER: EPISODE 2 — PANEL #${panelId}: "${p.beat?.name}"`);
  console.log(`Caption: ${p.caption}`);
  console.log(`======================================================`);

  const tab = await getMetaTab();
  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();

  try {
    // 1. Snapshot existing image URLs
    const preFlightUrls = await client.evaluate(`
      (() => {
        const imgs = Array.from(document.querySelectorAll('img'))
          .filter(i => (i.src.includes('scontent') || i.src.includes('fbcdn.net')) && i.naturalWidth >= 500);
        return imgs.map(i => i.src);
      })()
    `) || [];
    console.log(`📸 Pre-flight snapshot: ${preFlightUrls.length} existing images registered in thread.`);

    // 2. Clear composer and focus
    await client.evaluate(`
      (() => {
        const el = document.querySelector('div[contenteditable="true"]');
        if (el) {
          el.focus();
          document.execCommand('selectAll', false, null);
        }
      })()
    `);
    await client.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
    await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
    await new Promise(r => setTimeout(r, 200));

    // 3. Insert prompt via CDP
    const promptText = `/imagine ${sanitized}`;
    console.log(`📝 Inserting prompt (${promptText.length} chars)...`);
    await client.send('Input.insertText', { text: promptText });
    await new Promise(r => setTimeout(r, 600));

    // 4. Click Send button directly
    const sent = await client.evaluate(`
      (() => {
        const btn = document.querySelector('button[aria-label="Send"]');
        if (btn && !btn.disabled) {
          btn.click();
          return { clicked: true };
        }
        return { clicked: false, disabled: btn ? btn.disabled : 'not_found' };
      })()
    `);
    console.log('Send button status:', sent);

    if (!sent.clicked) {
      throw new Error(`Send button failed to click: ${JSON.stringify(sent)}`);
    }

    console.log('⏳ Waiting for Meta AI image synthesis...');
    const startTime = Date.now();
    let approvedBase64 = null;
    const preJson = JSON.stringify(preFlightUrls);

    while (Date.now() - startTime < 90000) {
      await new Promise(r => setTimeout(r, 2500));

      if (Date.now() - startTime < 8000) {
        process.stdout.write('.');
        continue;
      }

      // Check for newly generated image
      const candidateUrl = await client.evaluate(`
        (() => {
          const pre = new Set(${preJson});
          const imgs = Array.from(document.querySelectorAll('img'))
            .filter(i => (i.src.includes('scontent') || i.src.includes('fbcdn.net')) && i.naturalWidth >= 1000);
          const newOnes = imgs.filter(i => !pre.has(i.src));
          if (newOnes.length > 0) {
            return newOnes[newOnes.length - 1].src;
          }
          return null;
        })()
      `);

      if (candidateUrl) {
        const base64 = await client.evaluate(`
          (async () => {
            try {
              const res = await fetch("${candidateUrl}");
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

          if (existingHashes.has(hash)) {
            console.log(`\n⚠️ Duplicate hash (${hash.slice(0, 8)}). Waiting...`);
            continue;
          }

          approvedBase64 = base64;
          console.log(`\n✨ Candidate approved! Hash: ${hash.slice(0, 8)}, Size: ${(buf.length / 1024).toFixed(1)} KB`);
          break;
        }
      }
      process.stdout.write('.');
    }

    if (!approvedBase64) {
      throw new Error(`Timeout waiting for Panel #${panelId} generation`);
    }

    const buf = Buffer.from(approvedBase64, 'base64');
    fs.writeFileSync(outFile, buf);
    fs.writeFileSync(docsFile, buf);
    console.log(`✅ [SAVED]: Panel #${pad} (${(buf.length / 1024).toFixed(1)} KB) -> ${outFile}`);
    return true;
  } finally {
    await client.close();
  }
}

async function main() {
  const args = process.argv.slice(2).map(Number);
  const targets = args.length > 0 ? args : [1, 10, 12, 18];

  for (const pid of targets) {
    let success = false;
    let attempt = 0;
    while (!success && attempt < 3) {
      attempt++;
      try {
        await renderPanel(pid);
        success = true;
      } catch (e) {
        console.error(`❌ Attempt ${attempt} failed for Panel ${pid}:`, e.message);
        await new Promise(r => setTimeout(r, 5000));
      }
    }
    if (!success) {
      console.error(`💥 Failed Panel ${pid}`);
      process.exit(1);
    }
    console.log('⏸️ Cooldown 4s...');
    await new Promise(r => setTimeout(r, 4000));
  }
  console.log('\n🎉 ALL REQUESTED PANELS RENDERED CLEANLY!');
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { renderPanel };

