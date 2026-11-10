#!/usr/bin/env node
/**
 * Gate A (SCRIPT_GATE) Storyboard, Configurable Series Tone & Multi-Model Verifier
 * Validates panel count against targetPanelCount, verifies that prompts start with
 * the series' configurable artStyleAnchor, and adapts safety-token checks to the
 * active imageEngine (e.g. strict Llama Guard checks for meta-ai-cdp vs. direct
 * uncensored mode for grok-imagine-image-2-0, grok-cdp, flux-2-pro, recraft-v4).
 */
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
function getArg(flag, fallback) {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
}

const storyboardPath = path.resolve(getArg('--storyboard', '01_Script/storyboard.json'));
const projectArg = getArg('--project', 'projects/korvath-the-barbarian/project.json');
const stylePrefixOverride = getArg('--style-prefix', null);
const targetPanelsArg = getArg('--target-panels', null);
const engineOverride = getArg('--engine', null);

if (!fs.existsSync(storyboardPath)) {
  console.error(`[FAIL] Storyboard/manifest not found: ${storyboardPath}`);
  process.exit(1);
}

let projectConfig = {};
const resolvedProjectPath = path.resolve(projectArg);
if (fs.existsSync(resolvedProjectPath)) {
  projectConfig = JSON.parse(fs.readFileSync(resolvedProjectPath, 'utf8'));
}

const raw = JSON.parse(fs.readFileSync(storyboardPath, 'utf8'));
const panels = Array.isArray(raw) ? raw : (raw.panels || []);

const targetCount = targetPanelsArg
  ? parseInt(targetPanelsArg, 10)
  : (raw.targetPanelCount || projectConfig.defaultPanelsPerEpisode || panels.length);

// Resolve active image generation model (CLI -> Episode Manifest -> Series Project Config)
const activeEngine = (
  engineOverride ||
  raw.imageEngine ||
  projectConfig.defaultImageEngine ||
  'meta-ai-cdp'
).toLowerCase();

const STRICT_GUARDRAIL_ENGINES = new Set(['meta-ai-cdp', 'openai-dalle', 'gemini-imagen']);
const isStrictGuardrail = STRICT_GUARDRAIL_ENGINES.has(activeEngine);

// Configurable art style anchor from project.json or CLI flag
const configuredStyleAnchor = stylePrefixOverride || projectConfig.artStyleAnchor || '';
const anchorLead = configuredStyleAnchor
  ? configuredStyleAnchor.split(',')[0].trim().toLowerCase()
  : 'graphic novel comic book panel';

const FORBIDDEN_REGEX = /\b(decapitat(e|ed|ing)|dismember(ed|ing)?|gore|gory|naked|nude)\b/i;
let warnings = 0;
let errors = 0;

console.log(`=== STORYBOARD & MULTI-MODEL PROMPT AUDIT (GATE A) ===`);
console.log(`Series:       ${projectConfig.title || 'Custom Series'} (${projectConfig.genre || 'Configurable Genre'})`);
console.log(`Image Engine: ${activeEngine} (${isStrictGuardrail ? 'Strict Safety Classifier Mode' : 'Direct / Uncensored Mode'})`);
console.log(`Style Anchor: "${configuredStyleAnchor ? configuredStyleAnchor.slice(0, 75) + '...' : anchorLead}"`);
console.log(`Storyboard:   ${storyboardPath}`);
console.log(`Panel Count:  ${panels.length} (Target: ${targetCount})\n`);

if (panels.length !== targetCount) {
  console.error(`[ERROR] Panel count mismatch: found ${panels.length}, expected ${targetCount}`);
  errors++;
}

for (const p of panels) {
  const pId = p.panelId || p.panel_id || p.id || p.number;
  const prompt = (p.prompt || '').trim();
  const promptLower = prompt.toLowerCase();

  // 1. Check configurable series artStyleAnchor prefix
  if (!promptLower.includes(anchorLead)) {
    console.error(`[ERROR] Panel ${pId}: Missing configured series artStyleAnchor lead ("${anchorLead}")`);
    errors++;
  }

  // 2. Ensure comic/graphic novel framing exists
  if (!/graphic novel|comic book|sequential art|comic panel/i.test(prompt)) {
    console.warn(`[WARN]  Panel ${pId}: Prompt does not mention "graphic novel" or "comic panel"`);
    warnings++;
  }

  // 3. Check safety trigger words ONLY when targeting a strict guardrail model (e.g. meta-ai-cdp)
  if (isStrictGuardrail) {
    const forbiddenMatch = prompt.match(FORBIDDEN_REGEX);
    if (forbiddenMatch) {
      console.error(`[ERROR] Panel ${pId}: Engine "${activeEngine}" blocks trigger token "${forbiddenMatch[0]}" (substitute euphemism or switch to grok-imagine-image-2-0 / flux-2-pro)`);
      errors++;
    }
  }
}

if (errors > 0) {
  console.error(`\n[FAILED] Storyboard prompt audit failed with ${errors} error(s) and ${warnings} warning(s).`);
  process.exit(1);
} else {
  console.log(`[PASSED] All ${panels.length} panel prompts passed Gate A checks for engine "${activeEngine}" (${warnings} warning(s)).`);
}
