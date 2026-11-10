const { getMetaTab, CDPClient } = require('./cdp_helper');

(async () => {
  const tab = await getMetaTab();
  console.log('Meta tab found:', tab.title, tab.url);
  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();
  const info = await client.evaluate(`({
    title: document.title,
    href: location.href,
    hasComposer: !!document.querySelector('div[data-testid="composer-input"]'),
    imgCount: document.querySelectorAll('img').length
  })`);
  console.log('Tab Info:', info);
  await client.close();
})().catch(console.error);

