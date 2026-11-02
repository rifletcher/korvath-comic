const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const ep1Dir = path.join(rootDir, '02_Assets', 'Episode_01', 'selected');
const ep2Dir = path.join(rootDir, '02_Assets', 'Episode_02', 'selected');
const docsDir = path.join(rootDir, 'docs');
const docsAssetsDir = path.join(docsDir, 'assets');
const ep1DocsAssets = path.join(docsAssetsDir, 'ep1');
const ep2DocsAssets = path.join(docsAssetsDir, 'ep2');

const ep1StoryboardPath = path.join(rootDir, '01_Script', 'episodes', 'episode_01.json');
const ep2StoryboardPath = path.join(rootDir, '01_Script', 'episodes', 'episode_02.json');

function exportForVercel() {
  console.log("🚀 Exporting Korvath Comic (Multi-Issue) for Vercel Deployment...");

  fs.mkdirSync(ep1DocsAssets, { recursive: true });
  fs.mkdirSync(ep2DocsAssets, { recursive: true });
  fs.writeFileSync(path.join(docsDir, '.nojekyll'), '');

  let ep1Storyboard = [];
  if (fs.existsSync(ep1StoryboardPath)) {
    ep1Storyboard = JSON.parse(fs.readFileSync(ep1StoryboardPath, 'utf8'));
  }

  let ep2Storyboard = [];
  if (fs.existsSync(ep2StoryboardPath)) {
    ep2Storyboard = JSON.parse(fs.readFileSync(ep2StoryboardPath, 'utf8'));
  }

  // Copy Episode 1 panels to ep1 and root assets (for backward compat)
  if (fs.existsSync(ep1Dir)) {
    const ep1Files = fs.readdirSync(ep1Dir).filter(f => f.endsWith('.webp')).sort();
    console.log(`📦 Copying ${ep1Files.length} Episode 1 panels to docs/assets/ep1/...`);
    for (const f of ep1Files) {
      fs.copyFileSync(path.join(ep1Dir, f), path.join(ep1DocsAssets, f));
      fs.copyFileSync(path.join(ep1Dir, f), path.join(docsAssetsDir, f));
    }
  }

  // Copy Episode 2 panels
  if (fs.existsSync(ep2Dir)) {
    const ep2Files = fs.readdirSync(ep2Dir).filter(f => f.endsWith('.webp')).sort();
    console.log(`📦 Copying ${ep2Files.length} Episode 2 panels to docs/assets/ep2/...`);
    for (const f of ep2Files) {
      fs.copyFileSync(path.join(ep2Dir, f), path.join(ep2DocsAssets, f));
    }
  }

  const renderPanelsHtml = (panels, epSubdir) => {
    return panels.map(p => {
      const padId = String(p.panelId).padStart(2, '0');
      const filename = `panel_${padId}.webp`;
      return `
      <div class="panel-card" id="panel-${epSubdir}-${p.panelId}">
        <div class="panel-img-wrap">
          <img class="panel-img" 
               src="./assets/${epSubdir}/${filename}" 
               loading="lazy"
               alt="Panel ${p.panelId}: ${p.beat?.name || ''}">
        </div>
        <div class="panel-footer-meta">
          <span class="page-indicator">PANEL ${p.panelId} OF ${panels.length}</span>
          <span>${p.beat?.name || ''}</span>
          <span>${p.camera?.shotType || ''}</span>
        </div>
      </div>`;
    }).join('\n');
  };

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Korvath the Barbarian — Graphic Novel Reader</title>
  <meta name="description" content="A vintage sword-and-sorcery graphic novel comic book saga created in the spirit of Frank Frazetta and John Buscema.">
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
      padding: 20px 32px;
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
      font-size: 13px;
      letter-spacing: 3px;
      color: var(--crimson);
      text-transform: uppercase;
      font-weight: 700;
      margin-top: 2px;
    }
    .issue-selector {
      margin-top: 14px;
      display: flex;
      justify-content: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .issue-btn {
      background: #1c1510;
      border: 1px solid var(--blood-gold);
      color: #ccc;
      padding: 8px 18px;
      border-radius: 4px;
      font-family: inherit;
      cursor: pointer;
      font-size: 12px;
      letter-spacing: 1px;
      text-transform: uppercase;
      font-weight: 700;
      transition: all 0.2s ease;
    }
    .issue-btn:hover {
      background: #2f1d14;
      color: #fff;
      border-color: #ffd166;
    }
    .issue-btn.active {
      background: var(--crimson);
      color: #fff;
      border-color: #ff6b6b;
      box-shadow: 0 0 12px rgba(230, 57, 70, 0.6);
    }
    .comic-page {
      max-width: 1200px;
      margin: 40px auto;
      padding: 0 20px;
      display: flex;
      flex-direction: column;
      gap: 48px;
    }
    .issue-container {
      display: none;
      flex-direction: column;
      gap: 48px;
    }
    .issue-container.active {
      display: flex;
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
    .issue-header-banner {
      background: linear-gradient(180deg, #1f120c 0%, #0c0806 100%);
      border: 2px solid var(--border);
      padding: 24px;
      text-align: center;
      border-radius: 6px;
      margin-bottom: -16px;
    }
    .issue-header-banner h2 {
      font-size: 24px;
      color: var(--blood-gold);
      letter-spacing: 2px;
      text-transform: uppercase;
      margin-bottom: 6px;
    }
    .issue-header-banner p {
      font-size: 14px;
      color: #aaa;
      max-width: 800px;
      margin: 0 auto;
    }
  </style>
</head>
<body>
  <header>
    <h1>Korvath the Barbarian</h1>
    <div class="series-sub">The High Savage Chronicles</div>
    <div class="issue-selector">
      <button class="issue-btn" onclick="showIssue(1)" id="btn-issue-1">Issue #1: The Slumbering Serpent</button>
      <button class="issue-btn active" onclick="showIssue(2)" id="btn-issue-2">Issue #2: The Blood-Thieves of Valkash</button>
    </div>
  </header>

  <main class="comic-page">
    <!-- Issue 1 Container -->
    <section class="issue-container" id="issue-1">
      <div class="issue-header-banner">
        <h2>Issue #1: The Slumbering Serpent of Sarkesh</h2>
        <p>From the frozen crags of the northern wastes strode Korvath—lone wolf, reaver, breaker of chains. In the sun-blasted ruins of Sarkesh, he confronts serpent cultists and ancient horror.</p>
      </div>
      ${renderPanelsHtml(ep1Storyboard, 'ep1')}
    </section>

    <!-- Issue 2 Container -->
    <section class="issue-container active" id="issue-2">
      <div class="issue-header-banner">
        <h2>Issue #2: The Blood-Thieves of Valkash</h2>
        <p>Deep within the thieves' city of Valkash, Korvath and Natari track the treacherous merchant prince Malakor into subterranean vaults where webs drip with demon poison.</p>
      </div>
      ${renderPanelsHtml(ep2Storyboard, 'ep2')}
    </section>
  </main>

  <script>
    function showIssue(num) {
      document.querySelectorAll('.issue-container').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.issue-btn').forEach(el => el.classList.remove('active'));

      const targetIssue = document.getElementById('issue-' + num);
      const targetBtn = document.getElementById('btn-issue-' + num);

      if (targetIssue) targetIssue.classList.add('active');
      if (targetBtn) targetBtn.classList.add('active');

      window.history.replaceState(null, null, '#issue-' + num);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Check hash on load
    if (window.location.hash === '#issue-1') {
      showIssue(1);
    } else {
      showIssue(2);
    }
  </script>
</body>
</html>`;

  fs.writeFileSync(path.join(docsDir, 'index.html'), html, 'utf8');
  console.log(`✅ Multi-Issue Vercel bundle ready: docs/index.html & docs/assets/ created!`);
}

if (require.main === module) {
  exportForVercel();
}

module.exports = { exportForVercel };
