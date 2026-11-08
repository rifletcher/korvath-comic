const { getMetaTab, CDPClient } = require('./cdp_helper');

async function testNewChatNav() {
  const tab = await getMetaTab();
  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();

  console.log('Navigating to https://www.meta.ai/?new=1 ...');
  await client.send('Page.navigate', { url: 'https://www.meta.ai/?new=1' });
  await new Promise(r => setTimeout(r, 4000));

  const state = await client.evaluate(`
    (() => {
      const el = document.querySelector('div[contenteditable="true"], textarea');
      return {
        url: window.location.href,
        hasInput: !!el,
        inputClasses: el ? el.className : 'NONE',
        title: document.title
      };
    })()
  `);

  console.log('New chat state:', state);
  client.close();
}

testNewChatNav().catch(console.error);

