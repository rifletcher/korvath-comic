const { getMetaTab, CDPClient } = require('./cdp_helper');

async function testTextarea() {
  const tab = await getMetaTab();
  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();

  console.log('Focusing textarea...');
  await client.evaluate(`
    (() => {
      const ta = document.querySelector('textarea');
      if (ta) {
        ta.focus();
        ta.select();
      }
    })()
  `);
  await new Promise(r => setTimeout(r, 200));

  console.log('Inserting test text...');
  await client.send('Input.insertText', { text: 'test hello' });
  await new Promise(r => setTimeout(r, 500));

  const state = await client.evaluate(`
    (() => {
      const ta = document.querySelector('textarea');
      const btn = document.querySelector('button[aria-label="Send"]');
      return {
        value: ta ? ta.value : null,
        btnDisabled: btn ? btn.disabled : null
      };
    })()
  `);
  console.log('State:', state);

  // Clear text so we don't leave it dirty
  await client.evaluate(`
    (() => {
      const ta = document.querySelector('textarea');
      if (ta) {
        ta.value = '';
        ta.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()
  `);

  client.close();
}

testTextarea().catch(console.error);
