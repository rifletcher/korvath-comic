const fs = require('fs');
const path = require('path');
const { getMetaTab, CDPClient } = require('./cdp_helper');
const { sanitizePromptForMetaAI } = require('./meta_engine');

async function renderThroneProof() {
  const rawPrompt = `classic vintage 1970s sword-and-sorcery graphic novel comic book panel, Frank Frazetta and John Buscema illustration style, dramatic heavy black ink brushwork, crisp fine cross-hatching, rich cel-shaded digital colors, theatrical chiaroscuro lighting, dark pulp fantasy aesthetic, masterwork sequential art, Wide Throne Room Hero Shot, Dramatic Low-Angle View, Conan the Barbarian sits with savage arrogance upon a massive carved stone skull throne, towering muscled build, battle-scarred bronze torso in studded leather warrior harness, square jaw, smoldering blue wolfish eyes, shaggy raven hair, wolf-fur loincloth, one scarred hand resting on the carved armrest while his other hand grips the wire hilt of his massive 42-inch iron broadsword, blade point resting on the cracked stone floor, the notched steel blade dripping with dark crimson drops and scarlet spatters onto the flagstones. At the foot of the dais on lavish crimson silk pillows lounge two gorgeous exotic women in hammered bronze scale bikinis and translucent sheer silk veils with jeweled serpent armbands, alluring smoldering gazes. In the background, ornate smoking bronze braziers exhale thick swirling grey lotus incense smoke into the high vaulted shadows, warm flickering torchlight casting deep chiaroscuro contrasts.`;

  const { sanitized, modified, modifications } = sanitizePromptForMetaAI(rawPrompt);

  console.log(`\n======================================================`);
  console.log(`⚔️ RENDERING PROOF SCENE: CONAN ON THRONE WITH BIKINIS & BLOOD`);
  console.log(`======================================================`);
  if (modified) {
    console.log(`🛡️ Sanitized tokens: ${modifications.join(', ')}`);
  }
  console.log(`Prompt text:\n"${sanitized}"\n`);

  const outputPath = path.join(__dirname, '..', '00_Reference', 'test_scenes', 'conan_throne_proof.webp');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const tab = await getMetaTab();
  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();

  try {
    // 1. Initial media count
    const initialMediaCount = await client.evaluate(`
      document.querySelectorAll('button[aria-label="View media"]').length
    `);
    console.log(`📸 Initial media count: ${initialMediaCount}`);

    // 2. Set caret in composer and insert prompt
    await client.evaluate(`
      (() => {
        const el = document.querySelector('div[contenteditable="true"]');
        if (!el) throw new Error('Composer div not found');
        el.focus();
        document.execCommand('selectAll', false, null);
        document.execCommand('delete', false, null);
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      })()
    `);

    await client.send('Input.insertText', { text: sanitized });
    await new Promise(r => setTimeout(r, 400));

    // 3. Click Send
    const sendResult = await client.evaluate(`
      (() => {
        const btn = document.querySelector('button[aria-label="Send"]');
        if (btn && !btn.disabled) {
          btn.click();
          return true;
        }
        return false;
      })()
    `);

    if (!sendResult) throw new Error('Failed to click Send button');
    console.log(`🚀 Proof prompt dispatched! Synthesizing...`);

    // 4. Polling loop
    const timeoutMs = 90000;
    const startTime = Date.now();
    let newMediaDetected = false;

    while (Date.now() - startTime < timeoutMs) {
      await new Promise(r => setTimeout(r, 2000));
      const currentMediaCount = await client.evaluate(`
        document.querySelectorAll('button[aria-label="View media"]').length
      `);

      if (currentMediaCount > initialMediaCount) {
        newMediaDetected = true;
        console.log(`✨ New media button detected! (${initialMediaCount} -> ${currentMediaCount})`);
        break;
      }

      const elapsed = Math.round((Date.now() - startTime) / 1000);
      process.stdout.write(`   ⏳ Synthesizing proof scene... (${elapsed}s elapsed)\r`);
    }

    if (!newMediaDetected) {
      // Check if refusal appeared
      const lastText = await client.evaluate(`
        (() => {
          const els = Array.from(document.querySelectorAll('div[dir="auto"], p'));
          return els.slice(-3).map(e => e.innerText).join(' | ');
        })()
      `);
      throw new Error(`Timed out waiting for render. Chat response: "${lastText}"`);
    }

    await new Promise(r => setTimeout(r, 1500));

    // 5. Open lightbox modal
    console.log(`\n🔍 Opening media lightbox...`);
    await client.evaluate(`
      (() => {
        const btns = Array.from(document.querySelectorAll('button[aria-label="View media"]'));
        const lastBtn = btns[btns.length - 1];
        if (lastBtn) lastBtn.click();
      })()
    `);

    await new Promise(r => setTimeout(r, 1200));

    // 6. Extract high-res URL
    const highResUrl = await client.evaluate(`
      (() => {
        const imgs = Array.from(document.querySelectorAll('img[src*="fbcdn.net"]'));
        if (imgs.length === 0) return null;
        imgs.sort((a, b) => (b.naturalWidth || b.width) - (a.naturalWidth || a.width));
        return imgs[0].src;
      })()
    `);

    await client.evaluate(`
      (() => {
        const closeBtn = document.querySelector('button[aria-label="Close" i]');
        if (closeBtn) closeBtn.click();
      })()
    `);

    if (!highResUrl) throw new Error('High-res image URL not found in modal');

    console.log(`📥 Downloading image: ${highResUrl.substring(0, 80)}...`);
    const resp = await fetch(highResUrl);
    const buffer = Buffer.from(await resp.arrayBuffer());

    fs.writeFileSync(outputPath, buffer);
    console.log(`\n🎉 PROOF SCENE RENDERED & SAVED!\nFile: ${outputPath} (${Math.round(buffer.length / 1024)} KB)`);

    return outputPath;
  } finally {
    client.close();
  }
}

renderThroneProof().catch(err => {
  console.error('Proof render failed:', err);
  process.exit(1);
});

