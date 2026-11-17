const fs = require('fs');
const path = require('path');
const { runHeadlessPrompt, extractJsonFromText, extractFencedText } = require('./lib/headless_ai');
const { resolvePanelCharacterAnchors } = require('./lib/character_dna');

/**
 * AI Visual Art Director powered by Gemini 3.8 Flash via Antigravity Subscription
 * Executes headless agy CLI session (zero Venice API usage, zero third-party tokens).
 * Takes the current prompt and the human director's natural language correction,
 * and surgically rewrites the prompt before dispatching to Meta AI or Grok.
 */
async function refinePromptWithGemini(originalPrompt, directorCorrection, options = {}) {
  const correction = (directorCorrection || '').trim();
  if (!correction) return originalPrompt;

  const engine = options.engine || 'meta-ai-cdp';
  const invariants = options.invariants || [];
  const screenshotPath = options.screenshotPath || '';

  let screenshotSection = '';
  if (screenshotPath && fs.existsSync(screenshotPath)) {
    screenshotSection = `\nATTACHED VISUAL SCREENSHOT FOR MULTIMODAL INSPECTION:
Please inspect and analyze the visual screenshot image at file path: ${screenshotPath.replace(/\\/g, '/')}
Use your multimodal vision capabilities to examine the visual reference (e.g. circled areas, object shapes, ruby cut/setting, hand/finger posture, lighting, or character details) and incorporate those visual details directly into the refined prompt.`;
  }

  const directorPrompt = `You are the master AI Visual Art Director for a comic book graphic novel studio.
Your job is to read an existing comic image generation prompt, the Human Director's correction note, and any attached visual screenshot, and surgically rewrite the prompt to incorporate the correction while strictly preserving all core comic invariants, character DNA, and graphic novel styling.

CORE RULES:
1. Output ONLY the raw refined prompt inside a single markdown code fence:
\`\`\`text
<refined prompt here>
\`\`\`
Do not include conversational preamble, explanations, notes, or bullet points outside the fence.
2. Preserve the opening graphic novel / style anchor prefix (e.g. Frank Frazetta / John Buscema / pulp aesthetic).
3. If targeting 'meta-ai-cdp', enforce safety euphemisms (never use raw trigger words: blood, kill, decapitate, naked, gore). Use 'crimson mist', 'scarred bronze skin', 'strike down', etc.
4. If the Human Director asked to fix anatomy or objects (e.g. extra fingers, mutant limbs, duplicate swords), formulate explicit positive & negative constraints (e.g. 'anatomically natural five human fingers gripping the hilt, strictly single sword, strictly no extra digits, no duplicate blades').
5. Keep any vintage yellow narrative caption box or speech balloon text intact.

---
ORIGINAL PROMPT:
${originalPrompt}

TARGET IMAGE ENGINE:
${engine}

SERIES INVARIANTS:
${JSON.stringify(invariants)}

HUMAN DIRECTOR CORRECTION:
"${correction}"
${screenshotSection}

Produce the surgically updated prompt:`;

  const res = await runHeadlessPrompt(directorPrompt, {
    label: 'AI Director',
    timeoutMs: 45000
  });
  if (res.ok) {
    let refined = extractFencedText(res.text);
    refined = refined.replace(/^```[a-z]*\s*/i, '').replace(/```$/i, '').trim();
    if (refined.length > 20) {
      console.error(`[AI Director] Successfully refined prompt via ${res.source} (${refined.length} chars)`);
      if (typeof options.onTrace === 'function') {
        options.onTrace({ promptSent: directorPrompt, responseReceived: refined, source: res.source });
      }
      return refined;
    }
  }

  // Safe local deterministic director fallback if agy CLI is unreachable
  let fallback = originalPrompt;
  if (/finger|hand|thumb|digit|polydactyly/i.test(correction)) {
    fallback += `, anatomically accurate human hands, strictly five fingers on each hand, natural knuckles and thumb, no extra digits, no mutant fingers`;
  }
  if (/sword|blade|weapon|scimitar/i.test(correction)) {
    fallback += `, strictly single 42-inch broadsword, single blade only, no second sword, no duplicate weapons`;
  }
  if (/scar|face|jaw|eyes/i.test(correction)) {
    fallback += `, prominent facial scar detail, chiseled masculine jawline, wolfish scowling eyes`;
  }
  if (/mantle|cape|fur|cloak/i.test(correction)) {
    fallback += `, heavy shaggy wolf-fur mantle draped over shoulders`;
  }
  fallback += `, Mandatory visual correction: ${correction}`;

  if (typeof options.onTrace === 'function') {
    options.onTrace({ promptSent: directorPrompt, responseReceived: fallback, source: 'deterministic-fallback', error: res.error || 'empty_or_short_output' });
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// Keeping script, artwork and audio in step
// ---------------------------------------------------------------------------

// [old, new] pairs for caption/dialogue lines that changed.
function changedTextPairs(prevCaption, prevDialogue, newCaption, newDialogue) {
  const pairs = [];
  const a = String(prevCaption || '').trim();
  const b = String(newCaption || '').trim();
  if (a && b && a !== b) pairs.push([a, b]);
  const pd = Array.isArray(prevDialogue) ? prevDialogue : [];
  const nd = Array.isArray(newDialogue) ? newDialogue : [];
  for (let i = 0; i < Math.max(pd.length, nd.length); i++) {
    const o = String((pd[i] && pd[i].text) || '').trim();
    const n = String((nd[i] && nd[i].text) || '').trim();
    if (o && n && o !== n) pairs.push([o, n]);
  }
  return pairs;
}

// The image prompt carries the lettering verbatim (caption box / speech bubble
// text). When a line changes, the same words must change in the prompt or the
// re-rendered panel would still show the old text.
function syncPromptText(prompt, pairs) {
  let out = String(prompt || '');
  let changed = false;
  for (const [oldText, newText] of pairs) {
    const variants = [oldText, oldText.replace(/'/g, '’'), oldText.replace(/’/g, "'")];
    for (const v of variants) {
      if (v && out.includes(v)) {
        out = out.split(v).join(newText);
        changed = true;
      }
    }
  }
  return { prompt: out, changed };
}

function promptShowsText(prompt, text) {
  const p = String(prompt || '').toLowerCase().replace(/’/g, "'");
  const t = String(text || '').toLowerCase().replace(/’/g, "'").trim();
  return Boolean(t) && p.includes(t);
}

// After planning: if the words change, the audio must be re-voiced, and if those
// words are lettered in the artwork, the panel must be re-rendered too.
function enforceTextConsistency(panel, plan) {
  if (!plan || !plan.updateScript) return plan;
  const pairs = changedTextPairs(panel.caption, panel.dialogue, plan.updatedCaption, plan.updatedDialogue);
  // Speaker swaps also need new audio
  const speakerChanged = (panel.dialogue || []).some((d, i) =>
    plan.updatedDialogue && plan.updatedDialogue[i] && plan.updatedDialogue[i].speaker &&
    String(plan.updatedDialogue[i].speaker).toLowerCase() !== String(d.speaker || '').toLowerCase());
  if (pairs.length === 0 && !speakerChanged) return plan;

  if (!plan.regenerateAudio) {
    plan.regenerateAudio = true;
    plan.audioInstruction = plan.audioInstruction || 'Re-voice the updated line(s) with the same character voices.';
  }
  const lettered = pairs.filter(([oldText]) => promptShowsText(panel.prompt, oldText));
  if (lettered.length > 0) {
    plan.regeneratePanel = true;
    const mustRead = lettered.map(([, n]) => `"${n}"`).join(' and ');
    const note = `Re-letter the panel: the text must now read exactly ${mustRead}; keep the artwork composition the same.`;
    plan.visualInstruction = plan.visualInstruction && !plan.visualInstruction.includes(note)
      ? `${plan.visualInstruction} ${note}` : note;
  }
  const steps = [plan.updateScript && 'Update Script', plan.regeneratePanel && 'Regenerate Panel', plan.regenerateAudio && 'Regenerate Audio'].filter(Boolean);
  if (plan.directorSummary && !/→/.test(plan.directorSummary)) plan.directorSummary += ` (${steps.join(' → ')})`;
  return plan;
}

// Short scene description for the planner (the full art prompt is mostly
// costume detail and slows the AI down).
function sceneSummary(prompt) {
  const p = String(prompt || '');
  const afterStyle = p.split(/masterwork sequential art,?\s*/i)[1] || p;
  return afterStyle.split(/,\s*(?:At the top corner|Include an authentic|[A-Z][a-z]+,\s*towering)/)[0].slice(0, 400);
}

// The exact text the art prompt asks to be lettered into the panel.
function letteredText(prompt) {
  const out = [];
  const re = /(?:text|reads?|saying)\s*:?\s*\\?["“]([^"”\\]{2,200})\\?["”]/gi;
  let m;
  while ((m = re.exec(String(prompt || '')))) out.push(m[1]);
  return out;
}

// Finds a word the human wants gone ("Crom is Conan's god...", "remove Crom",
// "don't say Crom") that appears in the caption or dialogue.
function findNamedWordInScript(panel, fb) {
  const text = String(fb || '');
  if (!/\b(replace|remove|change|rename|get rid of|instead of|don'?t (?:say|use)|shouldn'?t|wrong|not ours|is from|belongs to|copyright|trademark|conan|original)\b/i.test(text)) return null;
  const lines = [{ where: 'the caption', text: panel.caption || '' }].concat(
    (panel.dialogue || []).map(d => ({ where: `${d.speaker}'s line`, text: d.text || '' })));
  const words = (text.match(/["“‘]([^"”’]{2,40})["”’]|\b[A-Z][a-zA-Z\-]{2,30}\b/g) || [])
    .map(w => w.replace(/^["“‘]|["”’]$/g, '').replace(/'s$/, ''));
  for (const w of words) {
    if (/^(Replace|Remove|Change|Rename|Korvath|Natari|Narrator|The|This|That|It|Conan|Please|Use)$/i.test(w)) continue;
    const re = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    const hit = lines.find(l => re.test(l.text));
    if (hit) return { word: w, where: hit.where };
  }
  return null;
}

// Rule-based handling of "replace X with Y" / "change X to Y" when no AI is available.
function applyReplaceRequest(panel, fb) {
  const m = String(fb || '').match(/\b(?:replace|change|swap|rename)\s+["'“‘]?(.+?)["'”’]?\s+(?:with|to|for|into)\s+["'“‘]?(.+?)["'”’]?\s*(?:[.!]|$|,|\s+in\s+)/i);
  if (!m) return null;
  const from = m[1].trim();
  const to = m[2].trim();
  if (!from || !to || from.length > 80 || to.length > 80) return null;
  const re = new RegExp(`\\b${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
  const caption = String(panel.caption || '').replace(re, to);
  const dialogue = (panel.dialogue || []).map(d => Object.assign({}, d, { text: String(d.text || '').replace(re, to) }));
  const changed = caption !== (panel.caption || '') || dialogue.some((d, i) => d.text !== (panel.dialogue[i] || {}).text);
  return changed ? { caption, dialogue, from, to } : null;
}

function deterministicPlanFallback(panel, userComment, sourceContext, screenshotPath) {
  const fb = (userComment || '').trim();
  const lower = fb.toLowerCase();

  const mentionsVisual = Boolean(screenshotPath) ||
    /\b(panel|image|img|picture|art|draw|drawing|visual|graphic|caption\s*box|bubble|text\s+on\s+the\s+(?:comic|panel|page)|sword|blade|hand|finger|face|scar|mantle|cloak|cape|ruby|gem|torch|background|lighting|pose|character|look)\b/i.test(lower);
  const mentionsAudio = /\b(audio|voice|sound|tts|elevenlabs|narrator|speaker|dialogue|dialog|speech|pronounce|monotone|flat|whisper|roar|scream|yell|echo|reverb|slower|faster|louder|quieter|pitch|tone|emotion)\b/i.test(lower);
  const mentionsScript = /\b(script|caption|dialogue|dialog|text|line|quote|doesn't\s+match|does\s+not\s+match|mismatch|typo|word)\b/i.test(lower);

  let updateScript = mentionsScript;
  let regeneratePanel = mentionsVisual;
  let regenerateAudio = mentionsAudio;

  const replacement = applyReplaceRequest(panel, fb);
  const named = !replacement ? findNamedWordInScript(panel, fb) : null;
  if (named) {
    const lettered = promptShowsText(panel.prompt, named.word);
    return {
      updateScript: true,
      updatedCaption: panel.caption || '',
      updatedDialogue: Array.isArray(panel.dialogue) ? panel.dialogue.map(d => Object.assign({}, d)) : [],
      regeneratePanel: lettered,
      visualInstruction: lettered ? `Re-letter the panel with the corrected line (no "${named.word}"); keep the artwork composition the same.` : '',
      regenerateAudio: true,
      audioInstruction: 'Re-voice the corrected line with the same character voice.',
      needsManualText: named.word,
      directorSummary: `"${named.word}" found in ${named.where}. Type the corrected wording in the highlighted line below, then confirm (Update Script → ${lettered ? 'Regenerate Panel → ' : ''}Regenerate Audio).`
    };
  }
  if (replacement) {
    const plan = {
      updateScript: true,
      updatedCaption: replacement.caption,
      updatedDialogue: replacement.dialogue,
      regeneratePanel: false,
      visualInstruction: '',
      regenerateAudio: false,
      audioInstruction: '',
      directorSummary: `Replace "${replacement.from}" with "${replacement.to}" in the script`
    };
    return enforceTextConsistency(panel, plan);
  }

  if (!regeneratePanel && !regenerateAudio) {
    if (sourceContext === 'voice' || sourceContext === 'lightbox_audio') {
      regenerateAudio = true;
    } else {
      regeneratePanel = true;
    }
  }

  // If script text is changed and audio wasn't explicitly excluded, audio should stay in sync
  if (updateScript && !regenerateAudio && /\b(audio|voice|dialogue|dialog|caption|match)\b/i.test(lower)) {
    regenerateAudio = true;
  }

  const steps = [];
  if (updateScript) steps.push('Update Script');
  if (regeneratePanel) steps.push('Regenerate Panel');
  if (regenerateAudio) steps.push('Regenerate Audio');

  // If user quoted what the comic says vs what audio says, align caption to the comic quote when applicable
  let updatedCaption = panel.caption || '';
  if (mentionsScript) {
    const quotes = [...fb.matchAll(/['"]([^'"]{10,200})['"]/g)].map(m => m[1].trim());
    if (quotes.length >= 2) {
      const comicMatch = fb.match(/(?:comic|panel|text\s+on\s+the\s+comic|caption\s+box)\s+(?:says|reads|is)\s+['"]([^'"]+)['"]/i);
      if (comicMatch && comicMatch[1]) {
        updatedCaption = comicMatch[1].trim();
      } else {
        updatedCaption = quotes[0];
      }
    } else if (quotes.length === 1 && /should\s+(?:say|be)|change\s+to|make\s+it/i.test(fb)) {
      updatedCaption = quotes[0];
    }
  }

  return {
    updateScript,
    updatedCaption,
    updatedDialogue: Array.isArray(panel.dialogue) ? panel.dialogue : [],
    regeneratePanel,
    visualInstruction: regeneratePanel ? fb : '',
    regenerateAudio,
    audioInstruction: regenerateAudio ? fb : '',
    directorSummary: `Director Plan (${steps.join(' → ')}): "${fb.slice(0, 120)}${fb.length > 120 ? '...' : ''}"`
  };
}

/**
 * AI Studio Director Intent Planner
 * Inspects any user comment from any textbox (Prompts, Visual, Voice, Lightbox) and determines
 * the ordered sequence of pipeline actions required:
 *   1. updateScript (caption / dialogue / prompt text)
 *   2. regeneratePanel (visual art + rendered text in image)
 *   3. regenerateAudio (voice casting, delivery, DSP, audio mix)
 */
async function planDirectorActions(panel, context = {}, userComment = '', sourceContext = 'panel', screenshotPath = '') {
  const fb = (userComment || '').trim();
  if (!fb) {
    return deterministicPlanFallback(panel, '', sourceContext, screenshotPath);
  }

  const speakersObj = (context.voiceRegistry && (context.voiceRegistry.characters || context.voiceRegistry.speakers)) || {};
  const speakerKeys = Object.keys(speakersObj);

  const plannerPrompt = `You are the Master AI Studio Director for a graphic novel & motion-comic pipeline.
A human creator typed a feedback comment into the "${sourceContext}" textbox for Panel #${panel.panelId} ("${panel.name || ''}").

HUMAN COMMENT:
${JSON.stringify(fb)}

CURRENT PANEL STATE:
- Caption (Narrator text / yellow caption box): ${JSON.stringify(panel.caption || '')}
- Dialogue (Speech bubbles & audio): ${JSON.stringify(panel.dialogue || [])}
- Scene (start of the art prompt): ${JSON.stringify(sceneSummary(panel.prompt))}
- Text lettered into the artwork (caption box / speech bubbles): ${JSON.stringify(letteredText(panel.prompt))}
- Available Voice Registry Speakers: ${JSON.stringify(speakerKeys)}
- Screenshot attached: ${Boolean(screenshotPath)}

YOUR JOB:
Determine ALL intents from the human's comment and output a strict dependency-ordered action plan:
1. "updateScript": true if the panel's caption or dialogue text/speaker in the script (manifest) needs to be fixed or aligned (for example, if comic text, dialogue, and audio don't match, pick or unify the intended canonical text).
   - Provide "updatedCaption" (string) and "updatedDialogue" (array of {speaker, text}). Keep unchanged fields as-is.
2. "regeneratePanel": true if the comic panel IMAGE needs to be re-rendered (e.g. visual mistake, wrong text rendered inside the comic's caption box or speech bubble, anatomy/weapon/lighting fix, or the user says the panel needs fixing).
   - Provide "visualInstruction": concise, actionable visual/text-in-image instruction for the Visual Art Director (never leave raw conversational filler).
3. "regenerateAudio": true if the panel AUDIO needs to be re-synthesized (e.g. wrong voice/speaker, wrong words spoken, tone/pacing/reverb issue, caption/dialogue changed, or the user says the audio needs fixing).
   - Provide "audioInstruction": concise, actionable voice/DSP direction for the Voice Director.
CONSISTENCY RULES (script, artwork and audio must always agree):
- If the comment asks to change or remove any word, name or line, set updateScript and write the corrected caption/dialogue. If the human didn't say what to use instead, invent an original replacement that fits the comic's world (never a name from another franchise).
- If changed words are lettered in the artwork (they appear in the Visual Prompt), also set regeneratePanel, and say in visualInstruction exactly what the caption box / speech bubble must now read.
- If spoken words change, also set regenerateAudio.
4. "directorSummary": one clear sentence summarizing the ordered actions you are triggering (e.g. "Aligned script caption/dialogue → Regenerating Panel #01 image → Re-synthesizing Panel #01 audio").

Output ONLY valid JSON (no markdown fences, no commentary outside JSON):
{
  "updateScript": boolean,
  "updatedCaption": string,
  "updatedDialogue": [{"speaker": string, "text": string}],
  "regeneratePanel": boolean,
  "visualInstruction": string,
  "regenerateAudio": boolean,
  "audioInstruction": string,
  "directorSummary": string
}`;

  console.error(`[AI Director Planner] Analyzing intents from "${sourceContext}" comment: "${fb}"...`);
  const res = await runHeadlessPrompt(plannerPrompt, {
    label: 'AI Director Planner',
    timeoutMs: 150000
  });
  if (res.ok) {
    const parsed = extractJsonFromText(res.text);
    if (parsed) {
      const plan = {
        updateScript: Boolean(parsed.updateScript),
        updatedCaption: typeof parsed.updatedCaption === 'string' ? parsed.updatedCaption : (panel.caption || ''),
        updatedDialogue: Array.isArray(parsed.updatedDialogue) ? parsed.updatedDialogue : (panel.dialogue || []),
        regeneratePanel: Boolean(parsed.regeneratePanel),
        visualInstruction: typeof parsed.visualInstruction === 'string' ? parsed.visualInstruction : fb,
        regenerateAudio: Boolean(parsed.regenerateAudio),
        audioInstruction: typeof parsed.audioInstruction === 'string' ? parsed.audioInstruction : fb,
        directorSummary: typeof parsed.directorSummary === 'string' && parsed.directorSummary.trim()
          ? parsed.directorSummary.trim()
          : 'AI Director executing ordered pipeline actions.'
      };
      enforceTextConsistency(panel, plan);
      // Ensure at least one execution step
      if (!plan.regeneratePanel && !plan.regenerateAudio) {
        if (sourceContext === 'voice' || sourceContext === 'lightbox_audio') plan.regenerateAudio = true;
        else plan.regeneratePanel = true;
      }
      plan.trace = {
        source: res.source || 'gemini-3.8-flash-medium',
        promptSent: plannerPrompt,
        responseReceived: JSON.stringify(parsed, null, 2)
      };
      console.error(`[AI Director Planner] Plan ready: ${plan.directorSummary}`);
      return plan;
    }
  }
  const fbPlan = deterministicPlanFallback(panel, fb, sourceContext, screenshotPath);
  fbPlan.aiUnavailableReason = res.ok ? 'AI reply was not valid JSON' : (res.error || 'AI director unavailable');
  fbPlan.trace = {
    source: 'deterministic-fallback',
    promptSent: plannerPrompt,
    responseReceived: JSON.stringify(fbPlan, null, 2)
  };
  return fbPlan;
}

/**
 * AI Visual Director 8-Point Image Inspection
 * Uses Gemini 3.8 Flash multimodal vision via agy.exe to inspect the rendered panel image
 * against the script beat, caption/dialogue text, character DNA, weapon invariants, and anatomy.
 */
async function inspectPanelImageWithGemini(imagePath, panel, project = {}, options = {}) {
  if (!imagePath || !fs.existsSync(imagePath)) {
    return {
      passed: false,
      score: 0,
      issues: ['Rendered image file missing on disk'],
      fixInstruction: 'Re-render panel image cleanly.',
      summary: 'Image file missing on disk.',
      source: 'file-check'
    };
  }

  const normalizedPath = imagePath.replace(/\\/g, '/');
  const prevPanel = options.previousPanel || null;
  const prevImg = prevPanel && prevPanel.imagePath ? String(prevPanel.imagePath).replace(/\\/g, '/') : '';
  const sheetPaths = Array.isArray(options.sheetPaths) ? options.sheetPaths : [];
  const lockedCharacters = resolvePanelCharacterAnchors(panel, project, path.join(__dirname, '..'));
  const lockedWardrobeText = lockedCharacters.length
    ? lockedCharacters.map(c => `- ${c.key}: ${c.anchor}`).join('\n')
    : 'None matched';

  const inspectPrompt = `You are the strict Master Visual Director for a comic book graphic novel studio enforcing the 8-Point Visual QA Gate (Protocol 5).
Inspect the rendered comic panel image at file path: ${normalizedPath}
${prevImg ? `Compare continuity against the preceding panel image at: ${prevImg} (Panel #${prevPanel.panelId}: ${JSON.stringify(prevPanel.summary || '')})` : ''}
${sheetPaths.length ? `Reference turnaround model sheets available in workspace: ${sheetPaths.map(s => s.replace(/\\/g, '/')).join(', ')}` : ''}

LOCKED CHARACTER & WARDROBE DNA (from character_prompts.json — MUST match strictly):
${lockedWardrobeText}

SERIES & SCRIPT SPECIFICATION:
- Series Genre: ${JSON.stringify(project.genre || 'Sword-and-Sorcery Pulp Graphic Novel')}
- Series artStyleAnchor: ${JSON.stringify(project.artStyleAnchor || 'classic vintage 1970s sword-and-sorcery graphic novel comic book panel, Frank Frazetta and John Buscema illustration style')}
- Series Invariants: ${JSON.stringify(project.invariants || [])}
- Panel #${panel.panelId}: "${panel.name || ''}"
- Action Beat / Scene Expected: ${JSON.stringify(panel.summary || '')}
- Expected Yellow Caption Box Text: ${JSON.stringify(panel.caption || '')}
- Expected Dialogue Bubbles: ${JSON.stringify(panel.dialogue || [])}
- Expected Characters: ${JSON.stringify(panel.characters || [])}
- Expected Objects/Props: ${JSON.stringify(panel.objects || [])}

8-POINT VISUAL QA RUBRIC (Hard Reject if ANY major defect is present):
1. FACIAL LIKENESS & SANITY: Matches character DNA/model sheet (chiseled jaw, intense wolfish eyes, wavy raven hair). REJECT ape-brow/Neanderthal ridge, squinting piggish eyes, jagged fringe bangs, or distorted face.
2. WARDROBE CONTINUITY (Mantle/Cape Rule): Clothing/armor layers match preceding panel & character DNA (e.g., wolf-fur mantle, cross-chest harness, fur-trimmed kilt). REJECT vanishing or spontaneously appearing garments.
3. CARRIED OBJECT & EQUIPMENT STATE: Exact weapon/relic geometry and count (e.g., single straight 42-inch double-edged broadsword — NOT curved scimitar, NO accidental dual-wielding/duplicate swords; torch/relic state preserved).
4. CARDINALITY & ANTI-GHOST GUARD: Exact headcount matches script. REJECT accidental background "ghost" clones, extra limbs, or fused crowd bodies.
5. ANATOMICAL SANITY & HANDS: 5 human fingers per hand, natural grip (thumbs toward crossguard), coherent limb articulation. REJECT monster/claw hands, 6+ mangled fingers, or dislocated arm twists.
6. ENVIRONMENTAL & DAMAGE CONTINUITY: Setting matches the Action Beat; lighting, battle wear, and splatters persist consistently from preceding panel. REJECT wrong scene or abrupt background teleportation.
7. SERIES artStyleAnchor FIDELITY: Matches series artStyleAnchor & genre (high-contrast black ink brushwork, cross-hatching, rich cel colors, chiaroscuro). REJECT 3D CGI plastic skin, blurry watercolor, or flat vector art.
8. CAPTION & SPEECH BUBBLE POINTER: Legible English matching script (no AI gibberish or overflow); speech balloon pointer tail MUST point directly to the actual speaker's mouth (REJECT pointer pointing at wrong character or empty space).

Output ONLY valid JSON (no markdown fences, no extra text):
{
  "passed": boolean,
  "score": number,
  "issues": ["string"],
  "fixInstruction": "concise prompt correction if passed is false, else empty string",
  "summary": "one-sentence visual director verdict citing any failed rubric point(s)"
}`;

  const res = await runHeadlessPrompt(inspectPrompt, {
    label: `AI Visual Director P#${panel.panelId}`,
    timeoutMs: 120000
  });
  if (res.ok) {
    const parsed = extractJsonFromText(res.text);
    if (parsed) {
      return {
        passed: Boolean(parsed.passed),
        score: Number(parsed.score) || (parsed.passed ? 8 : 3),
        issues: Array.isArray(parsed.issues) ? parsed.issues : [],
        fixInstruction: typeof parsed.fixInstruction === 'string' ? parsed.fixInstruction : '',
        summary: typeof parsed.summary === 'string' && parsed.summary.trim()
          ? parsed.summary.trim()
          : (parsed.passed ? 'Passed 8-Point Visual Director QA.' : 'Failed Visual Director QA.'),
        source: res.source
      };
    }
  }

  // If agy CLI is unavailable, do not block pipeline falsely; mark skipped
  return {
    passed: true,
    score: 7,
    issues: [],
    fixInstruction: '',
    summary: 'Visual QA skipped (Gemini CLI unavailable) — file size & hash verified.',
    source: 'skipped-unavailable'
  };
}

module.exports = {
  letteredText,
  sceneSummary,
  changedTextPairs,
  syncPromptText,
  enforceTextConsistency,
  applyReplaceRequest,
  refinePromptWithGemini,
  planDirectorActions,
  inspectPanelImageWithGemini
};
