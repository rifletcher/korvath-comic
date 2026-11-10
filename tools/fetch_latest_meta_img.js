const { getMetaTab, CDPClient } = require('./cdp_helper');

(async () => {
  const tab = await getMetaTab();
  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();

  const imgInfo = await client.evaluate(`
    (async () => {
      const imgs = Array.from(document.querySelectorAll('img'))
        .filter(i => (i.src.includes('scontent') || i.src.includes('fbcdn.net')) && i.naturalWidth >= 1000);
      if (imgs.length === 0) return null;
      const latest = imgs[imgs.length - 1];
      try {
        const res = await fetch(latest.src);
        const blob = await res.blob();
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve({
            url: latest.src,
            alt: latest.alt || '',
            width: latest.naturalWidth,
            height: latest.naturalHeight,
            base64: reader.result.split(',')[1]
          });
          reader.readAsDataURL(blob);
        });
      } catch (e) {
        return { error: e.message };
      }
    })()
  `);

  if (!imgInfo) {
    console.log('No 1000px+ images loaded yet.');
  } else if (imgInfo.error) {
    console.log('Fetch error:', imgInfo.error);
  } else {
    const fs = require('fs');
    const buf = Buffer.from(imgInfo.base64, 'base64');
    fs.writeFileSync('tools/latest_test.webp', buf);
    console.log(`Saved latest_test.webp (${(buf.length / 1024).toFixed(1)} KB, ${imgInfo.width}x${imgInfo.height})`);
    console.log('Alt snippet:', imgInfo.alt.slice(0, 150));
  }
  await client.close();
})().catch(console.error);

