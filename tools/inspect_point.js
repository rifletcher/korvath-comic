const { getMetaTab, CDPClient } = require('./cdp_helper');

async function main() {
  const tab = await getMetaTab();
  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();

  const info = await client.evaluate(`
    (() => {
      // Find element at point (500, 650)
      const el = document.elementFromPoint(500, 650);
      const elAbove = document.elementFromPoint(500, 600);
      const elBelow = document.elementFromPoint(500, 700);

      function describe(e) {
        if (!e) return null;
        return {
          tag: e.tagName,
          id: e.id,
          className: e.className ? String(e.className).slice(0, 50) : '',
          role: e.getAttribute('role'),
          rect: e.getBoundingClientRect(),
          outerHTML: e.outerHTML.slice(0, 150)
        };
      }

      return {
        at650: describe(el),
        at600: describe(elAbove),
        at700: describe(elBelow)
      };
    })()
  `);

  console.log('Elements at coordinates:', JSON.stringify(info, null, 2));
  client.close();
}

main().catch(console.error);

