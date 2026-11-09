const fs = require('fs');
const path = require('path');

const REGISTRY_PATH = path.join(__dirname, '..', '00_Reference', 'voice_registry.json');
let registry = null;

function getVoiceRegistry() {
  if (!registry) {
    if (!fs.existsSync(REGISTRY_PATH)) {
      throw new Error(`Missing voice registry file: ${REGISTRY_PATH}`);
    }
    registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  }
  return registry;
}

function resolveSpeaker(speakerName, dialogueText = '', panelId = 0) {
  const reg = getVoiceRegistry();
  const sLower = (speakerName || '').toLowerCase().trim();

  // 1. Direct key match
  if (reg.characters[sLower]) {
    checkPolarity(sLower, dialogueText, panelId);
    return reg.characters[sLower];
  }

  // 2. Alias match
  for (const [key, char] of Object.entries(reg.characters)) {
    if (char.aliases && char.aliases.some(alias => sLower.includes(alias.toLowerCase()))) {
      checkPolarity(key, dialogueText, panelId);
      return char;
    }
  }

  // 3. Fallback check: if strictCastingRequired is true, fail loud!
  if (reg.guards?.strictCastingRequired) {
    throw new Error(
      `❌ CASTING GUARD ERROR in Panel #${panelId}: Unknown speaker "${speakerName}". ` +
      `No silent fallback allowed. Speaker must be explicitly registered in 00_Reference/voice_registry.json.`
    );
  }

  return reg.characters.narrator;
}

function checkPolarity(charKey, text, panelId) {
  const reg = getVoiceRegistry();
  if (!reg.guards?.antiBarbarianPolarityGuard || !text) return;

  const tLower = text.toLowerCase();
  for (const slur of (reg.guards.disallowedWordsForHero || [])) {
    if (tLower.includes(slur.toLowerCase())) {
      if (charKey === 'korvath' || charKey === 'narrator') {
        throw new Error(
          `❌ POLARITY GUARD VIOLATION in Panel #${panelId}: Antagonist insult "${slur}" detected, ` +
          `but speaker is assigned to "${charKey}"! Opponent dialogue cannot use hero or narrator voice.`
        );
      }
    }
  }
}

module.exports = { getVoiceRegistry, resolveSpeaker, checkPolarity };
