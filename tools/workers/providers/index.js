const path = require('path');
const { VENICE_MODELS, renderViaVeniceModel } = require('./venice');
const { FAL_MUSE_MODELS, renderViaFalMuse } = require('./fal_muse');
const { prepareMusePrompt } = require('../../lib/muse_profiles');
const { renderViaMetaCDP } = require('./meta_cdp');
const { sanitizePromptForMetaAI } = require('../../meta_engine');

const SUPPORTED_MODELS = [
  { id: 'meta-ai-cdp', label: 'Meta AI (Chrome CDP)', kind: 'cdp', supportsUncensored: false },
  { id: 'meta-muse-image', label: 'Meta Muse Image (fal API)', kind: 'api', supportsUncensored: false },
  { id: 'grok-imagine-image-2-0', label: 'Grok Imagine 2.0 (Venice API)', kind: 'api', supportsUncensored: true },
  { id: 'flux-2-pro', label: 'Flux 2 Pro (Venice API)', kind: 'api', supportsUncensored: true },
  { id: 'recraft-v4', label: 'Recraft v4 (Venice API)', kind: 'api', supportsUncensored: true },
  { id: 'lustify-v8', label: 'Lustify v8 (Venice API)', kind: 'api', supportsUncensored: true }
];

const KNOWN_ENGINES = new Set(SUPPORTED_MODELS.map(m => m.id));

function normalizeEngine(engine) {
  const normalized = (engine || 'meta-ai-cdp').toLowerCase().trim();
  if (!KNOWN_ENGINES.has(normalized)) {
    throw new Error(`Unsupported image engine "${engine}". Supported: ${[...KNOWN_ENGINES].join(', ')}`);
  }
  return normalized;
}

function listSupportedModels() {
  return SUPPORTED_MODELS.slice();
}

// Venice models and Muse (official API) take the raw prompt. Only the Meta AI
// chat website gets the euphemism-sanitized prompt. If Muse refuses something,
// the panel fails with Muse's own error rather than being quietly softened.
function getPromptSentForEngine(engine, prompt) {
  const normalized = (engine || 'meta-ai-cdp').toLowerCase();
  if (VENICE_MODELS.has(normalized) || FAL_MUSE_MODELS.has(normalized)) return prompt;
  return sanitizePromptForMetaAI(prompt).sanitized;
}

// Simple render used for sample art and reference sheets (no manifest bookkeeping).
async function renderImageForEngine(engine, prompt, cdpFallbackArgs = {}) {
  const activeEngine = normalizeEngine(engine);
  if (VENICE_MODELS.has(activeEngine)) return renderViaVeniceModel(activeEngine, prompt);
  if (FAL_MUSE_MODELS.has(activeEngine)) return renderViaFalMuse(getPromptSentForEngine(activeEngine, prompt));
  const { projectId = 'adhoc', episodeId = 'adhoc', panelId = 0, emitEvent = () => {} } = cdpFallbackArgs;
  return renderViaMetaCDP(projectId, episodeId, panelId, prompt, null, null, emitEvent, null);
}

async function renderPanelWithProvider(engine, prompt, ctx) {
  const activeEngine = normalizeEngine(engine);
  const { projectId, episodeId, panelId, manifest, manifestPath, emitEvent, updateManifestLocked, panel } = ctx;

  // Muse: send the characters' sheets and use their Muse descriptions (reference/muse_profiles.json)
  if (FAL_MUSE_MODELS.has(activeEngine)) {
    const muse = prepareMusePrompt({ projectId, episodeId, panel: panel || null, prompt });
    const sheetNames = muse.sheets.map(s => `${s.key} (${path.basename(s.file)})`);
    emitEvent('panel_progress', {
      projectId,
      episodeId,
      panelId: Number(panelId),
      status: 'DISPATCHING_MODEL',
      engine: activeEngine,
      message: `[Muse] Panel #${panelId}: ${sheetNames.length ? `sending ${sheetNames.length} character sheet(s): ${sheetNames.join(', ')}` : 'no character sheets found for this panel'}` +
        (muse.wordingChanged.length ? ` · Muse wording: ${muse.wordingChanged.length} swap(s)` : '')
    });
    const buffer = await renderViaFalMuse(muse.prompt, { referenceImages: muse.referenceImages });
    if (manifest) manifest.assignedWorkerTab = `API:${activeEngine}`;
    return {
      buffer,
      promptSent: muse.prompt,
      engine: activeEngine,
      referenceSheets: muse.sheets.map(s => ({ character: s.key, file: path.relative(path.join(__dirname, '..', '..', '..'), s.file).replace(/\\/g, '/') })),
      museWording: muse.wordingChanged
    };
  }

  if (VENICE_MODELS.has(activeEngine) || FAL_MUSE_MODELS.has(activeEngine)) {
    const promptSent = getPromptSentForEngine(activeEngine, prompt);
    emitEvent('panel_progress', {
      projectId,
      episodeId,
      panelId: Number(panelId),
      status: 'DISPATCHING_MODEL',
      engine: activeEngine,
      message: `[${activeEngine}] Dispatching direct API prompt for ${projectId}/${episodeId} Panel #${panelId}...`
    });
    const buffer = VENICE_MODELS.has(activeEngine)
      ? await renderViaVeniceModel(activeEngine, promptSent)
      : await renderViaFalMuse(promptSent);
    if (manifest) manifest.assignedWorkerTab = `API:${activeEngine}`;
    return { buffer, promptSent, engine: activeEngine };
  }

  const buffer = await renderViaMetaCDP(
    projectId,
    episodeId,
    panelId,
    prompt,
    manifest,
    manifestPath,
    emitEvent,
    updateManifestLocked
  );
  return {
    buffer,
    promptSent: sanitizePromptForMetaAI(prompt).sanitized,
    engine: 'meta-ai-cdp'
  };
}

module.exports = {
  VENICE_MODELS,
  FAL_MUSE_MODELS,
  SUPPORTED_MODELS,
  listSupportedModels,
  normalizeEngine,
  getPromptSentForEngine,
  renderImageForEngine,
  renderPanelWithProvider
};
