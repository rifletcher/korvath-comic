const { getMetaTab, CDPClient } = require('./cdp_helper');

async function testReactInput() {
  const tab = await getMetaTab();
  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();

  console.log('Setting textarea value via React setter...');
  const res = await client.evaluate(`
    (() => {
      const ta = document.querySelector('textarea');
      if (!ta) return { error: 'No textarea' };

      ta.focus();
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      nativeSetter.call(ta, '/imagine vintage 1970s comic barbarian warrior facing an iron gate');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.dispatchEvent(new Event('change', { bubbles: true }));

      const sendBtn = document.querySelector('button[aria-label="Send"]');
      return {
        value: ta.value,
        sendBtnDisabled: sendBtn ? sendBtn.disabled : 'no send button'
      };
    })()
  `);
  console.log('React setter result:', res);

  if (res.sendBtnDisabled === false) {
    console.log('Send button is enabled! Clicking send...');
    await client.evaluate(`document.querySelector('button[aria-label="Send"]').click()`);
  }

  // Check URL change
  for (let i = 0; i < 5; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const url = await client.evaluate('window.location.href');
    console.log(`[${i+1}s] Current URL:`, url);
    if (url.includes('/prompt/')) {
      console.log('🎉 SUCCESSFUL DISPATCH TO /prompt/ !');
      break;
    }
  }

  client.close();
}

testReactInput().catch(console.error);
