const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const FFMPEG_PATH = 'C:\\Users\\robert.fletcher\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg.Essentials_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0.1-essentials_build\\bin\\ffmpeg.exe';
const FFPROBE_PATH = 'C:\\Users\\robert.fletcher\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg.Essentials_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0.1-essentials_build\\bin\\ffprobe.exe';

const rootDir = path.join(__dirname, '..');
const ep2Path = path.join(rootDir, '01_Script', 'episodes', 'episode_02.json');
const metaSelectedDir = path.join(rootDir, '02_Assets', 'Episode_02_meta', 'selected');

const audioWorkDir = path.join(rootDir, '02_Assets', 'full_movie_build', 'audio');
const metaWorkDir = path.join(rootDir, '02_Assets', 'full_movie_meta_build');
const segDir = path.join(metaWorkDir, 'segments');
const docsDir = path.join(rootDir, 'docs');

fs.mkdirSync(segDir, { recursive: true });

function getAudioDuration(audioFile) {
  try {
    const out = execSync(`"${FFPROBE_PATH}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioFile}"`, { encoding: 'utf8' }).trim();
    return parseFloat(out) || 4.0;
  } catch (e) {
    return 4.0;
  }
}

function getImageDimensions(imgPath) {
  try {
    const out = execSync(`ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${imgPath}"`).toString().trim();
    const [w, h] = out.split('x').map(Number);
    return { w, h, ar: w / h };
  } catch (e) {
    return { w: 1920, h: 1280, ar: 1.5 };
  }
}

function getVideoFilter(imgPath, panelDuration, panelId) {
  const { w, h, ar } = getImageDimensions(imgPath);
  const totalFrames = Math.ceil(panelDuration * 30);

  // 1. Vertical Portrait Panel (e.g. 1280x1920): Smooth Vertical Tilt (top to bottom)
  if (ar < 1.0) {
    return `scale=1280:-1,crop=1280:720:0:'(ih-720)*(0.5*(1-cos(PI*t/${panelDuration.toFixed(2)})))',format=yuv420p`;
  }

  // 2. Ultra-Wide Panoramic Panel (e.g. 2240x1120, ar >= 1.8): Smooth Horizontal Pan
  if (ar >= 1.8) {
    return `scale=-1:720,crop=1280:720:'(iw-1280)*(0.5*(1-cos(PI*t/${panelDuration.toFixed(2)})))':0,format=yuv420p`;
  }

  // 3. Standard Landscape: Subtle Ken Burns push
  const holdFrames = 36;
  const zoomExpr = `if(lte(on,${holdFrames}),1.0,min(1.0+(on-${holdFrames})*0.00012,1.04))`;
  const yExpr = "0";
  const xExpr = panelId % 2 === 0 ? `iw/2-(iw/zoom/2)+((on/${totalFrames})-0.5)*30` : `iw/2-(iw/zoom/2)-((on/${totalFrames})-0.5)*30`;
  return `scale=1536:864,zoompan=z='${zoomExpr}':x='${xExpr}':y='${yExpr}':d=${totalFrames}:s=1280x720:fps=30,format=yuv420p`;
}

async function buildMetaEpisodeVideo() {
  const ep2 = JSON.parse(fs.readFileSync(ep2Path, 'utf8'));

  console.log(`\n======================================================`);
  console.log(`🎬 BUILDING META AI MOTION COMIC MOVIE (Episode 2)`);
  console.log(`======================================================`);

  const segmentFiles = [];
  const chapterList = [];
  let cumulativeTime = 0;

  for (let idx = 0; idx < ep2.length; idx++) {
    const p = ep2[idx];
    const padId = String(p.panelId).padStart(2, '0');
    const imageFile = path.join(metaSelectedDir, `panel_${padId}.webp`);
    const panelMixedAudio = path.join(audioWorkDir, `p${padId}_mixed.wav`);

    if (!fs.existsSync(imageFile)) {
      throw new Error(`Meta AI Panel #${p.panelId} not found at ${imageFile}`);
    }
    if (!fs.existsSync(panelMixedAudio)) {
      throw new Error(`Mixed audio for Panel #${p.panelId} not found at ${panelMixedAudio}`);
    }

    const totalDuration = getAudioDuration(panelMixedAudio);
    console.log(`\n🎬 Panel #${p.panelId} [${p.beat?.name || 'Scene'}]: ${totalDuration.toFixed(2)}s`);

    // Record Chapter Metadata
    chapterList.push({
      panelId: p.panelId,
      title: p.beat?.name || `Panel ${p.panelId}`,
      timestamp: cumulativeTime,
      formattedTime: `${Math.floor(cumulativeTime / 60)}:${String(Math.floor(cumulativeTime % 60)).padStart(2, '0')}`
    });
    cumulativeTime += totalDuration;

    // Render 2.5D Motion Video Segment
    const segFile = path.join(segDir, `p${padId}_meta_seg.mp4`);
    const totalFrames = Math.ceil(totalDuration * 30);
    const holdFrames = 36; // 1.2s static hold

    const videoFilter = getVideoFilter(imageFile, totalDuration, p.panelId);
    const renderSegCmd = `"${FFMPEG_PATH}" -y -loop 1 -i "${imageFile}" -i "${panelMixedAudio}" -filter_complex "[0:v]${videoFilter}[v]" -map "[v]" -map 1:a -c:v libx264 -preset fast -crf 19 -c:a aac -b:a 192k -shortest -t ${totalDuration.toFixed(2)} "${segFile}"`;

    execSync(renderSegCmd, { stdio: 'ignore' });
    console.log(`   🎥 Video segment rendered: p${padId}_meta_seg.mp4`);
    segmentFiles.push(segFile);
  }

  // Concatenate All Segments via MPEG Transport Streams (.ts)
  console.log('\n🎞️ Stitching all 20 segments into master Meta AI motion comic movie...');
  const tsList = [];
  for (let i = 0; i < segmentFiles.length; i++) {
    const mp4Seg = segmentFiles[i];
    const tsSeg = mp4Seg.replace(/\.mp4$/, '.ts');
    execSync(`"${FFMPEG_PATH}" -y -i "${mp4Seg}" -c copy -bsf:v h264_mp4toannexb "${tsSeg}"`, { stdio: 'ignore' });
    tsList.push(`file '${tsSeg.replace(/\\/g, '/')}'`);
  }

  const concatList = path.join(metaWorkDir, 'concat_list.txt');
  fs.writeFileSync(concatList, tsList.join('\n'), 'utf8');

  const docsMasterVideo = path.join(docsDir, 'episode_02_meta_motion_comic.mp4');

  const concatCmd = `"${FFMPEG_PATH}" -y -f concat -safe 0 -i "${concatList}" -c:v libx264 -preset fast -crf 25 -c:a aac -b:a 128k "${docsMasterVideo}"`;
  execSync(concatCmd, { stdio: 'inherit' });

  // Clean up intermediate .ts files
  for (let i = 0; i < segmentFiles.length; i++) {
    const tsSeg = segmentFiles[i].replace(/\.mp4$/, '.ts');
    if (fs.existsSync(tsSeg)) {
      try { fs.unlinkSync(tsSeg); } catch (e) {}
    }
  }

  const stats = fs.statSync(docsMasterVideo);
  console.log(`\n======================================================`);
  console.log(`🌟 META AI MOTION COMIC COMPLETE:`);
  console.log(`Path: ${docsMasterVideo}`);
  console.log(`Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Total Runtime: ${Math.floor(cumulativeTime / 60)}m ${Math.floor(cumulativeTime % 60)}s`);
  console.log(`======================================================\n`);

  return docsMasterVideo;
}

if (require.main === module) {
  buildMetaEpisodeVideo().catch(console.error);
}

module.exports = { buildMetaEpisodeVideo };

