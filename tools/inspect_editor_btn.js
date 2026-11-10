const { getMetaTab, CDPClient } = require('./cdp_helper');

async function main() {
  const tab = await getMetaTab();
  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();

  const info = await client.evaluate(`
    (() => {
      const editor = document.querySelector('div[data-testid="composer-input"][contenteditable="true"]');
      const editorRect = editor ? editor.getBoundingClientRect() : null;
      
      const sendBtn = document.querySelector('button[aria-label="Send"]') ||
                      document.querySelector('[data-testid="composer-send-button"]');
      const sendRect = sendBtn ? sendBtn.getBoundingClientRect() : null;

      return {
        editorRect,
        sendBtn: sendBtn ? {
          outerHTML: sendBtn.outerHTML.slice(0, 150),
          disabled: sendBtn.disabled,
          rect: sendRect
        } : null
      };
    })()
  `);

  console.log('Editor and Send Button:', JSON.stringify(info, null, 2));
  client.close();
}

main().catch(console.error);

