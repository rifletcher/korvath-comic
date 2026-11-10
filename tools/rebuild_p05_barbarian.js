const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.join(__dirname, '..');
const audioDir = path.join(rootDir, '02_Assets', 'episode_01_build', 'audio');
const segMetaDir = path.join(rootDir, '02_Assets', 'episode_01_build', 'segments_meta');
const metaImg = path.join(rootDir, 'docs', 'assets', 'ep1_meta', 'panel_05.webp');
const p05Mixed = path.join(audioDir, 'p05_mixed.wav');
const p05MetaSeg = path.join(segMetaDir, 'p05_meta_seg.mp4');

// 1. Copy over the Barbarian Kratos audio to the build dir
const barbarianRaw = path.join(rootDir, 'test_barbarian_p05_raw.mp3');
const barbarianFx = path.join(rootDir, 'test_barbarian_p05_kratos.mp3');

fs.copyFileSync(barbarianRaw, path.join(audioDir, 'p05_dia_0_Sarkeshian Cultist_raw.mp3'));
fs.copyFileSync(barbarianFx, path.join(audioDir, 'p05_dia_0_Sarkeshian Cultist_fx.mp3'));

const narratorFx = path.join(audioDir, 'p05_narrator_fx.mp3');

function getDur(f) {
  return parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${f}"`).toString().trim());
}

const narrDur = getDur(narratorFx);
const diaDur = getDur(barbarianFx);

console.log(`Narrator dur: ${narrDur.toFixed(2)}s | Barbarian line dur: ${diaDur.toFixed(2)}s`);

let currentDelayMs = 250;
const inputArgs = [
  `-i "${narratorFx}"`,
  `-i "${barbarianFx}"`
];

const delayFilters = [
  `[0:a]adelay=${currentDelayMs}|${currentDelayMs}[a0]`
];

currentDelayMs += Math.round(narrDur * 1000) + 350;
delayFilters.push(`[1:a]adelay=${currentDelayMs}|${currentDelayMs}[a1]`);
currentDelayMs += Math.round(diaDur * 1000) + 400;

const totalDuration = Math.max((currentDelayMs + 300) / 1000, 4.0);

// Pink noise ambient drone
inputArgs.push(`-f lavfi -t ${totalDuration.toFixed(1)} -i "anoisesrc=d=${totalDuration.toFixed(1)}:c=pink:r=44100:a=0.015,lowpass=f=260"`);
delayFilters.push(`[2:a]volume=0.25[amb]`);

const filterComplex = `${delayFilters.join(';')};[a0][a1][amb]amix=inputs=3:duration=longest:dropout_transition=0,volume=1.85[outa]`;

execSync(`ffmpeg -y ${inputArgs.join(' ')} -filter_complex "${filterComplex}" -map "[outa]" -t ${totalDuration.toFixed(2)} "${p05Mixed}"`);
console.log(`✅ Generated new p05_mixed.wav (${totalDuration.toFixed(2)}s) with canonical Barbarian voice!`);

// 2. Re-render the Meta video segment for panel 5
const totalFrames = Math.ceil(totalDuration * 30);
const holdFrames = 36;
const zoomExpr = `if(lte(on,${holdFrames}),1.0,min(1.0+(on-${holdFrames})*0.00012,1.04))`;
const yExpr = "0";
const xExpr = `iw/2-(iw/zoom/2)-((on/${totalFrames})-0.5)*25`;
const filter = `scale=1536:864,zoompan=z='${zoomExpr}':x='${xExpr}':y='${yExpr}':d=${totalFrames}:s=1280x720:fps=30,format=yuv420p`;

const cmd = `ffmpeg -y -loop 1 -r 30 -i "${metaImg}" -i "${p05Mixed}" -filter_complex "[0:v]${filter}[v]" -map "[v]" -map 1:a -c:v libx264 -preset fast -crf 19 -r 30 -c:a aac -b:a 192k -ar 44100 -shortest -t ${totalDuration.toFixed(2)} "${p05MetaSeg}"`;
execSync(cmd);
console.log(`✅ Re-rendered p05_meta_seg.mp4!`);

