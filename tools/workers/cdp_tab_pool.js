const fs = require('fs');
const path = require('path');
const { CDPClient } = require('../cdp_helper');

const rootDir = path.join(__dirname, '..', '..');
const leasesFile = path.join(rootDir, 'projects', '.cdp_tab_leases.json');

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

/**
 * Allocates an isolated Chrome CDP tab for a specific (projectId, episodeId) comic job.
 * If another comic is already using Tab #1, this either binds an unused Meta AI tab
 * or opens a fresh isolated tab via Chrome DevTools Protocol so prompts never collide.
 */
async function acquireTabForComic(projectId, episodeId, spawnIfNeeded = true) {
  const status = await listAllCDPTabs();
  if (!status.online) {
    throw new Error('Chrome CDP is offline on port 9222. Run launch_meta_chrome.bat first.');
  }

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
  acquireTabForComic,
  releaseTabForComic,
  loadLeases,
  CDPClient
};

