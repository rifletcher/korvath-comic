const { getMetaTab, CDPClient } = require('./cdp_helper');

async function findNewChatButton() {
  const tab = await getMetaTab();
  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();

  const buttons = await client.evaluate(`
    (() => {
      const all = Array.from(document.querySelectorAll('a, button, div[role="button"]'))
        .map(el => ({
          tag: el.tagName,
          label: el.getAttribute('aria-label') || el.innerText,
          href: el.href || '',
          className: el.className
        }))
        .filter(b => b.label && (b.label.includes('New') || b.label.includes('Chat') || b.label.includes('plus') || b.label.includes('Edit') || b.href.includes('meta.ai')));
      return all;
    })()
  `);

  console.log('Candidate buttons:', JSON.stringify(buttons, null, 2));
  client.close();
}

findNewChatButton().catch(console.error);

