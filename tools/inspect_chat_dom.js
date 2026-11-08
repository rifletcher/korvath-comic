const { getMetaTab, CDPClient } = require('./cdp_helper');

async function inspectChatDom() {
  const tab = await getMetaTab();
  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();

  console.log('Navigating to primed thread...');
  await client.send('Page.navigate', { url: 'https://www.meta.ai/prompt/b329915b-16ff-4553-9963-5de47475cbd2' });
  await new Promise(r => setTimeout(r, 4000));

  const domInfo = await client.evaluate(`
    (() => {
      const allImgs = Array.from(document.querySelectorAll('img')).map(i => ({
        src: i.src.slice(0, 70),
        w: i.naturalWidth,
        h: i.naturalHeight,
        alt: i.alt || '',
        parentClasses: i.parentElement ? i.parentElement.className : ''
      }));
      return { total: allImgs.length, imgs: allImgs.filter(i => i.w >= 500) };
    })()
  `);
  console.log('DOM info:', JSON.stringify(domInfo, null, 2));
  client.close();
}

inspectChatDom().catch(console.error);

