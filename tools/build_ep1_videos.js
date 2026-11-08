const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');

const FFMPEG_PATH = 'C:\\Users\\robert.fletcher\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg.Essentials_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0.1-essentials_build\\bin\\ffmpeg.exe';
const FFPROBE_PATH = 'C:\\Users\\robert.fletcher\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg.Essentials_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0.1-essentials_build\\bin\\ffprobe.exe';

const rootDir = path.join(__dirname, '..');
const ep1Path = path.join(rootDir, '01_Script', 'episodes', 'episode_01.json');
const grokImgDir = path.join(rootDir, 'docs', 'assets', 'ep1');
const metaImgDir = path.join(rootDir, 'docs', 'assets', 'ep1_meta');

const workDir = path.join(rootDir, '02_Assets', 'episode_01_build');
const audioDir = path.join(workDir, 'audio');
const segGrokDir = path.join(workDir, 'segments_grok');
const segMetaDir = path.join(workDir, 'segments_meta');
const docsDir = path.join(rootDir, 'docs');

fs.mkdirSync(audioDir, { recursive: true });
fs.mkdirSync(segGrokDir, { recursive: true });
fs.mkdirSync(segMetaDir, { recursive: true });

let elevenApiKey = process.env.ELEVENLABS_API_KEY;
if (!elevenApiKey && fs.existsSync(path.join(rootDir, '.env'))) {
  const envContent = fs.readFileSync(path.join(rootDir, '.env'), 'utf8');
  const match = envContent.match(/ELEVENLABS_API_KEY=([^\r\n]+)/);
  if (match) elevenApiKey = match[1].trim();
}

const ELEVEN_VOICES = {
  narrator: {
    id: 'nPczCjzI2devNBz1zQrb', // Brian (Theatrical Cinematic Trailer Narrator)
    defaultStability: 0.30,
    defaultStyle: 0.65
  },
  korvath: {
    id: 'nPczCjzI2devNBz1zQrb', // Brian + Subterranean Kratos Chain (-12% pitch + 8dB sub-bass @ 95Hz)
    defaultStability: 0.22,
    defaultStyle: 0.85
  },
  natari: {
    id: 'EXAVITQu4vr4xnSDxMaL', // Sarah (High emotion, terrified screams, sultry rogue)
    defaultStability: 0.25,
    defaultStyle: 0.80
  },
  kheshat: {
    id: 'IKne3meq5aSn9XLyUdCD', // Charlie (Sinister serpent high priest)
    defaultStability: 0.28,
    defaultStyle: 0.75
  }
};

function callElevenLabs(voiceId, text, voiceSettings, outFile) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      text: text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: voiceSettings
    });

    const options = {
      hostname: 'api.elevenlabs.io',
      port: 443,
      path: `/v1/text-to-speech/${voiceId}`,
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': elevenApiKey,
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      if (res.statusCode !== 200) {
        let errData = '';
        res.on('data', chunk => errData += chunk);
        res.on('end', () => reject(new Error(`ElevenLabs HTTP ${res.statusCode}: ${errData}`)));
        return;
      }
      const fileStream = fs.createWriteStream(outFile);
      res.pipe(fileStream);
      fileStream.on('finish', () => resolve(outFile));
      fileStream.on('error', reject);
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function synthesizeClip(speaker, text, rawFile, fxFile) {
  if (fs.existsSync(fxFile) && fs.statSync(fxFile).size > 1000) {
    return fxFile;
  }

  const s = (speaker || '').toLowerCase().trim();
  let vConfig = ELEVEN_VOICES.narrator;
  let fxFilter = 'volume=1.25';

  if (s === 'korvath') {
    vConfig = ELEVEN_VOICES.korvath;
    // Subterranean Kratos Mastering Chain: -12% pitch + 8dB sub-bass @ 95Hz
    fxFilter = 'asetrate=44100*0.88,aresample=44100,equalizer=f=95:width_type=h:width=60:g=8,volume=1.45';
  } else if (s === 'natari') {
    vConfig = ELEVEN_VOICES.natari;
    fxFilter = 'volume=1.30';
  } else if (s.includes('kheshat') || s.includes('priest')) {
    vConfig = ELEVEN_VOICES.kheshat;
    fxFilter = 'asetrate=44100*0.94,aresample=44100,equalizer=f=120:width_type=h:width=50:g=4,volume=1.35';
  }

  if (elevenApiKey && vConfig) {
    try {
      console.log(`   🎙️ ElevenLabs [${speaker}]: "${text.slice(0, 35)}..."`);
      await callElevenLabs(vConfig.id, text, {
        stability: vConfig.defaultStability,
        similarity_boost: 0.85,
        style: vConfig.defaultStyle,
        use_speaker_boost: true
      }, rawFile);

      execSync(`"${FFMPEG_PATH}" -y -i "${rawFile}" -af "${fxFilter}" "${fxFile}"`, { stdio: 'ignore' });
      return fxFile;
    } catch (err) {
      console.warn(`   ⚠️ ElevenLabs synthesis failed, falling back to Edge TTS: ${err.message}`);
    }
  }

  // Edge TTS fallback
  const edgeTtsVoice = s === 'korvath' ? 'en-US-ChristopherNeural' :
                       s === 'natari' ? 'en-US-AvaNeural' :
                       s.includes('priest') ? 'en-GB-ThomasNeural' : 'en-US-AndrewMultilingualNeural';

  const tts = new MsEdgeTTS();
  await tts.setMetadata(edgeTtsVoice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  await tts.toFile(rawFile, text);
  execSync(`"${FFMPEG_PATH}" -y -i "${rawFile}" -af "${fxFilter}" "${fxFile}"`, { stdio: 'ignore' });
  return fxFile;
}

function getAudioDuration(audioFile) {
  try {
    const out = execSync(`"${FFPROBE_PATH}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioFile}"`, { encoding: 'utf8' }).trim();
    return parseFloat(out) || 4.0;
  } catch (e) {
    return 4.0;
  }
}

async function buildEpisode1() {
  const ep1 = JSON.parse(fs.readFileSync(ep1Path, 'utf8'));

  console.log(`\n======================================================`);
  console.log(`🎬 MASTER PIPELINE: EPISODE 1 — THE SLUMBERING SERPENT`);
  console.log(`======================================================\n`);

  const grokSegments = [];
  const metaSegments = [];
  const chapterList = [];
  let cumulativeTime = 0;

  for (let idx = 0; idx < ep1.length; idx++) {
    const p = ep1[idx];
    const padId = String(p.panelId).padStart(2, '0');
    console.log(`\n--- [Panel #${p.panelId} / 20: ${p.beat?.name || 'Scene'}] ---`);

    const grokImg = path.join(grokImgDir, `panel_${padId}.webp`);
    const metaImg = path.join(metaImgDir, `panel_${padId}.webp`);

    if (!fs.existsSync(grokImg)) throw new Error(`Missing Grok image: ${grokImg}`);
    if (!fs.existsSync(metaImg)) throw new Error(`Missing Meta image: ${metaImg}`);

    const panelMixedAudio = path.join(audioDir, `p${padId}_mixed.wav`);

    if (!fs.existsSync(panelMixedAudio) || fs.statSync(panelMixedAudio).size < 1000) {
      const clips = [];

      // 1. Narrator Caption
      if (p.caption && p.caption.trim()) {
        const rawNarrator = path.join(audioDir, `p${padId}_narrator_raw.mp3`);
        const fxNarrator = path.join(audioDir, `p${padId}_narrator_fx.mp3`);
        await synthesizeClip('Narrator', p.caption, rawNarrator, fxNarrator);
        clips.push({
          file: fxNarrator,
          duration: getAudioDuration(fxNarrator),
          speaker: 'Narrator'
        });
      }

      // 2. Character Dialogue
      if (p.dialogue && p.dialogue.length > 0) {
        for (let d = 0; d < p.dialogue.length; d++) {
          const dia = p.dialogue[d];
          const rawDia = path.join(audioDir, `p${padId}_dia_${d}_${dia.speaker}_raw.mp3`);
          const fxDia = path.join(audioDir, `p${padId}_dia_${d}_${dia.speaker}_fx.mp3`);
          await synthesizeClip(dia.speaker, dia.text, rawDia, fxDia);
          clips.push({
            file: fxDia,
            duration: getAudioDuration(fxDia),
            speaker: dia.speaker
          });
        }
      }

      // Mix clips
      let currentDelayMs = 250;
      const inputArgs = [];
      const delayFilters = [];
      const mixInputs = [];

      for (let i = 0; i < clips.length; i++) {
        inputArgs.push(`-i "${clips[i].file}"`);
        delayFilters.push(`[${i}:a]adelay=${currentDelayMs}|${currentDelayMs}[a${i}]`);
        mixInputs.push(`[a${i}]`);
        currentDelayMs += Math.round(clips[i].duration * 1000) + 350;
      }

      const totalDuration = Math.max((currentDelayMs + 500) / 1000, 4.0);

      // Low atmospheric bass drone
      const ambIdx = inputArgs.length;
      inputArgs.push(`-f lavfi -t ${totalDuration.toFixed(1)} -i "anoisesrc=d=${totalDuration.toFixed(1)}:c=pink:r=44100:a=0.015,lowpass=f=260"`);
      delayFilters.push(`[${ambIdx}:a]volume=0.25[amb]`);
      mixInputs.push('[amb]');

      const filterComplex = `${delayFilters.join(';')};${mixInputs.join('')}amix=inputs=${mixInputs.length}:duration=longest:dropout_transition=0,volume=1.85[outa]`;
      const mixCmd = `"${FFMPEG_PATH}" -y ${inputArgs.join(' ')} -filter_complex "${filterComplex}" -map "[outa]" -t ${totalDuration.toFixed(2)} "${panelMixedAudio}"`;
      execSync(mixCmd, { stdio: 'ignore' });
    }

    const panelDuration = getAudioDuration(panelMixedAudio);
    console.log(`   🔊 Mixed Audio: ${panelDuration.toFixed(2)}s`);

    chapterList.push({
      panelId: p.panelId,
      title: p.beat?.name || `Panel ${p.panelId}`,
      timestamp: cumulativeTime,
      formattedTime: `${Math.floor(cumulativeTime / 60)}:${String(Math.floor(cumulativeTime % 60)).padStart(2, '0')}`
    });
    cumulativeTime += panelDuration;

    // Render Grok Video Segment
    const grokSeg = path.join(segGrokDir, `p${padId}_grok_seg.mp4`);
    if (!fs.existsSync(grokSeg) || fs.statSync(grokSeg).size < 10000) {
      const totalFrames = Math.ceil(panelDuration * 30);
      const holdFrames = 36;
      const zoomExpr = `if(lte(on,${holdFrames}),1.0,min(1.0+(on-${holdFrames})*0.00012,1.04))`;
      const yExpr = "0";
      const xExpr = p.panelId % 2 === 0 ? `iw/2-(iw/zoom/2)+((on/${totalFrames})-0.5)*25` : `iw/2-(iw/zoom/2)-((on/${totalFrames})-0.5)*25`;
      const filter = `scale=1536:864,zoompan=z='${zoomExpr}':x='${xExpr}':y='${yExpr}':d=${totalFrames}:s=1280x720:fps=30,format=yuv420p`;
      const cmd = `"${FFMPEG_PATH}" -y -loop 1 -i "${grokImg}" -i "${panelMixedAudio}" -filter_complex "[0:v]${filter}[v]" -map "[v]" -map 1:a -c:v libx264 -preset fast -crf 19 -c:a aac -b:a 192k -shortest -t ${panelDuration.toFixed(2)} "${grokSeg}"`;
      execSync(cmd, { stdio: 'ignore' });
    }
    grokSegments.push(grokSeg);

    // Render Meta AI Video Segment
    const metaSeg = path.join(segMetaDir, `p${padId}_meta_seg.mp4`);
    if (!fs.existsSync(metaSeg) || fs.statSync(metaSeg).size < 10000) {
      const totalFrames = Math.ceil(panelDuration * 30);
      const holdFrames = 36;
      const zoomExpr = `if(lte(on,${holdFrames}),1.0,min(1.0+(on-${holdFrames})*0.00012,1.04))`;
      const yExpr = "0";
      const xExpr = p.panelId % 2 === 0 ? `iw/2-(iw/zoom/2)+((on/${totalFrames})-0.5)*25` : `iw/2-(iw/zoom/2)-((on/${totalFrames})-0.5)*25`;
      const filter = `scale=1536:864,zoompan=z='${zoomExpr}':x='${xExpr}':y='${yExpr}':d=${totalFrames}:s=1280x720:fps=30,format=yuv420p`;
      const cmd = `"${FFMPEG_PATH}" -y -loop 1 -i "${metaImg}" -i "${panelMixedAudio}" -filter_complex "[0:v]${filter}[v]" -map "[v]" -map 1:a -c:v libx264 -preset fast -crf 19 -c:a aac -b:a 192k -shortest -t ${panelDuration.toFixed(2)} "${metaSeg}"`;
      execSync(cmd, { stdio: 'ignore' });
    }
    metaSegments.push(metaSeg);
    console.log(`   🎥 Both segments rendered (Grok & Meta AI)`);
  }

  // Concatenate Grok Episode 1 Movie
  const grokConcatList = path.join(workDir, 'grok_concat.txt');
  fs.writeFileSync(grokConcatList, grokSegments.map(s => `file '${s.replace(/\\/g, '/')}'`).join('\n'), 'utf8');
  const grokOutMovie = path.join(docsDir, 'episode_01_motion_comic.mp4');
  console.log(`\n🎬 Assembling Grok Episode 1 Master Movie -> ${grokOutMovie}`);
  execSync(`"${FFMPEG_PATH}" -y -f concat -safe 0 -i "${grokConcatList}" -c copy "${grokOutMovie}"`, { stdio: 'ignore' });

  // Concatenate Meta AI Episode 1 Movie
  const metaConcatList = path.join(workDir, 'meta_concat.txt');
  fs.writeFileSync(metaConcatList, metaSegments.map(s => `file '${s.replace(/\\/g, '/')}'`).join('\n'), 'utf8');
  const metaOutMovie = path.join(docsDir, 'episode_01_meta_motion_comic.mp4');
  console.log(`🎬 Assembling Meta AI Episode 1 Master Movie -> ${metaOutMovie}`);
  execSync(`"${FFMPEG_PATH}" -y -f concat -safe 0 -i "${metaConcatList}" -c copy "${metaOutMovie}"`, { stdio: 'ignore' });

  // Save Chapters JSON
  fs.writeFileSync(path.join(docsDir, 'episode_01_chapters.json'), JSON.stringify(chapterList, null, 2), 'utf8');

  console.log(`\n✅ Episode 1 Master Movies Complete!`);
  console.log(`   - Grok: docs/episode_01_motion_comic.mp4 (${(fs.statSync(grokOutMovie).size / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`   - Meta: docs/episode_01_meta_motion_comic.mp4 (${(fs.statSync(metaOutMovie).size / 1024 / 1024).toFixed(2)} MB)`);
}

buildEpisode1().catch(e => {
  console.error("FATAL ERROR:", e);
  process.exit(1);
});

