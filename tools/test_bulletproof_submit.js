const { getMetaTab, CDPClient } = require('./cdp_helper');

async function testBulletproofSubmit(prompt) {
  const tab = await getMetaTab();
  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();

  console.log('Navigating to https://www.meta.ai/?new=1 ...');
  await client.send('Page.navigate', { url: 'https://www.meta.ai/?new=1' });
  await new Promise(r => setTimeout(r, 4000));

  // Focus composer
  await client.evaluate(`
    (() => {
      const el = document.querySelector('div[contenteditable="true"], textarea');
      if (el) el.focus();
    })()
  `);
  await new Promise(r => setTimeout(r, 300));

  // If not focused, click via rect
  const rect = await client.evaluate(`
    (() => {
      const el = document.querySelector('div[contenteditable="true"], textarea');
      if (el) {
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }
      return null;
    })()
  `);
  if (rect) {
    await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
    await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
    await new Promise(r => setTimeout(r, 300));
  }

  // Insert prompt
  console.log('Inserting text...');
  await client.send('Input.insertText', { text: prompt });
  await new Promise(r => setTimeout(r, 1000));

  // Verify text is present
  const composerText = await client.evaluate(`
    (() => {
      const el = document.querySelector('div[contenteditable="true"], textarea');
      return el ? (el.innerText || el.value || '') : '';
    })()
  `);
  console.log('Composer text length:', composerText.length);

  // Wait for Send button to be enabled
  let sendClicked = false;
  for (let attempt = 0; attempt < 5; attempt++) {
    const status = await client.evaluate(`
      (() => {
        const btn = document.querySelector('button[aria-label="Send"]');
        if (btn && !btn.disabled) {
          btn.click();
          return { clicked: true };
        }
        return { clicked: false, disabled: btn ? btn.disabled : 'no button' };
      })()
    `);
    console.log('Send button attempt ' + (attempt + 1) + ':', status);
    if (status.clicked) {
      sendClicked = true;
      break;
    }
    await new Promise(r => setTimeout(r, 500));
  }

  if (!sendClicked) {
    console.log('Sending Enter key fallback...');
    await client.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', windowsVirtualKeyCode: 13, text: '\r' });
    await client.send('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 13 });
  }

  // Monitor URL change
  console.log('Waiting for URL transition to /prompt/ ...');
  let promptUrl = null;
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const url = await client.evaluate('window.location.href');
    if (url.includes('/prompt/')) {
      promptUrl = url;
      console.log('🎉 Submitted successfully! Transitioned to:', url);
      break;
    }
  }

  client.close();
  return promptUrl;
}

testBulletproofSubmit('/imagine vintage 1970s comic barbarian warrior facing an iron gate').catch(console.error);
