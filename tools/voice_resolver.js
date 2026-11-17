const fs = require('fs');
const path = require('path');

// Voice casting is scoped per project so every episode of a comic uses the same
// actors. A project's cast lives in projects/<id>/reference/voice_registry.json;
// projects without one fall back to the shared 00_Reference/voice_registry.json.
const ROOT_DIR = path.join(__dirname, '..');
const GLOBAL_REGISTRY_PATH = path.join(ROOT_DIR, '00_Reference', 'voice_registry.json');

function getRegistryPath(projectId) {
  if (projectId) {
    const projPath = path.join(ROOT_DIR, 'projects', projectId, 'reference', 'voice_registry.json');
    if (fs.existsSync(projPath)) return projPath;
  }
  return GLOBAL_REGISTRY_PATH;
}

// Always read fresh: the AI Voice Director can change the cast during a run.
function getVoiceRegistry(projectId) {
  const regPath = getRegistryPath(projectId);
  if (!fs.existsSync(regPath)) {
    throw new Error(`Missing voice registry file: ${regPath}`);
  }
  const reg = JSON.parse(fs.readFileSync(regPath, 'utf8'));
  if (!reg.characters || typeof reg.characters !== 'object') {
    throw new Error(`Voice registry ${regPath} has no "characters" section`);
  }
  return reg;
}

// Make sure a project has its own registry file (copied from the shared one),
// so cast changes for one comic never leak into another. Returns its path.
function ensureProjectRegistry(projectId) {
  const projPath = path.join(ROOT_DIR, 'projects', projectId, 'reference', 'voice_registry.json');
  if (!fs.existsSync(projPath)) {
    fs.mkdirSync(path.dirname(projPath), { recursive: true });
    fs.copyFileSync(GLOBAL_REGISTRY_PATH, projPath);
  }
  return projPath;
}

// Returns { key, ...profile } for a speaker name, or throws if it is not cast.
function resolveSpeaker(speakerName, dialogueText = '', panelId = 0, projectId = '') {
  const reg = getVoiceRegistry(projectId);
  const sLower = (speakerName || '').toLowerCase().trim();

  // 1. Direct key match
  if (reg.characters[sLower]) {
    checkPolarity(reg, sLower, dialogueText, panelId);
    return Object.assign({ key: sLower }, reg.characters[sLower]);
  }

  // 2. Alias match
  for (const [key, char] of Object.entries(reg.characters)) {
    if (char.aliases && char.aliases.some(alias => sLower.includes(alias.toLowerCase()))) {
      checkPolarity(reg, key, dialogueText, panelId);
      return Object.assign({ key }, char);
    }
  }

  // 3. Character name match (e.g. "Thorgar the Undying" vs key "thorgar")
  for (const [key, char] of Object.entries(reg.characters)) {
    if (sLower && (sLower.startsWith(key + ' ') || (char.name && char.name.toLowerCase() === sLower))) {
      checkPolarity(reg, key, dialogueText, panelId);
      return Object.assign({ key }, char);
    }
  }

  if (reg.guards && reg.guards.strictCastingRequired === false && reg.characters.narrator) {
    return Object.assign({ key: 'narrator' }, reg.characters.narrator);
  }

  throw new Error(
    `CASTING ERROR in Panel #${panelId}: speaker "${speakerName}" is not in the voice cast ` +
    `(${path.relative(ROOT_DIR, getRegistryPath(projectId))}). Add the character or an alias for it.`
  );
}

function checkPolarity(reg, charKey, text, panelId) {
  if (!reg.guards?.antiBarbarianPolarityGuard || !text) return;

  const tLower = text.toLowerCase();
  for (const slur of (reg.guards.disallowedWordsForHero || [])) {
    if (tLower.includes(slur.toLowerCase())) {
      if (charKey === 'korvath' || charKey === 'narrator') {
        throw new Error(
          `POLARITY GUARD VIOLATION in Panel #${panelId}: Antagonist insult "${slur}" detected, ` +
          `but speaker is assigned to "${charKey}". Opponent dialogue cannot use hero or narrator voice.`
        );
      }
    }
  }
}

module.exports = { getVoiceRegistry, getRegistryPath, ensureProjectRegistry, resolveSpeaker, checkPolarity };
