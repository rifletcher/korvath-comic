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

async function renderSinglePanel(panelId) {
  const rootDir = path.join(__dirname, '..');
  const epFile = path.join(rootDir, '01_Script', 'episodes', 'episode_02.json');
  const ep = JSON.parse(fs.readFileSync(epFile, 'utf8'));
  const p = ep.find(x => x.panelId === panelId);

  if (!p) throw new Error(`Panel #${panelId} not found in episode_02.json`);

  const outDir = path.join(rootDir, '02_Assets', 'Episode_02_meta', 'selected');
  fs.mkdirSync(outDir, { recursive: true });
  const pad = String(panelId).padStart(2, '0');
  const outFile = path.join(outDir, `panel_${pad}.webp`);
  const docsDir = path.join(rootDir, 'docs', 'assets', 'ep2_meta');
  fs.mkdirSync(docsDir, { recursive: true });
  const docsFile = path.join(docsDir, `panel_${pad}.webp`);

  const existingHashes = getAllExistingHashes();
  if (fs.existsSync(outFile)) {
    const curHash = crypto.createHash('md5').update(fs.readFileSync(outFile)).digest('hex');
    existingHashes.delete(curHash);
  }

  const { sanitized, modified, modifications } = sanitizePromptForMetaAI(p.prompt);

  console.log(`\n======================================================`);
  console.log(`🎬 RENDERING EPISODE 2 — PANEL #${panelId}: "${p.beat?.name || 'Scene'}"`);
  console.log(`Action: ${p.action}`);
  console.log(`Caption: ${p.caption}`);
  console.log(`======================================================`);
  if (modified) {
    console.log(`🛡️ Sanitized ${modifications.length} trigger tokens: ${modifications.join(', ')}`);
  }

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

    // 2. Click editor at (500, 615)
    console.log('🎯 Focusing Lexical composer via mouse click...');
    await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 500, y: 615, button: 'left', clickCount: 1 });
    await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 500, y: 615, button: 'left', clickCount: 1 });
    await new Promise(r => setTimeout(r, 200));

    // Clear any leftover text
    await client.evaluate(`
      (() => {
        const el = document.querySelector('div[data-testid="composer-input"][contenteditable="true"]');
        if (el) {
          el.focus();
          document.execCommand('selectAll', false, null);
        }
      })()
    `);
    await client.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
    await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
    await new Promise(r => setTimeout(r, 150));

    // 3. Insert prompt via CDP
    const promptText = `/imagine ${sanitized}`;
    console.log(`📝 Inserting prompt (${promptText.length} chars)...`);
    await client.send('Input.insertText', { text: promptText });
    await new Promise(r => setTimeout(r, 400));

    // 4. Click Send button
    const sent = await client.evaluate(`
      (() => {
        const btn = document.querySelector('button[aria-label="Send"]');
        if (btn && !btn.disabled) {
          btn.click();
          return { clicked: true };
        }
        return { clicked: false, disabled: btn ? btn.disabled : null };
      })()
    `);
    console.log('Send button status:', sent);

    if (!sent.clicked) {
      console.log('⚠️ Send button was disabled or not found, sending Enter key...');
      await client.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', windowsVirtualKeyCode: 13, unmodifiedText: '\r', text: '\r' });
      await client.send('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 13 });
    }

    console.log('⏳ Waiting for Meta AI image synthesis...');
    const startTime = Date.now();
    let approvedBase64 = null;
    let refusalReason = null;

    const preJson = JSON.stringify(preFlightUrls);

    while (Date.now() - startTime < 90000) {
      await new Promise(r => setTimeout(r, 2500));

      // Wait at least 7 seconds
      if (Date.now() - startTime < 7000) {
        process.stdout.write('.');
        continue;
      }

      // Check for safety refusal
      const refusalCheck = await client.evaluate(`
        (() => {
          const textElements = Array.from(document.querySelectorAll('div[dir="auto"], p'));
          const lastTexts = textElements.slice(-6).map(t => t.innerText.trim()).filter(Boolean);
          const refusal = lastTexts.find(t => 
            t.includes("I can't generate that") || 
            t.includes("I wasn't able to generate") || 
            t.includes("against our policies") || 
            t.includes("I can't create that") ||
            t.includes("I cannot generate")
          );
          return refusal || null;
        })()
      `);

      if (refusalCheck) {
        refusalReason = refusalCheck;
        console.error(`\n⚠️ Meta AI Refusal detected: "${refusalReason}"`);
        break;
      }

      // Look for newly generated image
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
        // Fetch candidate as base64
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
            console.log(`\n⚠️ Duplicate hash detected (${hash.slice(0, 8)}). Waiting for fresh render...`);
            continue;
          }

          approvedBase64 = base64;
          console.log(`\n✨ Candidate approved! Hash: ${hash.slice(0, 8)}, Size: ${(buf.length / 1024).toFixed(1)} KB`);
          break;
        }
      }
      process.stdout.write('.');
    }

    if (refusalReason) {
      throw new Error(`Refusal: ${refusalReason}`);
    }

    if (!approvedBase64) {
      throw new Error(`Timeout waiting for Panel #${panelId} generation`);
    }

    // Write file
    const buf = Buffer.from(approvedBase64, 'base64');
    fs.writeFileSync(outFile, buf);
    fs.writeFileSync(docsFile, buf);
    console.log(`✅ [SAVED]: Panel #${pad} (${(buf.length / 1024).toFixed(1)} KB) -> ${outFile}`);
    return true;
  } finally {
    client.close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const targetPanels = args.length > 0 ? args.map(Number) : [5, 8, 10, 11, 12, 14, 17, 18, 20];

  console.log(`⚔️ STARTING EPISODE 2 MISSING PANELS RENDER: [${targetPanels.join(', ')}]`);

  for (const panelId of targetPanels) {
    let success = false;
    let attempts = 0;
    while (!success && attempts < 3) {
      attempts++;
      try {
        console.log(`\n▶️ [Attempt ${attempts}] Rendering Panel ${panelId}...`);
        await renderSinglePanel(panelId);
        success = true;
      } catch (err) {
        console.error(`❌ Error on Panel ${panelId}:`, err.message);
        if (attempts < 3) {
          console.log(`Waiting 6 seconds before retry...`);
          await new Promise(r => setTimeout(r, 6000));
        }
      }
    }
    if (!success) {
      console.error(`💥 Failed to render Panel ${panelId} after 3 attempts. Stopping.`);
      process.exit(1);
    }
    console.log(`⏸️ Cooling down for 4s before next panel...`);
    await new Promise(r => setTimeout(r, 4000));
  }

  console.log(`\n🎉 ALL TARGET PANELS SUCCESSFULLY RENDERED!`);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { renderSinglePanel };
