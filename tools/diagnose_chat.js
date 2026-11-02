const { getMetaTab, CDPClient } = require('./cdp_helper');

async function inspectLastAssistantResponse() {
  const tab = await getMetaTab();
  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();

  const response = await client.evaluate(`
    (() => {
      // Find all text blocks inside the conversation
      const container = document.querySelector('div.px-conversation-gutter');
      if (!container) return 'No container';
      
      const textNodes = Array.from(container.querySelectorAll('div[dir="auto"], p, span')).map(n => n.innerText.trim()).filter(t => t.length > 5);
      return textNodes.slice(-10);
    })()
  `);

  console.log('Last response in conversation:\n', response);
  client.close();
}

inspectLastAssistantResponse().catch(console.error);
