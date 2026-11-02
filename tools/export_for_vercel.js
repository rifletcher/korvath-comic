const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const selectedDir = path.join(rootDir, '02_Assets', 'Episode_01', 'selected');
const docsDir = path.join(rootDir, 'docs');
const docsAssetsDir = path.join(docsDir, 'assets');
const storyboardPath = path.join(rootDir, '01_Script', 'storyboard.json');

function exportForVercel() {
  console.log("🚀 Exporting Korvath Comic for Vercel Deployment...");

  fs.mkdirSync(docsAssetsDir, { recursive: true });
  fs.writeFileSync(path.join(docsDir, '.nojekyll'), '');

  let storyboard = [];
  if (fs.existsSync(storyboardPath)) {
    storyboard = JSON.parse(fs.readFileSync(storyboardPath, 'utf8'));
  }

  // Copy all available panels
  const panelFiles = fs.readdirSync(selectedDir).filter(f => f.endsWith('.webp')).sort();
  console.log(`📦 Copying ${panelFiles.length} panels to docs/assets/...`);
  for (const f of panelFiles) {
    fs.copyFileSync(path.join(selectedDir, f), path.join(docsAssetsDir, f));
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Korvath the Barbarian — Issue #1: The Slumbering Serpent of Sarkesh</title>
  <meta name="description" content="A 20-page vintage sword-and-sorcery graphic novel comic book issue.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Bangers&family=Cinzel:wght@700;900&family=Comic+Neue:wght@700&display=swap" rel="stylesheet">
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
    .controls {
      margin-top: 12px;
      display: flex;
      justify-content: center;
      gap: 16px;
    }
    .btn {
      background: #2a1c13;
      border: 1px solid var(--blood-gold);
      color: #fff;
      padding: 6px 16px;
      border-radius: 4px;
      font-family: inherit;
      cursor: pointer;
      font-size: 12px;
      letter-spacing: 1px;
      text-transform: uppercase;
      transition: background 0.2s;
    }
    .btn:hover {
      background: var(--crimson);
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
      border-radius: 4px;
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
    .panel-footer-meta {
      background: #111218;
      padding: 10px 18px;
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      color: #888;
      border-top: 1px solid #222;
      letter-spacing: 1px;
    }
    .page-indicator {
      color: var(--blood-gold);
      font-weight: bold;
    }
  </style>
</head>
<body>
  <header>
    <h1>Korvath the Barbarian</h1>
    <div class="series-sub">Issue #1: The Slumbering Serpent of Sarkesh</div>
  </header>

  <main class="comic-page">
    ${storyboard.map(p => {
      const padId = String(p.panelId).padStart(2, '0');
      const filename = `panel_${padId}.webp`;
      return `
      <div class="panel-card" id="panel-${p.panelId}">
        <div class="panel-img-wrap">
          <img class="panel-img" 
               src="./assets/${filename}" 
               loading="lazy"
               alt="Panel ${p.panelId}: ${p.beat?.name || ''}">
        </div>
        <div class="panel-footer-meta">
          <span class="page-indicator">PANEL ${p.panelId} OF ${storyboard.length}</span>
          <span>${p.beat?.name || ''}</span>
          <span>${p.camera?.shotType || ''}</span>
        </div>
      </div>`;
    }).join('\n')}
  </main>
</body>
</html>`;

  fs.writeFileSync(path.join(docsDir, 'index.html'), html, 'utf8');
  console.log(`✅ Vercel bundle ready: docs/index.html & docs/assets/ created!`);
}

if (require.main === module) {
  exportForVercel();
}

module.exports = { exportForVercel };

