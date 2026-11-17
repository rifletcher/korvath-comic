#!/usr/bin/env node
/**
 * Fail-Closed Voice Casting & Registry Verifier
 * Validates that all dialogue speakers in a storyboard resolve to valid entries
 * (or registered aliases) in voice_registry.json, flags any invalid/deprecated
 * voice IDs (like fX7UqA143pM34zT6bVzF), and prints a panel-by-panel speaker
 * audit table for visual speech-bubble verification.
 */
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
function getArg(flag, fallback) {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
}

const storyboardPath = path.resolve(getArg('--storyboard', '01_Script/storyboard.json'));
const registryPath = path.resolve(getArg('--registry', '00_Reference/voice_registry.json'));

if (!fs.existsSync(storyboardPath)) {
  console.error(`[FAIL] Storyboard not found: ${storyboardPath}`);
  process.exit(1);
}
if (!fs.existsSync(registryPath)) {
  console.error(`[FAIL] Voice registry not found: ${registryPath}`);
  process.exit(1);
}

const storyboard = JSON.parse(fs.readFileSync(storyboardPath, 'utf8'));
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
const characters = registry.characters || registry.voices || registry;

// Build alias resolution table
const aliasMap = new Map();
for (const [key, profile] of Object.entries(characters)) {
  aliasMap.set(key.toLowerCase().trim(), { key, profile });
  if (profile.name) {
    aliasMap.set(profile.name.toLowerCase().trim(), { key, profile });
  }
  if (Array.isArray(profile.aliases)) {
    for (const alias of profile.aliases) {
      aliasMap.set(alias.toLowerCase().trim(), { key, profile });
    }
  }
}

const BANNED_VOICE_IDS = new Set(['fX7UqA143pM34zT6bVzF']);
let errors = 0;

console.log(`=== VOICE CASTING & REGISTRY AUDIT ===`);
console.log(`Storyboard: ${storyboardPath}`);
console.log(`Registry:   ${registryPath}\n`);

// 1. Check registry for banned 404 voice IDs
for (const [key, profile] of Object.entries(characters)) {
  const vid = profile.voiceId || profile.voice_id;
  if (BANNED_VOICE_IDS.has(vid)) {
    console.error(`[ERROR] Voice registry key "${key}" uses banned/404 voiceId: ${vid}`);
    errors++;
  }
}

// 2. Check Korvath canonical profile
if (characters.korvath) {
  const vid = characters.korvath.voiceId || characters.korvath.voice_id;
  const dsp = characters.korvath.dspChain || characters.korvath.dsp_filter || '';
  if (vid !== 'nPczCjzI2devNBz1zQrb') {
    console.error(`[ERROR] 'korvath' voiceId is "${vid}" — expected canonical "nPczCjzI2devNBz1zQrb" (Brian + Kratos DSP)`);
    errors++;
  }
  if (!dsp.includes('0.88')) {
    console.error(`[ERROR] 'korvath' dspChain is missing canonical 0.88x Subterranean Kratos pitch shift`);
    errors++;
  }
}

// 3. Audit every panel's dialogue speakers
const panels = Array.isArray(storyboard) ? storyboard : (storyboard.panels || []);
let dialogueCount = 0;
for (const p of panels) {
  const pId = p.panelId || p.panel_id || p.id || p.number;
  const dialogues = p.dialogue || [];
  for (let i = 0; i < dialogues.length; i++) {
    dialogueCount++;
    const d = dialogues[i];
    const rawSpeaker = (d.speaker || '').trim();
    const resolved = aliasMap.get(rawSpeaker.toLowerCase());
    if (!rawSpeaker || !resolved) {
      console.error(`[ERROR] Panel ${pId} dialogue[${i}] has unmapped speaker "${rawSpeaker}" (not in voice_registry.json)`);
      errors++;
    } else {
      const { key, profile } = resolved;
      const actor = `${profile.actorName || profile.actor_name} (${profile.voiceId || profile.voice_id})`;
      console.log(`[OK] Panel ${String(pId).padStart(2, '0')} | Speaker: ${rawSpeaker.padEnd(16)} -> ${key.padEnd(8)} | Actor: ${actor.padEnd(50)} | "${(d.text || d.line || '').slice(0, 48)}"`);
    }
  }
}

if (errors > 0) {
  console.error(`\n[FAILED] Voice casting audit failed with ${errors} error(s).`);
  process.exit(1);
} else {
  console.log(`\n[PASSED] All ${panels.length} panels (${dialogueCount} dialogue lines) passed fail-closed voice registry resolution.`);
}
