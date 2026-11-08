const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getMetaTab, CDPClient } = require('./cdp_helper');
const { sanitizePromptForMetaAI } = require('./meta_engine');

async function renderPanelClean(client, epNum, panelId) {
  const rootDir = path.join(__dirname, '..');
  const epFile = path.join(rootDir, '01_Script', 'episodes', `episode_${String(epNum).padStart(2, '0')}.json`);
  const ep = JSON.parse(fs.readFileSync(epFile, 'utf8'));
  const p = ep.find(x => x.panelId === panelId);
  if (!p) throw new Error(`Panel #${panelId} not found in episode_${epNum}.json`);

  const pad = String(panelId).padStart(2, '0');
  const outDir = path.join(rootDir, '02_Assets', `Episode_${String(epNum).padStart(2, '0')}_meta`, 'selected');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `panel_${pad}.webp`);
  const docsDir = path.join(rootDir, 'docs', 'assets', `ep${epNum}_meta`);
  fs.mkdirSync(docsDir, { recursive: true });
  const docsFile = path.join(docsDir, `panel_${pad}.webp`);

  const { sanitized, modified, modifications } = sanitizePromptForMetaAI(p.prompt);
  const promptText = `/imagine ${sanitized}`;

  console.log(`\n======================================================`);
  console.log(`🎬 RENDER GATE: EPISODE ${epNum} — PANEL #${panelId} [${p.beat?.name || 'Scene'}]`);
  console.log(`Action: "${p.action?.slice(0, 80)}..."`);
  console.log(`======================================================`);
  if (modified) {
    console.log(`🛡️ Sanitized ${modifications.length} trigger tokens: ${modifications.join(', ')}`);
  }

  // 1. Open new clean chat
  console.log('🔄 Opening fresh Meta AI chat session...');
  await client.send('Page.navigate', { url: 'https://www.meta.ai/?new=1' });
  await new Promise(r => setTimeout(r, 3000));

  // 2. Click composer to focus
  console.log('🎯 Focusing composer input...');
  await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 550, y: 300, button: 'left', clickCount: 1 });
  await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 550, y: 300, button: 'left', clickCount: 1 });
  await new Promise(r => setTimeout(r, 400));

  // 3. Insert prompt
  console.log(`📝 Dispatching verified prompt (${promptText.length} chars)...`);
  await client.send('Input.insertText', { text: promptText });
  await new Promise(r => setTimeout(r, 800));

  // 4. Click Send
  const submitInfo = await client.evaluate(`
    (() => {
      const btn = document.querySelector('button[aria-label="Send"]');
      if (btn && !btn.disabled) {
        btn.click();
        return true;
      }
      return false;
    })()
  `);

  if (!submitInfo) {
    console.log('Clicking send via enter key...');
    await client.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', windowsVirtualKeyCode: 13, text: '\r' });
    await client.send('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 13 });
  }

  // 5. Poll for the single generated image in this clean session
  console.log('⏳ Waiting for generated image...');
  const startTime = Date.now();
  let foundUrl = null;

  while (Date.now() - startTime < 60000) {
    await new Promise(r => setTimeout(r, 2000));
    if (Date.now() - startTime < 7000) {
      process.stdout.write('.');
      continue;
    }

    const imgResult = await client.evaluate(`
      (() => {
        const imgs = Array.from(document.querySelectorAll('img'))
          .filter(i => i.src.includes('scontent') && i.src.includes('.webp') && i.naturalWidth >= 1000);
        return imgs.length > 0 ? imgs[0].src : null;
      })()
    `);

    if (imgResult) {
      foundUrl = imgResult;
      console.log('\n✨ Image generation complete!');
      break;
    }
    process.stdout.write('.');
  }

  if (!foundUrl) {
    const errorText = await client.evaluate(`
      (() => {
        return Array.from(document.querySelectorAll('div[dir="auto"], p'))
          .map(p => p.innerText.trim())
          .filter(t => t.length > 5)
          .slice(-3);
      })()
    `);
    console.log('\n⚠️ Meta AI text response:', errorText);
    throw new Error(`Timeout: No image generated for Panel #${panelId}`);
  }

  // 6. Download image as base64
  const base64 = await client.evaluate(`
    (async () => {
      try {
        const res = await fetch("${foundUrl}");
        const blob = await res.blob();
        return new Promise(resolve => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result.split(',')[1]);
          reader.readAsDataURL(blob);
        });
      } catch(e) { return null; }
    })()
  `);

  if (!base64 || base64.length < 50000) {
    throw new Error(`Failed to download image payload for Panel #${panelId}`);
  }

  const buf = Buffer.from(base64, 'base64');
  fs.writeFileSync(outFile, buf);
  fs.copyFileSync(outFile, docsFile);

  const sz = (fs.statSync(outFile).size / 1024).toFixed(1);
  const hash = crypto.createHash('md5').update(buf).digest('hex').slice(0, 8);
  console.log(`✅ [APPROVED]: Panel #${panelId} saved (${sz} KB, hash ${hash}) -> ${outFile}`);

  return outFile;
}

async function renderEpisodeRange(epNum, startPanel = 1, endPanel = 20) {
  const tab = await getMetaTab();
  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();

  console.log(`\n======================================================`);
  console.log(`🚀 STARTING AUTONOMOUS EPISODE ${epNum} RENDER [Panels ${startPanel} to ${endPanel}]`);
  console.log(`======================================================\n`);

  try {
    for (let p = startPanel; p <= endPanel; p++) {
      let attempts = 0;
      let success = false;
      while (attempts < 2 && !success) {
        attempts++;
        try {
          await renderPanelClean(client, epNum, p);
          success = true;
        } catch (err) {
          console.error(`\n❌ Error on Panel ${p} (Attempt ${attempts}): ${err.message}`);
          if (attempts < 2) {
            console.log('Retrying panel in 4 seconds...');
            await new Promise(r => setTimeout(r, 4000));
          }
        }
      }
      console.log(`⏸️ Cooling down for 3s before next panel...`);
      await new Promise(r => setTimeout(r, 3000));
    }
    console.log(`\n🎉 Episode ${epNum} generation complete! All panels rendered.`);
  } finally {
    client.close();
  }
}

if (require.main === module) {
  const ep = parseInt(process.argv[2] || '2', 10);
  const start = parseInt(process.argv[3] || '1', 10);
  const end = parseInt(process.argv[4] || '20', 10);
  renderEpisodeRange(ep, start, end).catch(console.error);
}

module.exports = { renderPanelClean, renderEpisodeRange };

