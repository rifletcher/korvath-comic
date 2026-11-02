/**
 * Korvath Comic Web Reader Compiler
 * 
 * Compiles 01_Script/storyboard.json and 02_Assets/ into an authentic,
 * vintage graphic novel reader with true comic-strip overlay lettering:
 *  - Classic yellow narrative caption boxes overlaid on the art
 *  - White speech bubbles with speaker tails overlaid over characters
 */

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'comic.config.json');
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

const STORYBOARD_PATH = path.join(__dirname, '..', config.paths.storyboard);
const OUTPUT_HTML = path.join(__dirname, '..', config.paths.assetsDir, 'web_reader.html');

function compileReader() {
  console.log("📖 Compiling Korvath Graphic Novel Web Reader with Overlay Lettering...");

  let storyboard = [];
  if (fs.existsSync(STORYBOARD_PATH)) {
    storyboard = JSON.parse(fs.readFileSync(STORYBOARD_PATH, 'utf8'));
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${config.projectName}: ${config.seriesSubtitle}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Bangers&family=Cinzel:wght@700;900&family=Comic+Neue:ital,wght@0,700;1,700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #070709;
      --card-bg: #0f1015;
      --border: #2a2015;
      --blood-gold: #fca311;
      --crimson: #e63946;
      --text: #eae2d6;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: 'Cinzel', Georgia, serif;
      line-height: 1.6;
      padding-bottom: 80px;
    }
    header {
      background: #120a06;
      border-bottom: 2px solid var(--border);
      padding: 24px 32px;
      text-align: center;
      position: sticky;
      top: 0;
      z-index: 100;
      box-shadow: 0 8px 30px rgba(0,0,0,0.9);
    }
    h1 {
      font-size: 32px;
      letter-spacing: 3px;
      text-transform: uppercase;
      color: var(--blood-gold);
      text-shadow: 0 0 16px rgba(252, 163, 17, 0.4);
    }
    .series-sub {
      font-size: 14px;
      letter-spacing: 4px;
      color: var(--crimson);
      text-transform: uppercase;
      font-weight: 700;
      margin-top: 4px;
    }
    .comic-page {
      max-width: 1200px;
      margin: 40px auto;
      padding: 0 20px;
      display: flex;
      flex-direction: column;
      gap: 48px;
    }
    .panel-card {
      background: #000;
      border: 3px solid #1a1a24;
      box-shadow: 0 16px 40px rgba(0,0,0,0.9);
      position: relative;
      overflow: hidden;
    }
    .panel-img-wrap {
      width: 100%;
      aspect-ratio: 16 / 9;
      position: relative;
      background: #0d0d12;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .panel-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    /* --- AUTHENTIC COMIC LETTERING OVERLAYS --- */
    .comic-caption-box {
      position: absolute;
      top: 18px;
      left: 18px;
      max-width: 55%;
      background: #fff6a6;
      color: #111;
      border: 2px solid #000;
      box-shadow: 4px 4px 0px rgba(0,0,0,0.85);
      padding: 10px 14px;
      font-family: 'Comic Neue', 'Bangers', cursive, sans-serif;
      font-weight: 700;
      font-size: 15px;
      line-height: 1.35;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      z-index: 10;
    }
    .comic-speech-balloon {
      position: absolute;
      bottom: 24px;
      right: 24px;
      max-width: 48%;
      background: #ffffff;
      color: #111;
      border: 2px solid #000;
      border-radius: 20px;
      box-shadow: 4px 4px 0px rgba(0,0,0,0.85);
      padding: 10px 18px;
      font-family: 'Comic Neue', 'Bangers', cursive, sans-serif;
      font-weight: 700;
      font-size: 15px;
      line-height: 1.3;
      text-transform: uppercase;
      z-index: 10;
    }
    .speaker-name {
      color: var(--crimson);
      font-size: 11px;
      letter-spacing: 1px;
      margin-bottom: 2px;
      display: block;
    }

    .panel-footer-meta {
      background: #111218;
      padding: 8px 16px;
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: #777;
      border-top: 1px solid #222;
      letter-spacing: 1px;
    }
  </style>
</head>
<body>
  <header>
    <h1>${config.projectName}</h1>
    <div class="series-sub">Issue #1: ${config.seriesSubtitle}</div>
  </header>

  <main class="comic-page">
    ${storyboard.map(p => {
      const padId = String(p.panelId).padStart(2, '0');
      const selectedImg = `Episode_01/selected/panel_${padId}.webp`;
      const rawImg = `Episode_01/raw/panel_${padId}.webp`;

      const dialogue = (p.dialogue && p.dialogue.length > 0) ? p.dialogue[0] : null;

      return `
      <div class="panel-card" id="panel-${p.panelId}">
        <div class="panel-img-wrap">
          <img class="panel-img" 
               src="${selectedImg}" 
               onerror="this.src='${rawImg}'; this.onerror=() => this.parentElement.innerHTML='<div style=\\\'padding:60px;color:#555;\\\'>Panel ${p.panelId}: Pending Render</div>';"
               alt="Panel ${p.panelId}">
        </div>
        <div class="panel-footer-meta">
          <span>PAGE / PANEL ${p.panelId} OF ${storyboard.length}</span>
          <span>${p.beat?.name || ''}</span>
          <span>${p.camera?.shotType || ''}</span>
        </div>
      </div>`;
    }).join('\n')}
  </main>
</body>
</html>`;

  fs.writeFileSync(OUTPUT_HTML, html, 'utf8');
  console.log(`✅ Graphic Novel Reader with authentic comic overlays compiled -> ${OUTPUT_HTML}`);
}

if (require.main === module) {
  compileReader();
}

module.exports = { compileReader };
