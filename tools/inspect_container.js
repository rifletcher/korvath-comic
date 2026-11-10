const { getMetaTab, CDPClient } = require('./cdp_helper');

async function main() {
  const tab = await getMetaTab();
  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();

  const html = await client.evaluate(`
    (() => {
      const container = document.querySelector('div.relative.min-h-\\\\[50px\\\\]') ||
                        document.elementFromPoint(500, 650);
      return {
        outerHTML: container ? container.outerHTML : null,
        children: container ? Array.from(container.children).map(c => ({
          tag: c.tagName,
          className: c.className,
          html: c.outerHTML.slice(0, 150)
        })) : []
      };
    })()
  `);

  console.log(JSON.stringify(html, null, 2));
  client.close();
}

main().catch(console.error);

