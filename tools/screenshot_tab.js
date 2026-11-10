const fs = require('fs');
const { getMetaTab, CDPClient } = require('./cdp_helper');

async function main() {
  const tab = await getMetaTab();
  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();

  const winInfo = await client.evaluate(`
    (() => ({
      href: window.location.href,
      width: window.innerWidth,
      height: window.innerHeight,
      title: document.title,
      bodyTextSnippet: document.body.innerText.slice(0, 300)
    }))()
  `);
  console.log('Window info:', winInfo);

  const shot = await client.send('Page.captureScreenshot', { format: 'jpeg', quality: 70 });
  fs.writeFileSync('meta_tab_screenshot.jpg', Buffer.from(shot.data, 'base64'));
  console.log('Saved meta_tab_screenshot.jpg');

  client.close();
}

main().catch(console.error);

