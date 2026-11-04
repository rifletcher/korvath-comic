const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');

const FFMPEG_PATH = 'C:\\Users\\robert.fletcher\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg.Essentials_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0.1-essentials_build\\bin\\ffmpeg.exe';
const FFPROBE_PATH = 'C:\\Users\\robert.fletcher\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg.Essentials_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0.1-essentials_build\\bin\\ffprobe.exe';

const rootDir = path.join(__dirname, '..');
const ep2Path = path.join(rootDir, '01_Script', 'episodes', 'episode_02.json');
const selectedDir = path.join(rootDir, '02_Assets', 'Episode_02', 'selected');

const workDir = path.join(rootDir, '02_Assets', 'full_movie_build');
const audioDir = path.join(workDir, 'audio');
const segDir = path.join(workDir, 'segments');
const sfxDir = path.join(workDir, 'sfx');
const docsDir = path.join(rootDir, 'docs');

fs.mkdirSync(audioDir, { recursive: true });
fs.mkdirSync(segDir, { recursive: true });
fs.mkdirSync(sfxDir, { recursive: true });

// --- 1. Sound Effects Generator ---
function ensureSFX() {
  const sfxFiles = {
    vault_slam: path.join(sfxDir, 'vault_slam.mp3'),
    acid_sizzle: path.join(sfxDir, 'acid_sizzle.mp3'),
    spider_hiss: path.join(sfxDir, 'spider_hiss.mp3'),
    torch_whoosh: path.join(sfxDir, 'torch_whoosh.mp3'),
    sword_cleave: path.join(sfxDir, 'sword_cleave.mp3'),
    chasm_wind: path.join(sfxDir, 'chasm_wind.mp3')
  };

  if (!fs.existsSync(sfxFiles.vault_slam)) {
    execSync(`"${FFMPEG_PATH}" -y -f lavfi -i "sine=frequency=50:duration=1.6" -af "lowpass=f=110,volume=2.2,afade=t=out:st=0.2:d=1.4" "${sfxFiles.vault_slam}"`, { stdio: 'ignore' });
  }
  if (!fs.existsSync(sfxFiles.acid_sizzle)) {
    execSync(`"${FFMPEG_PATH}" -y -f lavfi -i "anoisesrc=d=3.2:c=pink:r=48000:a=0.35" -af "highpass=f=2800,lowpass=f=7500,volume=1.3,afade=t=in:st=0:d=0.2,afade=t=out:st=2.6:d=0.6" "${sfxFiles.acid_sizzle}"`, { stdio: 'ignore' });
  }
  if (!fs.existsSync(sfxFiles.spider_hiss)) {
    execSync(`"${FFMPEG_PATH}" -y -f lavfi -i "anoisesrc=d=2.8:c=white:r=48000:a=0.45" -af "bandpass=f=3400:width_type=h:width=1100,tremolo=f=16:d=0.85,volume=1.4,afade=t=in:st=0:d=0.2,afade=t=out:st=2.2:d=0.6" "${sfxFiles.spider_hiss}"`, { stdio: 'ignore' });
  }
  if (!fs.existsSync(sfxFiles.torch_whoosh)) {
    execSync(`"${FFMPEG_PATH}" -y -f lavfi -i "anoisesrc=d=1.8:c=pink:r=48000:a=0.5" -af "bandpass=f=600:width_type=h:width=450,volume=1.8,afade=t=in:st=0:d=0.3,afade=t=out:st=1.2:d=0.6" "${sfxFiles.torch_whoosh}"`, { stdio: 'ignore' });
  }
  if (!fs.existsSync(sfxFiles.sword_cleave)) {
    execSync(`"${FFMPEG_PATH}" -y -f lavfi -i "anoisesrc=d=1.2:c=pink:r=48000:a=0.6" -af "bandpass=f=1400:width_type=h:width=900,volume=2.2,afade=t=in:st=0:d=0.08,afade=t=out:st=0.3:d=0.9" "${sfxFiles.sword_cleave}"`, { stdio: 'ignore' });
  }
  if (!fs.existsSync(sfxFiles.chasm_wind)) {
    execSync(`"${FFMPEG_PATH}" -y -f lavfi -i "anoisesrc=d=3.0:c=brown:r=48000:a=0.4" -af "lowpass=f=450,volume=1.4,afade=t=in:st=0:d=0.5,afade=t=out:st=2.2:d=0.8" "${sfxFiles.chasm_wind}"`, { stdio: 'ignore' });
  }

  return sfxFiles;
}

// --- 2. Grounded Cinematic Voice Engine ---
function getEmotionProfile(speaker, text, panelId) {
  const s = (speaker || '').toLowerCase().trim();

  // Chronicler / Narrator: Steady British pulp chronicle
  if (s === 'narrator') {
    return {
      voice: 'en-GB-RyanNeural',
      pitch: '-6Hz',
      rate: '-6%',
      fxFilter: 'volume=1.15'
    };
  }

  // Natari: Sultry, sharp desert rogue (strictly natural human pacing)
  if (s === 'natari') {
    return {
      voice: 'en-US-AvaNeural',
      pitch: '+2Hz',
      rate: '-2%',
      fxFilter: 'volume=1.25'
    };
  }

  // Korvath the Barbarian: Deep, heavy guttural warrior
  if (s === 'korvath') {
    return {
      voice: 'en-US-ChristopherNeural',
      pitch: '-14Hz',
      rate: '-5%',
      fxFilter: 'bass=g=4:f=120,volume=1.35'
    };
  }

  // Lord Malakor (Arrogant Merchant Prince)
  if (s.includes('malakor')) {
    return {
      voice: 'en-GB-ThomasNeural',
      pitch: '-2Hz',
      rate: '-4%',
      fxFilter: 'volume=1.25'
    };
  }

  // Spider Assassin (Sinister cutthroat)
  if (s.includes('assassin')) {
    return {
      voice: 'en-US-EricNeural',
      pitch: '-6Hz',
      rate: '+0%',
      fxFilter: 'volume=1.25'
    };
  }

  return {
    voice: 'en-GB-RyanNeural',
    pitch: '-6Hz',
    rate: '-6%',
    fxFilter: 'volume=1.0'
  };
}

async function synthesizeClip(emotionProfile, text, rawFile, fxFile) {
  if (fs.existsSync(fxFile) && fs.statSync(fxFile).size > 1000) {
    return fxFile;
  }

  let attempts = 0;
  while (attempts < 3) {
    try {
      const tts = new MsEdgeTTS({ connectionTimeoutMs: 30000, synthesisTimeoutMs: 60000 });
      await tts.setMetadata(emotionProfile.voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      const { audioStream } = tts.toStream(text, {
        pitch: emotionProfile.pitch,
        rate: emotionProfile.rate
      });
      const out = fs.createWriteStream(rawFile);
      await new Promise((resolve, reject) => {
        audioStream.pipe(out);
        out.on('finish', resolve);
        out.on('error', reject);
        audioStream.on('error', reject);
      });
      tts.close();
      break;
    } catch (err) {
      attempts++;
      console.warn(`   ⚠️ TTS retry ${attempts}/3 (${emotionProfile.voice}): ${err.message}`);
      if (attempts >= 3) throw err;
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  // Apply dynamic FX post-processing filter
  if (emotionProfile.fxFilter && emotionProfile.fxFilter !== 'volume=1.0') {
    execSync(`"${FFMPEG_PATH}" -y -i "${rawFile}" -af "${emotionProfile.fxFilter}" "${fxFile}"`, { stdio: 'ignore' });
    return fxFile;
  } else {
    fs.copyFileSync(rawFile, fxFile);
    return fxFile;
  }
}

function getAudioDuration(filePath) {
  const out = execSync(`"${FFPROBE_PATH}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`, { encoding: 'utf8' });
  return parseFloat(out.trim());
}

async function main() {
  console.log('🎬 ===============================================================');
  console.log('⚔️ EMOTIONAL RE-SYNTHESIS: EPISODE 2 MOTION COMIC MASTER');
  console.log('🎙️ Real High-Emotion Yells, Screams, Roars & Hollywood Comic FX');
  console.log('🎬 ===============================================================');

  const sfxFiles = ensureSFX();
  const ep2 = JSON.parse(fs.readFileSync(ep2Path, 'utf8'));
  const segmentFiles = [];
  const chapterList = [];
  let cumulativeTime = 0;

  for (const p of ep2) {
    const padId = String(p.panelId).padStart(2, '0');
    console.log(`\n▶️ [Panel ${p.panelId} / 20] "${p.beat?.name || 'Scene'}"`);

    const imageFile = path.join(selectedDir, `panel_${padId}.webp`);
    if (!fs.existsSync(imageFile)) {
      throw new Error(`Missing image file: ${imageFile}`);
    }

    // 1. Synthesize Audio Clips with Dynamic Emotional Prosody
    const clips = [];

    // Caption (Narrator)
    if (p.caption && p.caption.trim()) {
      const rawFile = path.join(audioDir, `p${padId}_narrator_raw.mp3`);
      const fxFile = path.join(audioDir, `p${padId}_narrator_fx.mp3`);
      const profile = getEmotionProfile('Narrator', p.caption.trim(), p.panelId);
      await synthesizeClip(profile, p.caption.trim(), rawFile, fxFile);
      clips.push({ file: fxFile, speaker: 'Narrator', duration: getAudioDuration(fxFile) });
    }

    // Dialogue (Characters with intense yells, screams, roars)
    if (p.dialogue && p.dialogue.length > 0) {
      for (let i = 0; i < p.dialogue.length; i++) {
        const d = p.dialogue[i];
        const rawFile = path.join(audioDir, `p${padId}_dia_${i}_${d.speaker.replace(/\s+/g, '_')}_raw.mp3`);
        const fxFile = path.join(audioDir, `p${padId}_dia_${i}_${d.speaker.replace(/\s+/g, '_')}_fx.mp3`);
        const profile = getEmotionProfile(d.speaker, d.text.trim(), p.panelId);
        await synthesizeClip(profile, d.text.trim(), rawFile, fxFile);
        clips.push({ file: fxFile, speaker: d.speaker, duration: getAudioDuration(fxFile) });
      }
    }

    // 2. Mix Sequenced Audio + SFX Cues for Panel
    const panelMixedAudio = path.join(audioDir, `p${padId}_mixed.wav`);
    let totalDuration = 0;
    
    // Check for panel-specific SFX cues
    let panelSFX = null;
    if (p.panelId === 10) panelSFX = [ { file: sfxFiles.vault_slam, delay: 0 }, { file: sfxFiles.acid_sizzle, delay: 1800 } ];
    if (p.panelId === 11) panelSFX = [ { file: sfxFiles.spider_hiss, delay: 500 } ];
    if (p.panelId === 13) panelSFX = [ { file: sfxFiles.torch_whoosh, delay: 600 } ];
    if (p.panelId === 14) panelSFX = [ { file: sfxFiles.sword_cleave, delay: 1200 }, { file: sfxFiles.vault_slam, delay: 2000 } ];
    if (p.panelId === 18) panelSFX = [ { file: sfxFiles.chasm_wind, delay: 200 } ];

    if (clips.length === 0) {
      totalDuration = 4.0;
      execSync(`"${FFMPEG_PATH}" -y -f lavfi -t 4.0 -i "anoisesrc=d=4.0:c=pink:r=44100:a=0.015,lowpass=f=280" -c:a pcm_s16le "${panelMixedAudio}"`, { stdio: 'ignore' });
    } else {
      let currentDelayMs = 250; // crisp 250ms opening
      const inputArgs = [];
      const delayFilters = [];
      const mixInputs = [];

      // Add speech clips
      for (let i = 0; i < clips.length; i++) {
        inputArgs.push(`-i "${clips[i].file}"`);
        delayFilters.push(`[${i}:a]adelay=${currentDelayMs}|${currentDelayMs}[a${i}]`);
        mixInputs.push(`[a${i}]`);
        currentDelayMs += Math.round(clips[i].duration * 1000) + 300; // tight 300ms inter-dialogue cadence
      }

      // Add SFX layers if available
      if (panelSFX) {
        for (let s = 0; s < panelSFX.length; s++) {
          const sfxIdx = clips.length + s;
          inputArgs.push(`-i "${panelSFX[s].file}"`);
          delayFilters.push(`[${sfxIdx}:a]adelay=${panelSFX[s].delay}|${panelSFX[s].delay}[sfx${s}]`);
          mixInputs.push(`[sfx${s}]`);
        }
      }

      totalDuration = Math.max((currentDelayMs + 400) / 1000, 3.5); // minimum 3.5s panel

      // Add low atmospheric drone
      const ambInputIdx = inputArgs.length;
      inputArgs.push(`-f lavfi -t ${totalDuration.toFixed(1)} -i "anoisesrc=d=${totalDuration.toFixed(1)}:c=pink:r=44100:a=0.012,lowpass=f=280"`);
      delayFilters.push(`[${ambInputIdx}:a]volume=0.22[amb]`);
      mixInputs.push('[amb]');

      const filterComplex = `${delayFilters.join(';')};${mixInputs.join('')}amix=inputs=${mixInputs.length}:duration=longest:dropout_transition=0,volume=1.85[outa]`;
      const mixCmd = `"${FFMPEG_PATH}" -y ${inputArgs.join(' ')} -filter_complex "${filterComplex}" -map "[outa]" -t ${totalDuration.toFixed(2)} "${panelMixedAudio}"`;
      execSync(mixCmd, { stdio: 'ignore' });
    }

    console.log(`   🔊 Mixed ${totalDuration.toFixed(1)}s (${clips.map(c => `${c.speaker}`).join(' ➔ ') || 'Ambient'})`);

    // Record Chapter Metadata
    chapterList.push({
      panelId: p.panelId,
      title: p.beat?.name || `Panel ${p.panelId}`,
      timestamp: cumulativeTime,
      formattedTime: `${Math.floor(cumulativeTime / 60)}:${String(Math.floor(cumulativeTime % 60)).padStart(2, '0')}`,
      speakers: clips.map(c => c.speaker)
    });
    cumulativeTime += totalDuration;

    // 3. Render 2.5D Motion Video Segment (Text-Safe Hybrid: 1.2s Read Hold + Top-Anchored Drift)
    const segFile = path.join(segDir, `p${padId}_seg.mp4`);
    const totalFrames = Math.ceil(totalDuration * 30);
    const holdFrames = 36; // 1.2s static hold at 30fps to read caption & absorb composition

    // Gentle zoom: stays 1.0 for first 36 frames, then creeps to max 1.04
    const zoomExpr = `if(lte(on,${holdFrames}),1.0,min(1.0+(on-${holdFrames})*0.00012,1.04))`;

    // Top-anchored y: keeps narrative caption box at y=0 so it NEVER gets cropped
    const yExpr = "0";

    // Subtle horizontal drift: +/- 15px max (alternating direction by panel)
    let xExpr = "iw/2-(iw/zoom/2)";
    if (p.panelId % 2 === 0) {
      xExpr = `iw/2-(iw/zoom/2)+((on/${totalFrames})-0.5)*30`;
    } else {
      xExpr = `iw/2-(iw/zoom/2)-((on/${totalFrames})-0.5)*30`;
    }

    const videoFilter = `scale=1536:864,zoompan=z='${zoomExpr}':x='${xExpr}':y='${yExpr}':d=${totalFrames}:s=1280x720:fps=30,format=yuv420p`;
    const renderSegCmd = `"${FFMPEG_PATH}" -y -loop 1 -i "${imageFile}" -i "${panelMixedAudio}" -filter_complex "[0:v]${videoFilter}[v]" -map "[v]" -map 1:a -c:v libx264 -preset fast -crf 19 -c:a aac -b:a 192k -shortest -t ${totalDuration.toFixed(2)} "${segFile}"`;

    execSync(renderSegCmd, { stdio: 'ignore' });
    console.log(`   🎥 Video segment rendered: p${padId}_seg.mp4`);
    segmentFiles.push(segFile);
  }

  // 4. Concatenate All 20 Segments into Full Master Movie
  console.log('\n🎞️ Stitches all 20 segments into master episode movie...');
  const concatList = path.join(workDir, 'concat_list.txt');
  fs.writeFileSync(concatList, segmentFiles.map(f => `file '${f.replace(/\\/g, '/')}'`).join('\n'), 'utf8');

  const masterVideo = path.join(rootDir, '02_Assets', 'video_test', 'episode_02_motion_comic.mp4');
  const docsMasterVideo = path.join(docsDir, 'episode_02_motion_comic.mp4');

  const concatCmd = `"${FFMPEG_PATH}" -y -f concat -safe 0 -i "${concatList}" -c copy "${masterVideo}"`;
  execSync(concatCmd, { stdio: 'inherit' });

  // 5. Transcode to Web Compressed Release (< 45 MB)
  console.log('\n📦 Transcoding high-efficiency web release for docs/ (CRF 25)...');
  const webCompressCmd = `"${FFMPEG_PATH}" -y -i "${masterVideo}" -c:v libx264 -preset medium -crf 25 -c:a aac -b:a 128k "${docsMasterVideo}"`;
  execSync(webCompressCmd, { stdio: 'inherit' });

  const webSizeMB = (fs.statSync(docsMasterVideo).size / (1024 * 1024)).toFixed(2);
  const masterDuration = getAudioDuration(docsMasterVideo);
  console.log(`\n🎉 MASTER HIGH-EMOTION MOVIE READY: ${docsMasterVideo}`);
  console.log(`⏱️ Total Runtime: ${(masterDuration / 60).toFixed(2)} min (${masterDuration.toFixed(1)}s)`);
  console.log(`📊 File Size: ${webSizeMB} MB (Safe for GitHub & Web)`);

  // 6. Update Chapters JSON
  const chaptersPath = path.join(docsDir, 'episode_02_chapters.json');
  fs.writeFileSync(chaptersPath, JSON.stringify(chapterList, null, 2), 'utf8');
  console.log(`📑 Updated chapter markers: ${chaptersPath}`);
}

main().catch(err => {
  console.error('Fatal error building full movie:', err);
  process.exit(1);
});
