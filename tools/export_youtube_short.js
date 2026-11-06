const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const FFMPEG_PATH = 'C:\\Users\\robert.fletcher\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg.Essentials_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0.1-essentials_build\\bin\\ffmpeg.exe';
const FFPROBE_PATH = 'C:\\Users\\robert.fletcher\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg.Essentials_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0.1-essentials_build\\bin\\ffprobe.exe';

const rootDir = path.join(__dirname, '..');

// CLI args
const args = process.argv.slice(2);
let epNum = '02';
let panelId = 10; // Default to Panel 10 (Acid Web Ambush Climax)

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--episode' || args[i] === '-e') epNum = String(args[i + 1]).padStart(2, '0');
  if (args[i] === '--panel' || args[i] === '-p') panelId = parseInt(args[i + 1]);
}

const padPanelId = String(panelId).padStart(2, '0');
const selectedDir = path.join(rootDir, '02_Assets', `Episode_${epNum}`, 'selected');
const imageFile = path.join(selectedDir, `panel_${padPanelId}.webp`);
const audioDir = path.join(rootDir, '02_Assets', 'full_movie_build', 'audio');
const mixedAudio = path.join(audioDir, `p${padPanelId}_mixed.wav`);

const shortsDir = path.join(rootDir, '02_Assets', 'youtube_releases', 'shorts');
const docsShortsDir = path.join(rootDir, 'docs', 'shorts');
fs.mkdirSync(shortsDir, { recursive: true });
fs.mkdirSync(docsShortsDir, { recursive: true });

function getAudioDuration(filePath) {
  const out = execSync(`"${FFPROBE_PATH}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`, { encoding: 'utf8' });
  return parseFloat(out.trim());
}

async function main() {
  console.log('📱 ===============================================================');
  console.log(`⚔️ YOUTUBE SHORTS / TIKTOK EXPORTER: EPISODE ${epNum} - PANEL ${panelId}`);
  console.log('🔥 9:16 Vertical Video (1080x1920) + Ambient Backdrop + Action Audio');
  console.log('📱 ===============================================================\n');

  if (!fs.existsSync(imageFile)) {
    throw new Error(`Missing panel image: ${imageFile}`);
  }
  if (!fs.existsSync(mixedAudio)) {
    throw new Error(`Missing mixed audio: ${mixedAudio}. Run movie build first.`);
  }

  const duration = getAudioDuration(mixedAudio);
  const totalFrames = Math.ceil(duration * 30);
  const outShort = path.join(shortsDir, `short_ep${epNum}_p${padPanelId}.mp4`);
  const docsShort = path.join(docsShortsDir, `short_ep${epNum}_p${padPanelId}.mp4`);

  console.log(`▶️ Generating 9:16 Vertical Short for Panel ${panelId}...`);
  console.log(`   Source Image: ${path.basename(imageFile)}`);
  console.log(`   Audio Track:  ${path.basename(mixedAudio)} (${duration.toFixed(1)}s)`);

  // FFmpeg 9:16 Compositor:
  // [0:v] split into 2 streams:
  // Stream 1 (bg): scaled to fill 1080x1920, blurred with boxblur, darkened
  // Stream 2 (fg): scaled to 1080x608 (16:9), framed in the optical center with gold border
  const filterGraph = `
    [0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=22:4,eq=brightness=-0.18:saturation=1.1[bg];
    [0:v]scale=1040:585,pad=1056:601:8:8:color=0x8b2635,pad=1060:605:2:2:color=0xfca311[fg];
    [bg][fg]overlay=(W-w)/2:(H-h)/2[comp];
    [comp]drawtext=text='⚔️ KORVATH THE BARBARIAN':fontcolor=0xfca311:fontsize=48:x=(w-text_w)/2:y=280:shadowcolor=black:shadowx=3:shadowy=3,
          drawtext=text='EPISODE 2 CLIMAX':fontcolor=0xffffff:fontsize=32:x=(w-text_w)/2:y=345:shadowcolor=black:shadowx=2:shadowy=2,
          drawtext=text='🔥 WATCH FULL SAGA ON YOUTUBE':fontcolor=0xfca311:fontsize=40:x=(w-text_w)/2:y=1480:shadowcolor=black:shadowx=3:shadowy=3,
          drawtext=text='Link in Comments & Bio':fontcolor=0xcccccc:fontsize=28:x=(w-text_w)/2:y=1540:shadowcolor=black:shadowx=2:shadowy=2[outv]
  `.replace(/\r?\n/g, '');

  const cmd = `"${FFMPEG_PATH}" -y -loop 1 -i "${imageFile}" -i "${mixedAudio}" -filter_complex "${filterGraph}" -map "[outv]" -map 1:a -c:v libx264 -preset fast -crf 22 -c:a aac -b:a 192k -shortest -t ${duration.toFixed(2)} "${outShort}"`;

  execSync(cmd, { stdio: 'inherit' });
  fs.copyFileSync(outShort, docsShort);

  const shortSizeMB = (fs.statSync(outShort).size / (1024 * 1024)).toFixed(2);
  console.log(`\n🎉 YOUTUBE SHORT EXPORT READY!`);
  console.log(`📁 File: ${outShort}`);
  console.log(`🌐 Web:  docs/shorts/${path.basename(docsShort)}`);
  console.log(`📊 Size: ${shortSizeMB} MB`);
  console.log(`⏱️ Duration: ${duration.toFixed(1)}s (Perfect for YouTube Shorts / TikTok / Reels)`);
}

main().catch(err => {
  console.error('\n❌ Short Export Error:', err.message);
  process.exit(1);
});
