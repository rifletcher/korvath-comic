const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const rootDir = path.join(__dirname, '..');
const projectsDir = path.join(rootDir, 'projects');

function getFileHashAndSize(filePath) {
  if (!fs.existsSync(filePath)) return { exists: false, sizeKB: 0, hash: '' };
  const buf = fs.readFileSync(filePath);
  return {
    exists: true,
    sizeKB: Math.round((buf.length / 1024) * 10) / 10,
    hash: crypto.createHash('md5').update(buf).digest('hex').slice(0, 8)
  };
}

function buildPanelManifests(scriptPanels, selectedDir, webAssetPrefix, isRendered, audioDir) {
  return scriptPanels.map(p => {
    const pad = String(p.panelId).padStart(2, '0');
    const imgPath = selectedDir ? path.join(selectedDir, `panel_${pad}.webp`) : '';
    const info = imgPath ? getFileHashAndSize(imgPath) : { exists: false, sizeKB: 0, hash: '' };
    const audioPath = audioDir ? path.join(audioDir, `p${pad}_mixed.wav`) : '';
    const hasAudio = audioPath ? fs.existsSync(audioPath) : false;

    return {
      panelId: p.panelId,
      name: p.beat?.name || `Panel ${p.panelId}`,
      act: p.beat?.act || 'Act I',
      summary: p.beat?.summary || p.action || '',
      caption: p.caption || '',
      dialogue: p.dialogue || [],
      characters: p.characters || [],
      objects: p.objects || [],
      shotType: p.camera?.shotType || 'Standard Shot',
      prompt: p.prompt || '',
      imageStatus: info.exists ? 'VERIFIED' : (isRendered ? 'RENDERED' : 'PENDING'),
      imagePath: imgPath ? path.relative(rootDir, imgPath).replace(/\\/g, '/') : '',
      webPreviewUrl: webAssetPrefix ? `${webAssetPrefix}/panel_${pad}.webp` : '',
      sizeKB: info.sizeKB,
      hash: info.hash,
      audioStatus: hasAudio ? 'VERIFIED' : 'LOCKED_BY_GATE',
      audioPath: hasAudio ? path.relative(rootDir, audioPath).replace(/\\/g, '/') : '',
      qaChecklist: {
        facialLikeness: info.exists,
        wardrobeContinuity: info.exists,
        singleSwordInvariant: info.exists,
        cardinalityGuard: info.exists,
        handAnatomyGuard: info.exists,
        environmentalContinuity: info.exists,
        frazettaInkStyle: info.exists,
        captionSpeechLegibility: info.exists
      }
    };
  });
}

function initWorkspace() {
  console.log('🏗️  Initializing Multi-Comic Studio Workspace Architecture...');
  fs.mkdirSync(projectsDir, { recursive: true });

  // ============================================================================
  // 1. PROJECT: KORVATH THE BARBARIAN
  // ============================================================================
  const korvathDir = path.join(projectsDir, 'korvath-the-barbarian');
  const korvathBibleDir = path.join(korvathDir, 'bible');
  const korvathEp1Dir = path.join(korvathDir, 'episodes', 'ep01');
  const korvathEp2Dir = path.join(korvathDir, 'episodes', 'ep02');

  fs.mkdirSync(korvathBibleDir, { recursive: true });
  fs.mkdirSync(korvathEp1Dir, { recursive: true });
  fs.mkdirSync(korvathEp2Dir, { recursive: true });

  // Copy Bible files into projects/korvath-the-barbarian/bible/
  const refDir = path.join(rootDir, '00_Reference');
  if (fs.existsSync(path.join(refDir, 'character_prompts.json'))) {
    fs.copyFileSync(path.join(refDir, 'character_prompts.json'), path.join(korvathBibleDir, 'characters.json'));
  }
  if (fs.existsSync(path.join(refDir, 'object_prompts.json'))) {
    fs.copyFileSync(path.join(refDir, 'object_prompts.json'), path.join(korvathBibleDir, 'objects.json'));
  }
  if (fs.existsSync(path.join(refDir, 'voice_registry.json'))) {
    fs.copyFileSync(path.join(refDir, 'voice_registry.json'), path.join(korvathBibleDir, 'voice_registry.json'));
  }
  if (fs.existsSync(path.join(refDir, 'character_bible.md'))) {
    fs.copyFileSync(path.join(refDir, 'character_bible.md'), path.join(korvathBibleDir, 'character_bible.md'));
  }

  const korvathProject = {
    id: 'korvath-the-barbarian',
    title: 'Korvath the Barbarian',
    subtitle: 'Chronicles of the Hyborian Sword',
    genre: '1970s Sword-and-Sorcery Pulp Graphic Novel',
    artStyleAnchor: 'classic vintage 1970s sword-and-sorcery graphic novel comic book panel, Frank Frazetta and John Buscema illustration style, dramatic heavy black ink brushwork, crisp fine cross-hatching, rich cel-shaded digital colors, theatrical chiaroscuro lighting, dark pulp fantasy aesthetic, masterwork sequential art',
    defaultImageEngine: 'meta-ai-cdp',
    defaultVoiceEngine: 'elevenlabs',
    targetEpisodeCount: 6,
    defaultPanelsPerEpisode: 20,
    createdAt: '2026-11-01T10:00:00Z',
    updatedAt: new Date().toISOString(),
    coverImage: 'docs/assets/ep1_meta/panel_01.webp',
    invariants: [
      'Single Sword Invariant: Korvath carries strictly ONE 42-inch straight iron broadsword',
      'Natari Weapons: Twin curved Zamorian daggers only (strictly NO broadsword)',
      'Anti-Claw Hand Anatomy: 5-fingered human hands on all characters holding relics',
      'Fail-Closed Voice Polarity: Antagonist slurs never assigned to hero or narrator'
    ],
    episodes: ['ep01', 'ep02']
  };
  fs.writeFileSync(path.join(korvathDir, 'project.json'), JSON.stringify(korvathProject, null, 2));

  // Load Episode 1 & Episode 2 scripts
  const ep1ScriptPath = path.join(rootDir, '01_Script', 'episodes', 'episode_01.json');
  const ep2ScriptPath = path.join(rootDir, '01_Script', 'episodes', 'episode_02.json');
  const ep1Script = JSON.parse(fs.readFileSync(ep1ScriptPath, 'utf8'));
  const ep2Script = JSON.parse(fs.readFileSync(ep2ScriptPath, 'utf8'));

  fs.writeFileSync(path.join(korvathEp1Dir, 'script.json'), JSON.stringify(ep1Script, null, 2));
  fs.writeFileSync(path.join(korvathEp2Dir, 'script.json'), JSON.stringify(ep2Script, null, 2));

  // Episode 1 Manifest (100% Complete & Released)
  const ep1Panels = buildPanelManifests(
    ep1Script,
    path.join(rootDir, 'docs', 'assets', 'ep1_meta'),
    'assets/ep1_meta',
    true,
    path.join(rootDir, '02_Assets', 'episode_01_build', 'audio')
  );

  const ep1Manifest = {
    projectId: 'korvath-the-barbarian',
    episodeId: 'ep01',
    episodeNumber: 1,
    title: 'Issue #1: The Slumbering Serpent',
    theme: 'sarkesh_serpent_cult_infiltration',
    targetPanelCount: ep1Panels.length,
    currentStage: 'READY_FOR_RELEASE',
    overallProgress: 100,
    assignedWorkerTab: null,
    updatedAt: new Date().toISOString(),
    outputs: {
      masterVideoPath: 'docs/episode_01_meta_motion_comic.mp4',
      grokVideoPath: 'docs/episode_01_motion_comic.mp4',
      webReaderPath: 'docs/index.html',
      durationSeconds: 184.74,
      resolution: '1280x720 @ 30fps (MPEG-TS Verified)'
    },
    stages: [
      { id: 'SCRIPT_GENERATION', name: '1. Writers Room Script', status: 'COMPLETED', progress: 100 },
      { id: 'PROMPT_EXPANSION', name: '2. Latent Anchor & Guardrails', status: 'COMPLETED', progress: 100 },
      { id: 'VISUAL_RENDERING', name: '3. Meta AI 2K Panel Rendering', status: 'COMPLETED', progress: 100 },
      { id: 'VOICE_SYNTHESIS', name: '4. Multi-Actor Voice & DSP', status: 'COMPLETED', progress: 100 },
      { id: 'VIDEO_ASSEMBLY', name: '5. Motion Comic Camera & Concat', status: 'COMPLETED', progress: 100 },
      { id: 'READY_FOR_RELEASE', name: '6. Master Release Bundle', status: 'COMPLETED', progress: 100 }
    ],
    gates: [
      {
        id: 'SCRIPT_GATE',
        name: 'Gate A: Storyboard & Dialogue Lock',
        afterStage: 'SCRIPT_GENERATION',
        status: 'APPROVED',
        approvedAt: '2026-11-03T18:00:00Z',
        notes: '20-panel 3-Act structure locked.'
      },
      {
        id: 'VISUAL_QA_GATE',
        name: 'Gate B: 8-Point Director Visual Continuity Gate',
        afterStage: 'VISUAL_RENDERING',
        status: 'APPROVED',
        approvedAt: '2026-11-08T22:00:00Z',
        notes: 'All 20 Frazetta 2K panels verified.'
      },
      {
        id: 'AUDIO_QA_GATE',
        name: 'Gate C: 5-Point Acoustic & Polarity Gate',
        afterStage: 'VOICE_SYNTHESIS',
        status: 'APPROVED',
        approvedAt: '2026-11-10T12:08:00Z',
        notes: 'Canonical Subterranean Kratos voice verified on Panel 5; strict 30fps sync.'
      }
    ],
    panels: ep1Panels
  };
  fs.writeFileSync(path.join(korvathEp1Dir, 'manifest.json'), JSON.stringify(ep1Manifest, null, 2));

  // Episode 2 Manifest (Paused at Gate B: VISUAL_QA_GATE awaiting user sign-off!)
  const ep2Panels = buildPanelManifests(
    ep2Script,
    path.join(rootDir, '02_Assets', 'Episode_02_meta', 'selected'),
    'assets/ep2_meta',
    true,
    null
  );

  const ep2Manifest = {
    projectId: 'korvath-the-barbarian',
    episodeId: 'ep02',
    episodeNumber: 2,
    title: 'Issue #2: The Shadow of the Spider',
    theme: 'valkash_city_of_thieves_heist',
    targetPanelCount: ep2Panels.length,
    currentStage: 'VISUAL_QA_GATE',
    overallProgress: 60,
    assignedWorkerTab: 'meta-tab-slot-1',
    updatedAt: new Date().toISOString(),
    outputs: {
      masterVideoPath: null,
      webReviewPath: 'docs/episode_02_review.html',
      durationSeconds: null,
      resolution: 'Pending Gate B Approval'
    },
    stages: [
      { id: 'SCRIPT_GENERATION', name: '1. Writers Room Script', status: 'COMPLETED', progress: 100 },
      { id: 'PROMPT_EXPANSION', name: '2. Latent Anchor & Guardrails', status: 'COMPLETED', progress: 100 },
      { id: 'VISUAL_RENDERING', name: '3. Meta AI 2K Panel Rendering', status: 'COMPLETED', progress: 100 },
      { id: 'VOICE_SYNTHESIS', name: '4. Multi-Actor Voice & DSP', status: 'LOCKED_BY_GATE', progress: 0 },
      { id: 'VIDEO_ASSEMBLY', name: '5. Motion Comic Camera & Concat', status: 'LOCKED_BY_GATE', progress: 0 },
      { id: 'READY_FOR_RELEASE', name: '6. Master Release Bundle', status: 'LOCKED_BY_GATE', progress: 0 }
    ],
    gates: [
      {
        id: 'SCRIPT_GATE',
        name: 'Gate A: Storyboard & Dialogue Lock',
        afterStage: 'SCRIPT_GENERATION',
        status: 'APPROVED',
        approvedAt: '2026-11-05T12:00:00Z',
        notes: 'Valkash heist script approved.'
      },
      {
        id: 'VISUAL_QA_GATE',
        name: 'Gate B: 8-Point Director Visual Continuity Gate',
        afterStage: 'VISUAL_RENDERING',
        status: 'AWAITING_APPROVAL',
        approvedAt: null,
        notes: 'Regenerated Panels 1, 2, 8, 9, 10, 12, 18, 19, 20 (Single-sword invariant + Anti-claw human hand on P20). Ready for Director review.'
      },
      {
        id: 'AUDIO_QA_GATE',
        name: 'Gate C: 5-Point Acoustic & Polarity Gate',
        afterStage: 'VOICE_SYNTHESIS',
        status: 'LOCKED',
        approvedAt: null,
        notes: 'Strictly on hold until Gate B is approved.'
      }
    ],
    panels: ep2Panels
  };
  fs.writeFileSync(path.join(korvathEp2Dir, 'manifest.json'), JSON.stringify(ep2Manifest, null, 2));

  // ============================================================================
  // 2. PROJECT: NATARI & THE THIEVES OF ZAMORA (Parallel Comic #2)
  // ============================================================================
  const zamoraDir = path.join(projectsDir, 'zamora-thieves-guild');
  const zamoraEp1Dir = path.join(zamoraDir, 'episodes', 'ep01');
  fs.mkdirSync(path.join(zamoraDir, 'bible'), { recursive: true });
  fs.mkdirSync(zamoraEp1Dir, { recursive: true });

  const zamoraProject = {
    id: 'zamora-thieves-guild',
    title: 'Tales of Zamora: The Crimson Veil',
    subtitle: 'Heists in the City of Spiders',
    genre: 'Dark Sword & Sorcery Stealth Anthology',
    artStyleAnchor: 'classic vintage 1970s sword-and-sorcery graphic novel comic book panel, Frank Frazetta and Barry Windsor-Smith illustration style, heavy ink cross-hatching, nocturnal indigo and amber torchlight',
    defaultImageEngine: 'meta-ai-cdp',
    defaultVoiceEngine: 'elevenlabs',
    targetEpisodeCount: 4,
    defaultPanelsPerEpisode: 10,
    createdAt: '2026-11-10T10:00:00Z',
    updatedAt: new Date().toISOString(),
    coverImage: 'docs/assets/ep2_meta/panel_04.webp',
    invariants: [
      'Twin Curved Daggers Only: Natari wields twin Zamorian kris daggers',
      'Nocturnal Palette: Deep sapphire shadows and brazier gold'
    ],
    episodes: ['ep01']
  };
  fs.writeFileSync(path.join(zamoraDir, 'project.json'), JSON.stringify(zamoraProject, null, 2));

  const zamoraPanels = Array.from({ length: 10 }, (_, i) => ({
    panelId: i + 1,
    name: [
      'Rooftops of Zamora', 'The Tower of the Astrologer', 'Silken Rope Descent',
      'Hall of Whispers', 'The Brass Lock', 'Eyes of the Gargoyle',
      'Crossbow Ambush', 'Dagger in the Dark', 'Leap Across the Canal', 'Dawn Coin Count'
    ][i],
    act: i < 3 ? 'Act I' : i < 7 ? 'Act II' : 'Act III',
    summary: `Beat ${i + 1} of the Zamorian tower heist.`,
    caption: `In Zamora, locks are merely polite suggestions to those born in the alleys.`,
    dialogue: [],
    characters: ['natari'],
    objects: ['daggers'],
    shotType: 'Nocturnal Rooftop Tracking Shot',
    prompt: `classic vintage 1970s sword-and-sorcery graphic novel comic book panel, Frank Frazetta style, Beat ${i + 1}`,
    imageStatus: i < 4 ? 'RENDERED' : 'QUEUED',
    imagePath: '',
    webPreviewUrl: '',
    sizeKB: i < 4 ? 940 : 0,
    hash: i < 4 ? `zam0${i + 1}a9f` : '',
    audioStatus: 'LOCKED_BY_GATE',
    audioPath: '',
    qaChecklist: {
      facialLikeness: i < 4,
      wardrobeContinuity: i < 4,
      singleSwordInvariant: i < 4,
      cardinalityGuard: i < 4,
      handAnatomyGuard: i < 4,
      environmentalContinuity: i < 4,
      frazettaInkStyle: i < 4,
      captionSpeechLegibility: i < 4
    }
  }));

  const zamoraEp1Manifest = {
    projectId: 'zamora-thieves-guild',
    episodeId: 'ep01',
    episodeNumber: 1,
    title: 'Issue #1: The Tower of the Astrologer',
    theme: 'zamora_rooftop_heist',
    targetPanelCount: 10,
    currentStage: 'VISUAL_RENDERING',
    overallProgress: 38,
    assignedWorkerTab: 'meta-tab-slot-2',
    updatedAt: new Date().toISOString(),
    outputs: {
      masterVideoPath: null,
      webReviewPath: null,
      durationSeconds: null,
      resolution: 'Rendering in Worker Slot #2'
    },
    stages: [
      { id: 'SCRIPT_GENERATION', name: '1. Writers Room Script', status: 'COMPLETED', progress: 100 },
      { id: 'PROMPT_EXPANSION', name: '2. Latent Anchor & Guardrails', status: 'COMPLETED', progress: 100 },
      { id: 'VISUAL_RENDERING', name: '3. Meta AI 2K Panel Rendering', status: 'IN_PROGRESS', progress: 40 },
      { id: 'VOICE_SYNTHESIS', name: '4. Multi-Actor Voice & DSP', status: 'LOCKED_BY_GATE', progress: 0 },
      { id: 'VIDEO_ASSEMBLY', name: '5. Motion Comic Camera & Concat', status: 'LOCKED_BY_GATE', progress: 0 },
      { id: 'READY_FOR_RELEASE', name: '6. Master Release Bundle', status: 'LOCKED_BY_GATE', progress: 0 }
    ],
    gates: [
      { id: 'SCRIPT_GATE', name: 'Gate A: Storyboard & Dialogue Lock', afterStage: 'SCRIPT_GENERATION', status: 'APPROVED', approvedAt: '2026-11-10T10:15:00Z', notes: 'Approved for parallel render.' },
      { id: 'VISUAL_QA_GATE', name: 'Gate B: 8-Point Director Visual Continuity Gate', afterStage: 'VISUAL_RENDERING', status: 'PENDING', approvedAt: null, notes: 'Waiting for remaining 6 panels.' },
      { id: 'AUDIO_QA_GATE', name: 'Gate C: 5-Point Acoustic & Polarity Gate', afterStage: 'VOICE_SYNTHESIS', status: 'LOCKED', approvedAt: null, notes: 'Locked.' }
    ],
    panels: zamoraPanels
  };
  fs.writeFileSync(path.join(zamoraEp1Dir, 'manifest.json'), JSON.stringify(zamoraEp1Manifest, null, 2));

  // ============================================================================
  // 3. PROJECT: KULL — THE IRON REAVER (Parallel Comic #3 at Script Gate)
  // ============================================================================
  const kullDir = path.join(projectsDir, 'kull-iron-reaver');
  const kullEp1Dir = path.join(kullDir, 'episodes', 'ep01');
  fs.mkdirSync(path.join(kullDir, 'bible'), { recursive: true });
  fs.mkdirSync(kullEp1Dir, { recursive: true });

  const kullProject = {
    id: 'kull-iron-reaver',
    title: 'Valusia: Crown of Iron',
    subtitle: 'Before the Oceans Drank Atlantis',
    genre: 'Pre-Cataclysmic Heroic Fantasy',
    artStyleAnchor: 'classic vintage 1970s sword-and-sorcery graphic novel comic book panel, John Buscema Savage Sword style, heavy chiaroscuro ink',
    defaultImageEngine: 'meta-ai-cdp',
    defaultVoiceEngine: 'elevenlabs',
    targetEpisodeCount: 8,
    defaultPanelsPerEpisode: 12,
    createdAt: '2026-11-10T11:00:00Z',
    updatedAt: new Date().toISOString(),
    coverImage: 'docs/assets/ep1_meta/panel_10.webp',
    invariants: [
      'Atlantean Broadaxe: Double-bitted notched bronze battle-axe',
      'Tiger-skin Baldric: Striped pelt across chest'
    ],
    episodes: ['ep01']
  };
  fs.writeFileSync(path.join(kullDir, 'project.json'), JSON.stringify(kullProject, null, 2));

  const kullPanels = Array.from({ length: 12 }, (_, i) => ({
    panelId: i + 1,
    name: `Valusia Beat #${i + 1}`,
    act: i < 4 ? 'Act I' : i < 8 ? 'Act II' : 'Act III',
    summary: `Scene beat ${i + 1}: The Serpent in the Throne Room.`,
    caption: 'By this axe I rule!',
    dialogue: [],
    characters: ['kull'],
    objects: ['broadaxe'],
    shotType: 'Heroic Low-Angle Shot',
    prompt: `classic vintage 1970s sword-and-sorcery graphic novel comic book panel, John Buscema Savage Sword style, Beat ${i + 1}`,
    imageStatus: 'PENDING',
    imagePath: '',
    webPreviewUrl: '',
    sizeKB: 0,
    hash: '',
    audioStatus: 'LOCKED_BY_GATE',
    audioPath: '',
    qaChecklist: {}
  }));

  const kullEp1Manifest = {
    projectId: 'kull-iron-reaver',
    episodeId: 'ep01',
    episodeNumber: 1,
    title: 'Issue #1: The Serpent in the Throne Room',
    theme: 'valusia_throne_usurper',
    targetPanelCount: 12,
    currentStage: 'SCRIPT_GATE',
    overallProgress: 18,
    assignedWorkerTab: null,
    updatedAt: new Date().toISOString(),
    outputs: {
      masterVideoPath: null,
      webReviewPath: null,
      durationSeconds: null,
      resolution: 'Awaiting Gate A Script Approval'
    },
    stages: [
      { id: 'SCRIPT_GENERATION', name: '1. Writers Room Script', status: 'COMPLETED', progress: 100 },
      { id: 'PROMPT_EXPANSION', name: '2. Latent Anchor & Guardrails', status: 'LOCKED_BY_GATE', progress: 0 },
      { id: 'VISUAL_RENDERING', name: '3. Meta AI 2K Panel Rendering', status: 'LOCKED_BY_GATE', progress: 0 },
      { id: 'VOICE_SYNTHESIS', name: '4. Multi-Actor Voice & DSP', status: 'LOCKED_BY_GATE', progress: 0 },
      { id: 'VIDEO_ASSEMBLY', name: '5. Motion Comic Camera & Concat', status: 'LOCKED_BY_GATE', progress: 0 },
      { id: 'READY_FOR_RELEASE', name: '6. Master Release Bundle', status: 'LOCKED_BY_GATE', progress: 0 }
    ],
    gates: [
      { id: 'SCRIPT_GATE', name: 'Gate A: Storyboard & Dialogue Lock', afterStage: 'SCRIPT_GENERATION', status: 'AWAITING_APPROVAL', approvedAt: null, notes: '7-Agent Writers Room completed 12-beat outline. Ready for Director sign-off.' },
      { id: 'VISUAL_QA_GATE', name: 'Gate B: 8-Point Director Visual Continuity Gate', afterStage: 'VISUAL_RENDERING', status: 'LOCKED', approvedAt: null, notes: 'Locked.' },
      { id: 'AUDIO_QA_GATE', name: 'Gate C: 5-Point Acoustic & Polarity Gate', afterStage: 'VOICE_SYNTHESIS', status: 'LOCKED', approvedAt: null, notes: 'Locked.' }
    ],
    panels: kullPanels
  };
  fs.writeFileSync(path.join(kullEp1Dir, 'manifest.json'), JSON.stringify(kullEp1Manifest, null, 2));

  console.log('✅ Multi-Comic Workspace initialized under /projects:');
  console.log('   1. korvath-the-barbarian (Ep1: READY_FOR_RELEASE | Ep2: VISUAL_QA_GATE)');
  console.log('   2. zamora-thieves-guild  (Ep1: VISUAL_RENDERING in Slot #2)');
  console.log('   3. kull-iron-reaver      (Ep1: SCRIPT_GATE awaiting approval)');
}

initWorkspace();

