const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const { listAllCDPTabs, acquireTabForComic, acquireTabLock, releaseTabLock, loadLeases, CDPClient } = require('./cdp_tab_pool');
const { sanitizePromptForMetaAI } = require('../meta_engine');
const { refinePromptWithGemini, planDirectorActions, inspectPanelImageWithGemini, changedTextPairs, syncPromptText } = require('../ai_director');
const { writeEpisodeScript, directExistingScript } = require('../writers_room/ai_writers_room');
const { synthesizeEpisodeAudio, regeneratePanelAudio, regenerateEpisodeAudio, castReportWithBalance } = require('../audio_synthesizer');
const { renderAndInspectPanel } = require('./qa/visual_director');
const { FAL_MUSE_MODELS, renderViaFalMuse } = require('./providers/fal_muse');
const { getRegistryPath } = require('../voice_resolver');

const rootDir = path.join(__dirname, '..', '..');

const VENICE_MODELS = new Set([
  'grok-imagine-image-2-0',
  'flux-2-pro',
  'recraft-v4',
  'lustify-v8'
]);

function getVeniceApiKey() {
  if (process.env.VENICE_API_KEY) return process.env.VENICE_API_KEY;
  const envCandidates = [
    path.join(rootDir, '.env'),
    'C:\\research\\c-book-generator\\comic-studio\\.env'
  ];
  for (const envPath of envCandidates) {
    if (fs.existsSync(envPath)) {
      const env = fs.readFileSync(envPath, 'utf8');
      const match = env.match(/VENICE_API_KEY=([^\r\n]+)/);
      if (match) return match[1].trim();
    }
  }
  throw new Error('VENICE_API_KEY not found in environment or .env');
}

function emitEvent(type, payload) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    type,
    ...payload
  }));
}

function getArgs() {
  const args = {};
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i].startsWith('--')) {
      const key = process.argv[i].slice(2);
      const val = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : true;
      args[key] = val;
    }
  }
  return args;
}

function readJsonWithRetry(filePath) {
  let lastErr;
  for (let i = 0; i < 5; i++) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
      lastErr = e;
      const waitUntil = Date.now() + 50;
      while (Date.now() < waitUntil) {}
    }
  }
  throw lastErr;
}

function loadProjectAndManifest(projectId, episodeId) {
  const projPath = path.join(rootDir, 'projects', projectId, 'project.json');
  const manifestPath = path.join(rootDir, 'projects', projectId, 'episodes', episodeId, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest not found: ${manifestPath}`);
  }
  const project = fs.existsSync(projPath) ? readJsonWithRetry(projPath) : {};
  const manifest = readJsonWithRetry(manifestPath);
  return { projPath, manifestPath, project, manifest };
}

function saveManifest(manifestPath, data) {
  data.updatedAt = new Date().toISOString();
  const tmpPath = `${manifestPath}.tmp.${process.pid}`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpPath, manifestPath);
}

function updateManifestLocked(manifestPath, updaterFn) {
  const lockPath = `${manifestPath}.lock`;
  const deadline = Date.now() + 15000;
  let acquired = false;
  while (Date.now() < deadline) {
    try {
      const fd = fs.openSync(lockPath, 'wx');
      fs.writeFileSync(fd, `${process.pid}`);
      fs.closeSync(fd);
      acquired = true;
      break;
    } catch (e) {
      if (e.code === 'EEXIST') {
        try {
          const st = fs.statSync(lockPath);
          if (Date.now() - st.mtimeMs > 30000) {
            fs.unlinkSync(lockPath);
            continue;
          }
        } catch (_) {}
        const waitUntil = Date.now() + 40;
        while (Date.now() < waitUntil) {}
      } else {
        throw e;
      }
    }
  }
  try {
    const latest = readJsonWithRetry(manifestPath);
    updaterFn(latest);
    saveManifest(manifestPath, latest);
    return latest;
  } finally {
    if (acquired) {
      try { fs.unlinkSync(lockPath); } catch (_) {}
    }
  }
}

async function handleCDPStatus() {
  const status = await listAllCDPTabs();
  const leases = loadLeases();
  emitEvent('cdp_status', {
    online: status.online,
    tabs: status.tabs,
    leases
  });
}

async function renderViaVeniceModel(modelName, prompt) {
  const apiKey = getVeniceApiKey();
  const payload = {
    model: modelName,
    prompt,
    aspect_ratio: '16:9',
    width: 1280,
    height: 720,
    safe_mode: false
  };

  const res = await fetch('https://api.venice.ai/api/v1/image/generate', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Model ${modelName} API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  if (!data.images || !data.images[0]) {
    throw new Error(`Model ${modelName} response missing image payload`);
  }
  return Buffer.from(data.images[0], 'base64');
}

async function renderViaMetaCDP(projectId, episodeId, panelId, prompt, manifest, manifestPath) {
  emitEvent('panel_progress', {
    projectId,
    episodeId,
    panelId: Number(panelId),
    status: 'ACQUIRING_TAB',
    message: `[meta-ai-cdp] Acquiring isolated Chrome CDP tab for ${projectId}/${episodeId} Panel #${panelId}...`
  });

  const tab = await acquireTabForComic(projectId, episodeId, true);
  await acquireTabLock(tab.id);
  if (manifest && manifestPath) {
    manifest.assignedWorkerTab = tab.id;
    updateManifestLocked(manifestPath, (latest) => {
      latest.assignedWorkerTab = tab.id;
    });
  }

  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();

  try {
    const { sanitized } = sanitizePromptForMetaAI(prompt);
    const needleStart = Math.min(Math.max(0, sanitized.length - 60), Math.floor(sanitized.length * 0.55));
    const uniqueNeedle = sanitized.slice(needleStart, needleStart + 44).trim() || sanitized.slice(-44).trim();

    // Wait briefly if Meta AI is still streaming images from a prior turn so preFlightUrls is complete
    let prevCount = -1;
    for (let s = 0; s < 4; s++) {
      const cnt = await client.evaluate(`
        document.querySelectorAll('img').length
      `);
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

    // 0. If Meta AI is still stuck generating a previous turn ("Stop" button active), wait briefly then click Stop
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
      throw new Error(`Meta AI failed to submit prompt on tab ${tab.id} (Send button unavailable and input did not clear)`);
    }

    const startTime = Date.now();
    const preSet = new Set(preFlightUrls);

    while (Date.now() - startTime < 90000) {
      await new Promise(r => setTimeout(r, 2000));

      // Fast-fail check for Meta AI safety refusal text
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
  } finally {
    client.close();
    releaseTabLock(tab.id);
  }
}

function invalidateGatesFrom(manifest, fromGateId, reason) {
  if (!manifest || !manifest.gates) return;
  const gateOrder = ['SCRIPT_GATE', 'VISUAL_QA_GATE', 'AUDIO_QA_GATE'];
  const startIdx = gateOrder.indexOf(fromGateId);
  if (startIdx === -1) return;

  for (let i = startIdx; i < gateOrder.length; i++) {
    const gid = gateOrder[i];
    const g = manifest.gates.find(x => x.id === gid);
    if (!g) continue;
    if (i === startIdx) {
      g.status = 'AWAITING_APPROVAL';
      g.approvedAt = null;
      g.notes = reason;
    } else {
      g.status = 'LOCKED';
      g.approvedAt = null;
      g.notes = 'Locked until prior gate is approved.';
    }
  }

  // Relock downstream stages
  const stageOrder = ['SCRIPT_GENERATION', 'PROMPT_EXPANSION', 'VISUAL_RENDERING', 'VOICE_SYNTHESIS', 'VIDEO_ASSEMBLY', 'READY_FOR_RELEASE'];
  let stageStart = -1;
  if (fromGateId === 'SCRIPT_GATE') stageStart = 1;
  else if (fromGateId === 'VISUAL_QA_GATE') stageStart = 3;
  else if (fromGateId === 'AUDIO_QA_GATE') stageStart = 4;

  if (stageStart !== -1 && manifest.stages) {
    for (let i = stageStart; i < stageOrder.length; i++) {
      const sid = stageOrder[i];
      const st = manifest.stages.find(x => x.id === sid);
      if (st) st.status = 'LOCKED_BY_GATE';
    }
  }

  if (fromGateId === 'SCRIPT_GATE') {
    manifest.currentStage = 'SCRIPT_GATE';
  } else if (fromGateId === 'VISUAL_QA_GATE') {
    const vrStage = (manifest.stages || []).find(x => x.id === 'VISUAL_RENDERING');
    if (vrStage) vrStage.status = 'IN_PROGRESS';
    if (['READY_FOR_RELEASE', 'VIDEO_ASSEMBLY', 'VOICE_SYNTHESIS'].includes(manifest.currentStage)) {
      manifest.currentStage = 'VISUAL_QA_GATE';
    }
  } else if (fromGateId === 'AUDIO_QA_GATE') {
    if (['READY_FOR_RELEASE', 'VIDEO_ASSEMBLY'].includes(manifest.currentStage)) {
      manifest.currentStage = 'AUDIO_QA_GATE';
    }
  }
}

async function handleRenderPanel(projectId, episodeId, panelId, promptOverride, engineOverride, directorCorrection, screenshotPath = '', managedByGo = false) {
  const { manifestPath, project, manifest } = loadProjectAndManifest(projectId, episodeId);

  // Enforce Gate A (SCRIPT_GATE)
  const scriptGate = manifest.gates.find(g => g.id === 'SCRIPT_GATE');
  if (scriptGate && scriptGate.status !== 'APPROVED') {
    throw new Error(`Cannot render panels for ${projectId}/${episodeId}: Gate A (SCRIPT_GATE) is ${scriptGate.status}`);
  }

  const pIdx = manifest.panels.findIndex(p => p.panelId === Number(panelId));
  if (pIdx === -1) {
    throw new Error(`Panel #${panelId} not found in ${projectId}/${episodeId}`);
  }

  const panel = manifest.panels[pIdx];
  const prevImageStatus = panel.imageStatus || 'VERIFIED';

  // Resolve active image engine: CLI flag -> Panel override -> Episode manifest -> Project default -> meta-ai-cdp
  const activeEngine = (
    engineOverride ||
    panel.imageEngine ||
    manifest.imageEngine ||
    project.defaultImageEngine ||
    'meta-ai-cdp'
  ).toLowerCase();

  const rawOverride = (promptOverride && typeof promptOverride === 'string') ? promptOverride.trim() : '';
  const basePrompt = (panel.prompt || '').trim();
  const looksLikeFeedbackComment = Boolean(
    rawOverride &&
    basePrompt &&
    rawOverride !== basePrompt &&
    (
      rawOverride.length < Math.min(120, Math.floor(basePrompt.length * 0.55)) ||
      /^(?:fix|make|change|remove|add|replace|why|too\s|wrong\s|missing\s|no\s+more|don't|do\s+not|there\s+is|he\s+has|she\s+has|the\s+(?:sword|hand|face|ruby|background|lighting))/i.test(rawOverride)
    )
  );

  let targetPrompt = (rawOverride && !looksLikeFeedbackComment) ? rawOverride : (basePrompt || rawOverride);
  const combinedCorrection = [
    looksLikeFeedbackComment ? rawOverride : '',
    (directorCorrection && typeof directorCorrection === 'string') ? directorCorrection.trim() : ''
  ].filter(Boolean).join(' | ');

  // Pre-process prompt with AI Director (Gemini 3.8 Flash) if human correction notes or feedback comment provided
  const screenshot = screenshotPath || '';
  let refinementTrace = null;
  if (combinedCorrection) {
    emitEvent('panel_progress', {
      projectId,
      episodeId,
      panelId: Number(panelId),
      status: 'AI_DIRECTOR_REFINING',
      message: `[AI Director : Gemini 3.8 Flash (Medium)] Processing director feedback${screenshot ? ' + attached screenshot' : ''} into refined prompt: "${combinedCorrection}"...`
    });

    targetPrompt = await refinePromptWithGemini(targetPrompt, combinedCorrection, {
      engine: activeEngine,
      invariants: project.invariants || [],
      screenshotPath: screenshot,
      onTrace: (t) => { refinementTrace = t; }
    });
  }

  panel.prompt = targetPrompt;
  panel.imageStatus = 'RENDERING';
  if (!managedByGo) {
    updateManifestLocked(manifestPath, (latest) => {
      invalidateGatesFrom(latest, 'VISUAL_QA_GATE', `Panel #${panelId} told to regenerate — awaiting visual director re-inspection`);
      const lp = (latest.panels || []).find(x => Number(x.panelId) === Number(panelId));
      if (lp) {
        lp.prompt = targetPrompt;
        lp.imageStatus = 'RENDERING';
        lp.error = '';
        lp.qaNotes = '';
      }
    });
  }

  const previousPanel = pIdx > 0 ? manifest.panels[pIdx - 1] : null;
  await renderAndInspectPanel({
    rootDir,
    projectId,
    episodeId,
    panelId,
    panel,
    previousPanel,
    project,
    manifest,
    manifestPath,
    activeEngine,
    initialPrompt: targetPrompt,
    refinementTrace,
    readJsonWithRetry,
    updateManifestLocked,
    invalidateGatesFrom,
    emitEvent,
    managedByGo
  });
}

function getAudioDuration(audioFile) {
  try {
    const out = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioFile}"`, { encoding: 'utf8' }).trim();
    return parseFloat(out) || 4.0;
  } catch (e) {
    return 4.0;
  }
}

function getImageDimensions(imgPath) {
  try {
    const out = execSync(`ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${imgPath}"`, { encoding: 'utf8' }).trim();
    const [w, h] = out.split('x').map(Number);
    return { w: w || 1920, h: h || 1280, ar: (w && h) ? w / h : 1.5 };
  } catch (e) {
    return { w: 1920, h: 1280, ar: 1.5 };
  }
}

function getVideoFilter(imgPath, panelDuration, panelId) {
  const { ar } = getImageDimensions(imgPath);
  const totalFrames = Math.ceil(panelDuration * 30);

  // 1. Vertical Portrait Panel (e.g. 1280x1920): Smooth Vertical Tilt (top to bottom)
  if (ar < 1.0) {
    return `scale=1280:-1,crop=1280:720:0:'(ih-720)*(0.5*(1-cos(PI*t/${panelDuration.toFixed(2)})))',format=yuv420p`;
  }

  // 2. Ultra-Wide Panoramic Panel (e.g. 2240x1120, ar >= 1.8): Smooth Horizontal Pan
  if (ar >= 1.8) {
    return `scale=-1:720,crop=1280:720:'(iw-1280)*(0.5*(1-cos(PI*t/${panelDuration.toFixed(2)})))':0,format=yuv420p`;
  }

  // 3. Standard Landscape: Subtle Ken Burns push
  const holdFrames = 36;
  const zoomExpr = `if(lte(on,${holdFrames}),1.0,min(1.0+(on-${holdFrames})*0.00012,1.04))`;
  const yExpr = '0';
  const xExpr = panelId % 2 === 0 ? `iw/2-(iw/zoom/2)+((on/${totalFrames})-0.5)*30` : `iw/2-(iw/zoom/2)-((on/${totalFrames})-0.5)*30`;
  return `scale=1536:864,zoompan=z='${zoomExpr}':x='${xExpr}':y='${yExpr}':d=${totalFrames}:s=1280x720:fps=30,format=yuv420p`;
}

async function handleAssembleVideo(projectId, episodeId) {
  const { manifestPath, manifest } = loadProjectAndManifest(projectId, episodeId);

  // Enforce Gate C (AUDIO_QA_GATE)
  const audioGate = (manifest.gates || []).find(g => g.id === 'AUDIO_QA_GATE');
  if (audioGate && audioGate.status !== 'APPROVED') {
    throw new Error(`Cannot assemble video for ${projectId}/${episodeId}: Gate C (AUDIO_QA_GATE) is ${audioGate.status}`);
  }

  const panels = manifest.panels || [];
  if (panels.length === 0) {
    throw new Error(`No panels configured in ${projectId}/${episodeId}`);
  }

  const workDir = path.join(rootDir, 'projects', projectId, 'episodes', episodeId, 'video');
  const segDir = path.join(workDir, 'segments');
  fs.mkdirSync(segDir, { recursive: true });

  const totalPanels = panels.length;
  const segmentFiles = [];
  const tsList = [];
  let cumulativeTime = 0;

  emitEvent('stage_update', {
    projectId,
    episodeId,
    stage: 'VIDEO_ASSEMBLY',
    status: 'IN_PROGRESS',
    progress: 5,
    message: `Starting Motion Comic Video Assembly for ${totalPanels} panels...`
  });

  for (let idx = 0; idx < totalPanels; idx++) {
    const p = panels[idx];
    const pad = String(p.panelId).padStart(2, '0');

    // Resolve panel image
    let imageFile = path.join(rootDir, 'projects', projectId, 'episodes', episodeId, 'panels', `panel_${pad}.webp`);
    if (!fs.existsSync(imageFile) && p.imagePath) {
      imageFile = path.join(rootDir, p.imagePath);
    }
    if (!fs.existsSync(imageFile)) {
      throw new Error(`Image for Panel #${p.panelId} not found at ${imageFile}`);
    }

    // Resolve audio
    let audioFile = path.join(rootDir, 'projects', projectId, 'episodes', episodeId, 'audio', `p${pad}_mixed.wav`);

    let duration = 4.0;
    let hasAudio = false;
    if (fs.existsSync(audioFile)) {
      duration = getAudioDuration(audioFile);
      hasAudio = true;
    }

    const currentPct = Math.round(5 + ((idx + 1) / totalPanels) * 80);
    emitEvent('video_progress', {
      projectId,
      episodeId,
      stage: 'VIDEO_ASSEMBLY',
      panelId: p.panelId,
      current: idx + 1,
      total: totalPanels,
      progress: currentPct,
      message: `[${idx + 1}/${totalPanels}] Rendering motion segment for Panel #${p.panelId} (${duration.toFixed(1)}s, ${hasAudio ? 'with audio' : 'silent'})...`
    });

    const segFile = path.join(segDir, `p${pad}_seg.mp4`);
    const tsSeg = path.join(segDir, `p${pad}_seg.ts`);
    const filter = getVideoFilter(imageFile, duration, p.panelId);

    let renderCmd = '';
    if (hasAudio) {
      renderCmd = `ffmpeg -y -loop 1 -r 30 -i "${imageFile}" -i "${audioFile}" -filter_complex "[0:v]${filter}[v]" -map "[v]" -map 1:a -r 30 -c:v libx264 -preset fast -crf 19 -c:a aac -b:a 192k -ar 44100 -shortest -t ${duration.toFixed(2)} "${segFile}"`;
    } else {
      renderCmd = `ffmpeg -y -loop 1 -r 30 -i "${imageFile}" -f lavfi -i anullsrc=r=44100:cl=stereo -filter_complex "[0:v]${filter}[v]" -map "[v]" -map 1:a -r 30 -c:v libx264 -preset fast -crf 19 -c:a aac -b:a 192k -ar 44100 -t ${duration.toFixed(2)} "${segFile}"`;
    }

    execSync(renderCmd, { stdio: 'ignore' });
    execSync(`ffmpeg -y -i "${segFile}" -c copy -bsf:v h264_mp4toannexb -f mpegts "${tsSeg}"`, { stdio: 'ignore' });

    segmentFiles.push(segFile);
    tsList.push(`file '${tsSeg.replace(/\\/g, '/')}'`);
    cumulativeTime += duration;
  }

  emitEvent('video_progress', {
    projectId,
    episodeId,
    stage: 'VIDEO_ASSEMBLY',
    status: 'CONCAT',
    progress: 92,
    message: `Stitching all ${totalPanels} MPEG-TS segments into zero-drift master video...`
  });

  const concatList = path.join(workDir, 'concat_list.txt');
  fs.writeFileSync(concatList, tsList.join('\n'), 'utf8');

  const masterRel = `projects/${projectId}/episodes/${episodeId}/video/${episodeId}_motion_comic.mp4`;
  const masterOut = path.join(rootDir, masterRel);
  fs.mkdirSync(path.dirname(masterOut), { recursive: true });

  const concatCmd = `ffmpeg -y -f concat -safe 0 -i "${concatList}" -c:v libx264 -preset fast -crf 19 -c:a aac -b:a 192k -ar 44100 -movflags +faststart "${masterOut}"`;
  execSync(concatCmd, { stdio: 'ignore' });

  // Clean up .ts segments
  for (const seg of segmentFiles) {
    const ts = seg.replace(/\.mp4$/, '.ts');
    if (fs.existsSync(ts)) {
      try { fs.unlinkSync(ts); } catch (e) {}
    }
  }

  const stat = fs.statSync(masterOut);
  const sizeMB = (stat.size / (1024 * 1024)).toFixed(1);
  const runtimeMins = Math.floor(cumulativeTime / 60);
  const runtimeSecs = Math.floor(cumulativeTime % 60);
  const runtimeStr = `${runtimeMins}m ${runtimeSecs}s`;

  // Update Manifest
  updateManifestLocked(manifestPath, (latest) => {
    if (!latest.outputs) latest.outputs = {};
    latest.outputs.masterVideoPath = masterRel;
    latest.outputs.durationSeconds = Math.round(cumulativeTime * 10) / 10;
    latest.outputs.resolution = '1280x720 @ 30fps (MPEG-TS Verified)';

    for (const s of latest.stages || []) {
      if (s.id === 'VIDEO_ASSEMBLY' || s.id === 'READY_FOR_RELEASE') {
        s.status = 'COMPLETED';
        s.progress = 100;
      }
    }
    latest.currentStage = 'READY_FOR_RELEASE';
    latest.overallProgress = 100;
    latest.updatedAt = new Date().toISOString();
  });

  emitEvent('video_complete', {
    projectId,
    episodeId,
    stage: 'VIDEO_ASSEMBLY',
    status: 'COMPLETED',
    progress: 100,
    masterVideoPath: masterRel,
    sizeMB,
    durationSeconds: manifest.outputs.durationSeconds,
    runtime: runtimeStr,
    message: `Master Motion Comic Complete! (${sizeMB} MB, ${runtimeStr}, 30fps MPEG-TS Verified)`
  });
}

async function handleGenerateScript(projectId, episodeId, guidance = '') {
  const say = (message) => emitEvent('script_progress', { projectId, episodeId, status: 'WRITING', message });
  say(`Convening the AI Writers' Room for ${projectId}/${episodeId}...`);

  const { manifestPath, project } = loadProjectAndManifest(projectId, episodeId);
  const result = await writeEpisodeScript({ projectId, episodeId, guidance, onProgress: say });
  const panels = result.panels;

  updateManifestLocked(manifestPath, (latest) => {
    latest.panels = panels;
    latest.targetPanelCount = panels.length;
    latest.currentStage = 'SCRIPT_GATE';
    latest.overallProgress = 18;
    latest.outputs = { resolution: `Configured for ${panels.length} Panels • Awaiting Gate A Approval` };
    latest.writersRoom = result.writersRoom;
    const generic = !latest.title || /^(chapter|episode|issue)\s*#?\d+$/i.test(String(latest.title).trim());
    if (generic && result.title) latest.title = result.title;
    for (const st of latest.stages || []) {
      if (st.id === 'SCRIPT_GENERATION') { st.status = 'COMPLETED'; st.progress = 100; }
    }
    for (const g of latest.gates || []) {
      if (g.id === 'SCRIPT_GATE') {
        g.status = 'AWAITING_APPROVAL';
        const sc = result.writersRoom.editorScores || {};
        g.notes = `AI Writers' Room wrote ${panels.length} panels (${result.writersRoom.structure || 'story'}). ` +
          (Object.keys(sc).length ? `Editor's draft scores: ${Object.entries(sc).map(([k, v]) => `${k} ${v}`).join(', ')}. ` : '') +
          `Ready for director lock.`;
      }
    }
  });

  const sfxCount = panels.reduce((a, p) => a + (p.soundEffects || []).length, 0);
  emitEvent('script_complete', {
    projectId,
    episodeId,
    panelsCount: panels.length,
    status: 'AWAITING_APPROVAL',
    message: `AI Writers' Room wrote ${panels.length} panels for ${result.title || project.title} — ${sfxCount} sound effects, voice acting on every line. Review it at Gate A.`
  });
}

async function handleDirectEpisodeAudio(projectId, episodeId) {
  const say = (message) => emitEvent('script_progress', { projectId, episodeId, status: 'WRITING', message });
  const { manifestPath } = loadProjectAndManifest(projectId, episodeId);
  const res = await directExistingScript({ projectId, episodeId, onProgress: say });
  const byId = new Map(res.panels.map(p => [Number(p.panelId), p]));
  updateManifestLocked(manifestPath, (latest) => {
    for (const p of latest.panels || []) {
      const d = byId.get(Number(p.panelId));
      if (!d) continue;
      // Only the performance fields change; if the words were edited meanwhile, leave that panel alone
      if ((d.caption || '') !== (p.caption || '') || JSON.stringify((d.dialogue || []).map(x => x.text)) !== JSON.stringify((p.dialogue || []).map(x => x.text))) continue;
      if (d.captionDirection) p.captionDirection = d.captionDirection;
      p.dialogue = (p.dialogue || []).map((line, i) => (d.dialogue[i] && d.dialogue[i].audioDirection) ? Object.assign({}, line, { audioDirection: d.dialogue[i].audioDirection }) : line);
      p.soundEffects = d.soundEffects || [];
      p.ambience = d.ambience || '';
    }
    latest.updatedAt = new Date().toISOString();
  });
  emitEvent('script_progress', { projectId, episodeId, status: 'COMPLETED',
    message: `AI Writers' Room wrote ${res.panels.length} panels' voice direction — ${res.lines} lines directed, ${res.effects} sound effects. Voice the episode on the Voice tab.` });
}

async function handleSynthesizeVoice(projectId, episodeId) {
  emitEvent('stage_update', {
    projectId,
    episodeId,
    stage: 'VOICE_SYNTHESIS',
    status: 'IN_PROGRESS',
    progress: 5,
    message: `Starting multi-actor voice synthesis & DSP mastering for ${projectId}/${episodeId}...`
  });

  const res = await synthesizeEpisodeAudio(projectId, episodeId, (prog) => {
    emitEvent('stage_update', {
      projectId,
      episodeId,
      stage: 'VOICE_SYNTHESIS',
      status: 'IN_PROGRESS',
      progress: prog.progress,
      message: prog.message
    });
  });

  emitEvent('stage_update', {
    projectId,
    episodeId,
    stage: 'VOICE_SYNTHESIS',
    status: 'COMPLETED',
    progress: 100,
    message: `Voice synthesis complete! (${res.totalPanels} panels, ${res.durationSeconds}s audio${res.revoicedPanels ? `, ${res.revoicedPanels} re-voiced to match the cast` : ''}, ~${res.creditsUsed || 0} ElevenLabs credits used)`
  });

  emitEvent('gate_update', {
    projectId,
    episodeId,
    gateId: 'AUDIO_QA_GATE',
    status: 'AWAITING_APPROVAL',
    message: `Voice synthesis complete. Ready for 5-Point Acoustic QA approval.`
  });
}

async function handleRegenerateAudio(projectId, episodeId, panelId, feedback = '') {
  const pid = Number(panelId);
  emitEvent('stage_update', {
    projectId,
    episodeId,
    stage: 'VOICE_SYNTHESIS',
    status: 'IN_PROGRESS',
    progress: 25,
    message: `Regenerating Panel #${String(pid).padStart(2, '0')} audio${feedback ? ` with feedback: "${feedback}"` : ''}...`
  });

  const res = await regeneratePanelAudio(projectId, episodeId, pid, feedback);

  emitEvent('audio_panel_regenerated', {
    projectId,
    episodeId,
    panelId: pid,
    audioPath: res.audioPath,
    durationSeconds: res.durationSeconds,
    message: `Panel #${String(pid).padStart(2, '0')} audio regenerated (${res.durationSeconds}s, ${res.freshTake ? 'fresh take, ' : ''}~${res.creditsUsed || 0} ElevenLabs credits).`,
    promptSent: res.trace || null,
    responseReceived: {
      audioPath: res.audioPath,
      durationSeconds: res.durationSeconds,
      directorNotes: res.directorNotes || '',
      caption: res.caption || '',
      dialogue: res.dialogue || []
    }
  });

  emitEvent('gate_update', {
    projectId,
    episodeId,
    gateId: 'AUDIO_QA_GATE',
    status: 'AWAITING_APPROVAL',
    message: `Panel #${String(pid).padStart(2, '0')} audio regenerated. Ready for 5-Point Acoustic QA approval.`
  });
}

async function handleRegenerateEpisodeAudio(projectId, episodeId, feedback = '') {
  emitEvent('stage_update', {
    projectId,
    episodeId,
    stage: 'VOICE_SYNTHESIS',
    status: 'IN_PROGRESS',
    progress: 5,
    message: feedback
      ? `AI Voice Director working on episode feedback: "${feedback}"`
      : `Re-voicing panels that don't match the project cast...`
  });

  const res = await regenerateEpisodeAudio(projectId, episodeId, feedback, (prog) => {
    emitEvent('stage_update', {
      projectId,
      episodeId,
      stage: 'VOICE_SYNTHESIS',
      status: 'IN_PROGRESS',
      progress: prog.progress || 10,
      panelId: prog.panelId,
      message: prog.message
    });
  });

  const parts = [];
  if (res.directorNotes) parts.push(res.directorNotes);
  if (res.castChanges.length) parts.push(`Cast changes: ${res.castChanges.join('; ')}`);
  parts.push(res.revoicedPanels.length ? `Re-voiced panels ${res.revoicedPanels.join(', ')} (~${res.creditsUsed || 0} ElevenLabs credits; unchanged lines reused).` : 'No panels needed re-voicing.');
  if (res.otherEpisodesAffected.length) parts.push(`Cast changes also apply to ${res.otherEpisodesAffected.join(', ')}; re-voice those to keep the comic consistent.`);

  emitEvent('episode_audio_regenerated', Object.assign({ projectId, episodeId, message: parts.join(' ') }, res));
  emitEvent('stage_update', {
    projectId,
    episodeId,
    stage: 'VOICE_SYNTHESIS',
    status: 'COMPLETED',
    progress: 100,
    message: parts.join(' ')
  });
}

async function handleCastCheck(projectId) {
  emitEvent('cast_report', await castReportWithBalance(projectId));
}

function resolveEffectiveFeedback(panel, comment = '', promptOverride = '') {
  const rawOverride = (promptOverride && typeof promptOverride === 'string') ? promptOverride.trim() : '';
  const basePrompt = (panel.prompt || '').trim();
  const overrideIsComment = Boolean(
    rawOverride &&
    basePrompt &&
    rawOverride !== basePrompt &&
    (
      rawOverride.length < Math.min(120, Math.floor(basePrompt.length * 0.55)) ||
      /^(?:fix|make|change|remove|add|replace|why|too\s|wrong\s|missing\s|no\s+more|don't|do\s+not|there\s+is|he\s+has|she\s+has|the\s+(?:sword|hand|face|ruby|background|lighting|text|audio))/i.test(rawOverride)
    )
  );
  const effectiveComment = [
    overrideIsComment ? rawOverride : '',
    (comment && typeof comment === 'string') ? comment.trim() : ''
  ].filter(Boolean).join(' | ');
  return { rawOverride, overrideIsComment, effectiveComment };
}

async function handleDirectorPlan(projectId, episodeId, panelId, comment = '', sourceContext = 'panel', promptOverride = '', screenshotPath = '') {
  const pid = Number(panelId);
  const { project, manifest } = loadProjectAndManifest(projectId, episodeId);
  const panel = (manifest.panels || []).find(p => Number(p.panelId) === pid);
  if (!panel) {
    throw new Error(`Panel #${pid} not found in ${projectId}/${episodeId}`);
  }
  const { effectiveComment } = resolveEffectiveFeedback(panel, comment, promptOverride);

  let voiceRegistry = {};
  const regPath = getRegistryPath(projectId);
  if (fs.existsSync(regPath)) {
    try { voiceRegistry = JSON.parse(fs.readFileSync(regPath, 'utf8')); } catch (e) {}
  }

  const log = (message, level = 'info') => emitEvent('director_plan_log', { projectId, episodeId, panelId: pid, level, message });
  log(`Read panel #${pid} ("${panel.name || ''}"): caption, ${(panel.dialogue || []).length} dialogue line(s), art prompt.`);
  log(`Asking the AI director (${process.env.CONAN_AI_MODEL || 'gemini-3.8-flash-medium'} via Antigravity). This usually takes 20–90 s.`);
  const planStarted = Date.now();
  const plan = await planDirectorActions(
    panel,
    { project, manifest, voiceRegistry },
    effectiveComment,
    sourceContext,
    screenshotPath
  );
  const orderedSteps = [];
  if (plan.updateScript) orderedSteps.push('SCRIPT');
  if (plan.regeneratePanel) orderedSteps.push('PANEL');
  if (plan.regenerateAudio) orderedSteps.push('AUDIO');
  const lowestGate = plan.updateScript
    ? 'SCRIPT_GATE'
    : (plan.regeneratePanel ? 'VISUAL_QA_GATE' : 'AUDIO_QA_GATE');
  const secs = Math.round((Date.now() - planStarted) / 1000);
  if (plan.trace && plan.trace.source === 'deterministic-fallback') {
    log(`AI director unavailable after ${secs}s (${plan.aiUnavailableReason || 'no answer'}). Used the rule-based director instead.`, 'warn');
  } else {
    log(`AI director answered in ${secs}s.`, 'ok');
  }
  const steps = [plan.updateScript && 'update script', plan.regeneratePanel && 'redraw panel', plan.regenerateAudio && 'redo audio'].filter(Boolean);
  log(`Plan ready: ${steps.join(' → ') || 'no actions'}. Review it and press Confirm & Execute.`, 'ok');

  emitEvent('director_plan_preview', {
    projectId,
    episodeId,
    panelId: pid,
    panelName: panel.name || '',
    currentCaption: panel.caption || '',
    currentDialogue: panel.dialogue || [],
    plan,
    trace: plan.trace || null,
    orderedSteps,
    lowestGate
  });
}

async function handleDirectorFeedback(projectId, episodeId, panelId, comment = '', sourceContext = 'panel', promptOverride = '', screenshotPath = '', planJson = '', managedByGo = false) {
  const pid = Number(panelId);
  const { manifestPath, project, manifest } = loadProjectAndManifest(projectId, episodeId);
  const pIdx = (manifest.panels || []).findIndex(p => Number(p.panelId) === pid);
  if (pIdx === -1) {
    throw new Error(`Panel #${pid} not found in ${projectId}/${episodeId}`);
  }
  const panel = manifest.panels[pIdx];
  const prevImageStatus = panel.imageStatus || 'VERIFIED';

  const { rawOverride, overrideIsComment, effectiveComment } = resolveEffectiveFeedback(panel, comment, promptOverride);

  let voiceRegistry = {};
  const regPath = getRegistryPath(projectId);
  if (fs.existsSync(regPath)) {
    try { voiceRegistry = JSON.parse(fs.readFileSync(regPath, 'utf8')); } catch (e) {}
  }

  let plan = null;
  if (planJson && typeof planJson === 'string' && planJson.trim()) {
    try {
      plan = JSON.parse(planJson);
    } catch (e) {}
  }

  if (!plan) {
    emitEvent('panel_progress', {
      projectId,
      episodeId,
      panelId: pid,
      status: 'AI_DIRECTOR_PLANNING',
      message: `[AI Director] Analyzing intents from "${sourceContext}" feedback...`
    });

    plan = await planDirectorActions(
      panel,
      { project, manifest, voiceRegistry },
      effectiveComment,
      sourceContext,
      screenshotPath
    );
  }

  const onlyStep = (plan && plan.onlyStep) ? String(plan.onlyStep).toUpperCase() : '';
  const runScript = onlyStep ? (onlyStep === 'SCRIPT') : Boolean(plan.updateScript);
  const runPanel = onlyStep ? (onlyStep === 'PANEL') : Boolean(plan.regeneratePanel);
  const runAudio = onlyStep ? (onlyStep === 'AUDIO') : Boolean(plan.regenerateAudio);
  const runGate = onlyStep ? (onlyStep === 'GATE') : true;

  const orderedSteps = [];
  if (plan.updateScript) orderedSteps.push('SCRIPT');
  if (plan.regeneratePanel) orderedSteps.push('PANEL');
  if (plan.regenerateAudio) orderedSteps.push('AUDIO');

  // Immediately update panel task indicators in manifest so the Visual Task Queue reflects planned work
  updateManifestLocked(manifestPath, (latest) => {
    const lp = (latest.panels || []).find(p => Number(p.panelId) === pid);
    if (!lp) return;
    if (runPanel) {
      lp.imageStatus = 'RENDERING';
      if (plan && plan.engine) lp.imageEngine = plan.engine;
    } else if (lp.imageStatus === 'IN_PROGRESS') {
      lp.imageStatus = prevImageStatus === 'IN_PROGRESS' ? 'VERIFIED' : prevImageStatus;
    }
    if (runAudio) {
      lp.audioStatus = 'PENDING';
    }
    latest.updatedAt = new Date().toISOString();
  });

  emitEvent('director_plan', {
    projectId,
    episodeId,
    panelId: pid,
    onlyStep,
    steps: orderedSteps,
    message: plan.directorSummary
  });

  // 1. SCRIPT STEP (always first so both panel and audio see updated caption/dialogue)
  if (runScript) {
    const prevCaption = panel.caption || '';
    const prevDialogue = Array.isArray(panel.dialogue) ? panel.dialogue : [];
    let reworkedPlan = null;
    if (typeof plan.reworkFeedback === 'string' && plan.reworkFeedback.trim()) {
      reworkedPlan = await planDirectorActions(
        panel,
        { project, manifest, voiceRegistry },
        plan.reworkFeedback.trim(),
        'script_rework',
        screenshotPath
      );
      if (typeof reworkedPlan.updatedCaption === 'string' && reworkedPlan.updatedCaption.trim()) {
        plan.updatedCaption = reworkedPlan.updatedCaption.trim();
      }
      if (Array.isArray(reworkedPlan.updatedDialogue) && reworkedPlan.updatedDialogue.length > 0) {
        plan.updatedDialogue = reworkedPlan.updatedDialogue;
      }
      if (reworkedPlan.directorSummary) plan.directorSummary = reworkedPlan.directorSummary;
      if (reworkedPlan.trace) plan.trace = reworkedPlan.trace;
    }

    if (typeof plan.updatedCaption === 'string' && plan.updatedCaption.trim()) {
      panel.caption = plan.updatedCaption.trim();
    }
    if (Array.isArray(plan.updatedDialogue) && plan.updatedDialogue.length > 0) {
      const prevDlg = Array.isArray(panel.dialogue) ? panel.dialogue : [];
      panel.dialogue = plan.updatedDialogue.map((d, idx) => {
        const existing = prevDlg[idx] || {};
        // Keep the existing spelling of the speaker's name when the AI only changed its case
        const sameSpeaker = existing.speaker && d.speaker && String(existing.speaker).toLowerCase() === String(d.speaker).toLowerCase();
        return Object.assign({}, existing, {
          speaker: sameSpeaker ? existing.speaker : (d.speaker || existing.speaker || 'NARRATOR'),
          text: d.text !== undefined ? d.text : existing.text
        });
      });
    }
    panel.lastDirectorPlan = plan.directorSummary;
    // Keep the lettering in the image prompt in step with the new caption/dialogue
    const synced = syncPromptText(panel.prompt, changedTextPairs(prevCaption, prevDialogue, panel.caption, panel.dialogue));
    if (synced.changed) panel.prompt = synced.prompt;
    updateManifestLocked(manifestPath, (latest) => {
      const lp = (latest.panels || []).find(p => Number(p.panelId) === pid);
      if (lp) {
        lp.caption = panel.caption;
        lp.dialogue = panel.dialogue;
        if (synced.changed) lp.prompt = panel.prompt;
        lp.lastDirectorPlan = panel.lastDirectorPlan;
      }
      latest.updatedAt = new Date().toISOString();
    });

    emitEvent('script_updated', {
      projectId,
      episodeId,
      panelId: pid,
      promptSent: (plan.trace && plan.trace.promptSent) ? plan.trace.promptSent : effectiveComment,
      responseReceived: {
        source: (plan.trace && plan.trace.source) || 'script-room',
        previousCaption: prevCaption,
        updatedCaption: panel.caption || '',
        previousDialogue: prevDialogue,
        updatedDialogue: panel.dialogue || [],
        directorSummary: plan.directorSummary || ''
      },
      reworkedPlan,
      message: `Script updated for Panel #${String(pid).padStart(2, '0')} (${plan.directorSummary})`
    });
  }

  // 2. PANEL VISUAL STEP (after script, before audio)
  let panelRenderError = null;
  if (runPanel) {
    try {
      await handleRenderPanel(
        projectId,
        episodeId,
        pid,
        overrideIsComment ? '' : rawOverride,
        (plan && plan.engine) || panel.imageEngine || '',
        plan.visualInstruction || effectiveComment,
        screenshotPath,
        managedByGo
      );
    } catch (err) {
      panelRenderError = err;
      emitEvent('worker_log', {
        projectId,
        episodeId,
        panelId: pid,
        message: `Panel #${String(pid).padStart(2, '0')} visual render failed (${err.message})${onlyStep ? '.' : '; continuing remaining Director steps.'}`
      });
    }
  }

  // 3. AUDIO STEP (after script and panel)
  if (runAudio) {
    await handleRegenerateAudio(
      projectId,
      episodeId,
      pid,
      plan.audioInstruction || effectiveComment
    );
  }

  if (onlyStep && !runGate) {
    emitEvent('director_step_complete', {
      projectId,
      episodeId,
      panelId: pid,
      step: onlyStep,
      failed: Boolean(panelRenderError),
      message: panelRenderError
        ? `Step ${onlyStep} failed: ${panelRenderError.message}`
        : `Step ${onlyStep} completed — awaiting your confirmation.`
    });
    return;
  }

  // Enforce gate authorization reset back to the lowest affected stage
  const lowestGate = plan.updateScript
    ? 'SCRIPT_GATE'
    : (plan.regeneratePanel ? 'VISUAL_QA_GATE' : 'AUDIO_QA_GATE');
  updateManifestLocked(manifestPath, (finalManifest) => {
    invalidateGatesFrom(
      finalManifest,
      lowestGate,
      `Panel #${String(pid).padStart(2, '0')} modified by AI Director (${orderedSteps.join(' → ')}): awaiting re-approval from ${lowestGate}.`
    );
    finalManifest.updatedAt = new Date().toISOString();
  });

  emitEvent('gate_update', {
    projectId,
    episodeId,
    gateId: lowestGate,
    status: 'AWAITING_APPROVAL',
    message: `Authorization reset to lowest affected gate: ${lowestGate}`
  });

  emitEvent('director_complete', {
    projectId,
    episodeId,
    panelId: pid,
    steps: orderedSteps,
    lowestGate,
    message: panelRenderError
      ? `AI Director finished Audio/Script, but Panel #${pid} render failed: ${panelRenderError.message}`
      : `AI Director finished (${orderedSteps.join(' → ')}): ${plan.directorSummary}`
  });

  if (panelRenderError) {
    throw panelRenderError;
  }
}

async function handleSampleArt(projectId, promptOverride = '', comments = '') {
  const projPath = path.join(rootDir, 'projects', projectId, 'project.json');
  const project = fs.existsSync(projPath) ? JSON.parse(fs.readFileSync(projPath, 'utf8')) : { id: projectId };
  const activeEngine = (project.defaultImageEngine || 'meta-ai-cdp').toLowerCase();

  let targetPrompt = (promptOverride || '').trim();
  if (!targetPrompt) {
    const biblePath = path.join(rootDir, 'projects', projectId, 'bible', 'characters.json');
    const bible = fs.existsSync(biblePath) ? JSON.parse(fs.readFileSync(biblePath, 'utf8')) : {};
    const style = project.artStyleAnchor || 'classic vintage graphic novel comic book panel, dramatic chiaroscuro ink brushwork';
    const story = bible.storyDirection || project.genre || 'dramatic graphic novel scene';
    const chars = Array.isArray(bible.characters)
      ? bible.characters.slice(0, 2).map(c => `${c.name}: ${c.visualPrompt}`).filter(Boolean).join('; ')
      : '';
    targetPrompt = `${style}, wide atmospheric key-frame illustration. Scene: ${story}${chars ? `. Featuring ${chars}` : ''}. No speech bubbles or text boxes.`;
  }

  if (comments && comments.trim()) {
    emitEvent('sample_art_progress', {
      projectId,
      status: 'REFINING_PROMPT',
      message: `Applying director comments to sample art prompt: "${comments.trim()}"...`
    });
    targetPrompt = await refinePromptWithGemini(targetPrompt, comments.trim(), {
      engine: activeEngine,
      invariants: project.invariants || []
    });
  }

  emitEvent('sample_art_progress', {
    projectId,
    status: 'RENDERING',
    message: `Rendering sample art via ${activeEngine}...`
  });

  let downloadedBuf = null;
  if (VENICE_MODELS.has(activeEngine)) {
    downloadedBuf = await renderViaVeniceModel(activeEngine, targetPrompt);
  } else if (FAL_MUSE_MODELS.has(activeEngine)) {
    downloadedBuf = await renderViaFalMuse(targetPrompt);
  } else {
    downloadedBuf = await renderViaMetaCDP(projectId, 'sample', 0, targetPrompt, null, null);
  }

  const outRel = `projects/${projectId}/bible/sample_art.webp`;
  const outPath = path.join(rootDir, outRel);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, downloadedBuf);

  emitEvent('sample_art_complete', {
    projectId,
    imageUrl: `/workspace-projects/${projectId}/bible/sample_art.webp?t=${Date.now()}`,
    prompt: targetPrompt,
    engine: activeEngine
  });
}

async function handleGenerateSheets(projectId, entityType = '', entityId = '') {
  const projPath = path.join(rootDir, 'projects', projectId, 'project.json');
  const project = fs.existsSync(projPath) ? JSON.parse(fs.readFileSync(projPath, 'utf8')) : { id: projectId };
  const biblePath = path.join(rootDir, 'projects', projectId, 'bible', 'characters.json');
  if (!fs.existsSync(biblePath)) {
    throw new Error(`Project bible not found: ${biblePath}. Save characters & story first.`);
  }
  const bible = JSON.parse(fs.readFileSync(biblePath, 'utf8'));
  const activeEngine = (project.defaultImageEngine || 'meta-ai-cdp').toLowerCase();
  const style = project.artStyleAnchor || 'classic vintage graphic novel comic book illustration, crisp black ink brushwork, cel-shaded coloring';

  const queue = [];
  const addItems = (list, type) => {
    if (!Array.isArray(list)) return;
    if (entityType && entityType !== type) return;
    for (const item of list) {
      if (entityId && item.id !== entityId) continue;
      if (!item.name && !item.visualPrompt) continue;
      queue.push({ type, item });
    }
  };

  addItems(bible.characters, 'char');
  addItems(bible.objects, 'object');
  addItems(bible.settings, 'setting');

  if (queue.length === 0) {
    throw new Error('No characters, objects, or settings found to generate sheets for.');
  }

  const sheetsDir = path.join(rootDir, 'projects', projectId, 'bible', 'sheets');
  fs.mkdirSync(sheetsDir, { recursive: true });

  for (let i = 0; i < queue.length; i++) {
    const { type, item } = queue[i];
    const safeId = (item.id || `item_${i}`).replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
    const label = item.name || safeId;

    emitEvent('sheet_progress', {
      projectId,
      entityType: type,
      entityId: item.id,
      name: label,
      status: 'RENDERING',
      current: i + 1,
      total: queue.length,
      message: `[${i + 1}/${queue.length}] Generating ${type} reference sheet for "${label}"...`
    });

    let prompt = '';
    if (type === 'char') {
      prompt = `${item.name}, ${item.visualPrompt}, ${style}, character model sheet turnaround, three full-body views: front heroic stance, 3/4 portrait closeup, dynamic action pose, neutral off-white parchment background, consistent proportions and attire across all views`;
    } else if (type === 'object') {
      prompt = `${item.name}, ${item.visualPrompt}, ${style}, object turnaround model sheet, 3-view technical reference sheet: side profile view, top perspective view, dynamic detail angle, clean neutral parchment background`;
    } else {
      prompt = `${item.name}, ${item.visualPrompt}, ${style}, wide panoramic environment concept art sheet, establishing architectural mood board, dramatic lighting, no characters`;
    }

    let buf = null;
    if (VENICE_MODELS.has(activeEngine)) {
      buf = await renderViaVeniceModel(activeEngine, prompt);
    } else if (FAL_MUSE_MODELS.has(activeEngine)) {
      buf = await renderViaFalMuse(prompt);
    } else {
      buf = await renderViaMetaCDP(projectId, 'sheets', i + 1, prompt, null, null);
    }

    const fileName = `${type}_${safeId}.webp`;
    fs.writeFileSync(path.join(sheetsDir, fileName), buf);
    const sheetUrl = `/workspace-projects/${projectId}/bible/sheets/${fileName}?t=${Date.now()}`;
    item.sheetUrl = sheetUrl;
    bible.updatedAt = new Date().toISOString();
    fs.writeFileSync(biblePath, JSON.stringify(bible, null, 2), 'utf8');

    emitEvent('sheet_complete', {
      projectId,
      entityType: type,
      entityId: item.id,
      name: label,
      sheetUrl,
      current: i + 1,
      total: queue.length,
      message: `✅ Generated ${type} sheet for "${label}" (${i + 1}/${queue.length})`
    });
  }

  emitEvent('sheets_all_complete', {
    projectId,
    total: queue.length,
    message: `🎉 All ${queue.length} reference sheets generated & saved to Project Bible!`
  });
}

async function main() {
  const args = getArgs();
  try {
    switch (args.action) {
      case 'cdp-status':
        await handleCDPStatus();
        break;
      case 'sample-art':
        await handleSampleArt(args.project, args.prompt, args.comments || args.correction);
        break;
      case 'generate-sheets':
        await handleGenerateSheets(args.project, args.type || '', args.key || args.id || '');
        break;
      case 'render-panel':
        await handleRenderPanel(args.project, args.episode, args.panel, args.prompt, args.engine, args.correction, args.screenshot, args['managed-by-go'] === '1');
        break;
      case 'generate-script':
      case 'write-script':
        await handleGenerateScript(args.project, args.episode, args.guidance);
        break;
      case 'direct-episode-audio':
        await handleDirectEpisodeAudio(args.project, args.episode);
        break;
      case 'synthesize-voice':
      case 'synthesize-audio':
        await handleSynthesizeVoice(args.project, args.episode);
        break;
      case 'regenerate-audio':
        await handleRegenerateAudio(args.project, args.episode, args.panel, args.feedback || args.correction || args.comments || '');
        break;
      case 'regenerate-episode-audio':
        await handleRegenerateEpisodeAudio(args.project, args.episode, args.feedback || args.comments || '');
        break;
      case 'cast-check':
        await handleCastCheck(args.project);
        break;
      case 'director-plan':
        await handleDirectorPlan(
          args.project,
          args.episode,
          args.panel,
          args.feedback || args.correction || args.comments || '',
          args.source || 'panel',
          args.prompt || '',
          args.screenshot || ''
        );
        break;
      case 'director-feedback':
        await handleDirectorFeedback(
          args.project,
          args.episode,
          args.panel,
          args.feedback || args.correction || args.comments || '',
          args.source || 'panel',
          args.prompt || '',
          args.screenshot || '',
          args.plan || '',
          args['managed-by-go'] === '1'
        );
        break;
      case 'assemble-video':
        await handleAssembleVideo(args.project, args.episode);
        break;
      default:
        throw new Error(`Unknown action: ${args.action}`);
    }
  } catch (err) {
    emitEvent('error', {
      action: args.action,
      projectId: args.project,
      episodeId: args.episode,
      error: err.message
    });
    process.exit(1);
  }
}

main();
