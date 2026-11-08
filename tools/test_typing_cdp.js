const { getMetaTab, CDPClient } = require('./cdp_helper');

async function testTyping() {
  const tab = await getMetaTab();
  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();

  console.log('1. Dispatching mouse click to editor at (500, 615)...');
  await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 500, y: 615, button: 'left', clickCount: 1 });
  await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 500, y: 615, button: 'left', clickCount: 1 });
  await new Promise(r => setTimeout(r, 200));

  console.log('2. Inserting text via Input.insertText...');
  await client.send('Input.insertText', { text: '/imagine vintage 1970s comic test' });
  await new Promise(r => setTimeout(r, 400));

  console.log('3. Checking Send button state...');
  const state = await client.evaluate(`
    (() => {
      const editor = document.querySelector('div[data-testid="composer-input"][contenteditable="true"]');
      const sendBtn = document.querySelector('button[aria-label="Send"]');
      return {
        editorText: editor ? editor.innerText : null,
        btnDisabled: sendBtn ? sendBtn.disabled : null
      };
    })()
  `);

  console.log('Result:', state);

  // Clear text
  console.log('4. Clearing text...');
  await client.evaluate(`
    (() => {
      const editor = document.querySelector('div[data-testid="composer-input"][contenteditable="true"]');
      if (editor) {
        editor.focus();
        document.execCommand('selectAll', false, null);
      }
    })()
  `);
  await client.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
  await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });

  client.close();
}

testTyping().catch(console.error);
