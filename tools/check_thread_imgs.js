const { getMetaTab, CDPClient } = require('./cdp_helper');

async function checkThread() {
  const tab = await getMetaTab();
  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();
  const imgs = await client.evaluate(`
    (() => {
      return Array.from(document.querySelectorAll('img'))
        .filter(i => i.src.includes('scontent') && i.src.includes('.webp'))
        .map((i, idx) => ({ idx, width: i.naturalWidth, src: i.src }));
    })()
  `);
  console.log('Total images in Meta AI thread:', imgs.length);
  imgs.slice(-10).forEach(i => console.log(i.idx, i.width, i.src.slice(0, 80)));
  client.close();
}

checkThread().catch(console.error);

