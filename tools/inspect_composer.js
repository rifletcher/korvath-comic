const { getMetaTab, CDPClient } = require('./cdp_helper');

async function inspectComposer() {
  const tab = await getMetaTab();
  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();

  const info = await client.evaluate(`
    (() => {
      const textarea = document.querySelector('textarea, div[contenteditable="true"]');
      const rect = textarea ? textarea.getBoundingClientRect() : null;
      const buttons = Array.from(document.querySelectorAll('button')).map(b => {
        const r = b.getBoundingClientRect();
        return {
          label: b.getAttribute('aria-label') || b.innerText,
          x: r.x + r.width / 2,
          y: r.y + r.height / 2,
          w: r.width,
          h: r.height,
          disabled: b.disabled
        };
      });
      return { textareaRect: rect, buttons };
    })()
  `);

  console.log('Composer info:', JSON.stringify(info, null, 2));
  client.close();
}

inspectComposer().catch(console.error);

