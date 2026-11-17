/**
 * Muse (fal) character consistency: send each character's sheet with the panel
 * and use the character's approved "Muse description" in the prompt.
 *
 * Per-series settings: projects/<p>/reference/muse_profiles.json
 * {
 *   "characters": {
 *     "natari": {
 *       "aliases": ["companion"],                 // other names used on panels
 *       "sheet": "natari_model_sheet.webp",       // in reference/sheets/ or bible/sheets/
 *       "sheetsByEpisode": { "ep01": "x.webp" },  // optional per-episode look
 *       "description": "natari, ... wording Muse accepts ...",
 *       "museWording": [["bikini top", "armour top"]]  // your own word swaps, applied in order
 *     }
 *   }
 * }
 * Characters without a profile still get a sheet if one is found by name.
 */
const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..', '..');
const MAX_SHEETS = 10;

function readJson(p, d) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return d; } }
function profilesPath(projectId) { return path.join(rootDir, 'projects', projectId, 'reference', 'muse_profiles.json'); }
function loadProfiles(projectId) { return (readJson(profilesPath(projectId), {}) || {}).characters || {}; }
function loadLooks(projectId) {
  return Object.assign({},
    readJson(path.join(rootDir, '00_Reference', 'character_prompts.json'), {}),
    readJson(path.join(rootDir, 'projects', projectId, 'reference', 'character_prompts.json'), {}));
}
function sheetDirs(projectId) {
  return [path.join(rootDir, 'projects', projectId, 'reference', 'sheets'), path.join(rootDir, 'projects', projectId, 'bible', 'sheets')];
}

// Finds the sheet file for a character: profile setting first, then common names.
function findSheet(projectId, key, episodeId, profile) {
  const wanted = [];
  if (profile && profile.sheetsByEpisode && episodeId && profile.sheetsByEpisode[episodeId]) wanted.push(profile.sheetsByEpisode[episodeId]);
  if (profile && profile.sheet) wanted.push(profile.sheet);
  wanted.push(`${key}_model_sheet.webp`, `char_${key}_model_sheet.webp`, `character_${key}.webp`, `${key}.webp`, `${key}.png`, `${key}.jpg`);
  for (const name of wanted) {
    for (const dir of sheetDirs(projectId)) {
      const f = path.isAbsolute(name) ? name : path.join(dir, name);
      if (fs.existsSync(f) && fs.statSync(f).size > 1000) return f;
    }
  }
  return '';
}

// Which known characters are on this panel (from its character list and its text).
function charactersInPanel(panel, projectId) {
  const profiles = loadProfiles(projectId);
  const looks = loadLooks(projectId);
  const keys = new Set([...Object.keys(profiles), ...Object.keys(looks)].filter(k => k !== 'conan'));
  const listed = (panel.characters || []).map(c => String(c).toLowerCase());
  const text = `${panel.summary || ''} ${(panel.dialogue || []).map(d => d.speaker).join(' ')}`.toLowerCase();
  const found = [];
  for (const key of keys) {
    const aliases = ((profiles[key] && profiles[key].aliases) || []).map(a => String(a).toLowerCase());
    const names = [key, key.replace(/_/g, ' '), ...aliases];
    const hit = names.some(n => listed.includes(n)) ||
      names.some(n => n.length > 3 && !['protagonist', 'companion', 'antagonist'].includes(n) && new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text));
    if (hit) found.push(key);
  }
  return found;
}

// Removes real-person likeness clauses ("facial blend of X and Y") from a prompt.
function stripCelebrityNames(prompt) {
  return String(prompt || '')
    .replace(/,?\s*facial blend of [^,.;]+/gi, '')
    .replace(/,?\s*celebrity blend[^,.;]*/gi, '')
    .replace(/,\s*,/g, ',');
}

/**
 * Builds what Muse gets for a panel.
 * Returns { prompt, referenceImages: [paths], sheets: [{ key, file }], replaced: [keys] }
 */
function prepareMusePrompt({ projectId, episodeId, panel, prompt }) {
  const profiles = loadProfiles(projectId);
  const looks = loadLooks(projectId);
  let out = String(prompt || '');
  const replaced = [];
  const wordingChanged = [];
  const sheets = [];
  const keys = panel ? charactersInPanel(panel, projectId) : [];
  for (const key of keys) {
    const prof = profiles[key] || {};
    if (prof.description && looks[key] && out.includes(looks[key])) {
      out = out.split(looks[key]).join(prof.description);
      replaced.push(key);
    }
    for (const pair of (Array.isArray(prof.museWording) ? prof.museWording : [])) {
      const [from, to] = pair || [];
      if (!from) continue;
      const re = new RegExp(String(from).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      if (re.test(out)) { out = out.replace(re, to || ''); wordingChanged.push(`${from} → ${to || '(removed)'}`); }
    }
    const file = findSheet(projectId, key, episodeId, prof);
    if (file && sheets.length < MAX_SHEETS && !sheets.some(s => s.file === file)) sheets.push({ key, file });
  }
  out = stripCelebrityNames(out).replace(/ {2,}/g, ' ');
  if (sheets.length) {
    const who = sheets.map((s, i) => `sheet ${i + 1}: ${s.key.replace(/_/g, ' ')}`).join('; ');
    out = `Draw a new comic panel. Characters shown in the reference sheets (${who}) must keep their exact faces, hair and costumes from those sheets. Do not copy the sheet layout or its labels. ${out}`;
  }
  return { prompt: out, referenceImages: sheets.map(s => s.file), sheets, replaced, wordingChanged };
}

module.exports = { prepareMusePrompt, charactersInPanel, findSheet, stripCelebrityNames, loadProfiles };
