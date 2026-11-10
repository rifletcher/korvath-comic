const { getMetaTab, CDPClient } = require('./cdp_helper');

(async () => {
  const tab = await getMetaTab();
  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();

  const btns = await client.evaluate(`
    (() => {
      const allBtns = Array.from(document.querySelectorAll('button'));
      return allBtns.map(b => ({
        ariaLabel: b.getAttribute('aria-label'),
        disabled: b.disabled,
        text: b.innerText.trim(),
        rect: b.getBoundingClientRect()
      })).filter(b => b.rect.y > 500);
    })()
  `);
  console.log('Buttons near bottom:', btns);
  await client.close();
})().catch(console.error);

