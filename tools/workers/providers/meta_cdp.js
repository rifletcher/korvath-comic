const { acquireTabForComic, acquireTabLock, releaseTabLock, CDPClient } = require('../cdp_tab_pool');
const { sanitizePromptForMetaAI } = require('../../meta_engine');

function buildUniqueNeedle(sanitized) {
  const needleStart = Math.min(Math.max(0, sanitized.length - 60), Math.floor(sanitized.length * 0.55));
  return sanitized.slice(needleStart, needleStart + 44).trim() || sanitized.slice(-44).trim();
}

async function resetMetaTabToFreshChat(client) {
  try {
    await client.send('Page.navigate', { url: 'https://www.meta.ai/' });
    for (let i = 0; i < 12; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const ready = await client.evaluate(`Boolean(document.querySelector('div[contenteditable="true"]'))`);
      if (ready) break;
    }
  } catch (_) {}
}

async function attemptMetaCDPRender(client, tab, sanitized, uniqueNeedle, emitEvent, ctx) {
  const { projectId, episodeId, panelId } = ctx;

  // 0. If Meta AI is stuck generating a previous turn ("Stop" button active), wait briefly then click Stop
  for (let w = 0; w < 5; w++) {
    const stopActive = await client.evaluate(`Boolean(document.querySelector('button[aria-label="Stop"]'))`);
    if (!stopActive) break;
    if (w === 4) {
      await client.evaluate(`(() => { const s = document.querySelector('button[aria-label="Stop"]'); if (s) s.click(); })()`);
      await new Promise(r => setTimeout(r, 1200));
    } else {
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  // Wait briefly if Meta AI is still streaming images from a prior turn
  let prevCount = -1;
  for (let s = 0; s < 4; s++) {
    const cnt = await client.evaluate(`document.querySelectorAll('img').length`);
    if (cnt === prevCount) break;
    prevCount = cnt;
    await new Promise(r => setTimeout(r, 1200));
  }

  const preTurnCount = await client.evaluate(`
    Array.from(document.querySelectorAll('div[dir="auto"], p, span'))
      .filter(el => el.innerText && el.innerText.includes(${JSON.stringify(uniqueNeedle)})).length
  `) || 0;

  const preFlightUrls = await client.evaluate(`
    (() => {
      const imgs = Array.from(document.querySelectorAll('img'))
        .filter(i => (i.src.includes('scontent') || i.src.includes('fbcdn.net')) && i.naturalWidth >= 500);
      return imgs.map(i => i.src);
    })()
  `) || [];

  emitEvent('panel_progress', {
    projectId,
    episodeId,
    panelId: Number(panelId),
    status: 'INJECTING_PROMPT',
    tabId: tab.id,
    message: `[meta-ai-cdp] Injecting sanitized prompt into isolated tab [${tab.id.slice(0, 8)}]...`
  });

  // 1. Click input element to guarantee focus
  const inputRect = await client.evaluate(`
    (() => {
      const el = document.querySelector('div[contenteditable="true"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()
  `);
  if (inputRect) {
    await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: inputRect.x, y: inputRect.y, button: 'left', clickCount: 1 });
    await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: inputRect.x, y: inputRect.y, button: 'left', clickCount: 1 });
    await new Promise(r => setTimeout(r, 200));
  }

  // 2. Clear input
  await client.evaluate(`
    (() => {
      const el = document.querySelector('div[contenteditable="true"]');
      if (el) {
        el.focus();
        document.execCommand('selectAll', false, null);
      }
    })()
  `);
  await client.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
  await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
  await new Promise(r => setTimeout(r, 250));

  // 3. Insert sanitized prompt with /imagine trigger
  await client.send('Input.insertText', { text: `/imagine ${sanitized}` });
  await new Promise(r => setTimeout(r, 600));

  // 4. Click Send or Enter
  let submitted = false;
  for (let attempt = 0; attempt < 5; attempt++) {
    const sendState = await client.evaluate(`
      (() => {
        const btn = document.querySelector('button[aria-label="Send"]');
        if (btn && !btn.disabled) {
          btn.click();
          return { clicked: true };
        }
        return { clicked: false, disabled: btn ? btn.disabled : true };
      })()
    `);
    if (sendState && sendState.clicked) {
      submitted = true;
      break;
    }
    await client.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await new Promise(r => setTimeout(r, 400));
    const cleared = await client.evaluate(`
      (() => {
        const el = document.querySelector('div[contenteditable="true"]');
        return el ? el.innerText.trim().length === 0 : false;
      })()
    `);
    if (cleared) {
      submitted = true;
      break;
    }
    await new Promise(r => setTimeout(r, 500));
  }

  if (!submitted) {
    throw new Error(`Meta AI failed to submit prompt on tab ${tab.id} (Send button unavailable)`);
  }

  const startTime = Date.now();
  const preSet = new Set(preFlightUrls);

  while (Date.now() - startTime < 90000) {
    await new Promise(r => setTimeout(r, 2000));

    const refusal = await client.evaluate(`
      (() => {
        const textElements = Array.from(document.querySelectorAll('div[dir="auto"], p, div.relative'));
        const lastTexts = textElements.slice(-8).map(t => t.innerText.trim()).filter(Boolean);
        return lastTexts.find(t =>
          t.includes("can't create") ||
          t.includes("can't generate") ||
          t.includes("against our") ||
          t.includes("cannot fulfill") ||
          t.includes("can't make that") ||
          t.includes("too graphic")
        ) || null;
      })()
    `);
    if (refusal) {
      throw new Error(`Meta AI Safety Guardrail Refused: "${refusal.slice(0, 160)}"`);
    }

    const curUrls = await client.evaluate(`
      (() => {
        const needle = ${JSON.stringify(uniqueNeedle)};
        const textNodes = Array.from(document.querySelectorAll('div[dir="auto"], p, span'))
          .filter(el => el.innerText && el.innerText.includes(needle));
        if (textNodes.length <= ${preTurnCount}) return [];
        const promptNode = textNodes[textNodes.length - 1];
        const imgs = Array.from(document.querySelectorAll('img'))
          .filter(i => (i.src.includes('scontent') || i.src.includes('fbcdn.net')) && i.complete && i.naturalWidth >= 500)
          .filter(i => Boolean(promptNode.compareDocumentPosition(i) & Node.DOCUMENT_POSITION_FOLLOWING));
        return imgs.map(i => i.src);
      })()
    `) || [];

    const newUrls = curUrls.filter(u => !preSet.has(u));
    if (newUrls.length > 0 && (Date.now() - startTime >= 3500)) {
      await new Promise(r => setTimeout(r, 1500));
      const settledUrls = await client.evaluate(`
        (() => {
          const needle = ${JSON.stringify(uniqueNeedle)};
          const textNodes = Array.from(document.querySelectorAll('div[dir="auto"], p, span'))
            .filter(el => el.innerText && el.innerText.includes(needle));
          if (textNodes.length <= ${preTurnCount}) return [];
          const promptNode = textNodes[textNodes.length - 1];
          const imgs = Array.from(document.querySelectorAll('img'))
            .filter(i => (i.src.includes('scontent') || i.src.includes('fbcdn.net')) && i.complete && i.naturalWidth >= 500)
            .filter(i => Boolean(promptNode.compareDocumentPosition(i) & Node.DOCUMENT_POSITION_FOLLOWING));
          return imgs.map(i => i.src);
        })()
      `) || curUrls;
      const settledNew = settledUrls.filter(u => !preSet.has(u));
      const finalList = settledNew.length > 0 ? settledNew : newUrls;
      const targetUrl = finalList[finalList.length - 1];
      const resp = await fetch(targetUrl);
      return Buffer.from(await resp.arrayBuffer());
    }
  }

  throw new Error(`Timed out waiting for Meta AI image on tab ${tab.id}`);
}

async function renderViaMetaCDP(projectId, episodeId, panelId, prompt, manifest, manifestPath, emitEvent, updateManifestLocked) {
  emitEvent('panel_progress', {
    projectId,
    episodeId,
    panelId: Number(panelId),
    status: 'ACQUIRING_TAB',
    message: `[meta-ai-cdp] Acquiring isolated Chrome CDP tab for ${projectId}/${episodeId} Panel #${panelId}...`
  });

  const tab = await acquireTabForComic(projectId, episodeId, true);
  await acquireTabLock(tab.id);
  if (manifest && manifestPath && typeof updateManifestLocked === 'function') {
    manifest.assignedWorkerTab = tab.id;
    updateManifestLocked(manifestPath, (latest) => {
      latest.assignedWorkerTab = tab.id;
    });
  }

  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();

  try {
    const { sanitized } = sanitizePromptForMetaAI(prompt);
    const uniqueNeedle = buildUniqueNeedle(sanitized);

    try {
      return await attemptMetaCDPRender(client, tab, sanitized, uniqueNeedle, emitEvent, { projectId, episodeId, panelId });
    } catch (firstErr) {
      // Do not retry safety refusals in the same thread — only reset & retry stalled/unsubmitted tabs
      if (/Safety Guardrail Refused/i.test(firstErr.message)) {
        throw firstErr;
      }
      emitEvent('panel_progress', {
        projectId,
        episodeId,
        panelId: Number(panelId),
        status: 'META_TAB_RESET',
        message: `[meta-ai-cdp] Tab stalled (${firstErr.message}) — resetting to a fresh Meta AI chat and retrying once...`
      });
      await resetMetaTabToFreshChat(client);
      return await attemptMetaCDPRender(client, tab, sanitized, uniqueNeedle, emitEvent, { projectId, episodeId, panelId });
    }
  } finally {
    client.close();
    releaseTabLock(tab.id);
  }
}

module.exports = {
  buildUniqueNeedle,
  renderViaMetaCDP
};

