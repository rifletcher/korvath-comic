const { getMetaTab, CDPClient } = require('./cdp_helper');

async function testNewChat() {
  const tab = await getMetaTab();
  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();
  
  console.log('Navigating to https://www.meta.ai/ ...');
  await client.send('Page.navigate', { url: 'https://www.meta.ai/' });
  await new Promise(r => setTimeout(r, 4000));

  const state = await client.evaluate(`
    (() => {
      const textarea = document.querySelector('textarea, div[contenteditable="true"]');
      const imgs = document.querySelectorAll('img').length;
      return { hasInput: !!textarea, totalImgs: imgs, url: window.location.href };
    })()
  `);
  console.log('New chat state:', state);
  client.close();
}

testNewChat().catch(console.error);

