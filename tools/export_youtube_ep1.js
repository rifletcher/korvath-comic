const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const FFMPEG_PATH = 'C:\\Users\\robert.fletcher\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg.Essentials_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0.1-essentials_build\\bin\\ffmpeg.exe';
const rootDir = path.join(__dirname, '..');

const releaseDir = path.join(rootDir, '02_Assets', 'youtube_releases', 'episode_01_meta');
const brandDir = path.join(rootDir, '02_Assets', 'branding_meta');
const docsBrandDir = path.join(rootDir, 'docs', 'branding');

fs.mkdirSync(releaseDir, { recursive: true });
fs.mkdirSync(brandDir, { recursive: true });
fs.mkdirSync(docsBrandDir, { recursive: true });

const masterVideo = path.join(rootDir, 'docs', 'episode_01_meta_motion_comic.mp4');
const panel20 = path.join(rootDir, 'docs', 'assets', 'ep1_meta', 'panel_20.webp');
const panel1 = path.join(rootDir, 'docs', 'assets', 'ep1_meta', 'panel_01.webp');
const panel14 = path.join(rootDir, 'docs', 'assets', 'ep1_meta', 'panel_14.webp');

console.log('🚀 ===============================================================');
console.log('⚔️ GENERATING YOUTUBE LAUNCH ASSETS (META AI 2K FRAZETTA EDITION)');
console.log('🚀 ===============================================================\n');

// 1. YouTube Master Thumbnail (1280x720) - Climax Panel 20 with Blood-Ruby
const outThumb = path.join(releaseDir, 'thumbnail_1280x720.jpg');
const thumbFilter = "scale=1280:720,eq=contrast=1.2:brightness=-0.02:saturation=1.25";
execSync(`"${FFMPEG_PATH}" -y -i "${panel20}" -vf "${thumbFilter}" -q:v 2 "${outThumb}"`, { stdio: 'ignore' });
console.log(`✅ 1. High-CTR Thumbnail: ${outThumb}`);

// 2. YouTube Channel Avatar (800x800) - Heroic Close-Up from Panel 14 (Laughing at Doom)
const outAvatar = path.join(brandDir, 'avatar_800x800.jpg');
const avatarFilter = "scale=800:800,eq=contrast=1.2:brightness=-0.02:saturation=1.25";
execSync(`"${FFMPEG_PATH}" -y -i "${panel14}" -vf "${avatarFilter}" -q:v 2 "${outAvatar}"`, { stdio: 'ignore' });
fs.copyFileSync(outAvatar, path.join(docsBrandDir, 'avatar_meta_800x800.jpg'));
console.log(`✅ 2. Channel Avatar: ${outAvatar}`);

// 3. YouTube Banner (2560x1440) - The Windswept Ruins (Panel 01)
const outBanner = path.join(brandDir, 'youtube_banner_2560x1440.jpg');
const bannerFilter = `
  scale=2560:1440:force_original_aspect_ratio=increase,
  crop=2560:1440,
  eq=contrast=1.18:brightness=-0.22:saturation=1.2,
  drawbox=x=0:y=500:w=2560:h=440:color=0x0a0a0f@0.72:t=fill,
  drawbox=x=0:y=500:w=2560:h=3:color=0x8b2635:t=fill,
  drawbox=x=0:y=937:w=2560:h=3:color=0x8b2635:t=fill,
  drawtext=text='IRON & INK':fontcolor=0xfca311:fontsize=120:x=(w-text_w)/2:y=560:shadowcolor=black:shadowx=6:shadowy=6,
  drawtext=text='DARK FANTASY & SWORD-AND-SORCERY MOTION COMICS':fontcolor=0xffffff:fontsize=38:x=(w-text_w)/2:y=710:shadowcolor=black:shadowx=3:shadowy=3,
  drawtext=text='VINTAGE 1970s PULP ART  •  CINEMATIC AUDIO DRAMAS':fontcolor=0xe63946:fontsize=28:x=(w-text_w)/2:y=775:shadowcolor=black:shadowx=2:shadowy=2
`.replace(/\r?\n\s*/g, '');
execSync(`"${FFMPEG_PATH}" -y -i "${panel1}" -vf "${bannerFilter}" -q:v 2 "${outBanner}"`, { stdio: 'ignore' });
fs.copyFileSync(outBanner, path.join(docsBrandDir, 'banner_meta_2560x1440.jpg'));
console.log(`✅ 3. Channel Banner: ${outBanner}`);

// 4. Copy Master Video
const outVideo = path.join(releaseDir, 'Korvath_Episode_01_Meta_Frazetta_Master.mp4');
fs.copyFileSync(masterVideo, outVideo);
console.log(`✅ 4. Master Video: ${outVideo} (${(fs.statSync(outVideo).size / 1024 / 1024).toFixed(2)} MB)`);

// 5. Generate SEO Description & Copy-Paste Metadata
const chapters = JSON.parse(fs.readFileSync(path.join(rootDir, 'docs', 'episode_01_chapters.json'), 'utf8'));
const timestampLines = chapters.map(c => `${c.formattedTime} - ${c.title}`).join('\n');

const metadataText = `=== YOUTUBE VIDEO TITLE ===
KORVATH: The Slumbering Serpent (Episode 1) — Vintage Sword & Sorcery Motion Comic [2K Frazetta Style]

=== VIDEO DESCRIPTION (COPY & PASTE) ===
Beyond the civilized world lie the sun-blasted sands of Sarkesh. Korvath the northern barbarian enters the tomb of an ancient serpent cult, where gods older than mankind sleep in stagnant gloom. 

A tribute to Robert E. Howard, Frank Frazetta, and John Buscema.

⚔️ READ THE WEB COMIC & COMPARE EDITIONS:
https://korvath-comic.vercel.app/

TIMESTAMPS:
${timestampLines}

VOICE CAST & SOUND DESIGN:
• The Narrator: Brian (The Dark Chronicler)
• Korvath the Barbarian: Subterranean Kratos (-12% Pitch + 8dB Sub-Bass DSP)
• Natari the Desert Rogue: Sarah
• High Priest Kheshat: Charlie

PRODUCTION SPECS:
• Art Style: 1970s Sword & Sorcery, Frank Frazetta & John Buscema (Meta AI 2K)
• Audio: 48kHz Stereo Mastered with Dynamic Combat SFX & Sub-Bass Rumble
• Resolution: 1080p Cinema Widescreen (16:9)

#ConanTheBarbarian #SwordAndSorcery #MotionComic #DarkFantasy #FrankFrazetta #GraphicNovel #AudioDrama

=== TAGS ===
conan, conan the barbarian, motion comic, sword and sorcery, dark fantasy, robert e howard, frank frazetta, john buscema, graphic novel, audio drama, barbarian, fantasy movie, pulp comics, 1970s comics, meta ai art
`;

fs.writeFileSync(path.join(releaseDir, 'youtube_metadata.txt'), metadataText, 'utf8');
console.log(`✅ 5. SEO Description & Metadata: ${path.join(releaseDir, 'youtube_metadata.txt')}`);
console.log('\n🎉 ALL YOUTUBE LAUNCH ASSETS ARE READY IN: 02_Assets/youtube_releases/episode_01_meta/');

