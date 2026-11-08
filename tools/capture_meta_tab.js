const fs = require('fs');
const { getMetaTab, CDPClient } = require('./cdp_helper');

async function captureTab() {
  const tab = await getMetaTab();
  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();

  const screenshot = await client.send('Page.captureScreenshot', { format: 'jpeg', quality: 70 });
  fs.writeFileSync('meta_tab_debug.jpg', Buffer.from(screenshot.data, 'base64'));
  console.log('Saved meta_tab_debug.jpg');
  client.close();
}

captureTab().catch(console.error);

