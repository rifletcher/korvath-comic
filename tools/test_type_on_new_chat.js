const { getMetaTab, CDPClient } = require('./cdp_helper');

async function testTypeOnNewChat() {
  const tab = await getMetaTab();
  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();

  console.log('Finding and focusing composer...');
  const focusRes = await client.evaluate(`
    (() => {
      const ta = document.querySelector('textarea, div[contenteditable="true"]');
      if (ta) {
        ta.focus();
        ta.click();
        return { tag: ta.tagName, ph: ta.getAttribute('placeholder') };
      }
      return null;
    })()
  `);
  console.log('Focus result:', focusRes);
  await new Promise(r => setTimeout(r, 400));

  // Dispatch mouse click at composer center
  await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 550, y: 350, button: 'left', clickCount: 1 });
  await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 550, y: 350, button: 'left', clickCount: 1 });
  await new Promise(r => setTimeout(r, 400));

  console.log('Typing text via Input.insertText...');
  await client.send('Input.insertText', { text: '/imagine vintage 1970s comic barbarian warrior standing before an iron temple gate' });
  await new Promise(r => setTimeout(r, 800));

  const textInBox = await client.evaluate(`
    (() => {
      const ta = document.querySelector('textarea, div[contenteditable="true"]');
      return ta ? (ta.value || ta.innerText || '') : '';
    })()
  `);
  console.log('Text currently in box:', textInBox);

  // Check send button
  const sendBtn = await client.evaluate(`
    (() => {
      const btn = document.querySelector('button[aria-label="Send"]');
      if (btn) {
        return { disabled: btn.disabled };
      }
      return null;
    })()
  `);
  console.log('Send button:', sendBtn);

  if (sendBtn && !sendBtn.disabled) {
    console.log('Clicking Send button...');
    await client.evaluate(`document.querySelector('button[aria-label="Send"]').click()`);
  } else {
    console.log('Pressing Enter key...');
    await client.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', windowsVirtualKeyCode: 13, text: '\r' });
    await client.send('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 13 });
  }

  // Check URL change
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

testTypeOnNewChat().catch(console.error);
