const { getMetaTab, CDPClient } = require('./cdp_helper');

async function inspectHistoryItem() {
  const tab = await getMetaTab();
  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();

  const historyLink = await client.evaluate(`
    (() => {
      const a = Array.from(document.querySelectorAll('a')).find(el => el.innerText.includes('Barbarian warrior facing'));
      return a ? a.href : null;
    })()
  `);
  console.log('History link:', historyLink);

  if (historyLink) {
    await client.send('Page.navigate', { url: historyLink });
    await new Promise(r => setTimeout(r, 4000));

    const imgs = await client.evaluate(`
      (() => {
        return Array.from(document.querySelectorAll('img')).map(i => ({ src: i.src, w: i.naturalWidth, h: i.naturalHeight }));
      })()
    `);
    console.log('Images in Barbarian warrior thread:', imgs);
  }

  client.close();
}

inspectHistoryItem().catch(console.error);
