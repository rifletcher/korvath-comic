const { getMetaTab, CDPClient } = require('./cdp_helper');

async function testClickDiv() {
  const tab = await getMetaTab();
  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();

  const clickX = 550;
  const clickY = 635;

  console.log(`Clicking at ${clickX}, ${clickY}...`);
  await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: clickX, y: clickY, button: 'left', clickCount: 1 });
  await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: clickX, y: clickY, button: 'left', clickCount: 1 });

  await new Promise(r => setTimeout(r, 200));

  console.log('Sending insertText...');
  await client.send('Input.insertText', { text: "Test prompt from CDP automation" });

  await new Promise(r => setTimeout(r, 300));

  const status = await client.evaluate(`
    (() => {
      const active = document.activeElement;
      const sendBtn = document.querySelector('button[aria-label="Send"]');
      const div = document.querySelector('div[contenteditable="true"]');
      return {
        activeTag: active ? active.tagName : null,
        activeClasses: active ? active.className : null,
        divText: div ? div.innerText : null,
        sendBtnDisabled: sendBtn ? sendBtn.disabled : null
      };
    })()
  `);

  console.log('Status after typing:', status);

  // Clear text
  await client.evaluate(`
    (() => {
      const div = document.querySelector('div[contenteditable="true"]');
      if (div) {
        div.focus();
        document.execCommand('selectAll', false, null);
      }
    })()
  `);
  await client.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
  await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });

  await new Promise(r => setTimeout(r, 200));

  const afterClear = await client.evaluate(`
    (() => {
      const div = document.querySelector('div[contenteditable="true"]');
      const sendBtn = document.querySelector('button[aria-label="Send"]');
      return {
        divText: div ? div.innerText : null,
        sendBtnDisabled: sendBtn ? sendBtn.disabled : null
      };
    })()
  `);
  console.log('Status after clear:', afterClear);

  client.close();
}

testClickDiv().catch(console.error);
