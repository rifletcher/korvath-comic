const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getMetaTab, CDPClient } = require('./cdp_helper');
const { sanitizePromptForMetaAI } = require('./meta_engine');

async function renderFreshPanel(episodeNum, panelId) {
  const epFile = path.join(__dirname, '..', '01_Script', 'episodes', `episode_${String(episodeNum).padStart(2, '0')}.json`);
  const ep = JSON.parse(fs.readFileSync(epFile, 'utf8'));
  const p = ep.find(x => x.panelId === panelId);
  if (!p) throw new Error(`Panel #${panelId} not found`);

  const { sanitized } = sanitizePromptForMetaAI(p.prompt);
  const promptText = `/imagine ${sanitized}`;

  const tab = await getMetaTab();
  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();

  console.log(`\n======================================================`);
  console.log(`🎬 CLEAN-SESSION RENDER: EPISODE ${episodeNum} — PANEL #${panelId}`);
  console.log(`Scene: "${p.beat?.name}"`);
  console.log(`======================================================`);

  try {
    console.log('🔄 Navigating to clean Meta AI session...');
    await client.send('Page.navigate', { url: 'https://www.meta.ai/' });
    await new Promise(r => setTimeout(r, 4000));

    // Focus input composer
    const focused = await client.evaluate(`
      (() => {
        const textarea = document.querySelector('textarea, div[contenteditable="true"]');
        if (textarea) {
          textarea.focus();
          return true;
        }
        return false;
      })()
    `);

    if (!focused) {
      await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 550, y: 630, button: 'left', clickCount: 1 });
      await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 550, y: 630, button: 'left', clickCount: 1 });
      await new Promise(r => setTimeout(r, 400));
    }

    console.log(`📝 Dispatching verified prompt (${promptText.length} chars)...`);
    await client.send('Input.insertText', { text: promptText });
    await new Promise(r => setTimeout(r, 800));

    // Submit
    const clicked = await client.evaluate(`
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

    if (!clicked) {
      console.log('Pressing Enter...');
      await client.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', windowsVirtualKeyCode: 13, text: '\r', unmodifiedText: '\r' });
      await client.send('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 13 });
    }

    console.log('⏳ Waiting for generated image in clean session...');
    const startTime = Date.now();
    let foundUrl = null;

    while (Date.now() - startTime < 75000) {
      await new Promise(r => setTimeout(r, 2500));
      if (Date.now() - startTime < 8000) {
        process.stdout.write('.');
        continue;
      }

      const imgUrl = await client.evaluate(`
        (() => {
          const imgs = Array.from(document.querySelectorAll('img'))
            .filter(i => i.src.includes('scontent') && i.src.includes('.webp') && i.naturalWidth >= 1000);
          return imgs.length > 0 ? imgs[imgs.length - 1].src : null;
        })()
      `);

      if (imgUrl) {
        foundUrl = imgUrl;
        console.log('\n✨ Image generated successfully!');
        break;
      }
      process.stdout.write('.');
    }

    if (!foundUrl) {
      const errMsgs = await client.evaluate(`
        (() => {
          return Array.from(document.querySelectorAll('div[dir="auto"], p'))
            .map(p => p.innerText.trim())
            .filter(t => t.length > 10)
            .slice(-3);
        })()
      `);
      console.log('\nMeta AI response:', errMsgs);
      throw new Error(`Timeout: No image generated for Panel #${panelId}`);
    }

    // Fetch as base64
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
      throw new Error(`Failed to download image data for Panel #${panelId}`);
    }

    const pad = String(panelId).padStart(2, '0');
    const outFile = path.join(__dirname, '..', '02_Assets', `Episode_${String(episodeNum).padStart(2, '0')}_meta`, 'selected', `panel_${pad}.webp`);
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, Buffer.from(base64, 'base64'));

    const docsFile = path.join(__dirname, '..', 'docs', 'assets', `ep${episodeNum}_meta`, `panel_${pad}.webp`);
    fs.mkdirSync(path.dirname(docsFile), { recursive: true });
    fs.copyFileSync(outFile, docsFile);

    const sz = (fs.statSync(outFile).size / 1024).toFixed(1);
    console.log(`✅ [CLEAN-SESSION APPROVED]: Panel #${panelId} saved (${sz} KB) -> ${outFile}`);
    return outFile;
  } finally {
    client.close();
  }
}

if (require.main === module) {
  const ep = parseInt(process.argv[2] || '2', 10);
  const p = parseInt(process.argv[3] || '4', 10);
  renderFreshPanel(ep, p).catch(console.error);
}

module.exports = { renderFreshPanel };

