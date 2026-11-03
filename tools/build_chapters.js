const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const FFPROBE_PATH = 'C:\\Users\\robert.fletcher\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg.Essentials_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0.1-essentials_build\\bin\\ffprobe.exe';

const rootDir = path.join(__dirname, '..');
const ep2 = JSON.parse(fs.readFileSync(path.join(rootDir, '01_Script', 'episodes', 'episode_02.json'), 'utf8'));
const segDir = path.join(rootDir, '02_Assets', 'full_movie_build', 'segments');

function buildChapters() {
  let currentTime = 0;
  const chapters = [];

  for (const p of ep2) {
    const padId = String(p.panelId).padStart(2, '0');
    const segFile = path.join(segDir, `p${padId}_seg.mp4`);
    if (!fs.existsSync(segFile)) break;

    const out = execSync(`"${FFPROBE_PATH}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${segFile}"`, { encoding: 'utf8' });
    const dur = parseFloat(out.trim());

    chapters.push({
      panelId: p.panelId,
      title: p.beat?.name || `Panel ${p.panelId}`,
      startTime: currentTime,
      duration: dur
    });

    currentTime += dur;
  }

  const jsonStr = JSON.stringify(chapters, null, 2);
  fs.writeFileSync(path.join(rootDir, 'docs', 'episode_02_chapters.json'), jsonStr, 'utf8');
  fs.writeFileSync(path.join(rootDir, '02_Assets', 'full_movie_build', 'episode_02_chapters.json'), jsonStr, 'utf8');
  console.log(`✅ Chapters saved for ${chapters.length} panels. Total movie duration: ${(currentTime / 60).toFixed(2)} min`);
}

if (require.main === module) {
  buildChapters();
}

module.exports = { buildChapters };

