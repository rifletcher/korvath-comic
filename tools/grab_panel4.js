const fs = require('fs');
const path = require('path');
const { getMetaTab, CDPClient } = require('./cdp_helper');
const { auditPanel, promotePanel } = require('./visual_qa_auditor');

async function grabPanel4() {
  const tab = await getMetaTab();
  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();

  const imgInfo = await client.evaluate(`
    (() => {
      const imgs = Array.from(document.querySelectorAll('img[src*="fbcdn.net"]'));
      const last = imgs[imgs.length - 1];
      return last ? { src: last.src, alt: last.alt } : null;
    })()
  `);

  if (!imgInfo) throw new Error('No image found');
  console.log('Downloading Panel 4 image:', imgInfo.alt, imgInfo.src.substring(0, 60));

  const res = await fetch(imgInfo.src);
  const buf = Buffer.from(await res.arrayBuffer());
  const dst = path.join(__dirname, '..', '02_Assets', 'Episode_01', 'raw', 'panel_04.webp');
  fs.writeFileSync(dst, buf);
  console.log(`Saved Panel 4 raw asset: ${dst} (${Math.round(buf.length / 1024)} KB)`);

  const STORYBOARD_PATH = path.join(__dirname, '..', '01_Script', 'storyboard.json');
  const storyboard = JSON.parse(fs.readFileSync(STORYBOARD_PATH, 'utf8'));
  const panel = storyboard.find(p => p.panelId === 4);

  const report = auditPanel(panel, dst);
  if (report.passed) {
    promotePanel(4);
  }

  client.close();
}

grabPanel4().catch(console.error);

