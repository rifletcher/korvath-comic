const fs = require('fs');
const path = require('path');
const { getMetaTab, CDPClient } = require('./cdp_helper');
const { sanitizePromptForMetaAI } = require('./meta_engine');
const { auditPanel, promotePanel } = require('./visual_qa_auditor');

async function renderPanelViaModal(panelId, outputPath) {
  const STORYBOARD_PATH = path.join(__dirname, '..', '01_Script', 'storyboard.json');
  const storyboard = JSON.parse(fs.readFileSync(STORYBOARD_PATH, 'utf8'));
  const panel = storyboard.find(p => p.panelId === panelId);
  if (!panel) throw new Error(`Panel #${panelId} not found`);

  const { sanitized, modified, modifications } = sanitizePromptForMetaAI(panel.prompt);

  console.log(`\n======================================================`);
  console.log(`⚔️ RENDERING CONAN PANEL #${panelId}: "${panel.beat.name}"`);
  console.log(`======================================================`);
  if (modified) {
    console.log(`🛡️ [Guardrails Active]: Sanitized ${modifications.length} trigger tokens: ${modifications.join(', ')}`);
  }
  console.log(`Prompt: "${sanitized.substring(0, 100)}..."`);

  const tab = await getMetaTab();
  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();

  try {
    // 1. Initial count of media items
    const initialMediaCount = await client.evaluate(`
      document.querySelectorAll('button[aria-label="View media"]').length
    `);
    console.log(`📸 Initial media buttons count: ${initialMediaCount}`);

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

    if (!sendResult) throw new Error('Failed to click Send button: Send button is disabled or not found');
    console.log(`🚀 Prompt dispatched! Waiting for synthesis...`);

    // 4. Poll until new media button appears
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
      process.stdout.write(`   ⏳ Synthesizing... (${elapsed}s elapsed)\r`);
    }

    if (!newMediaDetected) {
      throw new Error(`Timed out waiting for panel #${panelId} to render.`);
    }

    // Wait 1.5s for thumbnail / full assets to finish settling
    await new Promise(r => setTimeout(r, 1500));

    // 5. Click the newly created media button to open the lightbox
    console.log(`\n🔍 Opening media lightbox for high-res download...`);
    await client.evaluate(`
      (() => {
        const btns = Array.from(document.querySelectorAll('button[aria-label="View media"]'));
        const lastBtn = btns[btns.length - 1];
        if (lastBtn) lastBtn.click();
      })()
    `);

    await new Promise(r => setTimeout(r, 1200));

    // 6. Extract the high-res image URL from the modal
    const highResUrl = await client.evaluate(`
      (() => {
        // Look for the largest rendered image in the modal
        const imgs = Array.from(document.querySelectorAll('img[src*="fbcdn.net"]'));
        if (imgs.length === 0) return null;
        // Sort by naturalWidth descending
        imgs.sort((a, b) => (b.naturalWidth || b.width) - (a.naturalWidth || a.width));
        return imgs[0].src;
      })()
    `);

    // Close modal
    await client.evaluate(`
      (() => {
        const closeBtn = document.querySelector('button[aria-label="Close" i]');
        if (closeBtn) closeBtn.click();
      })()
    `);

    if (!highResUrl) {
      throw new Error('Failed to locate high-res image URL in modal');
    }

    console.log(`📥 Downloading high-res asset: ${highResUrl.substring(0, 80)}...`);
    const resp = await fetch(highResUrl);
    const buffer = Buffer.from(await resp.arrayBuffer());

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, buffer);
    console.log(`✅ Panel #${panelId} saved to: ${outputPath} (${Math.round(buffer.length / 1024)} KB)`);

    // 7. Audit & promote
    const auditReport = auditPanel(panel, outputPath);
    if (auditReport.passed) {
      promotePanel(panelId);
    }

    return true;
  } finally {
    client.close();
  }
}

if (require.main === module) {
  const panelId = process.argv[2] ? parseInt(process.argv[2], 10) : 5;
  const pad = String(panelId).padStart(2, '0');
  const out = path.join(__dirname, '..', '02_Assets', 'Episode_01', 'raw', `panel_${pad}.webp`);
  renderPanelViaModal(panelId, out).catch(err => {
    console.error('Render error:', err);
    process.exit(1);
  });
}

module.exports = { renderPanelViaModal };

