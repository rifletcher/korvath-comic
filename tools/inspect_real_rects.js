const { getMetaTab, CDPClient } = require('./cdp_helper');

async function main() {
  const tab = await getMetaTab();
  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();

  const info = await client.evaluate(`
    (() => {
      const editor = document.querySelector('div[data-testid="composer-input"][contenteditable="true"]');
      const r = editor ? editor.getBoundingClientRect() : null;
      
      const sendBtn = document.querySelector('button[aria-label="Send"]');
      const sr = sendBtn ? sendBtn.getBoundingClientRect() : null;

      return {
        editor: r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null,
        sendBtn: sr ? { x: sr.x, y: sr.y, w: sr.width, h: sr.height, disabled: sendBtn.disabled } : null
      };
    })()
  `);

  console.log('Real Rects:', info);
  client.close();
}

main().catch(console.error);
