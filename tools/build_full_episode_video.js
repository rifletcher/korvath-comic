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
const docsDir = path.join(rootDir, 'docs');

fs.mkdirSync(audioDir, { recursive: true });
fs.mkdirSync(segDir, { recursive: true });

// Voice Casting Directory
const VOICE_MAP = {
  narrator: { voice: 'en-GB-RyanNeural', pitch: '-8Hz', rate: '-8%' },
  korvath: { voice: 'en-US-ChristopherNeural', pitch: '-15Hz', rate: '-6%' },
  natari: { voice: 'en-US-AvaNeural', pitch: '+2Hz', rate: '-4%' },
  'lord malakor': { voice: 'en-GB-ThomasNeural', pitch: '-4Hz', rate: '-5%' },
  'spider assassin': { voice: 'en-US-EricNeural', pitch: '-10Hz', rate: '+8%' }
};

function getVoiceProfile(speakerName) {
  const key = (speakerName || '').toLowerCase().trim();
  return VOICE_MAP[key] || VOICE_MAP['narrator'];
}

async function synthesizeClip(ttsInstance, voiceProfile, text, outFile) {
  if (fs.existsSync(outFile) && fs.statSync(outFile).size > 1000) {
    return outFile;
  }
  await ttsInstance.setMetadata(voiceProfile.voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  const { audioStream } = ttsInstance.toStream(text, {
    pitch: voiceProfile.pitch,
    rate: voiceProfile.rate
  });
  const out = fs.createWriteStream(outFile);
  return new Promise((resolve, reject) => {
    audioStream.pipe(out);
    out.on('finish', () => resolve(outFile));
    out.on('error', reject);
    audioStream.on('error', reject);
  });
}

function getAudioDuration(filePath) {
  const out = execSync(`"${FFPROBE_PATH}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`, { encoding: 'utf8' });
  return parseFloat(out.trim());
}

async function main() {
  console.log('🎬 =======================================================');
  console.log('⚔️ BUILDING FULL 20-PANEL MOTION COMIC MOVIE (EPISODE 2)');
  console.log('🎬 =======================================================');

  const ep2 = JSON.parse(fs.readFileSync(ep2Path, 'utf8'));
  const tts = new MsEdgeTTS();
  const segmentFiles = [];

  for (const p of ep2) {
    const padId = String(p.panelId).padStart(2, '0');
    console.log(`\n▶️ Processing Panel ${p.panelId} / 20: "${p.beat?.name || 'Scene'}"`);

    const imageFile = path.join(selectedDir, `panel_${padId}.webp`);
    if (!fs.existsSync(imageFile)) {
      throw new Error(`Missing image file: ${imageFile}`);
    }

    // 1. Synthesize Audio Clips
    const clips = [];

    // Caption (Narrator)
    if (p.caption && p.caption.trim()) {
      const capFile = path.join(audioDir, `p${padId}_narrator.mp3`);
      await synthesizeClip(tts, VOICE_MAP.narrator, p.caption.trim(), capFile);
      clips.push({ file: capFile, speaker: 'Narrator', duration: getAudioDuration(capFile) });
    }

    // Dialogue (Characters)
    if (p.dialogue && p.dialogue.length > 0) {
      for (let i = 0; i < p.dialogue.length; i++) {
        const d = p.dialogue[i];
        const diaFile = path.join(audioDir, `p${padId}_dia_${i}_${d.speaker.replace(/\s+/g, '_')}.mp3`);
        const voice = getVoiceProfile(d.speaker);
        await synthesizeClip(tts, voice, d.text.trim(), diaFile);
        clips.push({ file: diaFile, speaker: d.speaker, duration: getAudioDuration(diaFile) });
      }
    }

    // 2. Mix Sequenced Audio for Panel
    const panelMixedAudio = path.join(audioDir, `p${padId}_mixed.wav`);
    let totalDuration = 0;
    
    if (clips.length === 0) {
      // Ambient silence / action pause
      totalDuration = 4.0;
      execSync(`"${FFMPEG_PATH}" -y -f lavfi -t 4.0 -i "anoisesrc=d=4.0:c=pink:r=44100:a=0.015,lowpass=f=280" -c:a pcm_s16le "${panelMixedAudio}"`, { stdio: 'ignore' });
    } else {
      // Build filter_complex with delays
      let currentDelayMs = 300; // start 300ms in
      const inputArgs = [];
      const delayFilters = [];
      const mixInputs = [];

      for (let i = 0; i < clips.length; i++) {
        inputArgs.push(`-i "${clips[i].file}"`);
        delayFilters.push(`[${i}:a]adelay=${currentDelayMs}|${currentDelayMs}[a${i}]`);
        mixInputs.push(`[a${i}]`);
        currentDelayMs += Math.round(clips[i].duration * 1000) + 400; // 400ms pause between lines
      }

      totalDuration = (currentDelayMs + 500) / 1000; // 500ms tail
      const ambInputIdx = clips.length;
      inputArgs.push(`-f lavfi -t ${totalDuration.toFixed(1)} -i "anoisesrc=d=${totalDuration.toFixed(1)}:c=pink:r=44100:a=0.012,lowpass=f=280"`);
      delayFilters.push(`[${ambInputIdx}:a]volume=0.25[amb]`);
      mixInputs.push('[amb]');

      const filterComplex = `${delayFilters.join(';')};${mixInputs.join('')}amix=inputs=${mixInputs.length}:duration=longest:dropout_transition=0,volume=1.8[outa]`;
      const mixCmd = `"${FFMPEG_PATH}" -y ${inputArgs.join(' ')} -filter_complex "${filterComplex}" -map "[outa]" -t ${totalDuration.toFixed(2)} "${panelMixedAudio}"`;
      execSync(mixCmd, { stdio: 'ignore' });
    }

    console.log(`   🔊 Audio mixed: ${totalDuration.toFixed(1)}s (${clips.map(c => c.speaker).join(' ➔ ') || 'Ambient'})`);

    // 3. Render 2.5D Motion Video Segment
    const segFile = path.join(segDir, `p${padId}_seg.mp4`);
    const totalFrames = Math.ceil(totalDuration * 30);

    // Dynamic zoom direction based on shot type
    let zoomExpr = "min(zoom+0.00032,1.10)";
    let xExpr = "iw/2-(iw/zoom/2)";
    let yExpr = "ih/2-(ih/zoom/2)";

    if (p.panelId % 3 === 0) {
      // Slow pan left to right
      xExpr = `iw/2-(iw/zoom/2)+((on/${totalFrames})-0.5)*80`;
    } else if (p.panelId % 3 === 1) {
      // Gentle upward crane
      yExpr = `ih/2-(ih/zoom/2)-((on/${totalFrames})-0.5)*40`;
    }

    const videoFilter = `scale=1536:864,zoompan=z='${zoomExpr}':x='${xExpr}':y='${yExpr}':d=${totalFrames}:s=1280x720:fps=30,format=yuv420p`;
    const renderSegCmd = `"${FFMPEG_PATH}" -y -loop 1 -i "${imageFile}" -i "${panelMixedAudio}" -filter_complex "[0:v]${videoFilter}[v]" -map "[v]" -map 1:a -c:v libx264 -preset fast -crf 19 -c:a aac -b:a 192k -shortest -t ${totalDuration.toFixed(2)} "${segFile}"`;

    execSync(renderSegCmd, { stdio: 'ignore' });
    console.log(`   🎥 Video segment rendered: ${segFile}`);
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

  const masterDuration = getAudioDuration(masterVideo);
  console.log(`\n🎉 MASTER MOVIE RENDERED: ${masterVideo}`);
  console.log(`⏱️ Total Runtime: ${(masterDuration / 60).toFixed(2)} minutes (${masterDuration.toFixed(1)} seconds)`);

  fs.copyFileSync(masterVideo, docsMasterVideo);
  console.log(`📦 Copied to docs: ${docsMasterVideo}`);
}

main().catch(err => {
  console.error('Fatal error building full movie:', err);
  process.exit(1);
});

