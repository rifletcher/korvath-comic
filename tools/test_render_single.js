const { getMetaTab, CDPClient } = require('./cdp_helper');

async function testCaretAndType() {
  const tab = await getMetaTab();
  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();

  await client.evaluate(`
    (() => {
      const el = document.querySelector('div[contenteditable="true"]');
      el.focus();
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    })()
  `);

  await client.send('Input.insertText', { text: "Conan barbarian battle action" });
  await new Promise(r => setTimeout(r, 200));

  const res = await client.evaluate(`
    (() => {
      const el = document.querySelector('div[contenteditable="true"]');
      const sendBtn = document.querySelector('button[aria-label="Send"]');
      return {
        text: el ? el.innerText : null,
        sendDisabled: sendBtn ? sendBtn.disabled : null
      };
    })()
  `);

  console.log('Result with caret set:', res);

  // Clear
  await client.evaluate(`
    (() => {
      const el = document.querySelector('div[contenteditable="true"]');
      if (el) {
        el.focus();
        document.execCommand('selectAll', false, null);
      }
    })()
  `);
  await client.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
  await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });

  client.close();
}

testCaretAndType().catch(console.error);
