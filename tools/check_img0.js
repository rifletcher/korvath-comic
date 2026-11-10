const fs = require('fs');
const { getMetaTab, CDPClient } = require('./cdp_helper');

async function main() {
  const tab = await getMetaTab();
  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();
  const imgs = await client.evaluate(`
    (() => {
      const imgs = Array.from(document.querySelectorAll('img'))
        .filter(i => i.src.includes('scontent') && i.src.includes('.webp') && i.naturalWidth >= 1000);
      return imgs.map(i => ({ src: i.src, alt: i.alt }));
    })()
  `);
  console.log('Imgs found:', imgs);
  if (imgs && imgs.length > 0) {
    const base64 = await client.evaluate(`
      (async () => {
        const res = await fetch("${imgs[0].src}");
        const blob = await res.blob();
        return new Promise(resolve => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result.split(',')[1]);
          reader.readAsDataURL(blob);
        });
      })()
    `);
    fs.writeFileSync('temp_thread_img0.webp', Buffer.from(base64, 'base64'));
    console.log('Saved temp_thread_img0.webp');
  }
  client.close();
}

main().catch(console.error);

