const fs = require('fs');
const path = require('path');
const { getMetaTab, CDPClient } = require('./cdp_helper');
const { sanitizePromptForMetaAI } = require('./meta_engine');

async function testRenderPanel10() {
  const ep = JSON.parse(fs.readFileSync('01_Script/episodes/episode_02.json', 'utf8'));
  const p10 = ep.find(x => x.panelId === 10);
  const { sanitized } = sanitizePromptForMetaAI(p10.prompt);

  const tab = await getMetaTab();
  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();

  console.log('Navigating to clean https://www.meta.ai/ ...');
  await client.send('Page.navigate', { url: 'https://www.meta.ai/' });
  await new Promise(r => setTimeout(r, 4000));

  console.log('Typing prompt for Panel 10 (Caught in the Web)...');
  await client.evaluate(`
    (() => {
      const textarea = document.querySelector('textarea, div[contenteditable="true"]');
      if (!textarea) throw new Error('No input box found');
      textarea.focus();
    })()
  `);

  await client.send('Input.insertText', { text: sanitized });
  await new Promise(r => setTimeout(r, 800));

  await client.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', windowsVirtualKeyCode: 13, text: '\r' });
  await client.send('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 13 });

  console.log('Prompt dispatched! Waiting for generated image...');
  const start = Date.now();
  let foundUrl = null;

  while (Date.now() - start < 60000) {
    await new Promise(r => setTimeout(r, 2000));
    if (Date.now() - start < 8000) {
      process.stdout.write('.');
      continue;
    }

    const img = await client.evaluate(`
      (() => {
        const imgs = Array.from(document.querySelectorAll('img'))
          .filter(i => i.src.includes('scontent') && i.src.includes('.webp') && i.naturalWidth >= 1000);
        return imgs.length > 0 ? imgs[0].src : null;
      })()
    `);

    if (img) {
      foundUrl = img;
      console.log('\nFound genuine image URL:', img.slice(0, 80));
      break;
    }
    process.stdout.write('.');
  }

  if (foundUrl) {
    const base64 = await client.evaluate(`
      (async () => {
        const res = await fetch("${foundUrl}");
        const blob = await res.blob();
        return new Promise(resolve => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result.split(',')[1]);
          reader.readAsDataURL(blob);
        });
      })()
    `);

    fs.writeFileSync('02_Assets/Episode_02_meta/selected/panel_10.webp', Buffer.from(base64, 'base64'));
    fs.copyFileSync('02_Assets/Episode_02_meta/selected/panel_10.webp', 'docs/assets/ep2_meta/panel_10.webp');
    console.log('Saved genuine Panel 10!');
  } else {
    console.log('No image found!');
  }

  client.close();
}

testRenderPanel10().catch(console.error);

