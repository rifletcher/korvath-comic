const { getMetaTab, CDPClient } = require('./cdp_helper');

async function inspectChatFull() {
  const tab = await getMetaTab();
  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();

  const data = await client.evaluate(`
    (() => {
      // Find all message bubbles or conversation blocks
      const items = Array.from(document.querySelectorAll('[data-testid="message-container"], [data-testid="message-text"], div[dir="auto"], img[src*="fbcdn.net"]')).map(el => {
        if (el.tagName === 'IMG') {
          return { type: 'IMG', src: el.src.substring(0, 70), alt: el.alt };
        } else {
          return { type: 'TEXT', text: el.innerText.trim() };
        }
      }).filter(item => item.type === 'IMG' || item.text.length > 15);

      return items.slice(-25);
    })()
  `);

  console.log(JSON.stringify(data, null, 2));
  client.close();
}

inspectChatFull().catch(console.error);

