const { getMetaTab, CDPClient } = require('./cdp_helper');

async function checkComposer() {
  const tab = await getMetaTab();
  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();
  const state = await client.evaluate(`
    (() => {
      const el = document.querySelector('textarea, div[contenteditable="true"]');
      const val = el ? (el.value || el.innerText) : 'NO INPUT';
      const btns = Array.from(document.querySelectorAll('button')).map(b => ({
        label: b.getAttribute('aria-label') || b.innerText,
        classes: b.className,
        disabled: b.disabled
      })).filter(b => b.label);
      return { val: val.slice(0, 100), btns: btns.slice(-6) };
    })()
  `);
  console.log(JSON.stringify(state, null, 2));
  client.close();
}

checkComposer().catch(console.error);

