const { getMetaTab, CDPClient } = require('./cdp_helper');

async function inspectThreadMessages() {
  const tab = await getMetaTab();
  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();
  const history = await client.evaluate(`
    (() => {
      const turns = [];
      const messages = document.querySelectorAll('div[data-testid="chat-message"], div[dir="auto"]');
      return Array.from(document.querySelectorAll('img'))
        .filter(i => i.src.includes('scontent') && i.src.includes('.webp') && i.naturalWidth >= 1000)
        .map((img, i) => {
          return {
            index: i,
            src: img.src
          };
        });
    })()
  `);
  console.log('Images in Meta AI thread:', history.length);
  client.close();
}

inspectThreadMessages().catch(console.error);

