/**
 * Imports the "At the Crossroads (Take 2)" graphic novel into the Comic Studio.
 * Each of the 10 tracks becomes an episode with its 10 approved panels, so the
 * Studio can go straight to voices and the motion comic.
 *
 *   node tools/import/import_crossroads.js "C:\research\gnb\At the Crossroads - 2" [--force]
 *
 * The source folder is only read, never changed.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', '..');
const PROJECT_ID = 'at-the-crossroads';
const src = process.argv[2];
const force = process.argv.includes('--force');
if (!src || !fs.existsSync(path.join(src, '01_Script', 'crossroads_all_panels.json'))) {
  console.error('Usage: node tools/import/import_crossroads.js "<path to At the Crossroads - 2>"');
  process.exit(1);
}
const projDir = path.join(ROOT, 'projects', PROJECT_ID);
if (fs.existsSync(path.join(projDir, 'project.json')) && !force) {
  console.error(`projects/${PROJECT_ID} already exists. Re-run with --force to overwrite the imported files.`);
  process.exit(1);
}

const STYLE = 'highly detailed modern graphic novel panel, crisp clean ink linework with fine cross-hatching, rich digital texture, muted but high-contrast cinematic lighting, clean cel and gradient shading, no messy watercolor wash, no blur';
const now = new Date().toISOString();
const tracks = JSON.parse(fs.readFileSync(path.join(src, '01_Script', 'crossroads_all_panels.json'), 'utf8'));
const assetDirs = fs.readdirSync(path.join(src, '02_Assets')).filter(d => /^Track_\d+/.test(d));

// Who speaks the quoted lines (the rest of the text is narration)
const SPEAKERS = { '4.6': 'Bluesman', '5.3': 'Devil', '5.7': 'Devil', '8.7': 'Bluesman' };

const CHARACTER_WORDS = [
  ['kid', /\b(kid|boy|young man|young adult man|the man|preacher|superstar|protagonist|his hands?)\b/i],
  ['mother', /\b(mother|mama|mom)\b/i],
  ['father', /\bfather\b/i],
  ['bluesman', /\bbluesman\b/i],
  ['devil', /\b(devil|shadow|entity|red ember eyes)\b/i],
  ['rider', /\b(rider|biker|motorcycle club|blackwater devils)\b/i],
  ['label_man', /\b(label man|record executive|executive)\b/i],
  ['old_timer', /\b(old timer|old-timer)\b/i]
];

function splitCaption(caption, speaker) {
  const c = String(caption || '').trim();
  if (!speaker) return { caption: c, dialogue: [] };
  const quoted = [...c.matchAll(/"([^"]+)"/g)].map(m => m[1].trim());
  const narration = c.replace(/"[^"]+"/g, ' ').replace(/\s+/g, ' ').trim();
  return { caption: narration, dialogue: quoted.map(text => ({ speaker, text })) };
}
function shortName(action) {
  const first = String(action || '').split(/[.;:—]/)[0].replace(/^(late 1970s west|present day)[, ]*/i, '').trim();
  const words = first.split(/\s+/).slice(0, 7).join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

fs.mkdirSync(path.join(projDir, 'reference', 'sheets'), { recursive: true });
fs.mkdirSync(path.join(projDir, 'episodes'), { recursive: true });

const episodes = [];
for (const t of tracks) {
  const n = Number(t.num);
  const epId = `ep${String(n).padStart(2, '0')}`;
  const assetDir = assetDirs.find(d => d.startsWith(`Track_${String(n).padStart(2, '0')}_`));
  if (!assetDir) throw new Error(`No 02_Assets folder for track ${n}`);
  const epDir = path.join(projDir, 'episodes', epId);
  fs.mkdirSync(path.join(epDir, 'panels'), { recursive: true });

  const panels = t.panels.map(p => {
    const pn = Number(p.panel);
    const pad = String(pn).padStart(2, '0');
    const from = path.join(src, '02_Assets', assetDir, 'selected', `track_${String(n).padStart(2, '0')}_panel_${pad}.webp`);
    if (!fs.existsSync(from)) throw new Error(`Missing panel image ${from}`);
    const rel = `projects/${PROJECT_ID}/episodes/${epId}/panels/panel_${pad}.webp`;
    fs.copyFileSync(from, path.join(ROOT, rel));
    const buf = fs.readFileSync(from);
    const { caption, dialogue } = splitCaption(p.caption, SPEAKERS[`${n}.${pn}`]);
    const text = `${p.action} ${p.prompt}`;
    return {
      panelId: pn,
      name: shortName(p.action),
      act: `Track ${n}`,
      summary: p.action,
      caption,
      dialogue,
      characters: CHARACTER_WORDS.filter(([, re]) => re.test(text)).map(([k]) => k),
      objects: [],
      shotType: String(p.camera || '').replace(/\.$/, ''),
      prompt: p.prompt,
      imageEngine: 'meta-ai-cdp',
      imageStatus: 'VERIFIED',
      imagePath: rel,
      webPreviewUrl: rel,
      sizeKB: Math.round(buf.length / 102.4) / 10,
      hash: crypto.createHash('sha1').update(buf).digest('hex').slice(0, 8),
      qaNotes: 'Imported from At the Crossroads (Take 2): panel approved in the original project.',
      audioStatus: 'PENDING',
      audioPath: '',
      importedFrom: path.join('02_Assets', assetDir, 'selected', path.basename(from)).replace(/\\/g, '/'),
      originalCaption: p.caption
    };
  });

  const manifest = {
    projectId: PROJECT_ID,
    episodeId: epId,
    episodeNumber: n,
    title: `Track ${n}: ${t.title}`,
    theme: t.title,
    targetPanelCount: panels.length,
    currentStage: 'VOICE_SYNTHESIS',
    overallProgress: 50,
    updatedAt: now,
    outputs: { resolution: `${panels.length} imported panels • ready for voices` },
    stages: [
      { id: 'SCRIPT_GENERATION', name: '1. Writers Room Script', status: 'COMPLETED', progress: 100 },
      { id: 'PROMPT_EXPANSION', name: '2. Latent Anchor & Guardrails', status: 'COMPLETED', progress: 100 },
      { id: 'VISUAL_RENDERING', name: '3. Meta AI 2K Panel Rendering', status: 'COMPLETED', progress: 100 },
      { id: 'VOICE_SYNTHESIS', name: '4. Multi-Actor Voice & DSP', status: 'PENDING', progress: 0 },
      { id: 'VIDEO_ASSEMBLY', name: '5. Motion Comic Camera & Concat', status: 'LOCKED_BY_GATE', progress: 0 },
      { id: 'READY_FOR_RELEASE', name: '6. Master Release Bundle', status: 'LOCKED_BY_GATE', progress: 0 }
    ],
    gates: [
      { id: 'SCRIPT_GATE', name: 'Gate A: Storyboard & Dialogue Lock', afterStage: 'SCRIPT_GENERATION', status: 'APPROVED', approvedAt: now, notes: 'Imported script from At the Crossroads (Take 2).' },
      { id: 'VISUAL_QA_GATE', name: 'Gate B: 8-Point Director Visual Continuity Gate', afterStage: 'VISUAL_RENDERING', status: 'APPROVED', approvedAt: now, notes: 'Imported panels already approved in the original project.' },
      { id: 'AUDIO_QA_GATE', name: 'Gate C: 5-Point Acoustic & Polarity Gate', afterStage: 'VOICE_SYNTHESIS', status: 'LOCKED', notes: 'Awaiting voice synthesis.' }
    ],
    panels,
    importedFrom: { source: 'At the Crossroads - 2', track: n, importedAt: now }
  };
  fs.writeFileSync(path.join(epDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  episodes.push(epId);
  console.log(`${epId}  ${manifest.title}  (${panels.length} panels, ${panels.filter(p => p.dialogue.length).length} with dialogue)`);
}

// Character looks (from the original Meta AI character prompts) and reference sheets
const charPrompts = JSON.parse(fs.readFileSync(path.join(src, '00_Reference', 'character_prompts_meta_ai.json'), 'utf8'));
const looks = {};
for (const c of charPrompts) {
  const look = String(c.prompt || '')
    .replace(/^Character design turnaround concept sheet[^.]*\.\s*/i, '')
    .replace(/\s*Style:.*$/i, '').trim();
  looks[c.id] = `${c.id}, ${look}`;
  const sheet = path.join(src, '00_Reference', 'characters', c.target_file || `${c.id}.webp`);
  if (fs.existsSync(sheet)) fs.copyFileSync(sheet, path.join(projDir, 'reference', 'sheets', path.basename(sheet)));
}
fs.writeFileSync(path.join(projDir, 'reference', 'character_prompts.json'), JSON.stringify(looks, null, 2));
fs.writeFileSync(path.join(projDir, 'reference', 'object_prompts.json'), '{}\n');
for (const f of ['character_bible.md', 'world_bible.md']) {
  const s = path.join(src, '00_Reference', f);
  if (fs.existsSync(s)) fs.copyFileSync(s, path.join(projDir, 'reference', f));
}

// Voice cast: ElevenLabs voices already used in this studio. Change them in the cast screen.
const voice = (name, voiceId, actorName, persona, stability, style, dsp, aliases = [], edge = 'en-US-ChristopherNeural') => ({
  name, aliases, engine: 'elevenlabs', voiceId, actorName, persona,
  defaultStability: stability, defaultStyle: style, dspChain: dsp, edgeFallback: edge
});
const registryPath = path.join(projDir, 'reference', 'voice_registry.json');
if (!fs.existsSync(registryPath) || force) {
  fs.writeFileSync(registryPath, JSON.stringify({
    characters: {
      narrator: voice('The Storyteller (Narrator)', 'nPczCjzI2devNBz1zQrb', 'Brian', 'Weathered Southern storyteller telling a legend over whiskey', 0.40, 0.55, 'volume=1.25'),
      kid: voice('The Kid', 'pNInz6obpgDQGcFmaJgB', 'Adam', 'Hungry young musician; later a burned-out star and a preacher', 0.35, 0.65, 'volume=1.25', ['the kid', 'young man', 'preacher']),
      devil: voice('The Devil', 'N2lVS1w4EtoT3dr4eOWO', 'Callum (Devil)', 'Cold, amused, bottomless; the shadow at the crossroads', 0.30, 0.75,
        'asetrate=44100*0.90,aresample=44100,equalizer=f=110:width_type=h:width=60:g=6,aecho=0.8:0.6:40:0.25,volume=1.35', ['shadow', 'the devil', 'rider', 'the rider']),
      bluesman: voice('The Old Bluesman', 'N2lVS1w4EtoT3dr4eOWO', 'Callum (Bluesman)', 'Warm, knowing old Delta bluesman (the Devil in disguise)', 0.35, 0.65,
        'asetrate=44100*0.95,aresample=44100,volume=1.30', ['old bluesman', 'the bluesman', 'itinerant bluesman']),
      mother: voice('The Mother', 'EXAVITQu4vr4xnSDxMaL', 'Sarah', 'Tired, loving, worried farm mother', 0.45, 0.55, 'volume=1.25', ['mama', 'mom'], 'en-US-AvaNeural'),
      label_man: voice('The Label Man', 'IKne3meq5aSn9XLyUdCD', 'Charlie', 'Slick, dismissive record executive', 0.40, 0.60, 'volume=1.25', ['label man', 'record executive', 'executive']),
      old_timer: voice('The Old Timer', 'JBFqnCBsd6RMkjVDRZzb', 'George', 'Old barfly telling the legend', 0.40, 0.60, 'asetrate=44100*0.94,aresample=44100,volume=1.30', ['old timer', 'old-timer'])
    },
    guards: { allowEdgeFallback: false }
  }, null, 2));
}

const project = {
  id: PROJECT_ID,
  title: 'At the Crossroads',
  subtitle: 'The Legend of the Kid and the Devil',
  genre: 'Southern Gothic folk-horror graphic novel told like a blues ballad',
  artStyleAnchor: STYLE,
  defaultImageEngine: 'meta-ai-cdp',
  defaultVoiceEngine: 'elevenlabs',
  targetEpisodeCount: episodes.length,
  defaultPanelsPerEpisode: 10,
  createdAt: now,
  updatedAt: now,
  coverImage: `projects/${PROJECT_ID}/episodes/ep05/panels/panel_02.webp`,
  invariants: [
    'The Kid ages across the story: 8-12 in Track 1, late teens/early 20s on the road, 24 at the crossroads, a star in his 30s, a preacher in his 40s',
    'The Devil appears as a 7-foot shadow with glowing red ember eyes, as the Old Bluesman in a fedora with a pipe, and as the Rider of the Blackwater Devils MC',
    'The black leather ledger bound with iron clasps is the Devil\'s book in every appearance'
  ],
  episodes
};
fs.writeFileSync(path.join(projDir, 'project.json'), JSON.stringify(project, null, 2));
console.log(`\nImported ${episodes.length} episodes into projects/${PROJECT_ID}.`);
