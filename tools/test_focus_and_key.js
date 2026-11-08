const { getMetaTab, CDPClient } = require('./cdp_helper');

async function testFocusAndKey() {
  const tab = await getMetaTab();
  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();

  console.log('Focusing textarea...');
  await client.evaluate(`
    (() => {
      const ta = document.querySelector('textarea');
      if (ta) ta.focus();
    })()
  `);
  await new Promise(r => setTimeout(r, 200));

  // Type a character
  await client.send('Input.insertText', { text: ' ' });
  await new Promise(r => setTimeout(r, 500));

  const status = await client.evaluate(`
    (() => {
      const btn = document.querySelector('button[aria-label="Send"]');
      return btn ? { disabled: btn.disabled } : null;
    })()
  `);
  console.log('Send button status after typing a space:', status);

  if (status && !status.disabled) {
    console.log('Button enabled! Clicking send...');
    await client.evaluate(`document.querySelector('button[aria-label="Send"]').click()`);
  }

  for (let i = 0; i < 5; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const url = await client.evaluate('window.location.href');
    console.log(`[${i+1}s] Current URL:`, url);
    if (url.includes('/prompt/')) {
      console.log('🎉 DISPATCHED TO /prompt/ !');
      break;
    }
  }

  client.close();
}

testFocusAndKey().catch(console.error);
