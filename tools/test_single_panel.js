const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getMetaTab, CDPClient } = require('./cdp_helper');
const { sanitizePromptForMetaAI } = require('./meta_engine');

async function renderPanelSafely(panelId) {
  const rootDir = path.join(__dirname, '..');
  const epFile = path.join(rootDir, '01_Script', 'episodes', 'episode_02.json');
  const ep = JSON.parse(fs.readFileSync(epFile, 'utf8'));
  const p = ep.find(x => x.panelId === panelId);
  if (!p) throw new Error('Panel not found');

  const { sanitized } = sanitizePromptForMetaAI(p.prompt);

  const tab = await getMetaTab();
  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();

  console.log(`\n=========================================`);
  console.log(`🛡️ SAFE RENDER DISPATCH FOR PANEL ${panelId}: "${p.beat.name}"`);
  console.log(`=========================================`);

  // 1. Wait until not generating
  console.log('1. Checking composer readiness...');
  while (true) {
    const ready = await client.evaluate(`
      (() => {
        const stop = document.querySelector('button[aria-label*="Stop" i]');
        const editor = document.querySelector('div[data-testid="composer-input"][contenteditable="true"]');
        return { isGenerating: !!stop, hasEditor: !!editor };
      })()
    `);
    if (!ready.isGenerating && ready.hasEditor) break;
    console.log('Waiting for generation/editor to settle...');
    await new Promise(r => setTimeout(r, 2000));
  }

  // 2. Snapshot existing images
  const preUrls = await client.evaluate(`
    (() => {
      const imgs = Array.from(document.querySelectorAll('img'))
        .filter(i => (i.src.includes('scontent') || i.src.includes('fbcdn.net')) && i.naturalWidth >= 500);
      return imgs.map(i => i.src);
    })()
  `) || [];
  console.log(`2. Snapshot: ${preUrls.length} existing images.`);

  // 3. Focus editor dynamically via its real rect
  const editorRect = await client.evaluate(`
    (() => {
      const el = document.querySelector('div[data-testid="composer-input"][contenteditable="true"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    })()
  `);

  const clickX = Math.round(editorRect.x + editorRect.w / 2);
  const clickY = Math.round(editorRect.y + editorRect.h / 2);
  console.log(`3. Clicking editor at (${clickX}, ${clickY})...`);

  await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: clickX, y: clickY, button: 'left', clickCount: 1 });
  await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: clickX, y: clickY, button: 'left', clickCount: 1 });
  await new Promise(r => setTimeout(r, 200));

  // Clear text
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

  // Insert prompt
  const textToType = `/imagine ${sanitized}`;
  console.log(`4. Inserting prompt (${textToType.length} chars)...`);
  await client.send('Input.insertText', { text: textToType });
  await new Promise(r => setTimeout(r, 500));

  // Click Send button
  console.log('5. Clicking Send button...');
  const sendRes = await client.evaluate(`
    (() => {
      const btn = document.querySelector('button[aria-label="Send"]');
      if (btn && !btn.disabled) {
        btn.click();
        return { clicked: true };
      }
      return { clicked: false, disabled: btn ? btn.disabled : null };
    })()
  `);
  console.log('Send result:', sendRes);

  if (!sendRes.clicked) {
    throw new Error('Failed to click Send button');
  }

  // 6. Wait at least 12 seconds before checking for candidates
  console.log('6. Waiting for generation (anti-race buffer 12s)...');
  await new Promise(r => setTimeout(r, 12000));

  let approvedBase64 = null;
  const start = Date.now();
  const preJson = JSON.stringify(preUrls);

  while (Date.now() - start < 75000) {
    await new Promise(r => setTimeout(r, 2500));

    const poll = await client.evaluate(`
      (() => {
        const pre = new Set(${preJson});
        const stop = document.querySelector('button[aria-label*="Stop" i]');
        const imgs = Array.from(document.querySelectorAll('img'))
          .filter(i => (i.src.includes('scontent') || i.src.includes('fbcdn.net')) && i.naturalWidth >= 1000);
        const newOnes = imgs.filter(i => !pre.has(i.src));
        return {
          isGenerating: !!stop,
          newUrl: newOnes.length > 0 ? newOnes[newOnes.length - 1].src : null
        };
      })()
    `);

    if (poll.newUrl) {
      console.log('\n✨ New image URL detected! Fetching base64...');
      const b64 = await client.evaluate(`
        (async () => {
          try {
            const res = await fetch("${poll.newUrl}");
            const blob = await res.blob();
            return new Promise(resolve => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result.split(',')[1]);
              reader.readAsDataURL(blob);
            });
          } catch(e) { return null; }
        })()
      `);
      if (b64 && b64.length > 50000) {
        approvedBase64 = b64;
        break;
      }
    }
    process.stdout.write('.');
  }

  if (!approvedBase64) {
    throw new Error('Timeout waiting for generated image');
  }

  const pad = String(panelId).padStart(2, '0');
  const outFile = path.join(rootDir, '02_Assets', 'Episode_02_meta', 'selected', `panel_${pad}.webp`);
  const docsFile = path.join(rootDir, 'docs', 'assets', 'ep2_meta', `panel_${pad}.webp`);
  const buf = Buffer.from(approvedBase64, 'base64');
  fs.writeFileSync(outFile, buf);
  fs.writeFileSync(docsFile, buf);
  console.log(`\n🎉 Saved Panel ${pad} (${(buf.length / 1024).toFixed(1)} KB) -> ${outFile}`);

  client.close();
}

async function main() {
  const panel = parseInt(process.argv[2] || '14', 10);
  await renderPanelSafely(panel);
}

main().catch(console.error);
