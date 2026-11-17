const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { CDPClient } = require('../cdp_helper');

const rootDir = path.join(__dirname, '..', '..');
const leasesFile = path.join(rootDir, 'projects', '.cdp_tab_leases.json');
const tabLocksDir = path.join(rootDir, 'projects', '.tab_locks');

function isPidAlive(pid) {
  if (!pid || typeof pid !== 'number') return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e && e.code === 'EPERM';
  }
}

async function acquireTabLock(tabId, timeoutMs = 180000) {
  fs.mkdirSync(tabLocksDir, { recursive: true });
  const safeId = String(tabId || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
  const lockFile = path.join(tabLocksDir, `${safeId}.lock`);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const fd = fs.openSync(lockFile, 'wx');
      fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, tabId, acquiredAt: Date.now() }));
      fs.closeSync(fd);
      return lockFile;
    } catch (e) {
      if (e.code === 'EEXIST') {
        try {
          const raw = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
          const ageMs = Date.now() - (raw.acquiredAt || 0);
          if (ageMs > timeoutMs || (raw.pid && !isPidAlive(raw.pid))) {
            fs.unlinkSync(lockFile);
            continue;
          }
        } catch (_) {
          // Lock file may be mid-write or deleted
        }
        await new Promise(r => setTimeout(r, 350));
      } else {
        throw e;
      }
    }
  }
  throw new Error(`Timed out waiting for exclusive lock on Meta AI tab ${tabId}`);
}

function releaseTabLock(tabId) {
  const safeId = String(tabId || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
  const lockFile = path.join(tabLocksDir, `${safeId}.lock`);
  try {
    if (fs.existsSync(lockFile)) {
      const raw = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
      if (!raw.pid || raw.pid === process.pid) {
        fs.unlinkSync(lockFile);
      }
    }
  } catch (_) {}
}

function loadLeases() {
  if (!fs.existsSync(leasesFile)) return {};
  try {
    return JSON.parse(fs.readFileSync(leasesFile, 'utf8'));
  } catch (e) {
    return {};
  }
}

function saveLeases(leases) {
  fs.mkdirSync(path.dirname(leasesFile), { recursive: true });
  fs.writeFileSync(leasesFile, JSON.stringify(leases, null, 2), 'utf8');
}

async function listAllCDPTabs() {
  try {
    const res = await fetch('http://127.0.0.1:9222/json');
    if (!res.ok) return { online: false, tabs: [] };
    const tabs = await res.json();
    const pageTabs = tabs.filter(t => t.type === 'page');
    return {
      online: true,
      tabs: pageTabs.map(t => ({
        id: t.id,
        title: t.title,
        url: t.url,
        webSocketDebuggerUrl: t.webSocketDebuggerUrl,
        isMetaAI: Boolean(t.url && t.url.includes('meta.ai')),
        isVenice: Boolean(t.url && t.url.includes('venice.ai'))
      }))
    };
  } catch (e) {
    return { online: false, tabs: [], error: e.message };
  }
}

async function ensureChromeCDP() {
  let status = await listAllCDPTabs();
  if (status.online) return status;

  const chromeCandidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe')
  ];
  const chromeExe = chromeCandidates.find(p => p && fs.existsSync(p));
  const profileDir = path.join(rootDir, '.chrome_profile');

  if (chromeExe) {
    const child = spawn(
      chromeExe,
      ['--remote-debugging-port=9222', `--user-data-dir=${profileDir}`, 'https://www.meta.ai'],
      { detached: true, stdio: 'ignore', windowsHide: false }
    );
    child.unref();
  } else {
    const batPath = path.join(rootDir, 'launch_meta_chrome.bat');
    if (fs.existsSync(batPath)) {
      const child = spawn('cmd.exe', ['/c', 'start', '""', batPath], {
        cwd: rootDir,
        detached: true,
        stdio: 'ignore'
      });
      child.unref();
    } else {
      throw new Error('Chrome CDP is offline on port 9222 and Chrome / launch_meta_chrome.bat could not be found.');
    }
  }

  // Wait up to 15s for Chrome DevTools Protocol on port 9222 to come online
  for (let attempt = 0; attempt < 30; attempt++) {
    await new Promise(r => setTimeout(r, 500));
    status = await listAllCDPTabs();
    if (status.online && status.tabs && status.tabs.length > 0) {
      await new Promise(r => setTimeout(r, 2000));
      return await listAllCDPTabs();
    }
  }

  throw new Error('Auto-launched Chrome, but CDP on port 9222 did not respond within 15s. Close any conflicting Chrome windows using .chrome_profile or run launch_meta_chrome.bat.');
}

/**
 * Allocates an isolated Chrome CDP tab for a specific (projectId, episodeId) comic job.
 * If Chrome CDP is offline, automatically launches Chrome on port 9222 with .chrome_profile.
 * If another comic is already using Tab #1, this either binds an unused Meta AI tab
 * or opens a fresh isolated tab via Chrome DevTools Protocol so prompts never collide.
 */
async function acquireTabForComic(projectId, episodeId, spawnIfNeeded = true) {
  const status = await ensureChromeCDP();

  const leaseKey = `${projectId}:${episodeId}`;
  const leases = loadLeases();
  const metaTabs = status.tabs.filter(t => t.isMetaAI);

  // 1. Check if this comic already has a valid leased tab that is still open
  if (leases[leaseKey]) {
    const existing = metaTabs.find(t => t.id === leases[leaseKey].tabId);
    if (existing) {
      leases[leaseKey].lastActive = new Date().toISOString();
      saveLeases(leases);
      return existing;
    }
  }

  // 2. Find an open Meta AI tab not currently leased by another active comic
  const leasedTabIds = new Set(
    Object.entries(leases)
      .filter(([k]) => k !== leaseKey)
      .map(([, v]) => v.tabId)
  );

  const freeTab = metaTabs.find(t => !leasedTabIds.has(t.id));
  if (freeTab) {
    leases[leaseKey] = {
      projectId,
      episodeId,
      tabId: freeTab.id,
      url: freeTab.url,
      acquiredAt: new Date().toISOString(),
      lastActive: new Date().toISOString()
    };
    saveLeases(leases);
    return freeTab;
  }

  // 3. Spawn a brand-new isolated Meta AI tab for concurrent comic rendering
  if (spawnIfNeeded) {
    const createRes = await fetch('http://127.0.0.1:9222/json/new?https://www.meta.ai', { method: 'PUT' });
    if (createRes.ok) {
      const newTab = await createRes.json();
      leases[leaseKey] = {
        projectId,
        episodeId,
        tabId: newTab.id,
        url: newTab.url || 'https://www.meta.ai',
        acquiredAt: new Date().toISOString(),
        lastActive: new Date().toISOString()
      };
      saveLeases(leases);
      // Wait briefly for DOM initialization
      await new Promise(r => setTimeout(r, 2500));
      return {
        id: newTab.id,
        title: newTab.title || 'Meta AI',
        url: newTab.url || 'https://www.meta.ai',
        webSocketDebuggerUrl: newTab.webSocketDebuggerUrl,
        isMetaAI: true
      };
    }
  }

  // Fallback to first available Meta tab if spawning is disabled
  if (metaTabs.length > 0) {
    return metaTabs[0];
  }

  throw new Error('No Meta AI tabs available and failed to spawn a new tab.');
}

function releaseTabForComic(projectId, episodeId) {
  const leaseKey = `${projectId}:${episodeId}`;
  const leases = loadLeases();
  if (leases[leaseKey]) {
    delete leases[leaseKey];
    saveLeases(leases);
  }
}

module.exports = {
  listAllCDPTabs,
  ensureChromeCDP,
  acquireTabForComic,
  releaseTabForComic,
  acquireTabLock,
  releaseTabLock,
  loadLeases,
  CDPClient
};

