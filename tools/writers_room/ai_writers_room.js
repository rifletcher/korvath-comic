/**
 * AI Writers' Room: the AI writes each episode's script when you press Generate.
 *
 *   1. Showrunner      outline: premise, structure, beats, what changes, ending hook
 *   2. Scriptwriter    panel-by-panel narration, dialogue and voice acting (delivery)
 *   3. Script editor   scores the draft and rewrites the weak panels
 *   4. Checks          cast, Conan/IP terms, line lengths, repeats (+ one AI fix pass)
 *   5. Assembly        image prompts built by code (style, character looks, lettering)
 *
 * Fails closed: if the AI can't be reached or the script fails the checks,
 * nothing is written. There is no template fallback.
 */
const fs = require('fs');
const path = require('path');
const { runHeadlessPrompt, extractJsonFromText } = require('../lib/headless_ai');
const { loadCharacterPrompts } = require('../lib/character_dna');

const rootDir = path.join(__dirname, '..', '..');
const WRITER_MODEL = process.env.CONAN_WRITER_MODEL || process.env.CONAN_AI_MODEL || undefined;
const WRITER_TIMEOUT_MS = Number(process.env.CONAN_WRITER_TIMEOUT_MS) || 300000;
const MAX_PROMPT_CHARS = 26000; // Windows command lines top out at ~32K characters

// Robert E. Howard's Conan setting and real artists: never in our scripts.
const BANNED_TERMS = [
  'conan', 'crom', 'cimmeria', 'cimmerian', 'hyborian', 'hyboria', 'aquilonia', 'aquilonian',
  'stygia', 'stygian', 'zamora', 'zamorian', 'zingara', 'zingaran', 'nemedia', 'nemedian',
  'vanaheim', 'asgard', 'hyrkania', 'hyrkanian', 'turan', 'turanian', 'thoth-amon', 'mitra',
  'robert e. howard', 'robert e howard', 'frazetta', 'buscema'
];

// Voice acting: delivery words the writers may use, and how each is performed
// with ElevenLabs settings (lower stability = more emotional; higher style = more dramatic).
const DELIVERIES = {
  calm:        { stability: 0.55, style: 0.40 },
  quiet:       { stability: 0.50, style: 0.45, dspExtra: 'volume=0.80' },
  whisper:     { stability: 0.50, style: 0.50, dspExtra: 'volume=0.70' },
  menacing:    { stability: 0.45, style: 0.65, dspExtra: 'volume=0.90' },
  wry:         { stability: 0.38, style: 0.60 },
  joking:      { stability: 0.32, style: 0.68 },
  warm:        { stability: 0.45, style: 0.55 },
  weary:       { stability: 0.50, style: 0.50 },
  pained:      { stability: 0.28, style: 0.78 },
  grief:       { stability: 0.30, style: 0.75 },
  fearful:     { stability: 0.22, style: 0.82 },
  panic:       { stability: 0.15, style: 0.90 },
  urgent:      { stability: 0.25, style: 0.80 },
  commanding:  { stability: 0.35, style: 0.80, dspExtra: 'volume=1.10' },
  defiant:     { stability: 0.25, style: 0.85 },
  angry:       { stability: 0.18, style: 0.88, dspExtra: 'volume=1.15' },
  shout:       { stability: 0.16, style: 0.90, dspExtra: 'volume=1.25' },
  roar:        { stability: 0.15, style: 0.92, dspExtra: 'volume=1.25' },
  triumphant:  { stability: 0.22, style: 0.88 },
  // narrator
  ominous:     { stability: 0.48, style: 0.62 },
  hushed:      { stability: 0.50, style: 0.50, dspExtra: 'volume=0.85' },
  grim:        { stability: 0.45, style: 0.60 },
  building:    { stability: 0.30, style: 0.78 },
  epic:        { stability: 0.28, style: 0.85 }
};
const NARRATOR_DELIVERIES = ['calm', 'ominous', 'hushed', 'grim', 'building', 'epic', 'weary', 'wry', 'urgent', 'triumphant'];

const LIMITS = { captionWords: 32, lineWords: 18, panelWords: 42, linesPerPanel: 2 };

// ---------- small helpers ----------
const readJson = (p, d = null) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return d; } };
const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length;
const clip = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const cap = (s) => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);

function scrubBanned(text) {
  let t = String(text || '');
  for (const term of BANNED_TERMS) t = t.replace(new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b\\s*`, 'gi'), '');
  return t.replace(/ {2,}/g, ' ');
}

function bannedIn(text) {
  const t = ` ${String(text || '').toLowerCase()} `;
  return BANNED_TERMS.filter(term => new RegExp(`[^a-z]${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^a-z]`).test(t));
}

// ---------- context ----------
function loadSeriesContext(projectId, episodeId) {
  const projDir = path.join(rootDir, 'projects', projectId);
  const project = readJson(path.join(projDir, 'project.json'), {});
  const manifest = readJson(path.join(projDir, 'episodes', episodeId, 'manifest.json'), {});

  const regPath = [path.join(projDir, 'reference', 'voice_registry.json'), path.join(rootDir, '00_Reference', 'voice_registry.json')]
    .find(p => fs.existsSync(p));
  const registry = (regPath && readJson(regPath, {})) || {};
  const regChars = registry.characters || {};

  // Roles from the character bible ("### 1. `korvath` — Title" + "**Role:** ...")
  const roles = {};
  const biblePath = [path.join(projDir, 'reference', 'character_bible.md'), path.join(projDir, 'bible', 'character_bible.md')]
    .find(p => fs.existsSync(p));
  if (biblePath) {
    let key = null;
    for (const line of fs.readFileSync(biblePath, 'utf8').split(/\r?\n/)) {
      const h = line.match(/^###\s*\d*\.?\s*`([^`]+)`\s*[—-]\s*(.+)$/);
      if (h) { key = h[1].toLowerCase(); roles[key] = { title: h[2].trim() }; continue; }
      const r = line.match(/\*\*Role:\*\*\s*(.+)$/);
      if (r && key && roles[key]) roles[key].role = r[1].trim();
    }
  }

  const visuals = Object.assign({},
    loadCharacterPrompts(rootDir, projectId),
    readJson(path.join(projDir, 'reference', 'character_prompts.json'), {}));
  delete visuals.conan;
  const objects = readJson(path.join(projDir, 'reference', 'object_prompts.json'), {}) || {};

  // Speaking cast = voice registry (the only voices the audio stage will accept)
  const cast = Object.entries(regChars)
    .filter(([k]) => k !== 'narrator')
    .map(([k, v]) => ({
      key: k,
      speakerName: cap(k),
      name: v.name || cap(k),
      role: (roles[k] && (roles[k].role || roles[k].title)) || v.description || '',
      voice: v.voiceDescription || v.persona || '',
      aliases: v.aliases || []
    }));

  // Story so far: earlier numbered episodes (copies like ep02-grok are skipped)
  const epNum = Number(manifest.episodeNumber) || Number(String(episodeId).replace(/\D/g, '')) || 1;
  const prev = [];
  const epsDir = path.join(projDir, 'episodes');
  for (const id of (fs.existsSync(epsDir) ? fs.readdirSync(epsDir) : [])) {
    if (!/^ep\d+$/i.test(id) || id === episodeId) continue;
    const m = readJson(path.join(epsDir, id, 'manifest.json'));
    if (!m) continue;
    const n = Number(m.episodeNumber) || Number(id.replace(/\D/g, ''));
    if (n >= epNum) continue;
    const wr = m.writersRoom || {};
    const captions = (m.panels || []).map(p => String(p.caption || '').trim()).filter(Boolean);
    const lines = [];
    for (const p of m.panels || []) for (const d of p.dialogue || []) if (d && d.text) lines.push(`${d.speaker}: ${d.text}`);
    prev.push({
      n, id, title: m.title || id,
      summary: wr.episodeSummary || captions.join(' '),
      endState: wr.endState || '',
      structure: wr.structure || '',
      setPieces: (m.panels || []).map(p => p.name).filter(Boolean),
      captions, lines
    });
  }
  prev.sort((a, b) => a.n - b.n);

  let sounds = [];
  try { sounds = require('../lib/sound_effects').librarySounds(projectId); } catch (_) {}

  return { project, manifest, cast, visuals, objects, prev, epNum, sounds, registryPath: regPath };
}

function storySoFarText(prev, budget = 7000) {
  if (!prev.length) return 'This is the first episode of the series.';
  const parts = prev.map((e, i) => {
    const latest = i === prev.length - 1;
    const sum = latest ? clip(e.summary, 1800) : clip(e.summary, 700);
    return `Episode ${e.n} "${e.title}"${e.structure ? ` [${e.structure}]` : ''}: ${sum}` +
      (e.endState ? `\n  Where things stand after it: ${clip(e.endState, 500)}` : '') +
      `\n  Set pieces already used: ${clip(e.setPieces.join('; '), 400)}`;
  });
  let out = parts.join('\n');
  while (out.length > budget && parts.length > 1) { parts.shift(); out = '(earlier episodes omitted)\n' + parts.join('\n'); }
  return clip(out, budget);
}

function castText(cast) {
  return cast.map(c => `- ${c.speakerName} (${c.name})${c.role ? `: ${clip(c.role, 160)}` : ''}${c.aliases.length ? ` [also covers: ${c.aliases.slice(0, 6).join(', ')}]` : ''}`).join('\n');
}

function compactScript(panels, withDelivery = true) {
  return (panels || []).map(p => {
    const d = (p.dialogue || []).map(x => `   ${x.speaker}${withDelivery && (x.delivery || (x.audioDirection && x.audioDirection.delivery)) ? ` (${x.delivery || x.audioDirection.delivery})` : ''}: "${x.text}"`).join('\n');
    return `${p.panelId}. [${p.act || ''}] ${p.name || ''} | ${p.shotType || ''}\n   PICTURE: ${p.summary || ''}\n   NARRATION: ${p.caption || '(none)'}${d ? '\n' + d : ''}`;
  }).join('\n');
}

// ---------- prompts ----------
const CRAFT_RULES = `
CRAFT RULES (follow all of them):
- This is a MOTION COMIC: each panel is a still image on screen for about 8-10 seconds while its narration and dialogue are performed aloud by voice actors. Per panel: narration at most ${LIMITS.captionWords} words, each spoken line at most ${LIMITS.lineWords} words, at most ${LIMITS.linesPerPanel} spoken lines, and at most ${LIMITS.panelWords} words in total. Every panel needs narration or dialogue (or both).
- PICTURE: one frozen, drawable moment. Concrete: where we are, the light, who is where, the single key action. No abstract feelings, no camera moves, no sequences of actions.
- NARRATION is the voice of the Chronicler: past tense, terse, atmospheric. It adds what the picture cannot show (history, smell, sound, stakes, a character's intent, irony, foreshadowing). Never describe the visible action ("Korvath swings his sword").
- DIALOGUE: each character sounds like themselves. Subtext over exposition; no "as you know"; people interrupt, joke, lie, threaten. Avoid clichés ("little did they know", "foul vermin", "a chill ran down", "die, beast", "it's a trap") and avoid repeating lines or imagery from earlier episodes.
- Every panel must move the story: new information, a decision, a reversal, an escalation or a payoff. Plant something early that pays off later.
- Vary the shots: establishing, close-up, extreme close-up on an object or eyes, over-the-shoulder, low angle, high angle, two-shot, wide action. No two consecutive panels with the same shot type.
- VOICE ACTING: every spoken line and every narration gets a "delivery" from this list: ${Object.keys(DELIVERIES).join(', ')}. Narration may only use: ${NARRATOR_DELIVERIES.join(', ')}. Pick what the moment needs and vary it — not everything shouted. Optionally give "performanceText": the same words written the way an actor would say them, using only punctuation, ellipses, dashes, a stammer or ONE word in capitals for emphasis (e.g. "Run— RUN!", "You... came back."). Never put stage directions or [brackets] in any spoken text.
- SOUND DESIGN: give panels "soundEffects" (0-2 per panel, at most 3) where a sound makes the moment land: steel on steel, a door grinding, a roar, footsteps on stone. Each: "sound" (a specific description for a sound designer, 5-15 words, no speech or music), "at" (start, after_narration, with_dialogue or end), "volume" (soft, medium or loud), "seconds" (0.5-4). Quiet panels can have none. Give every panel an "ambience": the background of the place (e.g. "crackling torches and distant dripping water in a stone vault"); use the SAME words for every panel in the same place so it is made once. Reuse sounds from the SOUND LIBRARY word for word when they fit; they are free.
- Only the cast members listed under SPEAKING CAST may speak. New characters may appear in pictures but must not speak. The narrator speaks only through NARRATION.
- This is an ORIGINAL world. Never use these names or terms: ${BANNED_TERMS.join(', ')}. Invent your own gods, oaths, places and peoples.`;

function seriesHeader(ctx) {
  const p = ctx.project;
  return `SERIES: ${p.title || ''}
GENRE AND TONE: ${p.genre || 'pulp graphic novel'}
${p.storyDirection ? `SERIES DIRECTION: ${clip(p.storyDirection, 800)}\n` : ''}SERIES RULES: ${clip(scrubBanned((p.invariants || []).join(' | ')), 900)}

SPEAKING CAST (speaker names to use exactly as written):
${castText(ctx.cast)}

CHARACTERS WITH A FIXED LOOK (use these keys in "characters"): ${Object.keys(ctx.visuals).join(', ') || '(none)'}
KNOWN OBJECTS (use these keys in "objects" when they appear): ${Object.keys(ctx.objects).join(', ') || '(none)'}
SOUND LIBRARY (already made, reuse word for word): ${clip(ctx.sounds.map(s => `"${s.sound}" (${s.seconds}s)`).join('; '), 1500) || '(empty)'}

STORY SO FAR:
${storySoFarText(ctx.prev)}`;
}

function episodeHeader(ctx, guidance) {
  const m = ctx.manifest;
  const total = Number(ctx.project.targetEpisodeCount) || 0;
  const isFinal = total && ctx.epNum >= total;
  return `THIS EPISODE: Episode ${ctx.epNum}${total ? ` of ${total}` : ''} "${m.title || ''}"${m.theme ? ` (theme: ${String(m.theme).replace(/_/g, ' ')})` : ''}
PANELS: exactly ${ctx.panelCount}
${isFinal ? 'This is the FINAL episode: resolve the main threads.' : 'End on a hook that makes people want the next episode.'}
${guidance ? `\nDIRECTOR'S NOTES (highest priority; follow them):\n${clip(guidance, 2000)}\n` : ''}`;
}

function outlinePrompt(ctx, guidance, currentScript) {
  return `You are the SHOWRUNNER of a comic-book writers' room. Plan the next episode.
${seriesHeader(ctx)}

${episodeHeader(ctx, guidance)}
${currentScript ? `CURRENT SCRIPT OF THIS EPISODE (rework it according to the director's notes; keep what they do not ask to change):\n${clip(currentScript, 6000)}\n` : ''}
Pick a story STRUCTURE that differs from the earlier episodes (for example: heist, chase, siege, duel, mystery, betrayal, survival, rescue, escape, journey, told-in-flashback). Do not reuse the earlier episodes' set pieces. Give the hero a real choice with a cost.\nEvery character who appears in this episode but is NOT in the fixed-look list (new or returning) must be in "newCharacters" with a look, so the artist draws them the same way every time.
${CRAFT_RULES}

Reply with ONLY this JSON:
{"title":"episode title","logline":"one sentence","structure":"heist","whatChanges":"how the hero or situation is different at the end","beats":[{"act":"Act I","beat":"what happens","panels":4}],"newCharacters":[{"key":"short_slug","name":"Name","look":"visual description an artist can draw, 25-40 words"}],"episodeSummary":"3-4 sentences, past tense, what happened — for future episodes","endState":"who is alive or hurt, what they carry, what threads are open"}
The beats' panel numbers must add up to exactly ${ctx.panelCount}.`;
}

const PANEL_JSON_SHAPE = `{"panels":[{"name":"short panel title","act":"Act I","shotType":"Close-Up","summary":"PICTURE: one drawable moment","characters":["korvath"],"objects":["broadsword"],"caption":"narration or empty string","captionDelivery":"ominous","captionPerformanceText":"optional acted version of the narration","dialogue":[{"speaker":"Korvath","text":"the line","delivery":"wry","performanceText":"optional acted version"}],"soundEffects":[{"sound":"heavy broadsword drawn slowly from a leather scabbard","at":"start","volume":"medium","seconds":1.5}],"ambience":"crackling torches and low murmur in a crowded stone tavern"}]}`;

function scriptPrompt(ctx, outline, guidance, currentScript) {
  return `You are the SCRIPTWRITER of a comic-book writers' room. Write the full panel script from the showrunner's outline.
${seriesHeader(ctx)}

${episodeHeader(ctx, guidance)}
OUTLINE:
${JSON.stringify(outline, null, 1)}
${currentScript ? `\nCURRENT SCRIPT (keep lines that still work, rewrite the rest):\n${clip(currentScript, 5000)}\n` : ''}
${CRAFT_RULES}

Write exactly ${ctx.panelCount} panels, in order, following the outline's beats. In "characters" use the fixed-look keys above, or the new characters' keys from the outline.
Reply with ONLY this JSON:
${PANEL_JSON_SHAPE}`;
}

function editorPrompt(ctx, outline, panels) {
  return `You are the SCRIPT EDITOR of a comic-book writers' room. Make this draft as good as it can be.
SERIES: ${ctx.project.title || ''} — ${ctx.project.genre || ''}
SPEAKING CAST: ${ctx.cast.map(c => c.speakerName).join(', ')}
STORY SO FAR (do not repeat its lines or set pieces):
${storySoFarText(ctx.prev, 3500)}

OUTLINE: ${clip(JSON.stringify({ logline: outline.logline, structure: outline.structure, whatChanges: outline.whatChanges }), 1200)}

DRAFT:
${JSON.stringify({ panels }, null, 0)}
${CRAFT_RULES}

First score the draft 1-10 for story, dialogue, narration, voice acting and visual variety. Then rewrite every panel that is weak: flat or on-the-nose lines, clichés, narration that just describes the picture, characters who sound alike, deliveries that are all the same, sound effects that add nothing or are missing from big moments, repeated shots, pictures that are not one clear moment. Keep what already works. Keep exactly ${panels.length} panels and the same story.
Reply with ONLY this JSON:
{"scores":{"story":7,"dialogue":6,"narration":6,"voiceActing":5,"visualVariety":7},"notes":["what you changed and why"],"panels":[ ...all ${panels.length} panels in the same shape as the draft... ]}`;
}

function fixPrompt(ctx, panels, problems) {
  return `You are the SCRIPT EDITOR. This comic script failed the studio's checks. Fix ONLY these problems and keep everything else as it is.
PROBLEMS:
${problems.map(p => `- ${p}`).join('\n')}

SPEAKING CAST (exact speaker names): ${ctx.cast.map(c => c.speakerName).join(', ')}
Allowed deliveries: ${Object.keys(DELIVERIES).join(', ')} (narration: ${NARRATOR_DELIVERIES.join(', ')})
Limits per panel: narration ≤ ${LIMITS.captionWords} words, each line ≤ ${LIMITS.lineWords} words, ≤ ${LIMITS.linesPerPanel} lines, ≤ ${LIMITS.panelWords} words total.
Never use: ${BANNED_TERMS.join(', ')}.

SCRIPT:
${JSON.stringify({ panels }, null, 0)}

Reply with ONLY the corrected JSON in the same shape: {"panels":[...exactly ${ctx.panelCount} panels...]}`;
}

// ---------- AI call ----------
async function askJson(ai, prompt, label, log) {
  if (prompt.length > MAX_PROMPT_CHARS) prompt = prompt.slice(0, MAX_PROMPT_CHARS - 200) + '\n\n(Context trimmed.) Reply with ONLY the JSON described above.';
  for (let attempt = 1; attempt <= 2; attempt++) {
    const t0 = Date.now();
    const res = await ai(prompt, { label: `Writers' Room: ${label}`, timeoutMs: WRITER_TIMEOUT_MS, model: WRITER_MODEL });
    if (!res || !res.ok) throw new Error(`The writers' room could not reach the AI (${label}): ${(res && res.error) || 'no answer'}. Nothing was changed.`);
    const json = extractJsonFromText(res.text);
    if (json) { log(`${label} done in ${Math.round((Date.now() - t0) / 1000)}s`); return { json, model: res.model }; }
    log(`${label}: the AI's answer wasn't valid JSON${attempt === 1 ? ', asking again' : ''}`);
  }
  throw new Error(`The writers' room got an unreadable answer from the AI (${label}) twice. Nothing was changed.`);
}

// ---------- checks ----------
function resolveSpeaker(name, cast) {
  const s = String(name || '').trim().toLowerCase();
  if (!s) return null;
  return cast.find(c => c.key === s || c.speakerName.toLowerCase() === s || c.name.toLowerCase() === s ||
    s.startsWith(c.key + ' ') || c.aliases.some(a => String(a).toLowerCase() === s)) || null;
}

function cleanPanels(rawPanels, ctx) {
  return (Array.isArray(rawPanels) ? rawPanels : []).map(p => {
    const dialogue = (Array.isArray(p.dialogue) ? p.dialogue : [])
      .filter(d => d && String(d.text || '').trim())
      .map(d => {
        const c = resolveSpeaker(d.speaker, ctx.cast);
        return {
          speaker: c ? c.speakerName : String(d.speaker || '').trim(),
          text: String(d.text).replace(/\[[^\]]*\]/g, '').trim(),
          delivery: String(d.delivery || '').toLowerCase().trim(),
          performanceText: String(d.performanceText || '').replace(/\[[^\]]*\]/g, '').trim()
        };
      });
    return {
      name: String(p.name || '').trim(),
      act: String(p.act || '').trim(),
      shotType: String(p.shotType || '').trim(),
      summary: String(p.summary || '').replace(/^PICTURE:\s*/i, '').trim(),
      characters: (Array.isArray(p.characters) ? p.characters : []).map(c => String(c).toLowerCase().trim()).filter(Boolean),
      objects: (Array.isArray(p.objects) ? p.objects : []).map(o => String(o).toLowerCase().trim()).filter(Boolean),
      caption: String(p.caption || '').replace(/\[[^\]]*\]/g, '').trim(),
      captionDelivery: String(p.captionDelivery || '').toLowerCase().trim(),
      captionPerformanceText: String(p.captionPerformanceText || '').replace(/\[[^\]]*\]/g, '').trim(),
      dialogue,
      soundEffects: (Array.isArray(p.soundEffects) ? p.soundEffects : [])
        .filter(e => e && String(e.sound || e.description || '').trim())
        .slice(0, 3)
        .map(e => ({
          sound: String(e.sound || e.description).replace(/\s+/g, ' ').trim().slice(0, 200),
          at: ['start', 'after_narration', 'with_dialogue', 'end'].includes(e.at) ? e.at : 'start',
          volume: ['soft', 'medium', 'loud'].includes(e.volume) ? e.volume : 'medium',
          seconds: Math.min(4, Math.max(0.5, Number(e.seconds) || 2))
        })),
      ambience: String((p.ambience && p.ambience.sound) || p.ambience || '').replace(/\s+/g, ' ').trim().slice(0, 200)
    };
  });
}

function checkScript(panels, ctx) {
  const problems = [];
  if (panels.length !== ctx.panelCount) problems.push(`The script has ${panels.length} panels; it must have exactly ${ctx.panelCount}.`);
  const earlier = new Set();
  for (const e of ctx.prev) { e.captions.forEach(c => earlier.add(norm(c))); e.lines.forEach(l => earlier.add(norm(l.split(':').slice(1).join(':')))); }
  const seen = new Set();
  panels.forEach((p, i) => {
    const n = i + 1;
    if (!p.summary) problems.push(`Panel ${n} has no PICTURE description.`);
    if (!p.caption && !p.dialogue.length) problems.push(`Panel ${n} has neither narration nor dialogue.`);
    if (words(p.caption) > LIMITS.captionWords) problems.push(`Panel ${n} narration is ${words(p.caption)} words (max ${LIMITS.captionWords}).`);
    if (p.dialogue.length > LIMITS.linesPerPanel) problems.push(`Panel ${n} has ${p.dialogue.length} spoken lines (max ${LIMITS.linesPerPanel}).`);
    const total = words(p.caption) + p.dialogue.reduce((a, d) => a + words(d.text), 0);
    if (total > LIMITS.panelWords) problems.push(`Panel ${n} has ${total} spoken words in total (max ${LIMITS.panelWords}).`);
    for (const d of p.dialogue) {
      if (!resolveSpeaker(d.speaker, ctx.cast)) problems.push(`Panel ${n}: "${d.speaker}" is not in the speaking cast (${ctx.cast.map(c => c.speakerName).join(', ')}). Give the line to a cast member or turn it into narration.`);
      if (words(d.text) > LIMITS.lineWords) problems.push(`Panel ${n}: ${d.speaker}'s line is ${words(d.text)} words (max ${LIMITS.lineWords}).`);
    }
    const spoken = [p.caption, ...p.dialogue.map(d => d.text)].filter(Boolean);
    for (const s of spoken) {
      const k = norm(s);
      if (k.length > 12 && earlier.has(k)) problems.push(`Panel ${n} repeats a line from an earlier episode: "${clip(s, 80)}".`);
      if (k.length > 12 && seen.has(k)) problems.push(`Panel ${n} repeats a line used earlier in this episode: "${clip(s, 80)}".`);
      seen.add(k);
    }
    for (const e of p.soundEffects) {
      if (/\b(says|saying|speech|voice says|music|song|singing)\b/i.test(e.sound)) problems.push(`Panel ${n} sound effect "${clip(e.sound, 60)}" asks for speech or music; sound effects must be sounds only.`);
    }
    const all = [p.name, p.summary, p.caption, p.captionPerformanceText, p.ambience, ...p.soundEffects.map(e => e.sound), ...p.dialogue.map(d => `${d.text} ${d.performanceText}`)].join(' ');
    const bad = bannedIn(all);
    if (bad.length) problems.push(`Panel ${n} uses banned names/terms: ${bad.join(', ')}. Replace them with original ones.`);
  });
  return problems;
}

// ---------- voice acting ----------
function sameWords(a, b) {
  const wa = norm(a).replace(/\b(\w)-(?=\1)/g, ''), wb = norm(b);
  const A = wa.split(' ').filter(Boolean), B = wb.split(' ').filter(Boolean);
  if (!B.length) return false;
  const setA = new Set(A);
  return B.every(w => setA.has(w)) && A.length <= B.length + 3;
}

function buildDirection(delivery, performanceText, text, isNarrator) {
  let key = String(delivery || '').toLowerCase();
  if (!DELIVERIES[key] || (isNarrator && !NARRATOR_DELIVERIES.includes(key))) key = isNarrator ? 'grim' : '';
  if (!key) return null;
  const preset = DELIVERIES[key];
  const dir = { delivery: key, stability: preset.stability, style: preset.style, source: 'writers-room' };
  if (preset.dspExtra) dir.dspExtra = preset.dspExtra;
  const perf = String(performanceText || '').trim();
  if (perf && perf !== text && sameWords(perf, text)) dir.performanceText = perf;
  else if (['shout', 'roar', 'angry', 'panic'].includes(key) && !/[!?]$/.test(text)) dir.performanceText = text.replace(/[.…]+$/, '') + '!';
  return dir;
}

// ---------- prompt assembly (code, not AI) ----------
function assemblePanel(p, idx, ctx, newChars) {
  const anchor = ctx.project.artStyleAnchor || 'classic vintage graphic novel comic book panel';
  let prompt = `${anchor}, ${p.shotType || 'comic panel'}. ${p.summary}`;
  const added = new Set();
  for (const key of p.characters) {
    if (added.has(key)) continue;
    if (ctx.visuals[key]) { prompt += `, ${ctx.visuals[key]}`; added.add(key); continue; }
    const nc = newChars.find(c => c.key === key);
    if (nc && nc.look) { prompt += `, ${nc.name}: ${nc.look}`; added.add(key); }
  }
  for (const key of p.objects) if (ctx.objects[key]) prompt += `, ${ctx.objects[key]}`;
  if (p.caption) {
    prompt += `, At the top corner of the panel, include a clean yellow vintage comic book narrative caption box with black border containing the exact readable English text: "${p.caption}"`;
  }
  p.dialogue.forEach((d, i) => {
    prompt += `, Include ${i ? 'a second' : 'an authentic'} white comic book speech balloon with black ink outline and its pointer tail pointing directly at ${d.speaker}'s mouth with the exact text: "${d.text}"`;
  });

  const panel = {
    panelId: idx + 1,
    name: p.name || `Panel ${idx + 1}`,
    act: (p.act || '').split(':')[0] || '',
    summary: p.summary,
    caption: p.caption,
    dialogue: p.dialogue.map(d => {
      const out = { speaker: d.speaker, text: d.text };
      const dir = buildDirection(d.delivery, d.performanceText, d.text, false);
      if (dir) out.audioDirection = dir;
      return out;
    }),
    characters: p.characters,
    objects: p.objects,
    shotType: p.shotType,
    soundEffects: p.soundEffects,
    ambience: p.ambience,
    prompt,
    imageStatus: 'PENDING', imagePath: '', webPreviewUrl: '', sizeKB: 0, hash: '',
    audioStatus: 'LOCKED_BY_GATE', audioPath: '',
    qaChecklist: {
      facialLikeness: false, wardrobeContinuity: false, singleSwordInvariant: true, cardinalityGuard: true,
      handAnatomyGuard: true, environmentalContinuity: false, frazettaInkStyle: true, captionSpeechLegibility: true
    }
  };
  if (p.caption) {
    const cd = buildDirection(p.captionDelivery, p.captionPerformanceText, p.caption, true);
    if (cd) panel.captionDirection = cd;
  }
  return panel;
}

// ---------- main ----------
/**
 * @param {object} opts { projectId, episodeId, guidance, onProgress(msg), ai(prompt, options) }
 * @returns {{ panels, writersRoom, title }}
 */
async function writeEpisodeScript(opts) {
  const { projectId, episodeId } = opts;
  const guidance = String(opts.guidance || '').trim();
  const ai = opts.ai || runHeadlessPrompt;
  const log = (m) => { if (opts.onProgress) opts.onProgress(m); };

  const ctx = loadSeriesContext(projectId, episodeId);
  ctx.panelCount = Number(ctx.manifest.targetPanelCount) || Number(ctx.project.defaultPanelsPerEpisode) || 20;
  if (!ctx.cast.length) throw new Error(`No voice cast found for ${projectId}. Set up the cast before writing a script.`);

  const existing = (ctx.manifest.panels || []).filter(p => p && (p.caption || (p.dialogue || []).length));
  const rework = !!guidance && existing.length > 0;
  const currentScript = rework ? compactScript(existing) : '';
  log(`${rework ? 'Reworking' : 'Writing'} Episode ${ctx.epNum} (${ctx.panelCount} panels) — story so far: ${ctx.prev.length} earlier episode(s)`);

  log('1/4 Showrunner: planning the episode outline...');
  const o = await askJson(ai, outlinePrompt(ctx, guidance, currentScript), 'Outline', log);
  const outline = o.json;
  if (!Array.isArray(outline.beats) || !outline.beats.length) throw new Error('The showrunner returned an outline with no beats. Nothing was changed.');
  log(`   "${outline.title || ctx.manifest.title}": ${clip(outline.logline || '', 200)} [${outline.structure || '?'}]`);
  const newChars = (Array.isArray(outline.newCharacters) ? outline.newCharacters : [])
    .filter(c => c && c.key && !ctx.visuals[String(c.key).toLowerCase()])
    .map(c => ({ key: String(c.key).toLowerCase().replace(/[^a-z0-9_]+/g, '_'), name: c.name || c.key, look: scrubBanned(c.look || '') }))
    .filter(c => c.look);
  if (newChars.length) log(`   New looks for the artist: ${newChars.map(c => c.name).join(', ')}`);

  log('2/4 Scriptwriter: writing panels, dialogue and voice acting...');
  const s = await askJson(ai, scriptPrompt(ctx, outline, guidance, currentScript), 'Script draft', log);
  let panels = cleanPanels(s.json.panels, ctx);
  if (!panels.length) throw new Error('The scriptwriter returned no panels. Nothing was changed.');

  log('3/4 Script editor: scoring the draft and rewriting weak panels...');
  const e = await askJson(ai, editorPrompt(ctx, outline, panels), 'Edit pass', log);
  const edited = cleanPanels(e.json.panels, ctx);
  const scores = e.json.scores || {};
  const notes = Array.isArray(e.json.notes) ? e.json.notes.slice(0, 12) : [];
  if (edited.length === panels.length) panels = edited;
  else log(`   The editor returned ${edited.length} panels instead of ${panels.length}; keeping the draft.`);
  if (Object.keys(scores).length) log(`   Draft scores: ${Object.entries(scores).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  notes.slice(0, 5).forEach(n => log(`   • ${clip(n, 200)}`));

  log('4/4 Checks: cast, banned terms, line lengths, repeats...');
  let problems = checkScript(panels, ctx);
  if (problems.length) {
    log(`   ${problems.length} problem(s) found; asking the editor to fix them:`);
    problems.slice(0, 8).forEach(p => log(`   ✗ ${p}`));
    const f = await askJson(ai, fixPrompt(ctx, panels, problems), 'Fix pass', log);
    const fixed = cleanPanels(f.json.panels, ctx);
    if (fixed.length) panels = fixed;
    problems = checkScript(panels, ctx);
  }
  if (problems.length) {
    throw new Error(`The script still fails ${problems.length} check(s), so nothing was changed:\n- ${problems.slice(0, 10).join('\n- ')}`);
  }
  log('   All checks passed.');

  const assembled = panels.map((p, i) => assemblePanel(p, i, ctx, newChars));
  const deliveries = {};
  for (const p of assembled) for (const d of p.dialogue) if (d.audioDirection) deliveries[d.audioDirection.delivery] = (deliveries[d.audioDirection.delivery] || 0) + 1;

  const writersRoom = {
    generatedAt: new Date().toISOString(),
    model: o.model || WRITER_MODEL || 'default',
    mode: rework ? 'rework' : 'new',
    guidance,
    logline: outline.logline || '',
    structure: outline.structure || '',
    whatChanges: outline.whatChanges || '',
    beats: outline.beats,
    newCharacters: newChars,
    episodeSummary: outline.episodeSummary || '',
    endState: outline.endState || '',
    editorScores: scores,
    editorNotes: notes,
    deliveries
  };
  // Keep new characters' looks for later episodes (only adds keys that don't exist yet)
  if (newChars.length && !opts.ai) {
    try {
      const cpPath = path.join(rootDir, 'projects', projectId, 'reference', 'character_prompts.json');
      const cp = readJson(cpPath, {}) || {};
      let added = 0;
      for (const c of newChars) if (!cp[c.key]) { cp[c.key] = `${c.key}, ${c.look}`; added++; }
      if (added) { fs.writeFileSync(cpPath, JSON.stringify(cp, null, 2)); log(`   Saved ${added} new character look(s) to the series reference.`); }
    } catch (e) { log(`   Couldn't save new character looks: ${e.message}`); }
  }
  return { panels: assembled, writersRoom, title: outline.title || '' };
}

// ---------- direct an existing script (voice acting + sound, words unchanged) ----------
function directPrompt(ctx, panels) {
  const script = panels.map(p => ({
    panelId: p.panelId,
    picture: clip(p.summary || '', 300),
    narration: p.caption || '',
    dialogue: (p.dialogue || []).map(d => ({ speaker: d.speaker, text: d.text }))
  }));
  return `You are the VOICE AND SOUND DIRECTOR of a motion comic. The words are final: do NOT change, add or remove any words. Direct how each line is performed and design the sound.
SERIES: ${ctx.project.title || ''} — ${ctx.project.genre || ''}
EPISODE: ${ctx.manifest.title || ''}

SCRIPT:
${JSON.stringify(script, null, 0)}

- Every narration and every spoken line gets a "delivery" from: ${Object.keys(DELIVERIES).join(', ')}. Narration may only use: ${NARRATOR_DELIVERIES.join(', ')}. Follow the emotion of the moment and vary it across the episode.
- Optionally give a "performanceText": the SAME words, punctuated the way an actor would say them (ellipses, dashes, a stammer, ONE word in capitals). No stage directions, no [brackets], no new words.
- SOUND: 0-2 "soundEffects" per panel where a sound makes the moment land. Each: "sound" (specific, 5-15 words, no speech, no music), "at" (start, after_narration, with_dialogue or end), "volume" (soft, medium or loud), "seconds" (0.5-4). Every panel gets an "ambience" (the background of the place); use the SAME words for panels in the same place.
- SOUND LIBRARY (already made, reuse word for word when they fit): ${clip(ctx.sounds.map(x => `"${x.sound}" (${x.seconds}s)`).join('; '), 1500) || '(empty)'}

Reply with ONLY this JSON, one entry per panel:
{"panels":[{"panelId":1,"captionDelivery":"ominous","captionPerformanceText":"","dialogue":[{"delivery":"menacing","performanceText":""}],"soundEffects":[{"sound":"...","at":"start","volume":"soft","seconds":2}],"ambience":"..."}]}`;
}

/**
 * Adds voice acting and sound to an episode's existing panels without changing any words.
 * Returns { panels } (the episode's panels with captionDirection / audioDirection / soundEffects / ambience set).
 */
async function directExistingScript(opts) {
  const { projectId, episodeId } = opts;
  const ai = opts.ai || runHeadlessPrompt;
  const log = (m) => { if (opts.onProgress) opts.onProgress(m); };
  const ctx = loadSeriesContext(projectId, episodeId);
  const panels = ctx.manifest.panels || [];
  if (!panels.length) throw new Error('This episode has no panels to direct.');
  log(`Directing voices and sound for ${panels.length} panels (the words stay exactly as they are)...`);
  const r = await askJson(ai, directPrompt(ctx, panels), 'Voice & sound direction', log);
  const byId = new Map((Array.isArray(r.json.panels) ? r.json.panels : []).map(x => [Number(x.panelId), x]));
  let lines = 0, effects = 0, missing = 0;
  const out = panels.map(p => {
    const d = byId.get(Number(p.panelId));
    if (!d) { missing++; return p; }
    const np = Object.assign({}, p);
    if (p.caption) {
      const cd = buildDirection(d.captionDelivery, d.captionPerformanceText, p.caption, true);
      if (cd) { np.captionDirection = Object.assign({}, p.captionDirection || {}, cd); lines++; }
    }
    np.dialogue = (p.dialogue || []).map((line, i) => {
      const dd = (Array.isArray(d.dialogue) ? d.dialogue : [])[i] || {};
      const dir = buildDirection(dd.delivery, dd.performanceText, line.text, false);
      if (!dir) return line;
      lines++;
      return Object.assign({}, line, { audioDirection: Object.assign({}, line.audioDirection || {}, dir) });
    });
    const cleaned = cleanPanels([{ soundEffects: d.soundEffects, ambience: d.ambience }], ctx)[0];
    const banned = bannedIn([cleaned.ambience, ...cleaned.soundEffects.map(e => e.sound)].join(' '));
    np.soundEffects = banned.length ? [] : cleaned.soundEffects.filter(e => !/\b(says|speech|music|song|singing)\b/i.test(e.sound));
    np.ambience = banned.length ? '' : cleaned.ambience;
    effects += np.soundEffects.length;
    return np;
  });
  if (missing === panels.length) throw new Error('The AI returned no usable directions. Nothing was changed.');
  log(`   ${lines} line(s) directed, ${effects} sound effect(s)${missing ? `, ${missing} panel(s) left as they were` : ''}.`);
  return { panels: out, lines, effects, missing };
}

module.exports = {
  writeEpisodeScript,
  directExistingScript,
  // exported for tests
  loadSeriesContext, checkScript, cleanPanels, buildDirection, assemblePanel, storySoFarText, bannedIn, DELIVERIES, LIMITS
};
