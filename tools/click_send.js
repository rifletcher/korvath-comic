const { getMetaTab, CDPClient } = require('./cdp_helper');

(async () => {
  const tab = await getMetaTab();
  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();

  const res = await client.evaluate(`
    (() => {
      const btn = document.querySelector('button[aria-label="Send"]');
      if (btn) {
        btn.click();
        return { clicked: true, disabled: btn.disabled };
      }
      return { clicked: false };
    })()
  `);
  console.log('Click result:', res);
  await client.close();
})().catch(console.error);

