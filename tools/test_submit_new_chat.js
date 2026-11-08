const { getMetaTab, CDPClient } = require('./cdp_helper');

async function testSubmitNewChat() {
  const tab = await getMetaTab();
  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();

  console.log('Focusing composer on new chat...');
  const focused = await client.evaluate(`
    (() => {
      const el = document.querySelector('textarea, div[contenteditable="true"]');
      if (el) {
        el.focus();
        return true;
      }
      return false;
    })()
  `);
  console.log('Focused:', focused);

  await client.send('Input.insertText', { text: '/imagine vintage 1970s comic barbarian warrior facing an iron door' });
  await new Promise(r => setTimeout(r, 600));

  // Find send button
  const submitInfo = await client.evaluate(`
    (() => {
      const btn = document.querySelector('button[aria-label="Send"]') ||
                  document.querySelector('button[type="submit"]') ||
                  document.querySelector('form button:not([disabled])');
      if (btn) {
        btn.click();
        return { clicked: true, label: btn.getAttribute('aria-label') || btn.innerText };
      }
      return { clicked: false };
    })()
  `);
  console.log('Submit info:', submitInfo);

  if (!submitInfo.clicked) {
    console.log('Sending Enter key...');
    await client.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', windowsVirtualKeyCode: 13, text: '\r' });
    await client.send('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 13 });
  }

  // Poll for 15 seconds to see what happens
  console.log('Waiting for response...');
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const status = await client.evaluate(`
      (() => {
        const imgs = Array.from(document.querySelectorAll('img'))
          .filter(img => img.src.includes('scontent') && img.src.includes('.webp'))
          .map(img => ({ alt: img.alt, w: img.naturalWidth, src: img.src.slice(0, 50) }));
        const msgs = Array.from(document.querySelectorAll('p, div[dir="auto"]'))
          .map(p => p.innerText.trim()).filter(t => t.length > 5);
        return { imgs, msgs: msgs.slice(-3), url: window.location.href };
      })()
    `);
    console.log(`[${i*2}s] URL: ${status.url}`);
    if (status.imgs.length > 0) {
      console.log('🎉 FOUND GENERATED IMAGE:', status.imgs);
      break;
    }
  }

  client.close();
}

testSubmitNewChat().catch(console.error);

