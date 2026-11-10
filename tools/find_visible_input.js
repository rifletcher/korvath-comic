const { getMetaTab, CDPClient } = require('./cdp_helper');

async function main() {
  const tab = await getMetaTab();
  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();

  const els = await client.evaluate(`
    (() => {
      const all = Array.from(document.querySelectorAll('*'));
      const inputs = all.filter(el => {
        const tag = el.tagName.toLowerCase();
        const ce = el.getAttribute('contenteditable');
        const role = el.getAttribute('role');
        return tag === 'textarea' || tag === 'input' || ce === 'true' || role === 'textbox';
      });

      return inputs.map(el => {
        const r = el.getBoundingClientRect();
        return {
          tag: el.tagName,
          id: el.id,
          className: el.className ? el.className.slice(0, 50) : '',
          role: el.getAttribute('role'),
          contenteditable: el.getAttribute('contenteditable'),
          rect: { x: r.x, y: r.y, w: r.width, h: r.height }
        };
      });
    })()
  `);
  console.log('All input elements:', els);

  // Also check if there is an iframe!
  const iframes = await client.evaluate(`
    (() => Array.from(document.querySelectorAll('iframe')).map(f => ({ src: f.src, rect: f.getBoundingClientRect() })))()
  `);
  console.log('Iframes:', iframes);

  client.close();
}

main().catch(console.error);

