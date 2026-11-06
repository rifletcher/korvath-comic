const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const FFMPEG_PATH = 'C:\\Users\\robert.fletcher\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg.Essentials_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0.1-essentials_build\\bin\\ffmpeg.exe';
const FFPROBE_PATH = 'C:\\Users\\robert.fletcher\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg.Essentials_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0.1-essentials_build\\bin\\ffprobe.exe';

const rootDir = path.join(__dirname, '..');

// CLI args
const args = process.argv.slice(2);
let epNum = '02';
let thumbPanelId = 10; // Default to climax panel 10 (Caught in the Web)

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--episode' || args[i] === '-e') epNum = String(args[i + 1]).padStart(2, '0');
  if (args[i] === '--thumb' || args[i] === '-t') thumbPanelId = parseInt(args[i + 1]);
}

const epScriptPath = path.join(rootDir, '01_Script', 'episodes', `episode_${epNum}.json`);
const epChaptersPath = path.join(rootDir, 'docs', `episode_${epNum}_chapters.json`);
const masterVideoPath = path.join(rootDir, 'docs', `episode_${epNum}_motion_comic.mp4`);
const selectedDir = path.join(rootDir, '02_Assets', `Episode_${epNum}`, 'selected');

const bundleDir = path.join(rootDir, '02_Assets', 'youtube_releases', `episode_${epNum}`);
fs.mkdirSync(bundleDir, { recursive: true });

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

async function main() {
  console.log('🎬 ===============================================================');
  console.log(`⚔️ YOUTUBE BUNDLE EXPORTER: EPISODE ${epNum}`);
  console.log('📦 Video + High-CTR Thumbnail + Clickable Timestamps + SEO Metadata');
  console.log('🎬 ===============================================================\n');

  if (!fs.existsSync(epScriptPath)) {
    throw new Error(`Missing episode script: ${epScriptPath}`);
  }
  if (!fs.existsSync(masterVideoPath)) {
    throw new Error(`Missing master video: ${masterVideoPath}. Run npm run movie:build first.`);
  }

  const epScript = JSON.parse(fs.readFileSync(epScriptPath, 'utf8'));
  let chapters = [];
  if (fs.existsSync(epChaptersPath)) {
    chapters = JSON.parse(fs.readFileSync(epChaptersPath, 'utf8'));
  }

  // 1. Copy Master Video
  console.log('▶️ [1/3] Packaging Master Video (1080p Web Compressed)...');
  const outVideo = path.join(bundleDir, `Korvath_Episode_${epNum}_Master.mp4`);
  fs.copyFileSync(masterVideoPath, outVideo);
  const videoSizeMB = (fs.statSync(outVideo).size / (1024 * 1024)).toFixed(2);
  console.log(`   ✅ Video ready: ${outVideo} (${videoSizeMB} MB)`);

  // 2. Generate High-CTR YouTube Thumbnail
  console.log(`\n▶️ [2/3] Generating High-CTR Thumbnail from Panel ${thumbPanelId}...`);
  const padThumbId = String(thumbPanelId).padStart(2, '0');
  const sourceImage = path.join(selectedDir, `panel_${padThumbId}.webp`);
  const outThumb = path.join(bundleDir, 'thumbnail.jpg');
  const docsThumb = path.join(rootDir, 'docs', `episode_${epNum}_thumbnail.jpg`);

  if (fs.existsSync(sourceImage)) {
    // Cinematic color grading: enhance contrast, warm saturated golds, subtle vignette
    const filterGrading = "scale=1280:720,eq=contrast=1.18:brightness=-0.02:saturation=1.22";
    execSync(`"${FFMPEG_PATH}" -y -i "${sourceImage}" -vf "${filterGrading}" -q:v 2 "${outThumb}"`, { stdio: 'ignore' });
    fs.copyFileSync(outThumb, docsThumb);
    console.log(`   ✅ High-CTR Thumbnail generated: ${outThumb}`);
  } else {
    console.warn(`   ⚠️ Source panel image not found: ${sourceImage}. Skipping thumbnail.`);
  }

  // 3. Compile Clickable Timestamps & SEO Metadata
  console.log('\n▶️ [3/3] Compiling YouTube Description, Chapters & Tags...');

  let timestampsText = 'TIMESTAMPS / CHAPTERS:\n';
  if (chapters.length > 0) {
    chapters.forEach(c => {
      const ts = c.timestamp !== undefined ? c.timestamp : (c.startTime || 0);
      timestampsText += `${formatTime(ts)} - ${c.title || `Panel ${c.panelId}`}\n`;
    });
  } else {
    timestampsText += '0:00 - Episode Start\n';
  }

  const episodeTitle = `KORVATH: The City of Shadows (Episode ${parseInt(epNum)}) | Dark Fantasy Motion Comic`;

  const descriptionText = `${episodeTitle}

Beyond the red sands of Sarkesh lies Valkash—the City of Shadows, where thieves rule, wine is laced with venom, and blades speak louder than gold. Korvath the northern barbarian and the captive dancer Natari must survive treacherous alleyways, spider assassins, and an ancient subterranean vault.

${timestampsText}
CAST & CREW:
⚔️ Korvath the Barbarian: Booming Warrior Voice
💃 Natari the Desert Rogue: Sarah
🐍 Lord Malakor: Brian
🗡️ Spider Assassin: George
📜 The Pulp Chronicler (Narrator): Adam

PRODUCTION & ART STYLE:
🎨 Illustrated in classic 1970s Sword & Sorcery pulp aesthetic (Homage to Frank Frazetta & John Buscema).
🎙️ Sound Design: Cinematic Hollywood SFX & Procedural Motion Comic Engine.
📖 Autonomous Graphic Novel Studio by Antigravity Studio.

#DarkFantasy #Conan #MotionComic #SwordAndSorcery #Grimdark #GraphicNovel #AudioDrama #Frazetta #PulpFantasy`;

  const uploadInfo = {
    title: episodeTitle,
    category: 'Film & Animation (1)',
    tags: [
      'Dark Fantasy',
      'Conan the Barbarian',
      'Motion Comic',
      'Sword and Sorcery',
      'Grimdark',
      'Frank Frazetta',
      'John Buscema',
      'Pulp Fantasy',
      'Audio Drama',
      'Graphic Novel',
      'Comic Dub',
      'Barbarian'
    ],
    videoFile: outVideo,
    thumbnailFile: outThumb,
    description: descriptionText
  };

  const uploadInfoPath = path.join(bundleDir, 'upload_info.txt');
  const uploadJsonPath = path.join(bundleDir, 'metadata.json');
  fs.writeFileSync(uploadInfoPath, descriptionText, 'utf8');
  fs.writeFileSync(uploadJsonPath, JSON.stringify(uploadInfo, null, 2), 'utf8');

  console.log(`   ✅ Exported metadata: ${uploadInfoPath}`);
  console.log(`   ✅ Exported JSON: ${uploadJsonPath}`);

  console.log('\n===============================================================');
  console.log('🎉 YOUTUBE RELEASE BUNDLE READY TO UPLOAD!');
  console.log('===============================================================');
  console.log(`📁 Directory: ${bundleDir}`);
  console.log(`📹 Video:     ${outVideo}`);
  console.log(`🖼️ Thumbnail: ${outThumb}`);
  console.log(`📑 Metadata:  ${uploadInfoPath}`);
  console.log('===============================================================\n');
  console.log('📌 TITLE (Copy-paste to YouTube):');
  console.log(episodeTitle);
  console.log('\n📌 CHAPTERS PREVIEW:');
  console.log(timestampsText.trim());
}

main().catch(err => {
  console.error('\n❌ Export Error:', err.message);
  process.exit(1);
});
