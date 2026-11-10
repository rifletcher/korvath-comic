const fs = require('fs');
const path = require('path');
const { getMetaTab, CDPClient } = require('./cdp_helper');
const { sanitizePromptForMetaAI } = require('./meta_engine');

async function testRenderOnFreshThread(panelId) {
  const ep = JSON.parse(fs.readFileSync('01_Script/episodes/episode_02.json', 'utf8'));
  const p = ep.find(x => x.panelId === panelId);
  const { sanitized } = sanitizePromptForMetaAI(p.prompt);

  const tab = await getMetaTab();
  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();

  console.log('Navigating to fresh prompt thread: https://www.meta.ai/prompt/69afed44-341b-470a-9887-663f3fd8dd17 ...');
  await client.send('Page.navigate', { url: 'https://www.meta.ai/prompt/69afed44-341b-470a-9887-663f3fd8dd17' });
  await new Promise(r => setTimeout(r, 4000));

  // Focus div[contenteditable="true"]
  console.log('Focusing Lexical editor...');
  await client.evaluate(`
    (() => {
      const el = document.querySelector('div[contenteditable="true"]');
      if (el) {
        el.focus();
        document.execCommand('selectAll', false, null);
      }
    })()
  `);
  await new Promise(r => setTimeout(r, 300));

  const promptText = `/imagine ${sanitized}`;
  console.log(`Inserting prompt (${promptText.length} chars)...`);
  await client.send('Input.insertText', { text: promptText });
  await new Promise(r => setTimeout(r, 800));

  // Click Send
  const clicked = await client.evaluate(`
    (() => {
      const btn = document.querySelector('button[aria-label="Send"]');
      if (btn && !btn.disabled) {
        btn.click();
        return true;
      }
      return false;
    })()
  `);
  console.log('Send clicked:', clicked);

  // Poll for new image
  console.log('Polling for generated image...');
  const start = Date.now();
  let imgUrl = null;

  while (Date.now() - start < 60000) {
    await new Promise(r => setTimeout(r, 2000));
    if (Date.now() - start < 8000) {
      process.stdout.write('.');
      continue;
    }

    const current = await client.evaluate(`
      (() => {
        const imgs = Array.from(document.querySelectorAll('img'))
          .filter(i => i.src.includes('scontent') && i.src.includes('.webp') && i.naturalWidth >= 1000);
        return imgs.map(i => i.src);
      })()
    `);

    // In this thread there was initially 1 image. If length > 1, the new image has landed!
    if (current && current.length > 1) {
      imgUrl = current[current.length - 1];
      console.log('\n🎉 NEW IMAGE LANDED:', imgUrl.slice(0, 80));
      break;
    }
    process.stdout.write('.');
  }

  if (imgUrl) {
    const base64 = await client.evaluate(`
      (async () => {
        const res = await fetch("${imgUrl}");
        const blob = await res.blob();
        return new Promise(resolve => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result.split(',')[1]);
          reader.readAsDataURL(blob);
        });
      })()
    `);

    const pad = String(panelId).padStart(2, '0');
    const out = path.join('02_Assets', 'Episode_02_meta', 'selected', `panel_${pad}.webp`);
    fs.writeFileSync(out, Buffer.from(base64, 'base64'));
    fs.copyFileSync(out, path.join('docs', 'assets', 'ep2_meta', `panel_${pad}.webp`));
    console.log(`✅ Saved Panel ${pad} (${(fs.statSync(out).size / 1024).toFixed(1)} KB) -> ${out}`);
  }

  client.close();
}

testRenderOnFreshThread(5).catch(console.error);

