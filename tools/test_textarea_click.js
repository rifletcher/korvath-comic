const { getMetaTab, CDPClient } = require('./cdp_helper');

async function main() {
  const tab = await getMetaTab();
  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();

  const rect = await client.evaluate(`
    (() => {
      const ta = document.querySelector('textarea');
      if (!ta) return null;
      const r = ta.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    })()
  `);
  console.log('Textarea rect:', rect);

  if (rect) {
    const clickX = Math.round(rect.x + rect.w / 2);
    const clickY = Math.round(rect.y + rect.h / 2);
    console.log(`Clicking coordinates: (${clickX}, ${clickY})`);

    await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: clickX, y: clickY, button: 'left', clickCount: 1 });
    await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: clickX, y: clickY, button: 'left', clickCount: 1 });
    await new Promise(r => setTimeout(r, 200));

    console.log('Inserting text via CDP...');
    await client.send('Input.insertText', { text: 'Hello World' });
    await new Promise(r => setTimeout(r, 300));

    const check = await client.evaluate(`
      (() => {
        const ta = document.querySelector('textarea');
        const btn = document.querySelector('button[aria-label="Send"]');
        return {
          value: ta ? ta.value : null,
          btnDisabled: btn ? btn.disabled : null
        };
      })()
    `);
    console.log('Check after mouse click + insertText:', check);

    // Clear
    await client.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
    await client.evaluate(`
      (() => {
        const ta = document.querySelector('textarea');
        if (ta) {
          ta.value = '';
          ta.dispatchEvent(new Event('input', { bubbles: true }));
        }
      })()
    `);
  }

  client.close();
}

main().catch(console.error);

