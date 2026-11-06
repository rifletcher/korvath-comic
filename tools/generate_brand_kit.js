const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const FFMPEG_PATH = 'C:\\Users\\robert.fletcher\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg.Essentials_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0.1-essentials_build\\bin\\ffmpeg.exe';
const rootDir = path.join(__dirname, '..');

const brandAssetsDir = path.join(rootDir, '02_Assets', 'branding');
const docsBrandDir = path.join(rootDir, 'docs', 'branding');
fs.mkdirSync(brandAssetsDir, { recursive: true });
fs.mkdirSync(docsBrandDir, { recursive: true });

const modelSheet = path.join(rootDir, '00_Reference', 'sheets', 'char_conan_model_sheet.webp');
const bannerArt = path.join(rootDir, '02_Assets', 'Episode_02', 'selected', 'panel_01.webp');

async function buildBrandKit() {
  console.log('🎨 ===============================================================');
  console.log('⚔️ IRON & INK COMICS: MULTI-PLATFORM BRAND ASSET GENERATOR');
  console.log('🎨 YouTube + TikTok + Instagram + X (Twitter) Production Kit');
  console.log('🎨 ===============================================================\n');

  // 1. Generate Avatar / Profile Picture (800x800)
  console.log('▶️ [1/4] Generating Studio Avatar (800x800 Profile Picture)...');
  const avatarPath = path.join(brandAssetsDir, 'avatar_800x800.jpg');
  const docsAvatar = path.join(docsBrandDir, 'avatar_800x800.jpg');

  // Crop the brooding close-up portrait from the center of the 1920x1280 model sheet
  // Apply enhanced contrast, rich warm saturation, and subtle vignette
  const avatarFilter = `
    crop=720:720:600:180,
    scale=800:800,
    eq=contrast=1.22:brightness=-0.03:saturation=1.25,
    drawbox=x=0:y=0:w=800:h=800:color=0x8b2635@0.8:t=8,
    drawbox=x=8:y=8:w=784:h=784:color=0xfca311@0.9:t=4
  `.replace(/\r?\n\s*/g, '');

  execSync(`"${FFMPEG_PATH}" -y -i "${modelSheet}" -vf "${avatarFilter}" -q:v 2 "${avatarPath}"`, { stdio: 'ignore' });
  fs.copyFileSync(avatarPath, docsAvatar);
  console.log(`   ✅ Avatar ready: ${avatarPath}`);

  // 2. Generate YouTube Channel Banner (2560x1440)
  // Safe area for all devices is the middle 1546x423 (y=508 to 931)
  console.log('\n▶️ [2/4] Generating YouTube Master Banner (2560x1440)...');
  const bannerPath = path.join(brandAssetsDir, 'youtube_banner_2560x1440.jpg');
  const docsBanner = path.join(docsBrandDir, 'youtube_banner_2560x1440.jpg');

  const bannerFilter = `
    scale=2560:1440:force_original_aspect_ratio=increase,
    crop=2560:1440,
    eq=contrast=1.18:brightness=-0.22:saturation=1.2,
    drawbox=x=0:y=500:w=2560:h=440:color=0x0a0a0f@0.72:t=fill,
    drawbox=x=0:y=500:w=2560:h=3:color=0x8b2635:t=fill,
    drawbox=x=0:y=937:w=2560:h=3:color=0x8b2635:t=fill,
    drawtext=text='IRON & INK':fontcolor=0xfca311:fontsize=120:x=(w-text_w)/2:y=560:shadowcolor=black:shadowx=6:shadowy=6,
    drawtext=text='DARK FANTASY & SWORD-AND-SORCERY MOTION COMICS':fontcolor=0xffffff:fontsize=38:x=(w-text_w)/2:y=710:shadowcolor=black:shadowx=3:shadowy=3,
    drawtext=text='ORIGINAL SAGAS  •  PULP AUDIO DRAMAS  •  WEEKLY EPISODES':fontcolor=0xe63946:fontsize=28:x=(w-text_w)/2:y=775:shadowcolor=black:shadowx=2:shadowy=2
  `.replace(/\r?\n\s*/g, '');

  execSync(`"${FFMPEG_PATH}" -y -i "${bannerArt}" -vf "${bannerFilter}" -q:v 2 "${bannerPath}"`, { stdio: 'ignore' });
  fs.copyFileSync(bannerPath, docsBanner);
  console.log(`   ✅ YouTube Banner ready: ${bannerPath}`);

  // 3. Generate Studio Title Card / Video Intro Bumper (1920x1080)
  console.log('\n▶️ [3/4] Generating Cinematic Studio Intro Bumper (1920x1080)...');
  const bumperPath = path.join(brandAssetsDir, 'studio_bumper_1920x1080.jpg');
  const docsBumper = path.join(docsBrandDir, 'studio_bumper_1920x1080.jpg');

  const bumperFilter = `
    scale=1920:1080:force_original_aspect_ratio=increase,
    crop=1920:1080,
    boxblur=16:4,
    eq=brightness=-0.38:contrast=1.2,
    drawbox=x=80:y=80:w=1760:h=920:color=0x8b2635:t=6,
    drawbox=x=96:y=96:w=1728:h=888:color=0xfca311:t=2,
    drawtext=text='AN':fontcolor=0xaaaaaa:fontsize=36:x=(w-text_w)/2:y=380:shadowcolor=black:shadowx=2:shadowy=2,
    drawtext=text='IRON & INK':fontcolor=0xfca311:fontsize=130:x=(w-text_w)/2:y=440:shadowcolor=black:shadowx=6:shadowy=6,
    drawtext=text='PRODUCTION':fontcolor=0xffffff:fontsize=44:x=(w-text_w)/2:y=610:shadowcolor=black:shadowx=3:shadowy=3
  `.replace(/\r?\n\s*/g, '');

  execSync(`"${FFMPEG_PATH}" -y -i "${bannerArt}" -vf "${bumperFilter}" -q:v 2 "${bumperPath}"`, { stdio: 'ignore' });
  fs.copyFileSync(bumperPath, docsBumper);
  console.log(`   ✅ Studio Bumper ready: ${bumperPath}`);

  // 4. Generate Master Social Profiles & Copy-Paste Bio Guide
  console.log('\n▶️ [4/4] Writing Cross-Platform Social Media Templates & Bio Kit...');
  const guideContent = `# ⚔️ IRON & INK COMICS — SOCIAL MEDIA LAUNCH KIT

---

## 🏷️ Brand Identity & Handles

| Platform | Recommended Handle | Direct URL / Name |
| :--- | :--- | :--- |
| **YouTube** | \`@IronAndInkComics\` | [youtube.com/@IronAndInkComics](https://youtube.com) |
| **TikTok** | \`@ironandinkcomics\` | [tiktok.com/@ironandinkcomics](https://tiktok.com) |
| **Instagram** | \`@ironandinkcomics\` | [instagram.com/ironandinkcomics](https://instagram.com) |
| **X (Twitter)** | \`@IronAndInkComic\` | [x.com/IronAndInkComic](https://x.com) |

---

## 📝 Ready-to-Paste Profile Bios

### 1. YouTube Channel Description (About Section)
\`\`\`text
Welcome to Iron & Ink Comics. 

We produce original dark fantasy, sword-and-sorcery, and cosmic horror motion comics. Inspired by the legendary 1970s pulp graphic novels of Frank Frazetta, John Buscema, and Robert E. Howard.

Brutal sagas, cinematic audio dramas, and visceral sequential art.

⚔️ Series:
• Korvath the Barbarian (Season 1)
• The Altar of the Blood-Ruby

🔔 Subscribe for new episodes, motion comics, and dark fantasy audiobooks.
\`\`\`

### 2. TikTok Bio (80 Character Limit)
\`\`\`text
⚔️ Dark Fantasy & Sword-and-Sorcery Motion Comics
🔥 Full episodes on YouTube 👇
[Link to YouTube / Linktree]
\`\`\`

### 3. Instagram Bio (150 Character Limit)
\`\`\`text
IRON & INK COMICS ⚔️
Original Dark Fantasy & Sword-and-Sorcery Motion Comics
🎨 1970s Vintage Pulp Art • Audio Dramas • Cinematic Sagas
Watch full episodes below 👇
\`\`\`

### 4. X (Twitter) Bio (160 Character Limit)
\`\`\`text
Legendary Art. Dark Sagas. Brutal Pulp. ⚔️
Original dark fantasy & sword-and-sorcery motion comics & audio dramas.
Watch the saga on YouTube 👇
\`\`\`

---

## 🏷️ Universal Hashtag Vault (Copy & Paste to Every Post)

### For YouTube Shorts & TikTok:
\`\`\`text
#darkfantasy #motioncomic #swordandsorcery #conan #graphicnovel #frazetta #grimdark #audiodrama #comicbook #fantasyart
\`\`\`

### For Instagram:
\`\`\`text
#darkfantasy #motioncomic #swordandsorcery #conanthebarbarian #graphicnovels #frankfrazetta #pulpfantasy #grimdarkfantasy #indiecomics #digitalcomics #comicart
\`\`\`

---

## 📁 Generated Visual Assets

* **Avatar (800x800):** \`02_Assets/branding/avatar_800x800.jpg\`
* **YouTube Banner (2560x1440):** \`02_Assets/branding/youtube_banner_2560x1440.jpg\`
* **Studio Bumper Card (1920x1080):** \`02_Assets/branding/studio_bumper_1920x1080.jpg\`
* **Web Previews:** \`docs/branding/\`
`;

  const guidePath = path.join(brandAssetsDir, 'brand_guide.md');
  const docsGuidePath = path.join(docsBrandDir, 'brand_guide.md');
  fs.writeFileSync(guidePath, guideContent, 'utf8');
  fs.writeFileSync(docsGuidePath, guideContent, 'utf8');

  console.log(`   ✅ Social Launch Kit written: ${guidePath}`);
  console.log('\n===============================================================');
  console.log('🎉 IRON & INK BRANDING KIT COMPLETE!');
  console.log('===============================================================');
  console.log(`📁 Assets Location: ${brandAssetsDir}`);
  console.log(`🌐 Web Preview:     docs/branding/`);
  console.log('===============================================================\n');
}

buildBrandKit().catch(err => {
  console.error('\n❌ Branding Build Error:', err.message);
  process.exit(1);
});
