const { getMetaTab, CDPClient } = require('./cdp_helper');

async function getTabInfo() {
  const tab = await getMetaTab();
  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();
  const info = await client.evaluate(`
    (() => {
      const msgs = Array.from(document.querySelectorAll('div[dir="auto"], p'))
        .map(p => p.innerText.trim())
        .filter(t => t.length > 5);
      const url = window.location.href;
      return { url, msgs: msgs.slice(-5) };
    })()
  `);
  console.log('Tab URL:', info.url);
  console.log('Tab Messages:', info.msgs);
  client.close();
}

getTabInfo().catch(console.error);

