const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { listAllCDPTabs, acquireTabForComic, loadLeases, CDPClient } = require('./cdp_tab_pool');
const { sanitizePromptForMetaAI } = require('../meta_engine');

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

function loadProjectAndManifest(projectId, episodeId) {
  const projPath = path.join(rootDir, 'projects', projectId, 'project.json');
  const manifestPath = path.join(rootDir, 'projects', projectId, 'episodes', episodeId, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest not found: ${manifestPath}`);
  }
  const project = fs.existsSync(projPath) ? JSON.parse(fs.readFileSync(projPath, 'utf8')) : {};
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  return { projPath, manifestPath, project, manifest };
}

function saveManifest(manifestPath, data) {
  data.updatedAt = new Date().toISOString();
  fs.writeFileSync(manifestPath, JSON.stringify(data, null, 2), 'utf8');
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
  manifest.assignedWorkerTab = tab.id;
  saveManifest(manifestPath, manifest);

  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();

  try {
    const { sanitized } = sanitizePromptForMetaAI(prompt);

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
    await new Promise(r => setTimeout(r, 200));

    await client.send('Input.insertText', { text: `/imagine ${sanitized}` });
    await new Promise(r => setTimeout(r, 600));

    const sent = await client.evaluate(`
      (() => {
        const btn = document.querySelector('button[aria-label="Send"]');
        if (btn && !btn.disabled) {
          btn.click();
          return { clicked: true };
        }
        return { clicked: false };
      })()
    `);

    if (!sent || !sent.clicked) {
      await client.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    }

    const startTime = Date.now();
    const preSet = new Set(preFlightUrls);

    while (Date.now() - startTime < 90000) {
      await new Promise(r => setTimeout(r, 2500));
      const curUrls = await client.evaluate(`
        (() => {
          const imgs = Array.from(document.querySelectorAll('img'))
            .filter(i => (i.src.includes('scontent') || i.src.includes('fbcdn.net')) && i.naturalWidth >= 500);
          return imgs.map(i => i.src);
        })()
      `) || [];

      const newUrls = curUrls.filter(u => !preSet.has(u));
      if (newUrls.length > 0) {
        const targetUrl = newUrls[0];
        const resp = await fetch(targetUrl);
        return Buffer.from(await resp.arrayBuffer());
      }
    }

    throw new Error(`Timed out waiting for Meta AI image on tab ${tab.id}`);
  } finally {
    client.close();
  }
}

async function handleRenderPanel(projectId, episodeId, panelId, promptOverride, engineOverride) {
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
  if (promptOverride && typeof promptOverride === 'string' && promptOverride.trim()) {
    panel.prompt = promptOverride.trim();
  }

  // Resolve active image engine: CLI flag -> Episode manifest -> Project default -> meta-ai-cdp
  const activeEngine = (
    engineOverride ||
    manifest.imageEngine ||
    project.defaultImageEngine ||
    'meta-ai-cdp'
  ).toLowerCase();

  panel.imageStatus = 'RENDERING';
  saveManifest(manifestPath, manifest);

  let downloadedBuf = null;
  if (VENICE_MODELS.has(activeEngine)) {
    emitEvent('panel_progress', {
      projectId,
      episodeId,
      panelId: Number(panelId),
      status: 'DISPATCHING_MODEL',
      engine: activeEngine,
      message: `[${activeEngine}] Dispatching direct uncensored prompt for ${projectId}/${episodeId} Panel #${panelId}...`
    });
    downloadedBuf = await renderViaVeniceModel(activeEngine, panel.prompt);
    manifest.assignedWorkerTab = `API:${activeEngine}`;
  } else {
    downloadedBuf = await renderViaMetaCDP(projectId, episodeId, panelId, panel.prompt, manifest, manifestPath);
  }

  const pad = String(panelId).padStart(2, '0');
  const outPath = panel.imagePath
    ? path.join(rootDir, panel.imagePath)
    : path.join(rootDir, 'projects', projectId, 'episodes', episodeId, 'panels', `panel_${pad}.webp`);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, downloadedBuf);

  if (panel.webPreviewUrl) {
    const docsOut = path.join(rootDir, 'docs', panel.webPreviewUrl);
    fs.mkdirSync(path.dirname(docsOut), { recursive: true });
    fs.writeFileSync(docsOut, downloadedBuf);
  }

  const hash = crypto.createHash('md5').update(downloadedBuf).digest('hex').slice(0, 8);
  const sizeKB = Math.round((downloadedBuf.length / 1024) * 10) / 10;

  panel.imageStatus = 'VERIFIED';
  panel.imagePath = path.relative(rootDir, outPath).replace(/\\/g, '/');
  panel.hash = hash;
  panel.sizeKB = sizeKB;
  saveManifest(manifestPath, manifest);

  emitEvent('panel_complete', {
    projectId,
    episodeId,
    panelId: Number(panelId),
    engine: activeEngine,
    status: 'VERIFIED',
    hash,
    sizeKB,
    imagePath: panel.imagePath
  });
}

async function main() {
  const args = getArgs();
  try {
    switch (args.action) {
      case 'cdp-status':
        await handleCDPStatus();
        break;
      case 'render-panel':
        await handleRenderPanel(args.project, args.episode, args.panel, args.prompt, args.engine);
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
