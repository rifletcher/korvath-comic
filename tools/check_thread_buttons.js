const { getMetaTab, CDPClient } = require('./cdp_helper');

async function checkThreadButtons() {
  const tab = await getMetaTab();
  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();

  const info = await client.evaluate(`
    (() => {
      const btns = Array.from(document.querySelectorAll('button')).map(b => ({
        label: b.getAttribute('aria-label') || b.innerText,
        testid: b.getAttribute('data-testid'),
        classes: b.className,
        disabled: b.disabled
      })).filter(b => b.label || b.testid);
      return btns;
    })()
  `);

  console.log('Thread buttons:', JSON.stringify(info, null, 2));
  client.close();
}

checkThreadButtons().catch(console.error);

