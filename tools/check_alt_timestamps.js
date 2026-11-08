const { getMetaTab, CDPClient } = require('./cdp_helper');

async function checkAltTimestamps() {
  const tab = await getMetaTab();
  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();

  console.log('Navigating to primed thread...');
  await client.send('Page.navigate', { url: 'https://www.meta.ai/prompt/b329915b-16ff-4553-9963-5de47475cbd2' });
  await new Promise(r => setTimeout(r, 4000));

  const images = await client.evaluate(`
    (() => {
      return Array.from(document.querySelectorAll('img'))
        .filter(i => i.src.includes('scontent') && i.src.includes('.webp'))
        .map(i => ({
          alt: i.alt,
          w: i.naturalWidth,
          h: i.naturalHeight,
          src: i.src.slice(0, 60)
        }));
    })()
  `);

  console.log('Images found:', images);
  client.close();
}

checkAltTimestamps().catch(console.error);

