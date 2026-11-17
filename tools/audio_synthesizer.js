const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');
const { runHeadlessPrompt, extractJsonFromText } = require('./lib/headless_ai');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
const { resolveSpeaker, getVoiceRegistry, getRegistryPath, ensureProjectRegistry } = require('./voice_resolver');
const { updateManifestLocked } = require('./lib/manifest_lock');
const sfx = require('./lib/sound_effects');

const rootDir = path.join(__dirname, '..');

function getElevenKey() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY;
  const envCandidates = [
    path.join(rootDir, '.env')
  ];
  for (const envPath of envCandidates) {
    if (fs.existsSync(envPath)) {
      const env = fs.readFileSync(envPath, 'utf8');
      const match = env.match(/ELEVENLABS_API_KEY=([^\r\n]+)/);
      if (match) return match[1].trim();
    }
  }
  return null;
}

function getAudioDuration(filePath) {
  try {
    const out = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`, { encoding: 'utf8' }).trim();
    return parseFloat(out) || 4.0;
  } catch (e) {
    return 4.0;
  }
}

const ELEVEN_MODEL_ID = 'eleven_turbo_v2_5';

async function callElevenLabs(voiceId, text, settings, outFile) {
  const apiKey = getElevenKey();
  if (!apiKey) throw new Error('No ElevenLabs API key found');

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      text,
      model_id: ELEVEN_MODEL_ID,
      voice_settings: settings
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`ElevenLabs error (${res.status}): ${errText}`);
  }

  const arrayBuf = await res.arrayBuffer();
  fs.writeFileSync(outFile, Buffer.from(arrayBuf));
}

// ElevenLabs account balance (free call, uses no credits). Returns
// { remaining, used, limit, resetsAt, tier } or { error } if it can't be read
// (for example a restricted API key without user_read permission).
async function getElevenLabsBalance() {
  const apiKey = getElevenKey();
  if (!apiKey) return { error: 'No ElevenLabs API key found (ELEVENLABS_API_KEY in .env)' };
  try {
    const res = await fetch('https://api.elevenlabs.io/v1/user/subscription', { headers: { 'xi-api-key': apiKey } });
    const text = await res.text();
    if (!res.ok) {
      if (/missing_permissions|user_read/.test(text)) {
        return { error: "can't show your balance: the API key needs the User → Read permission (ElevenLabs → Developers → API Keys). Voicing still works, but without the up-front credit check." };
      }
      return { error: explainElevenLabsError(`(${res.status}) ${text.slice(0, 200)}`) };
    }
    const j = JSON.parse(text);
    const used = Number(j.character_count) || 0;
    const limit = Number(j.character_limit) || 0;
    return {
      remaining: Math.max(0, limit - used),
      used,
      limit,
      tier: j.tier || '',
      resetsAt: j.next_character_count_reset_unix ? new Date(j.next_character_count_reset_unix * 1000).toISOString() : ''
    };
  } catch (err) {
    return { error: `ElevenLabs balance check failed: ${err.message}` };
  }
}

// Characters ElevenLabs will bill for voicing these panels (narration + dialogue).
function estimatePanelCharacters(panels, projectId) {
  let chars = 0;
  let clips = 0;
  let registry = null;
  try { registry = getVoiceRegistry(projectId); } catch (_) {}
  const usesEleven = (speaker) => {
    if (!registry) return true;
    try { return (resolveSpeaker(speaker, '', 0, projectId).engine || 'elevenlabs') === 'elevenlabs'; } catch (_) { return true; }
  };
  for (const p of panels || []) {
    if (p.caption && p.caption.trim() && usesEleven('Narrator')) {
      chars += String((p.captionDirection && p.captionDirection.performanceText) || p.caption).trim().length;
      clips++;
    }
    for (const d of p.dialogue || []) {
      if (!d || !d.text || !String(d.text).trim() || !usesEleven(d.speaker)) continue;
      chars += String((d.audioDirection && d.audioDirection.performanceText) || d.text).trim().length;
      clips++;
    }
    if (p.sfxCredits) { chars += p.sfxCredits; clips++; }
  }
  return { chars, clips };
}

function formatResetDate(iso) {
  if (!iso) return '';
  try { return new Date(iso).toISOString().slice(0, 10); } catch (_) { return ''; }
}

// Throws a clear error before anything is spent if the balance is too low.
// If the balance can't be read, synthesis goes ahead and any credit error is
// still reported clearly when it happens.
async function assertEnoughCredits(panels, projectId, what) {
  const { chars, clips } = estimatePanelCharacters(panels, projectId);
  if (chars === 0) return { chars, clips, balance: null };
  const balance = await getElevenLabsBalance();
  if (!balance.error && balance.remaining < chars) {
    const reset = formatResetDate(balance.resetsAt);
    throw new Error(
      `ElevenLabs is out of credits: ${balance.remaining.toLocaleString('en-US')} left, ${what} needs about ` +
      `${chars.toLocaleString('en-US')} (${clips} clips). Nothing was voiced. ` +
      `Top up your ElevenLabs plan${reset ? ` or wait for the reset on ${reset}` : ''}, then try again.`
    );
  }
  return { chars, clips, balance };
}

// Turns raw ElevenLabs API errors into plain English.
function explainElevenLabsError(raw) {
  const msg = String(raw || '');
  if (/quota_exceeded|credits remaining|exceeds your quota|insufficient.*credit/i.test(msg)) {
    const m = msg.match(/You have (\d+) credits remaining[^"]*?(\d+) credits are required/i);
    return m
      ? `ElevenLabs ran out of credits (${m[1]} left, this line needs ${m[2]}). Top up your plan or wait for the monthly reset.`
      : 'ElevenLabs ran out of credits. Top up your plan or wait for the monthly reset.';
  }
  if (/invalid_api_key|\b401\b/i.test(msg)) return `ElevenLabs rejected the API key (check ELEVENLABS_API_KEY in .env). Details: ${msg.slice(0, 200)}`;
  if (/detected_unusual_activity|free_users_not_allowed|payment_required|\b402\b/i.test(msg)) return `ElevenLabs refused the request for this account: ${msg.slice(0, 240)}`;
  if (/voice_not_found|\b404\b/i.test(msg)) return `ElevenLabs couldn't find the voice for this character (check its voiceId in the cast). Details: ${msg.slice(0, 200)}`;
  if (/\b429\b|too_many_concurrent|rate limit/i.test(msg)) return `ElevenLabs is rate-limiting requests; wait a minute and try again. Details: ${msg.slice(0, 160)}`;
  return msg;
}

async function synthesizeWithEdge(text, edgeVoice, outFile) {
  let attempts = 0;
  const maxAttempts = 4;
  const voiceName = edgeVoice || 'en-US-ChristopherNeural';

  while (attempts < maxAttempts) {
    let tts = null;
    try {
      tts = new MsEdgeTTS({ connectionTimeoutMs: 20000, synthesisTimeoutMs: 30000 });
      await tts.setMetadata(voiceName, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      const { audioStream } = tts.toStream(text);
      const out = fs.createWriteStream(outFile);
      await new Promise((resolve, reject) => {
        audioStream.pipe(out);
        out.on('finish', resolve);
        out.on('error', reject);
        audioStream.on('error', reject);
      });
      tts.close();
      return;
    } catch (err) {
      if (tts) { try { tts.close(); } catch(e) {} }
      if (fs.existsSync(outFile)) { try { fs.unlinkSync(outFile); } catch(e) {} }
      attempts++;
      if (attempts >= maxAttempts) throw err;
      await new Promise(r => setTimeout(r, 1000 * attempts));
    }
  }
}

function getAudioSampleRate(filePath) {
  try {
    const out = execSync(`ffprobe -v error -select_streams a:0 -show_entries stream=sample_rate -of default=noprint_wrappers=1:nokey=1 "${filePath}"`, { encoding: 'utf8' }).trim();
    return parseInt(out, 10) || 0;
  } catch (e) {
    return 0;
  }
}

// Edge TTS always produces 24 kHz audio; ElevenLabs produces 44.1 kHz.
const EDGE_TTS_SAMPLE_RATE = 24000;

function edgeAllowed(registry, profile) {
  return (profile && profile.engine === 'edge') || Boolean(registry && registry.guards && registry.guards.allowEdgeFallback);
}

function readClipInfo(fxFile) {
  try { return JSON.parse(fs.readFileSync(`${fxFile}.json`, 'utf8')); } catch (_) { return null; }
}

// ---------------------------------------------------------------------------
// Take cache: every ElevenLabs generation is kept once per comic, keyed by
// voice, model, text and delivery settings. Asking for the identical line again
// (re-mixing, DSP-only tweaks, re-voicing a panel where only another line
// changed, or an episode copy for another image model) reuses the take for free.
// ---------------------------------------------------------------------------
function takeKey(voiceId, text, settings) {
  return crypto.createHash('sha1').update(JSON.stringify({
    v: voiceId, m: ELEVEN_MODEL_ID, t: text,
    s: settings.stability, sb: settings.similarity_boost, st: settings.style, b: settings.use_speaker_boost
  })).digest('hex').slice(0, 20);
}

function takePath(projectId, key) {
  return path.join(rootDir, 'projects', projectId || '_shared', 'audio_takes', `${key}.mp3`);
}

function clipSettings(profile, audioDirection) {
  return {
    stability: (audioDirection && audioDirection.stability !== undefined) ? audioDirection.stability : (profile.defaultStability || 0.25),
    similarity_boost: 0.85,
    style: (audioDirection && audioDirection.style !== undefined) ? audioDirection.style : (profile.defaultStyle || 0.75),
    use_speaker_boost: true
  };
}

function clipDsp(profile, audioDirection) {
  let activeDsp = (audioDirection && audioDirection.dspChain) ? audioDirection.dspChain : profile.dspChain;
  if (audioDirection && audioDirection.dspExtra) {
    activeDsp = activeDsp && activeDsp !== 'volume=1.0' ? `${activeDsp},${audioDirection.dspExtra}` : audioDirection.dspExtra;
  }
  return activeDsp || '';
}

// What a clip should sound like right now: used both to synthesize and to tell
// whether an existing clip is still up to date.
function clipSpec(speaker, text, audioDirection, projectId, panelId) {
  const profile = resolveSpeaker(speaker, text, panelId, projectId);
  const textToSpeak = (audioDirection && audioDirection.performanceText) ? audioDirection.performanceText : String(text || '').trim();
  return { profile, textToSpeak, settings: clipSettings(profile, audioDirection), dsp: clipDsp(profile, audioDirection) };
}

function clipMatchesSpec(info, spec) {
  if (!info) return false;
  return info.character === spec.profile.key &&
    info.textToSpeak === spec.textToSpeak &&
    info.stability === spec.settings.stability &&
    info.style === spec.settings.style &&
    (info.dspChain || '') === (spec.dsp || '') &&
    (info.engineUsed !== 'ElevenLabs' || info.voiceId === spec.profile.voiceId);
}

// Synthesizes one line with the project's cast. Never silently swaps actors:
// if the cast says ElevenLabs and ElevenLabs fails, this throws (unless the
// registry explicitly allows Edge TTS via guards.allowEdgeFallback).
// opts.freshTake forces a new ElevenLabs generation (a deliberate re-take).
async function synthesizeClip(speaker, text, audioDirection, rawFile, fxFile, panelId, traceList = null, projectId = '', opts = {}) {
  const registry = getVoiceRegistry(projectId);
  const spec = clipSpec(speaker, text, audioDirection, projectId, panelId);
  const { profile, textToSpeak, settings } = spec;

  // Finished clip already matches exactly: nothing to do.
  if (!opts.freshTake && fs.existsSync(fxFile) && fs.statSync(fxFile).size > 1000) {
    const info = readClipInfo(fxFile);
    if (clipMatchesSpec(info, spec)) {
      if (Array.isArray(traceList)) traceList.push(Object.assign({}, info, { cached: true, creditsUsed: 0 }));
      return fxFile;
    }
  }

  const engine = profile.engine || 'elevenlabs';
  const allowEdge = edgeAllowed(registry, profile);
  let engineUsed = '';
  let elevenLabsError = '';
  let creditsUsed = 0;
  let reusedTake = false;

  if (engine === 'elevenlabs') {
    const key = profile.voiceId ? takeKey(profile.voiceId, textToSpeak, settings) : '';
    const cachedTake = key ? takePath(projectId, key) : '';
    if (key && !opts.freshTake && fs.existsSync(cachedTake) && fs.statSync(cachedTake).size > 1000) {
      fs.copyFileSync(cachedTake, rawFile);
      engineUsed = 'ElevenLabs';
      reusedTake = true;
    } else {
      const elevenKey = getElevenKey();
      if (!elevenKey) {
        elevenLabsError = 'No ElevenLabs API key found (ELEVENLABS_API_KEY in .env)';
      } else if (!profile.voiceId) {
        elevenLabsError = `No ElevenLabs voiceId set for "${profile.key}"`;
      } else {
        try {
          await callElevenLabs(profile.voiceId, textToSpeak, settings, rawFile);
          engineUsed = 'ElevenLabs';
          creditsUsed = textToSpeak.length;
          fs.mkdirSync(path.dirname(cachedTake), { recursive: true });
          fs.copyFileSync(rawFile, cachedTake);
        } catch (err) {
          elevenLabsError = explainElevenLabsError(err.message);
        }
      }
    }
    if (!engineUsed && !allowEdge) {
      throw new Error(
        `${elevenLabsError} (Panel #${panelId}, ${speaker} / ${profile.actorName || profile.key}). ` +
        `Stopped without using a substitute voice, so the cast stays consistent.`
      );
    }
  }

  if (!engineUsed) {
    if (elevenLabsError) console.warn(`   [Audio] ElevenLabs failed for "${speaker}": ${elevenLabsError}. Using Edge TTS (allowed by registry).`);
    await synthesizeWithEdge(textToSpeak, profile.edgeFallback, rawFile);
    engineUsed = 'Edge TTS';
  }

  // Effects are applied locally with ffmpeg: changing them never costs credits.
  const activeDsp = spec.dsp;
  if (activeDsp && activeDsp !== 'volume=1.0') {
    try {
      execSync(`ffmpeg -y -i "${rawFile}" -af "${activeDsp}" "${fxFile}"`, { stdio: 'ignore' });
    } catch (e) {
      fs.copyFileSync(rawFile, fxFile);
    }
  } else {
    fs.copyFileSync(rawFile, fxFile);
  }

  const info = {
    speaker,
    character: profile.key,
    actorName: profile.actorName || '',
    voiceId: engineUsed === 'ElevenLabs' ? profile.voiceId : '',
    edgeVoice: engineUsed === 'Edge TTS' ? (profile.edgeFallback || '') : '',
    engineUsed,
    elevenLabsError,
    textToSpeak,
    stability: settings.stability,
    style: settings.style,
    dspChain: activeDsp || '',
    reusedTake,
    creditsUsed,
    synthesizedAt: new Date().toISOString()
  };
  try { fs.writeFileSync(`${fxFile}.json`, JSON.stringify(info, null, 2), 'utf8'); } catch (_) {}
  if (Array.isArray(traceList)) traceList.push(info);
  return fxFile;
}

// The clips a panel should have right now: [{ speaker, text, direction, fxName, rawName }].
function expectedPanelClips(panel) {
  const pad = String(panel.panelId).padStart(2, '0');
  const out = [];
  if (panel.caption && panel.caption.trim()) {
    out.push({ speaker: 'Narrator', text: panel.caption.trim(), direction: panel.captionDirection || null,
      rawName: `p${pad}_narrator_raw.mp3`, fxName: `p${pad}_narrator_fx.mp3` });
  }
  (panel.dialogue || []).forEach((d, dIdx) => {
    if (!d || !d.text || !String(d.text).trim()) return;
    const slug = String(d.speaker || 'character').replace(/[^a-zA-Z0-9_-]+/g, '_');
    out.push({ speaker: d.speaker, text: d.text, direction: d.audioDirection || null,
      rawName: `p${pad}_dia_${dIdx}_${slug}_raw.mp3`, fxName: `p${pad}_dia_${dIdx}_${slug}_fx.mp3` });
  });
  return out;
}

// Checks whether a panel's existing audio was voiced by the project's current
// cast. Returns { ok, reasons[] }. Panels made before clip tracking existed are
// judged by sample rate (Edge TTS fallback audio is 24 kHz).
function checkPanelCast(panel, projectId, audioDir) {
  const registry = getVoiceRegistry(projectId);
  const pad = String(panel.panelId).padStart(2, '0');
  const mixedWav = path.join(audioDir, `p${pad}_mixed.wav`);
  const reasons = [];
  if (!fs.existsSync(mixedWav) || fs.statSync(mixedWav).size <= 1000) {
    return { ok: false, missing: true, reasons: ['no audio yet'], clips: [] };
  }
  {
    let stored = '';
    try { stored = JSON.parse(fs.readFileSync(`${mixedWav}.json`, 'utf8')).sfx || ''; } catch (_) {}
    if (sfx.sfxSignature(panel) !== stored) reasons.push('sound effects changed since the panel was mixed');
  }

  const clips = fs.readdirSync(audioDir)
    .filter(f => f.startsWith(`p${pad}_`) && f.endsWith('_fx.mp3.json'))
    .map(f => readClipInfo(path.join(audioDir, f.replace(/\.json$/, ''))))
    .filter(Boolean);

  if (clips.length > 0) {
    // Script edits since the panel was voiced (caption/dialogue text, delivery or effects)
    for (const exp of expectedPanelClips(panel)) {
      const info = readClipInfo(path.join(audioDir, exp.fxName));
      let spec = null;
      try { spec = clipSpec(exp.speaker, exp.text, exp.direction, projectId, panel.panelId); } catch (e) {
        reasons.push(e.message);
        continue;
      }
      if (!info) reasons.push(`${exp.speaker}: line not voiced yet`);
      else if (info.textToSpeak !== spec.textToSpeak) reasons.push(`${exp.speaker}: script text changed since it was voiced`);
      else if (!clipMatchesSpec(info, spec) && info.engineUsed === 'ElevenLabs' && info.voiceId === spec.profile.voiceId) reasons.push(`${exp.speaker}: delivery or effects changed`);
    }
    for (const c of clips) {
      const cur = registry.characters[c.character];
      if (!cur) {
        reasons.push(`${c.speaker}: "${c.character}" is no longer in the cast`);
        continue;
      }
      const wantEngine = cur.engine || 'elevenlabs';
      if (wantEngine === 'elevenlabs' && c.engineUsed !== 'ElevenLabs' && !edgeAllowed(registry, cur)) {
        reasons.push(`${c.speaker}: voiced by fallback ${c.engineUsed} (${c.edgeVoice || 'unknown voice'}) instead of ${cur.actorName || cur.voiceId}`);
      } else if (c.engineUsed === 'ElevenLabs' && c.voiceId && cur.voiceId && c.voiceId !== cur.voiceId) {
        reasons.push(`${c.speaker}: voiced by ${c.actorName || c.voiceId}, cast is now ${cur.actorName || cur.voiceId}`);
      }
    }
    return { ok: reasons.length === 0, reasons, clips };
  }

  // Legacy panel without clip records
  const anyElevenCast = Object.values(registry.characters).some(c => (c.engine || 'elevenlabs') === 'elevenlabs');
  if (anyElevenCast && !(registry.guards && registry.guards.allowEdgeFallback) && getAudioSampleRate(mixedWav) === EDGE_TTS_SAMPLE_RATE) {
    reasons.push('made with fallback Edge TTS voices, not the ElevenLabs cast');
    return { ok: false, legacy: true, reasons, clips: [] };
  }
  return { ok: reasons.length === 0, legacy: true, reasons, clips: [] };
}

// Copies a panel's current audio into audio/_previous/<stamp>/ so earlier takes
// can be recovered. Files stay in place so unchanged lines are reused for free.
function archivePanelAudio(audioDir, panelId, stamp) {
  const pad = String(panelId).padStart(2, '0');
  const dest = path.join(audioDir, '_previous', stamp);
  let copied = 0;
  for (const fname of fs.readdirSync(audioDir)) {
    if (fname.startsWith(`p${pad}_`) && /\.(mp3|wav|json)$/.test(fname)) {
      fs.mkdirSync(dest, { recursive: true });
      try { fs.copyFileSync(path.join(audioDir, fname), path.join(dest, fname)); copied++; } catch (_) {}
    }
  }
  return copied;
}

// Removes clip files for lines that no longer exist in the panel (a snapshot is in _previous/).
function removeStaleClipFiles(audioDir, panel) {
  const pad = String(panel.panelId).padStart(2, '0');
  // Compare case-insensitively: on Windows "Korvath" and "korvath" are the same file.
  const keep = new Set([`p${pad}_mixed.wav`, `p${pad}_mixed.wav.json`]);
  for (const c of expectedPanelClips(panel)) {
    keep.add(c.rawName.toLowerCase()); keep.add(c.fxName.toLowerCase()); keep.add(`${c.fxName}.json`.toLowerCase());
  }
  for (const fname of fs.readdirSync(audioDir)) {
    if (fname.startsWith(`p${pad}_`) && /\.(mp3|json)$/.test(fname) && !keep.has(fname.toLowerCase())) {
      try { fs.unlinkSync(path.join(audioDir, fname)); } catch (_) {}
    }
  }
}

// Voices one panel (narrator caption + dialogue) and mixes it. Returns { duration, clips }.
// Lines that are unchanged reuse their existing clip or cached take (no credits).
async function synthesizePanelAudio(projectId, panel, audioDir, opts = {}) {
  const clips = [];
  const traces = [];
  for (const exp of expectedPanelClips(panel)) {
    const rawFile = path.join(audioDir, exp.rawName);
    const fxFile = path.join(audioDir, exp.fxName);
    await synthesizeClip(exp.speaker, exp.text, exp.direction, rawFile, fxFile, panel.panelId, traces, projectId, opts);
    clips.push({ file: fxFile, speaker: exp.speaker, duration: getAudioDuration(fxFile) });
  }
  removeStaleClipFiles(audioDir, panel);
  const pad = String(panel.panelId).padStart(2, '0');
  const mixedWav = path.join(audioDir, `p${pad}_mixed.wav`);

  // Sound effects and scene ambience from the script (made once, then reused from projects/<p>/sfx/)
  const extras = { effects: [], ambienceFile: '' };
  const fxList = sfx.panelEffects(panel);
  const amb = sfx.panelAmbience(panel);
  if (fxList.length || amb) {
    const key = getElevenKey();
    for (const e of fxList) {
      const r = await sfx.ensureSoundEffect(projectId, e.sound, e.seconds, key);
      extras.effects.push(Object.assign({}, e, { file: r.file }));
      traces.push({ speaker: 'SFX', sound: e.sound, engineUsed: 'ElevenLabs SFX', cached: r.cached, creditsUsed: r.creditsUsed });
    }
    if (amb) {
      const r = await sfx.ensureSoundEffect(projectId, amb.sound, amb.seconds, key);
      extras.ambienceFile = r.file;
      traces.push({ speaker: 'Ambience', sound: amb.sound, engineUsed: 'ElevenLabs SFX', cached: r.cached, creditsUsed: r.creditsUsed });
    }
  }
  const duration = mixPanelAudio(clips, mixedWav, extras);
  try {
    fs.writeFileSync(`${mixedWav}.json`, JSON.stringify({
      sfx: sfx.sfxSignature(panel),
      effects: extras.effects.map(e => ({ sound: e.sound, at: e.at, volume: e.volume, seconds: e.seconds })),
      ambience: amb ? amb.sound : '',
      mixedAt: new Date().toISOString()
    }, null, 2));
  } catch (_) {}
  return { duration, clips: traces };
}

function summarizeClips(traces) {
  return (traces || []).map(t => ({
    speaker: t.speaker,
    character: t.character,
    actorName: t.actorName,
    voiceId: t.voiceId,
    engineUsed: t.engineUsed
  }));
}

function isFatalVoiceError(msg) {
  return /\b(401|402|403)\b|quota|credits|unauthori[sz]ed|invalid api key|No ElevenLabs API key|payment/i.test(msg || '');
}

function mixPanelAudio(clips, mixedWav, extras = {}) {
  const effects = (extras && extras.effects) || [];
  const ambienceFile = (extras && extras.ambienceFile) || '';
  if (effects.length || ambienceFile) return mixPanelWithEffects(clips, mixedWav, effects, ambienceFile);
  if (clips.length === 0) {
    // 4s ambient silent room tone
    execSync(`ffmpeg -y -f lavfi -t 4.0 -i "anoisesrc=d=4.0:c=pink:r=44100:a=0.012,lowpass=f=280" -c:a pcm_s16le "${mixedWav}"`, { stdio: 'ignore' });
    return 4.0;
  }

  let currentDelayMs = 250;
  const inputArgs = [];
  const delayFilters = [];
  const mixInputs = [];

  for (let i = 0; i < clips.length; i++) {
    const clipDur = (typeof clips[i].duration === 'number' && Number.isFinite(clips[i].duration))
      ? clips[i].duration
      : getAudioDuration(clips[i].file);
    inputArgs.push(`-i "${clips[i].file}"`);
    delayFilters.push(`[${i}:a]adelay=${currentDelayMs}|${currentDelayMs}[a${i}]`);
    mixInputs.push(`[a${i}]`);
    currentDelayMs += Math.round(clipDur * 1000) + 300;
  }

  const totalDuration = Math.max((currentDelayMs + 400) / 1000, 3.5);

  const ambIdx = inputArgs.length;
  inputArgs.push(`-f lavfi -t ${totalDuration.toFixed(1)} -i "anoisesrc=d=${totalDuration.toFixed(1)}:c=pink:r=44100:a=0.012,lowpass=f=280"`);
  delayFilters.push(`[${ambIdx}:a]volume=0.22[amb]`);
  mixInputs.push('[amb]');

  const filterComplex = `${delayFilters.join(';')};${mixInputs.join('')}amix=inputs=${mixInputs.length}:duration=longest:dropout_transition=0,volume=1.85[outa]`;
  const mixCmd = `ffmpeg -y ${inputArgs.join(' ')} -filter_complex "${filterComplex}" -map "[outa]" -t ${totalDuration.toFixed(2)} "${mixedWav}"`;
  execSync(mixCmd, { stdio: 'ignore' });

  return totalDuration;
}

// Mix with sound effects and/or scene ambience. Voices keep the same timing and
// level as the plain mix; every input is padded to the full length so levels don't jump.
function mixPanelWithEffects(clips, mixedWav, effects, ambienceFile) {
  const voiceStart = 250;
  let t = voiceStart;
  const timeline = [];
  for (const c of clips) {
    const dur = (typeof c.duration === 'number' && Number.isFinite(c.duration)) ? c.duration : getAudioDuration(c.file);
    timeline.push({ file: c.file, start: t, dur, narrator: /narrator/i.test(c.speaker || '') });
    t += Math.round(dur * 1000) + 300;
  }
  const voiceEnd = t;
  const firstDialogue = timeline.find(x => !x.narrator);
  const afterNarration = timeline.find(x => x.narrator);
  const placed = effects.map(e => {
    let at = 0;
    if (e.at === 'with_dialogue' && firstDialogue) at = Math.max(0, firstDialogue.start - 150);
    else if (e.at === 'after_narration' && afterNarration) at = afterNarration.start + Math.round(afterNarration.dur * 1000) + 50;
    else if (e.at === 'end') at = Math.max(0, voiceEnd - 200);
    return Object.assign({}, e, { startMs: at, dur: getAudioDuration(e.file) });
  });
  let endMs = Math.max(voiceEnd + 400, 3500);
  for (const e of placed) endMs = Math.max(endMs, e.startMs + Math.round(e.dur * 1000) + 200);
  const total = (endMs / 1000).toFixed(2);

  const inputs = [];
  const filters = [];
  const labels = [];
  timeline.forEach((v, i) => {
    inputs.push(`-i "${v.file}"`);
    filters.push(`[${i}:a]aresample=44100,adelay=${v.start}|${v.start},apad=whole_dur=${total}[v${i}]`);
    labels.push(`[v${i}]`);
  });
  placed.forEach((e, j) => {
    const idx = inputs.length;
    inputs.push(`-i "${e.file}"`);
    filters.push(`[${idx}:a]aresample=44100,volume=${e.gain},adelay=${e.startMs}|${e.startMs},apad=whole_dur=${total}[s${j}]`);
    labels.push(`[s${j}]`);
  });
  const ambIdx = inputs.length;
  if (ambienceFile) {
    inputs.push(`-stream_loop -1 -i "${ambienceFile}"`);
    filters.push(`[${ambIdx}:a]aresample=44100,atrim=0:${total},volume=0.28,afade=t=in:d=0.6,afade=t=out:st=${Math.max(0, Number(total) - 0.6).toFixed(2)}:d=0.6[amb]`);
  } else {
    inputs.push(`-f lavfi -t ${total} -i "anoisesrc=d=${total}:c=pink:r=44100:a=0.012,lowpass=f=280"`);
    filters.push(`[${ambIdx}:a]volume=0.22[amb]`);
  }
  labels.push('[amb]');
  const n = labels.length;
  const gain = (0.8 * n).toFixed(3); // amix divides by n (all inputs padded): voices end up at 0.8, close to the plain mix
  const filterComplex = `${filters.join(';')};${labels.join('')}amix=inputs=${n}:duration=longest:dropout_transition=0,volume=${gain},alimiter=limit=0.95[outa]`;
  execSync(`ffmpeg -y ${inputs.join(' ')} -filter_complex "${filterComplex}" -map "[outa]" -t ${total} "${mixedWav}"`, { stdio: 'ignore' });
  return Number(total);
}

async function synthesizeEpisodeAudio(projectId, episodeId, onProgress) {
  const manifestPath = path.join(rootDir, 'projects', projectId, 'episodes', episodeId, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest not found: ${manifestPath}`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const panels = manifest.panels || [];
  if (panels.length === 0) {
    throw new Error(`No panels in episode ${projectId}/${episodeId}`);
  }

  const audioDir = path.join(rootDir, 'projects', projectId, 'episodes', episodeId, 'audio');
  fs.mkdirSync(audioDir, { recursive: true });

  // Pre-flight: check the ElevenLabs balance covers every panel that needs voicing.
  const toVoice = panels.filter(p => !checkPanelCast(p, projectId, audioDir).ok);
  await assertEnoughCredits(panelsNeedingCredits(toVoice, projectId, audioDir), projectId, `voicing ${toVoice.length} panel(s) of ${episodeId}`);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const total = panels.length;
  const results = {};
  const failures = [];
  let revoiced = 0;
  let cumulativeDuration = 0;

  for (let idx = 0; idx < total; idx++) {
    const p = panels[idx];
    const pad = String(p.panelId).padStart(2, '0');
    const relAudioPath = `projects/${projectId}/episodes/${episodeId}/audio/p${pad}_mixed.wav`;

    const check = checkPanelCast(p, projectId, audioDir);
    if (check.ok) {
      results[p.panelId] = { audioStatus: 'VERIFIED', audioPath: relAudioPath, audioError: '', audioClips: summarizeClips(check.clips) };
      cumulativeDuration += getAudioDuration(path.join(audioDir, `p${pad}_mixed.wav`));
      continue;
    }

    if (onProgress) {
      onProgress({
        panelId: p.panelId,
        current: idx + 1,
        total,
        progress: Math.round(((idx + 1) / total) * 100),
        message: check.missing
          ? `Voicing Panel #${p.panelId} with the project cast...`
          : `Re-voicing Panel #${p.panelId} (${check.reasons.join('; ')})...`
      });
    }

    if (!check.missing) {
      archivePanelAudio(audioDir, p.panelId, stamp);
      revoiced++;
    }

    try {
      const { duration, clips } = await synthesizePanelAudio(projectId, p, audioDir);
      cumulativeDuration += duration;
      results[p.panelId] = { audioStatus: 'VERIFIED', audioPath: relAudioPath, audioError: '', audioClips: summarizeClips(clips), creditsUsed: clips.reduce((n, c) => n + (c.creditsUsed || 0), 0) };
    } catch (err) {
      failures.push({ panelId: p.panelId, error: err.message });
      results[p.panelId] = { audioStatus: 'FAILED', audioPath: '', audioError: err.message };
      // An auth/credit problem will fail every panel the same way: stop early.
      if (isFatalVoiceError(err.message)) break;
    }
  }

  updateManifestLocked(manifestPath, (latest) => {
    for (const lp of latest.panels || []) {
      const r = results[lp.panelId];
      if (!r) continue;
      lp.audioStatus = r.audioStatus;
      if (r.audioPath) lp.audioPath = r.audioPath;
      lp.audioError = r.audioError || undefined;
      if (r.audioClips) lp.audioClips = r.audioClips;
    }
    const stage4 = (latest.stages || []).find(s => s.id === 'VOICE_SYNTHESIS');
    const gateC = (latest.gates || []).find(g => g.id === 'AUDIO_QA_GATE');
    if (failures.length === 0) {
      if (stage4) { stage4.status = 'COMPLETED'; stage4.progress = 100; }
      if (gateC) {
        gateC.status = 'AWAITING_APPROVAL';
        gateC.approvedAt = null;
        gateC.notes = `All ${total} panels voiced with the project cast` + (revoiced ? ` (${revoiced} re-voiced to match the cast).` : '.') + ' Ready for 5-Point Acoustic QA approval.';
      }
      latest.currentStage = 'AUDIO_QA_GATE';
      if ((latest.overallProgress || 0) < 75) latest.overallProgress = 75;
    } else {
      if (stage4) { stage4.status = 'IN_PROGRESS'; }
      if (gateC) {
        gateC.status = 'LOCKED';
        gateC.approvedAt = null;
        gateC.notes = `Voice synthesis stopped: ${failures[0].error}`;
      }
    }
  });

  if (failures.length > 0) {
    throw new Error(`Voice synthesis failed on Panel #${failures[0].panelId}: ${failures[0].error}`);
  }

  return {
    success: true,
    totalPanels: total,
    revoicedPanels: revoiced,
    creditsUsed: Object.values(results).reduce((n, r) => n + (r.creditsUsed || 0), 0),
    durationSeconds: Math.round(cumulativeDuration * 10) / 10
  };
}

function stripBracketTags(str) {
  return String(str || '').replace(/\[[^\]]+\]\s*/g, '').trim();
}

function applyDeterministicAudioFeedback(panel, feedback, registryKeys, projectId = '') {
  const fb = (feedback || '').trim();
  if (!fb) return 'No feedback provided; re-synthesized with current settings.';
  const lower = fb.toLowerCase();
  const actions = [];

  panel.audioFeedback = fb;

  // Check for explicit speaker reassignment hints (never pass feedback text to TTS)
  const speakerChangeMatch = fb.match(/(?:speaker|voice|cast|change(?:\s+voice)?(?:\s+to)?|use|should\s+be|sounds\s+like)\s*[:=]?\s*([A-Za-z0-9_\- ]{2,30})/i);
  if (speakerChangeMatch && Array.isArray(panel.dialogue) && panel.dialogue.length > 0) {
    const candidate = speakerChangeMatch[1].trim().toLowerCase();
    const matchedKey = registryKeys.find(k => k.toLowerCase() === candidate || candidate.includes(k.toLowerCase()));
    if (matchedKey) {
      panel.dialogue[0].speaker = matchedKey.toUpperCase();
      actions.push(`Reassigned speaker to ${matchedKey.toUpperCase()}`);
    }
  }

  const adjustDirection = (dir, rawText, speaker) => {
    const cleanText = stripBracketTags((dir && dir.performanceText) || rawText);
    // Start from the character's own delivery so effects-only notes don't change
    // the ElevenLabs settings (which would buy a new take for no reason).
    let base = { stability: 0.25, style: 0.75 };
    try {
      const prof = resolveSpeaker(speaker, rawText, panel.panelId, projectId);
      base = { stability: prof.defaultStability || 0.25, style: prof.defaultStyle || 0.75 };
    } catch (_) {}
    const next = Object.assign({ stability: base.stability, style: base.style, performanceText: cleanText }, dir || {});
    next.performanceText = stripBracketTags(next.performanceText || rawText);
    const extraFilters = [];

    if (/monotone|flat|robotic|lifeless|boring|more emotion|dramatic|intense/.test(lower)) {
      next.stability = 0.18;
      next.style = 0.88;
      actions.push('Increased expressiveness (stability=0.18, style=0.88)');
    }
    if (/roar|scream|yell|angry|aggressive|rage|furious|shout/.test(lower)) {
      next.stability = 0.16;
      next.style = 0.90;
      if (next.performanceText && !/[!?]$/.test(next.performanceText)) {
        next.performanceText = next.performanceText.replace(/\.$/, '') + '!';
      }
      extraFilters.push('volume=1.25');
      actions.push('Tuned for aggressive delivery (stability=0.16, style=0.90, +volume)');
    } else if (/whisper|quiet|soft|creepy|ominous|menacing/.test(lower)) {
      next.stability = 0.44;
      next.style = 0.62;
      extraFilters.push('volume=0.85');
      actions.push('Tuned for quiet/menacing delivery (stability=0.44, style=0.62)');
    } else if (/calm|steady|too wild|too crazy|less dramatic|natural/.test(lower)) {
      next.stability = 0.55;
      next.style = 0.42;
      actions.push('Stabilized delivery (stability=0.55, style=0.42)');
    }

    if (/echo|reverb|cavern|crypt|vault|cave|hollow/.test(lower)) {
      extraFilters.push('aecho=0.8:0.88:60:0.35');
      actions.push('Added stone vault reverb (aecho)');
    }
    if (/deep|deeper|bass|booming|heavy|monster/.test(lower)) {
      extraFilters.push('asetrate=44100*0.92,aresample=44100,bass=g=4:f=110');
      actions.push('Deepened vocal timbre (-8% pitch, +4dB bass)');
    }
    if (/slower|too fast|rushed|slow down|pause/.test(lower)) {
      if (next.performanceText) {
        next.performanceText = next.performanceText.replace(/,\s+/g, '... ').replace(/\.\s+/g, '... ');
      }
      extraFilters.push('atempo=0.90');
      actions.push('Slowed pacing (atempo=0.90 + dramatic pauses)');
    } else if (/faster|too slow|speed up/.test(lower)) {
      extraFilters.push('atempo=1.10');
      actions.push('Sped up pacing (atempo=1.10)');
    }
    if (/louder|too quiet|hard to hear/.test(lower)) {
      extraFilters.push('volume=1.35');
      actions.push('Boosted gain (volume=1.35)');
    }

    if (extraFilters.length > 0) {
      next.dspExtra = extraFilters.join(',');
    }
    return next;
  };

  if (Array.isArray(panel.dialogue) && panel.dialogue.length > 0) {
    for (const d of panel.dialogue) {
      d.text = stripBracketTags(d.text);
      d.audioDirection = adjustDirection(d.audioDirection, d.text, d.speaker);
    }
  }
  if (panel.caption) {
    panel.caption = stripBracketTags(panel.caption);
    if (!panel.dialogue || panel.dialogue.length === 0 || /narrator|caption/.test(lower)) {
      panel.captionDirection = adjustDirection(panel.captionDirection, panel.caption, 'Narrator');
    }
  }

  return actions.length > 0 ? actions.join('; ') : 'Adjusted vocal direction based on director feedback';
}

async function interpretAudioFeedbackWithGemini(panel, feedback, registry, traceOut = null) {
  const fb = (feedback || '').trim();
  if (!fb) return null;

  const speakerSummary = castSummary(registry);

  const directorPrompt = [
    `You are the AI Voice Director for a graphic novel audio pipeline.`,
    `A human creator reviewed Panel #${panel.panelId} ("${panel.name || ''}") and wrote a COMMENT describing what is wrong with the current audio:`,
    `HUMAN COMMENT (DO NOT speak this comment aloud — translate it into audio direction!): ${JSON.stringify(fb)}`,
    ``,
    `Panel Visual Context: ${JSON.stringify((panel.prompt || '').slice(0, 300))}`,
    `Current Narrator Caption: ${JSON.stringify(panel.caption || '')}`,
    `Current Dialogue: ${JSON.stringify(panel.dialogue || [])}`,
    `Available Voice Registry Speakers: ${JSON.stringify(speakerSummary)}`,
    ``,
    `CRITICAL RULES:`,
    `1. NEVER put the human's comment or instructions into caption or dialogue text. ElevenLabs will read any text literally.`,
    `2. NEVER put bracketed stage directions like [shouts], [whispers], or [growls] into performanceText — ElevenLabs reads bracketed words aloud! Use punctuation ("...", "—", "!") for pacing and emphasis instead.`,
    `3. Decide what YOU as the Voice Director should change:`,
    `   - Reassign dialogue[].speaker to a better matching key from the voice registry if the voice/character is wrong (never assign hero/narrator to an antagonist).`,
    `   - Tune ElevenLabs voice_settings: stability (0.15-0.65; lower=raw/emotional, higher=calm/steady) and style (0.30-0.92; higher=dramatic).`,
    `   - Optionally set dspExtra (valid ffmpeg -af filter string, e.g. "aecho=0.8:0.88:60:0.35" for crypt reverb, "atempo=0.90" to slow down, "asetrate=44100*0.92,aresample=44100,bass=g=4:f=110" for deeper voice, "volume=1.3" for louder). Leave empty if not needed.`,
    `   - Only edit spoken words in caption/dialogue[].text if the comment asks to fix a mispronounced word, typo, or line.`,
    ``,
    `Return ONLY valid JSON (no markdown fences, no commentary) with this exact shape:`,
    `{"directorNotes":"brief summary of changes","caption":"...","captionDirection":{"stability":0.3,"style":0.7,"performanceText":"...","dspExtra":""},"dialogue":[{"speaker":"...","text":"...","audioDirection":{"stability":0.22,"style":0.82,"performanceText":"...","dspExtra":""}}]}`
  ].join('\n');

  const res = await runHeadlessPrompt(directorPrompt, {
    label: `AI Voice Director P#${panel.panelId}`,
    timeoutMs: 45000
  });
  if (res.ok) {
    const parsed = extractJsonFromText(res.text);
    if (parsed) {
      if (typeof parsed.caption === 'string' && parsed.caption.trim()) {
        panel.caption = stripBracketTags(parsed.caption);
      }
      if (parsed.captionDirection && typeof parsed.captionDirection === 'object') {
        parsed.captionDirection.performanceText = stripBracketTags(parsed.captionDirection.performanceText || panel.caption);
        panel.captionDirection = parsed.captionDirection;
      }
      if (Array.isArray(parsed.dialogue) && parsed.dialogue.length > 0) {
        panel.dialogue = parsed.dialogue.map(d => ({
          speaker: d.speaker,
          text: stripBracketTags(d.text),
          audioDirection: d.audioDirection ? Object.assign({}, d.audioDirection, {
            performanceText: stripBracketTags(d.audioDirection.performanceText || d.text)
          }) : undefined
        }));
      }
      panel.audioFeedback = fb;
      panel.audioDirectorNotes = parsed.directorNotes || 'AI Voice Director adjusted vocal & DSP parameters.';
      console.log(`[AI Voice Director] Applied Gemini direction: ${panel.audioDirectorNotes}`);
      if (traceOut && typeof traceOut === 'object') {
        traceOut.voiceDirectorSource = res.source;
        traceOut.voiceDirectorPrompt = directorPrompt;
        traceOut.voiceDirectorResponse = JSON.stringify(parsed, null, 2);
      }
      return panel.audioDirectorNotes;
    }
  }
  if (traceOut && typeof traceOut === 'object') {
    traceOut.voiceDirectorSource = 'deterministic-fallback';
    traceOut.voiceDirectorPrompt = directorPrompt;
    traceOut.voiceDirectorResponse = '';
  }
  return null;
}

function panelSpecSignature(panel, projectId) {
  try {
    return JSON.stringify(expectedPanelClips(panel).map(c => {
      const sp = clipSpec(c.speaker, c.text, c.direction, projectId, panel.panelId);
      return [sp.profile.key, sp.profile.voiceId, sp.textToSpeak, sp.settings, sp.dsp];
    }));
  } catch (_) {
    return String(Math.random());
  }
}

// For cost estimates: a pseudo-panel per panel containing only the lines that
// would actually be sent to ElevenLabs (no matching clip and no cached take).
function panelsNeedingCredits(panels, projectId, audioDir) {
  const out = [];
  for (const p of panels || []) {
    const pending = { panelId: p.panelId, caption: '', dialogue: [] };
    for (const c of expectedPanelClips(p)) {
      let spec;
      try { spec = clipSpec(c.speaker, c.text, c.direction, projectId, p.panelId); } catch (_) { continue; }
      if ((spec.profile.engine || 'elevenlabs') !== 'elevenlabs') continue;
      if (clipMatchesSpec(readClipInfo(path.join(audioDir, c.fxName)), spec)) continue;
      if (spec.profile.voiceId && fs.existsSync(takePath(projectId, takeKey(spec.profile.voiceId, spec.textToSpeak, spec.settings)))) continue;
      pending.dialogue.push({ speaker: c.speaker, text: spec.textToSpeak });
    }
    pending.sfxCredits = sfx.sfxCreditsNeeded(p, projectId);
    if (pending.dialogue.length || pending.sfxCredits) out.push(pending);
  }
  return out;
}

function castSummary(registry) {
  return Object.entries((registry && registry.characters) || {}).map(([k, v]) => ({
    key: k,
    name: v.name || k,
    actor: v.actorName || '',
    persona: v.persona || '',
    aliases: v.aliases || []
  }));
}

const PANEL_FIELDS_FROM_DIRECTOR = ['caption', 'captionDirection', 'dialogue', 'audioFeedback', 'audioDirectorNotes'];

async function regeneratePanelAudio(projectId, episodeId, panelId, feedback = '', opts = {}) {
  const manifestPath = path.join(rootDir, 'projects', projectId, 'episodes', episodeId, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest not found: ${manifestPath}`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const panel = (manifest.panels || []).find(p => Number(p.panelId) === Number(panelId));
  if (!panel) {
    throw new Error(`Panel #${panelId} not found in ${projectId}/${episodeId}`);
  }

  const audioDir = path.join(rootDir, 'projects', projectId, 'episodes', episodeId, 'audio');
  fs.mkdirSync(audioDir, { recursive: true });
  const pad = String(panel.panelId).padStart(2, '0');

  // Interpret feedback via AI Voice Director (headless AI first, deterministic fallback if unavailable)
  const audioTrace = {
    feedback: (feedback || '').trim(),
    voiceDirectorSource: '',
    voiceDirectorPrompt: '',
    voiceDirectorResponse: '',
    synthesizedClips: []
  };
  let directorNotes = '';
  const specsBefore = panelSpecSignature(panel, projectId);
  if (feedback && feedback.trim()) {
    const registry = getVoiceRegistry(projectId);
    directorNotes = await interpretAudioFeedbackWithGemini(panel, feedback, registry, audioTrace);
    if (!directorNotes) {
      directorNotes = applyDeterministicAudioFeedback(panel, feedback, Object.keys(registry.characters), projectId);
      panel.audioDirectorNotes = directorNotes;
      audioTrace.voiceDirectorResponse = directorNotes;
    }
  }

  // A new take is bought only when asked for: "Regenerate" with no feedback, or
  // feedback that the director couldn't turn into any change. Otherwise only
  // lines whose text, voice or delivery changed are re-generated.
  const nothingChanged = panelSpecSignature(panel, projectId) === specsBefore;
  const freshTake = opts.freshTake !== undefined ? opts.freshTake : nothingChanged;

  if (!opts.stamp) {
    const needs = freshTake ? [panel] : panelsNeedingCredits([panel], projectId, audioDir);
    await assertEnoughCredits(needs, projectId, `re-voicing panel #${panel.panelId}`);
  }

  // Keep a copy of the previous take in audio/_previous/
  archivePanelAudio(audioDir, panel.panelId, opts.stamp || new Date().toISOString().replace(/[:.]/g, '-'));

  let duration = 0;
  let synthError = '';
  try {
    const res = await synthesizePanelAudio(projectId, panel, audioDir, { freshTake });
    duration = res.duration;
    audioTrace.synthesizedClips = res.clips;
  } catch (err) {
    synthError = err.message;
  }

  const relAudioPath = `projects/${projectId}/episodes/${episodeId}/audio/p${pad}_mixed.wav`;
  updateManifestLocked(manifestPath, (latest) => {
    const lp = (latest.panels || []).find(p => Number(p.panelId) === Number(panelId));
    if (!lp) return;
    for (const k of PANEL_FIELDS_FROM_DIRECTOR) {
      if (panel[k] !== undefined) lp[k] = panel[k];
    }
    if (synthError) {
      lp.audioStatus = 'FAILED';
      lp.audioError = synthError;
      return;
    }
    lp.audioPath = relAudioPath;
    lp.audioStatus = 'VERIFIED';
    lp.audioError = undefined;
    lp.audioClips = summarizeClips(audioTrace.synthesizedClips);
    lp.audioDurationSeconds = Math.round(duration * 10) / 10;
    lp.audioRegeneratedAt = new Date().toISOString();

    if (opts.skipGateUpdate) return;
    const gateB = (latest.gates || []).find(g => g.id === 'VISUAL_QA_GATE');
    const gateC = (latest.gates || []).find(g => g.id === 'AUDIO_QA_GATE');
    if (gateC) {
      if (gateB && gateB.status !== 'APPROVED') {
        gateC.status = 'LOCKED';
        gateC.approvedAt = null;
        gateC.notes = `Panel #${pad} audio regenerated, but locked until Gate B (Visual QA) is approved.`;
      } else {
        gateC.status = 'AWAITING_APPROVAL';
        gateC.approvedAt = null;
        gateC.notes = `Panel #${pad} audio regenerated${feedback && feedback.trim() ? ` (${feedback.trim()})` : ''}. Ready for 5-Point Acoustic QA approval.`;
        latest.currentStage = 'AUDIO_QA_GATE';
        for (const st of (latest.stages || [])) {
          if (st.id === 'VIDEO_ASSEMBLY' || st.id === 'READY_FOR_RELEASE') {
            st.status = 'LOCKED_BY_GATE';
          }
        }
      }
    }
  });

  if (synthError) {
    throw new Error(synthError);
  }

  return {
    success: true,
    panelId: Number(panel.panelId),
    audioPath: relAudioPath,
    durationSeconds: Math.round(duration * 10) / 10,
    directorNotes: panel.audioDirectorNotes || directorNotes || '',
    creditsUsed: (audioTrace.synthesizedClips || []).reduce((n, c) => n + (c.creditsUsed || 0), 0),
    freshTake,
    caption: panel.caption,
    dialogue: panel.dialogue,
    trace: audioTrace
  };
}

// ---------------------------------------------------------------------------
// Episode-level AI Voice Director
// ---------------------------------------------------------------------------

const CAST_SETTING_LIMITS = {
  defaultStability: [0.1, 0.8],
  defaultStyle: [0.2, 0.95]
};

function sanitizeDsp(dsp) {
  if (typeof dsp !== 'string') return null;
  const clean = dsp.trim();
  // Only plain ffmpeg audio-filter syntax: no quotes, shell metacharacters or file paths.
  if (!clean || clean.length > 300 || !/^[a-zA-Z0-9_=:.,*+\-|]+$/.test(clean)) return null;
  return clean;
}

// Applies AI-proposed cast changes to the project's own registry. Only tuning
// fields can change, and voiceId only to an actor already in the cast, so the
// director can't invent voices. Returns a list of human-readable changes.
function applyCastChanges(projectId, castChanges) {
  if (!castChanges || typeof castChanges !== 'object') return [];
  const regPath = ensureProjectRegistry(projectId);
  const registry = JSON.parse(fs.readFileSync(regPath, 'utf8'));
  const knownVoices = new Set(Object.values(registry.characters).map(c => c.voiceId).filter(Boolean));
  const applied = [];

  for (const [key, change] of Object.entries(castChanges)) {
    const char = registry.characters[key];
    if (!char || !change || typeof change !== 'object') continue;
    for (const [field, [lo, hi]] of Object.entries(CAST_SETTING_LIMITS)) {
      const v = Number(change[field]);
      if (change[field] !== undefined && Number.isFinite(v)) {
        const clamped = Math.min(hi, Math.max(lo, v));
        if (clamped !== char[field]) {
          applied.push(`${key}.${field}: ${char[field]} -> ${clamped}`);
          char[field] = clamped;
        }
      }
    }
    if (change.dspChain !== undefined) {
      const dsp = sanitizeDsp(change.dspChain);
      if (dsp && dsp !== char.dspChain) {
        applied.push(`${key}.dspChain: ${char.dspChain || '(none)'} -> ${dsp}`);
        char.dspChain = dsp;
      }
    }
    if (change.voiceId && change.voiceId !== char.voiceId && knownVoices.has(change.voiceId)) {
      const actor = Object.values(registry.characters).find(c => c.voiceId === change.voiceId);
      applied.push(`${key}.voiceId: ${char.actorName || char.voiceId} -> ${(actor && actor.actorName) || change.voiceId}`);
      char.voiceId = change.voiceId;
      if (actor && actor.actorName) char.actorName = actor.actorName;
    }
  }

  if (applied.length > 0) {
    registry.changeLog = registry.changeLog || [];
    registry.changeLog.push({ at: new Date().toISOString(), source: 'AI Voice Director (episode feedback)', changes: applied });
    fs.writeFileSync(regPath, JSON.stringify(registry, null, 2), 'utf8');
  }
  return applied;
}

async function planEpisodeAudioWithAI(manifest, feedback, registry, projectId) {
  const panelsSummary = (manifest.panels || []).map(p => ({
    panelId: p.panelId,
    name: p.name,
    caption: p.caption || '',
    dialogue: (p.dialogue || []).map(d => ({ speaker: d.speaker, text: d.text }))
  }));
  const cast = Object.entries(registry.characters).map(([k, v]) => ({
    key: k, name: v.name, actor: v.actorName, voiceId: v.voiceId, persona: v.persona,
    defaultStability: v.defaultStability, defaultStyle: v.defaultStyle, dspChain: v.dspChain
  }));

  const prompt = [
    `You are the AI Voice Director for a motion-comic audio pipeline (project "${projectId}", episode "${manifest.episodeId}").`,
    `The human director listened to this episode's audio and wrote what is wrong:`,
    `HUMAN FEEDBACK (instructions to you, never text to be spoken): ${JSON.stringify(feedback)}`,
    ``,
    `Project voice cast (shared by every episode of this comic): ${JSON.stringify(cast)}`,
    `Episode panels: ${JSON.stringify(panelsSummary)}`,
    ``,
    `Decide the smallest set of changes that fixes the feedback:`,
    `- castChanges: tuning for a character everywhere in the comic (defaultStability 0.1-0.8, defaultStyle 0.2-0.95, dspChain as an ffmpeg -af filter string). voiceId may only be set to a voiceId already in the cast. Use this when the problem is how a character sounds in general.`,
    `- panels: specific panels to re-voice, each with a short note for the panel voice director (e.g. "Thorgar line should be a booming threat"). Use this for line-level problems.`,
    `- revoiceAll: true only if the whole episode must be re-voiced (for example after castChanges that affect most panels).`,
    `Never put bracketed stage directions or the human's words into spoken text.`,
    ``,
    `Return ONLY JSON: {"directorNotes":"one or two sentences","castChanges":{"<key>":{"defaultStability":0.2,"defaultStyle":0.8,"dspChain":"...","voiceId":"..."}},"panels":[{"panelId":1,"note":"..."}],"revoiceAll":false}`
  ].join('\n');

  const res = await runHeadlessPrompt(prompt, { label: `AI Voice Director ${manifest.episodeId}`, timeoutMs: 90000 });
  const parsed = res.ok ? extractJsonFromText(res.text) : null;
  return { plan: parsed, source: parsed ? res.source : 'unavailable', prompt, raw: res.text || res.error || '' };
}

// Applies episode-wide feedback: the AI Voice Director plans cast tweaks and
// panel notes, then the affected panels are re-voiced. With no feedback, it
// re-voices only panels that don't match the project's cast.
async function regenerateEpisodeAudio(projectId, episodeId, feedback = '', onProgress = null) {
  const manifestPath = path.join(rootDir, 'projects', projectId, 'episodes', episodeId, 'manifest.json');
  if (!fs.existsSync(manifestPath)) throw new Error(`Manifest not found: ${manifestPath}`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const audioDir = path.join(rootDir, 'projects', projectId, 'episodes', episodeId, 'audio');
  fs.mkdirSync(audioDir, { recursive: true });
  const fb = String(feedback || '').trim();
  const emit = (msg, extra = {}) => { if (onProgress) onProgress(Object.assign({ message: msg }, extra)); };

  let directorNotes = '';
  let castApplied = [];
  let panelNotes = new Map();
  let revoiceAll = false;
  let plannerSource = 'none';

  if (fb) {
    emit('AI Voice Director is reading your feedback...');
    const registry = getVoiceRegistry(projectId);
    const { plan, source } = await planEpisodeAudioWithAI(manifest, fb, registry, projectId);
    plannerSource = source;
    if (plan) {
      directorNotes = plan.directorNotes || '';
      castApplied = applyCastChanges(projectId, plan.castChanges);
      for (const item of Array.isArray(plan.panels) ? plan.panels : []) {
        if (item && item.panelId !== undefined) panelNotes.set(Number(item.panelId), String(item.note || fb));
      }
      revoiceAll = Boolean(plan.revoiceAll) || castApplied.length > 0;
    } else {
      // No AI available: apply the feedback to every panel with the rule-based director.
      directorNotes = 'AI Voice Director unavailable; applied your feedback to every panel with the rule-based director.';
      for (const p of manifest.panels || []) panelNotes.set(Number(p.panelId), fb);
    }
    if (castApplied.length > 0) emit(`Cast updated: ${castApplied.join('; ')}`);
  }

  // Which panels to re-voice: noted ones, all (if requested), and any off-cast panels.
  const targets = [];
  for (const p of manifest.panels || []) {
    const check = checkPanelCast(p, projectId, audioDir);
    const note = panelNotes.get(Number(p.panelId)) || '';
    if (revoiceAll || note || !check.ok) {
      targets.push({ panelId: p.panelId, note, reason: note ? 'director note' : (check.ok ? 'cast change' : check.reasons.join('; ')) });
    }
  }

  const fresh = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const targetIds = new Set(targets.map(t => Number(t.panelId)));
  await assertEnoughCredits(panelsNeedingCredits((fresh.panels || []).filter(p => targetIds.has(Number(p.panelId))), projectId, audioDir), projectId,
    `re-voicing ${targets.length} panel(s) of ${episodeId}`);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const done = [];
  const failures = [];
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    emit(`Re-voicing Panel #${t.panelId} (${i + 1}/${targets.length}): ${t.reason}`, {
      panelId: t.panelId, current: i + 1, total: targets.length, progress: Math.round(((i + 1) / targets.length) * 100)
    });
    try {
      const res = await regeneratePanelAudio(projectId, episodeId, t.panelId, t.note, { stamp, skipGateUpdate: true, freshTake: false });
      done.push({ panelId: t.panelId, directorNotes: res.directorNotes, creditsUsed: res.creditsUsed || 0 });
    } catch (err) {
      failures.push({ panelId: t.panelId, error: err.message });
      if (isFatalVoiceError(err.message)) break;
    }
  }

  updateManifestLocked(manifestPath, (latest) => {
    latest.audioDirectorLog = latest.audioDirectorLog || [];
    latest.audioDirectorLog.push({
      at: new Date().toISOString(),
      feedback: fb,
      directorNotes,
      plannerSource,
      castChanges: castApplied,
      revoicedPanels: done.map(d => d.panelId),
      failures
    });
    const gateB = (latest.gates || []).find(g => g.id === 'VISUAL_QA_GATE');
    const gateC = (latest.gates || []).find(g => g.id === 'AUDIO_QA_GATE');
    if (gateC && done.length > 0) {
      gateC.approvedAt = null;
      if (gateB && gateB.status !== 'APPROVED') {
        gateC.status = 'LOCKED';
      } else if (failures.length > 0) {
        gateC.status = 'LOCKED';
        gateC.notes = `Episode re-voice stopped: ${failures[0].error}`;
      } else {
        gateC.status = 'AWAITING_APPROVAL';
        gateC.notes = `AI Voice Director re-voiced ${done.length} panel(s)${fb ? ` for: "${fb}"` : ' to match the project cast'}. Ready for acoustic QA.`;
        latest.currentStage = 'AUDIO_QA_GATE';
        for (const st of latest.stages || []) {
          if (st.id === 'VOICE_SYNTHESIS') { st.status = 'COMPLETED'; st.progress = 100; }
          if (st.id === 'VIDEO_ASSEMBLY' || st.id === 'READY_FOR_RELEASE') st.status = 'LOCKED_BY_GATE';
        }
      }
    }
  });

  if (failures.length > 0) {
    throw new Error(`Re-voicing stopped on Panel #${failures[0].panelId}: ${failures[0].error}`);
  }

  // Cast changes apply to the whole comic, so earlier episodes may now be off-cast.
  const otherEpisodesAffected = castApplied.length > 0
    ? castReport(projectId).episodes.filter(e => e.episodeId !== episodeId && e.offCastPanels.length > 0).map(e => e.episodeId)
    : [];

  return {
    success: true,
    directorNotes,
    plannerSource,
    castChanges: castApplied,
    revoicedPanels: done.map(d => d.panelId),
    creditsUsed: done.reduce((n, d) => n + d.creditsUsed, 0),
    otherEpisodesAffected
  };
}

// ---------------------------------------------------------------------------
// Cast check: which actor voiced each character in each episode
// ---------------------------------------------------------------------------

async function castReportWithBalance(projectId) {
  const rep = castReport(projectId);
  rep.elevenLabs = await getElevenLabsBalance();
  return rep;
}

function castReport(projectId) {
  const projPath = path.join(rootDir, 'projects', projectId, 'project.json');
  const project = fs.existsSync(projPath) ? JSON.parse(fs.readFileSync(projPath, 'utf8')) : { episodes: [] };
  const registry = getVoiceRegistry(projectId);
  const episodes = [];

  for (const episodeId of project.episodes || []) {
    const manifestPath = path.join(rootDir, 'projects', projectId, 'episodes', episodeId, 'manifest.json');
    if (!fs.existsSync(manifestPath)) continue;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const audioDir = path.join(rootDir, 'projects', projectId, 'episodes', episodeId, 'audio');
    const voices = {};
    const offCastPanels = [];
    let voicedPanels = 0;
    let legacyPanels = 0;

    for (const p of manifest.panels || []) {
      if (!fs.existsSync(audioDir)) break;
      const check = checkPanelCast(p, projectId, audioDir);
      if (check.missing) continue;
      voicedPanels++;
      if (check.legacy) legacyPanels++;
      if (!check.ok) offCastPanels.push({ panelId: p.panelId, reasons: check.reasons });
      for (const c of check.clips) {
        const who = c.engineUsed === 'ElevenLabs' ? (c.actorName || c.voiceId) : `${c.engineUsed} ${c.edgeVoice || ''}`.trim();
        voices[c.character] = voices[c.character] || {};
        voices[c.character][who] = (voices[c.character][who] || 0) + 1;
      }
    }
    const offIds = new Set(offCastPanels.map(o => Number(o.panelId)));
    const unvoiced = (manifest.panels || []).filter(p => offIds.has(Number(p.panelId)) || !fs.existsSync(path.join(audioDir, `p${String(p.panelId).padStart(2, '0')}_mixed.wav`)));
    const fullCost = estimatePanelCharacters(manifest.panels || [], projectId);
    const revoiceCost = estimatePanelCharacters(fs.existsSync(audioDir) ? panelsNeedingCredits(unvoiced, projectId, audioDir) : unvoiced, projectId);
    episodes.push({
      episodeId, title: manifest.title, voicedPanels, legacyPanels, offCastPanels, voices,
      charsFullEpisode: fullCost.chars,
      charsToFix: revoiceCost.chars
    });
  }

  return {
    projectId,
    registryPath: path.relative(rootDir, getRegistryPath(projectId)).replace(/\\/g, '/'),
    projectHasOwnCast: getRegistryPath(projectId).includes(`${path.sep}projects${path.sep}`),
    cast: Object.entries(registry.characters).map(([k, v]) => ({
      key: k, name: v.name, actor: v.actorName, engine: v.engine || 'elevenlabs', voiceId: v.voiceId
    })),
    allowEdgeFallback: Boolean(registry.guards && registry.guards.allowEdgeFallback),
    episodes
  };
}

module.exports = {
  synthesizeClip,
  mixPanelAudio,
  synthesizeEpisodeAudio,
  regeneratePanelAudio,
  regenerateEpisodeAudio,
  castReport,
  castReportWithBalance,
  getElevenLabsBalance,
  estimatePanelCharacters,
  explainElevenLabsError,
  checkPanelCast,
  applyCastChanges,
  getAudioDuration
};

