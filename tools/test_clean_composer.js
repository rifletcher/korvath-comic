const { getMetaTab, CDPClient } = require('./cdp_helper');

async function testCleanComposer() {
  const tab = await getMetaTab();
  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();

  console.log('Clicking composer at x: 550, y: 300...');
  await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 550, y: 300, button: 'left', clickCount: 1 });
  await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 550, y: 300, button: 'left', clickCount: 1 });
  await new Promise(r => setTimeout(r, 400));

  console.log('Inserting text...');
  await client.send('Input.insertText', { text: '/imagine vintage 1970s comic barbarian warrior facing an iron gate' });
  await new Promise(r => setTimeout(r, 1000));

  // Check Send button status
  const btnStatus = await client.evaluate(`
    (() => {
      const btn = document.querySelector('button[aria-label="Send"]');
      return btn ? { disabled: btn.disabled, rect: btn.getBoundingClientRect() } : null;
    })()
  `);
  console.log('Send button status after typing:', btnStatus);

  if (btnStatus && !btnStatus.disabled) {
    console.log('Clicking Send button...');
    await client.evaluate(`document.querySelector('button[aria-label="Send"]').click()`);
  } else {
    console.log('Sending Enter key...');
    await client.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', windowsVirtualKeyCode: 13, text: '\r' });
    await client.send('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 13 });
  }

  // Poll for generated image
  console.log('Polling for image...');
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const res = await client.evaluate(`
      (() => {
        const imgs = Array.from(document.querySelectorAll('img'))
          .filter(i => i.src.includes('scontent') && i.src.includes('.webp') && i.naturalWidth >= 1000);
        return {
          url: window.location.href,
          imgs: imgs.map(i => ({ alt: i.alt, w: i.naturalWidth, src: i.src.slice(0, 60) }))
        };
      })()
    `);
    console.log(`[${(i+1)*2}s]`, res.url, res.imgs.length > 0 ? res.imgs : 'waiting...');
    if (res.imgs.length > 0) {
      console.log('🎉 SUCCESS! Image generated in clean chat!');
      break;
    }
  }

  client.close();
}

testCleanComposer().catch(console.error);

