/**
 * Sound effects for the audio step (ElevenLabs sound generation).
 *
 * The writers' room puts these on each panel:
 *   panel.soundEffects = [{ sound, at: 'start'|'after_narration'|'with_dialogue'|'end', volume: 'soft'|'medium'|'loud', seconds }]
 *   panel.ambience     = 'background sound for the scene' (same text across a scene, so it's made once)
 *
 * Every generated sound is kept in projects/<p>/sfx/ and reused by its description,
 * across panels and episodes, so a "sword clash" is only paid for once.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const rootDir = path.join(__dirname, '..', '..');
const SFX_CREDITS_PER_SECOND = 40; // ElevenLabs docs: 40 credits per second when a duration is set
const AMBIENCE_SECONDS = 10;
const MAX_EFFECTS_PER_PANEL = 3;
const VOLUME = { soft: 0.35, medium: 0.6, loud: 0.9 };
const PLACES = ['start', 'after_narration', 'with_dialogue', 'end'];

function sfxDir(projectId) { return path.join(rootDir, 'projects', projectId, 'sfx'); }
function libraryPath(projectId) { return path.join(sfxDir(projectId), 'library.json'); }
function readLibrary(projectId) { try { return JSON.parse(fs.readFileSync(libraryPath(projectId), 'utf8')); } catch (_) { return {}; } }

function cleanSound(s) { return String(s || '').replace(/\s+/g, ' ').trim().slice(0, 400); }
function clampSeconds(s, def) { const n = Number(s); return Math.round(Math.min(8, Math.max(0.5, Number.isFinite(n) && n > 0 ? n : def)) * 10) / 10; }
function sfxKey(sound, seconds) { return crypto.createHash('sha1').update(`${cleanSound(sound).toLowerCase()}|${seconds}`).digest('hex').slice(0, 16); }
function sfxPath(projectId, sound, seconds) { return path.join(sfxDir(projectId), `${sfxKey(sound, seconds)}.mp3`); }
function hasSfx(projectId, sound, seconds) { const p = sfxPath(projectId, sound, seconds); return fs.existsSync(p) && fs.statSync(p).size > 500; }

// The effects a panel asks for, normalised. Returns [{ sound, at, volume, seconds, gain }].
function panelEffects(panel) {
  return (Array.isArray(panel && panel.soundEffects) ? panel.soundEffects : [])
    .filter(e => e && cleanSound(e.sound || e.description))
    .slice(0, MAX_EFFECTS_PER_PANEL)
    .map(e => {
      const volume = VOLUME[e.volume] ? e.volume : 'medium';
      return {
        sound: cleanSound(e.sound || e.description),
        at: PLACES.includes(e.at) ? e.at : 'start',
        volume,
        seconds: clampSeconds(e.seconds, 2),
        gain: VOLUME[volume]
      };
    });
}
function panelAmbience(panel) {
  const a = cleanSound(panel && (typeof panel.ambience === 'object' ? panel.ambience && panel.ambience.sound : panel.ambience));
  return a ? { sound: a, seconds: AMBIENCE_SECONDS } : null;
}
// Changes when the panel's effects change, so the mix is rebuilt.
function sfxSignature(panel) {
  const fx = panelEffects(panel);
  const amb = panelAmbience(panel);
  if (!fx.length && !amb) return '';
  return JSON.stringify({ fx: fx.map(e => [e.sound, e.at, e.volume, e.seconds]), amb: amb ? amb.sound : '' });
}

// Credits needed for effects that aren't in the library yet.
function sfxCreditsNeeded(panel, projectId) {
  let credits = 0;
  const seen = new Set();
  const all = panelEffects(panel).map(e => [e.sound, e.seconds]);
  const amb = panelAmbience(panel);
  if (amb) all.push([amb.sound, amb.seconds]);
  for (const [sound, secs] of all) {
    const k = sfxKey(sound, secs);
    if (seen.has(k) || hasSfx(projectId, sound, secs)) continue;
    seen.add(k);
    credits += Math.ceil(secs * SFX_CREDITS_PER_SECOND);
  }
  return credits;
}

// Generates (or reuses) one sound. Returns { file, cached, creditsUsed }.
async function ensureSoundEffect(projectId, sound, seconds, apiKey) {
  sound = cleanSound(sound);
  const file = sfxPath(projectId, sound, seconds);
  if (hasSfx(projectId, sound, seconds)) return { file, cached: true, creditsUsed: 0 };
  if (!apiKey) throw new Error('No ElevenLabs API key found (ELEVENLABS_API_KEY in .env), so sound effects could not be made.');
  const res = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: sound, duration_seconds: seconds, prompt_influence: 0.5 })
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`ElevenLabs sound effect error (${res.status}) for "${sound.slice(0, 60)}": ${errText.slice(0, 300)}`);
  }
  fs.mkdirSync(sfxDir(projectId), { recursive: true });
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  const lib = readLibrary(projectId);
  lib[sfxKey(sound, seconds)] = { sound, seconds, file: path.basename(file), createdAt: new Date().toISOString() };
  fs.writeFileSync(libraryPath(projectId), JSON.stringify(lib, null, 2));
  return { file, cached: false, creditsUsed: Math.ceil(seconds * SFX_CREDITS_PER_SECOND) };
}

// Sounds already made for this series (the writers' room reuses them word for word).
function librarySounds(projectId, limit = 60) {
  return Object.values(readLibrary(projectId)).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, limit).map(e => ({ sound: e.sound, seconds: e.seconds }));
}

module.exports = {
  panelEffects, panelAmbience, sfxSignature, sfxCreditsNeeded, ensureSoundEffect, librarySounds,
  sfxPath, hasSfx, SFX_CREDITS_PER_SECOND, AMBIENCE_SECONDS, PLACES, VOLUME
};
