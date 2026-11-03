const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const FFMPEG_PATH = 'C:\\Users\\robert.fletcher\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg.Essentials_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0.1-essentials_build\\bin\\ffmpeg.exe';

const rootDir = path.join(__dirname, '..');
const audioDir = path.join(rootDir, '02_Assets', 'audio_test');
const videoDir = path.join(rootDir, '02_Assets', 'video_test');
const docsDir = path.join(rootDir, 'docs');

fs.mkdirSync(videoDir, { recursive: true });

const imagePath = path.join(rootDir, '02_Assets', 'Episode_02', 'selected', 'panel_03.webp');
const narratorAudio = path.join(audioDir, 'panel03_narrator.mp3');
const korvathAudio = path.join(audioDir, 'panel03_korvath.mp3');
const combinedAudio = path.join(audioDir, 'panel03_combined_audio.wav');
const finalVideo = path.join(videoDir, 'panel_03_motion_comic.mp4');
const docsVideo = path.join(docsDir, 'panel_03_motion_comic.mp4');

async function buildMotionComic() {
  console.log('🎬 1. Creating sequenced audio track (Narrator -> Pause -> Korvath)...');

  // Narrator: starts at 0.5s, ends around 5.1s
  // Korvath: starts at 5.6s, ends around 10.6s
  // Total duration: 11.2s
  const audioCmd = `"${FFMPEG_PATH}" -y -i "${narratorAudio}" -i "${korvathAudio}" -f lavfi -t 11.5 -i "anoisesrc=d=11.5:c=pink:r=44100:a=0.015,lowpass=f=280" -filter_complex "[0:a]adelay=500|500[a0];[1:a]adelay=5600|5600[a1];[2:a]volume=0.3[amb];[a0][a1][amb]amix=inputs=3:duration=longest:dropout_transition=0,volume=1.8[outa]" -map "[outa]" -t 11.2 "${combinedAudio}"`;
  
  execSync(audioCmd, { stdio: 'inherit' });
  console.log(`✅ Combined audio mixed: ${combinedAudio}`);

  console.log('🎥 2. Rendering 2.5D Motion Comic Video with Ken Burns Camera Push...');
  // 11.2s at 30fps = 336 frames
  // Gentle slow dramatic zoom: 1.0 to 1.12 over 336 frames
  const videoCmd = `"${FFMPEG_PATH}" -y -loop 1 -i "${imagePath}" -i "${combinedAudio}" -filter_complex "[0:v]scale=1536:864,zoompan=z='min(zoom+0.00036,1.12)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=336:s=1280x720:fps=30,format=yuv420p[v]" -map "[v]" -map 1:a -c:v libx264 -preset fast -crf 18 -c:a aac -b:a 192k -shortest "${finalVideo}"`;

  execSync(videoCmd, { stdio: 'inherit' });
  console.log(`✅ Final Video rendered successfully: ${finalVideo}`);

  fs.copyFileSync(finalVideo, docsVideo);
  console.log(`📦 Video copied to docs for web viewing: ${docsVideo}`);
}

buildMotionComic().catch(console.error);
