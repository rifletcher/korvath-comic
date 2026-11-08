const { getMetaTab, CDPClient } = require('./cdp_helper');

async function testClickNewChat() {
  const tab = await getMetaTab();
  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();

  console.log('Navigating to old thread first...');
  await client.send('Page.navigate', { url: 'https://www.meta.ai/prompt/b329915b-16ff-4553-9963-5de47475cbd2' });
  await new Promise(r => setTimeout(r, 4000));

  console.log('Clicking "New chat" sidebar button...');
  const clicked = await client.evaluate(`
    (() => {
      const a = Array.from(document.querySelectorAll('a')).find(el => el.innerText.includes('New chat'));
      if (a) {
        a.click();
        return true;
      }
      return false;
    })()
  `);
  console.log('New chat link clicked:', clicked);
  await new Promise(r => setTimeout(r, 3000));

  const url = await client.evaluate('window.location.href');
  console.log('Current URL after clicking New chat:', url);

  client.close();
}

testClickNewChat().catch(console.error);
