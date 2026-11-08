const { getMetaTab, CDPClient } = require('./cdp_helper');

async function findInput() {
  const tab = await getMetaTab();
  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();

  const els = await client.evaluate(`
    (() => {
      const found = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
      let node;
      while (node = walker.nextNode()) {
        const tag = node.tagName.toLowerCase();
        const role = node.getAttribute('role');
        const ce = node.getAttribute('contenteditable');
        const ph = node.getAttribute('placeholder');
        if (tag === 'textarea' || tag === 'input' || ce === 'true' || role === 'textbox' || (ph && ph.includes('Meta'))) {
          found.push({
            tag,
            role,
            contenteditable: ce,
            placeholder: ph,
            className: node.className,
            text: node.innerText,
            rect: node.getBoundingClientRect()
          });
        }
      }
      return found;
    })()
  `);

  console.log('Found input elements:', JSON.stringify(els, null, 2));
  client.close();
}

findInput().catch(console.error);
