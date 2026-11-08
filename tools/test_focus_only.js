const { getMetaTab, CDPClient } = require('./cdp_helper');

async function testFocusOnly() {
  const tab = await getMetaTab();
  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();

  console.log('Focusing textarea without clicking random coordinates...');
  await client.evaluate(`
    (() => {
      const ta = document.querySelector('textarea');
      if (ta) ta.focus();
    })()
  `);
  await new Promise(r => setTimeout(r, 200));

  console.log('Inserting text...');
  await client.send('Input.insertText', { text: '/imagine vintage 1970s comic barbarian warrior standing before an iron temple gate' });
  await new Promise(r => setTimeout(r, 800));

  const textInBox = await client.evaluate(`
    (() => {
      const ta = document.querySelector('textarea');
      return ta ? ta.value : '';
    })()
  `);
  console.log('Text currently in box:', textInBox);

  // Send button
  const sendBtn = await client.evaluate(`
    (() => {
      const btn = document.querySelector('button[aria-label="Send"]');
      return btn ? { disabled: btn.disabled } : null;
    })()
  `);
  console.log('Send button:', sendBtn);

  if (sendBtn && !sendBtn.disabled) {
    console.log('Clicking Send button...');
    await client.evaluate(`document.querySelector('button[aria-label="Send"]').click()`);
  }

  for (let i = 0; i < 5; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const url = await client.evaluate('window.location.href');
    console.log(`[${i+1}s] URL:`, url);
    if (url.includes('/prompt/')) {
      console.log('🎉 PROMPT SUBMITTED TO NEW THREAD:', url);
      break;
    }
  }

  client.close();
}

testFocusOnly().catch(console.error);
