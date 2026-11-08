const fs = require('fs');
const path = require('path');

function buildEp2Review() {
  const root = path.join(__dirname, '..');
  const epFile = path.join(root, '01_Script', 'episodes', 'episode_02.json');
  const ep = JSON.parse(fs.readFileSync(epFile, 'utf8'));

  let panelsHtml = '';
  ep.forEach(p => {
    const pad = String(p.panelId).padStart(2, '0');
    const imgPath = `./assets/ep2_meta/panel_${pad}.webp`;
    const chars = (p.characters || []).join(', ');
    const dialogueHtml = (p.dialogue || []).map(d => `
      <div class="speech-quote">
        <span class="speaker">${d.speaker}:</span> "${d.text}"
      </div>
    `).join('');

    panelsHtml += `
      <article class="panel-card" id="panel-${pad}">
        <div class="panel-header">
          <div class="panel-title-group">
            <span class="panel-badge">Panel ${pad}</span>
            <span class="beat-act">${p.beat?.act || 'Act'}</span>
            <h2 class="panel-heading">${p.beat?.name || 'Scene'}</h2>
          </div>
          <div class="panel-chars">${chars}</div>
        </div>

        <div class="panel-img-wrap" onclick="openLightbox('${imgPath}', 'Panel ${pad}: ${p.beat?.name || ''}')">
          <img src="${imgPath}" alt="Panel ${pad}: ${p.beat?.name}" class="panel-img" loading="lazy" />
          <div class="zoom-hint">🔍 Click to inspect (Full 2K)</div>
        </div>

        <div class="panel-body">
          <div class="caption-box">
            <div class="caption-label">📜 Narrative Caption</div>
            <div class="caption-text">"${p.caption}"</div>
          </div>
          ${dialogueHtml ? `<div class="dialogue-box">${dialogueHtml}</div>` : ''}
          <div class="action-desc"><strong>Action:</strong> ${p.action}</div>
        </div>
      </article>
    `;
  });

  const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Korvath Episode 2: The Blood-Thieves of Valkash — Visual Director Review Deck</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=Montserrat:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #070709;
      --card: #101118;
      --border: #222533;
      --gold: #fca311;
      --crimson: #e63946;
      --meta-blue: #00b4d8;
      --emerald: #2ec4b6;
      --text: #eae2d6;
      --muted: #8b8f9e;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: 'Montserrat', sans-serif;
      padding-bottom: 100px;
      line-height: 1.6;
    }
    header {
      background: #111218;
      border-bottom: 2px solid var(--border);
      padding: 24px 32px;
      text-align: center;
      position: sticky;
      top: 0;
      z-index: 1000;
      box-shadow: 0 10px 30px rgba(0,0,0,0.9);
    }
    .series-sub {
      font-family: 'Cinzel', serif;
      font-size: 13px;
      letter-spacing: 4px;
      color: var(--crimson);
      text-transform: uppercase;
      font-weight: 900;
    }
    h1 {
      font-family: 'Cinzel', serif;
      font-size: 28px;
      letter-spacing: 2px;
      color: var(--gold);
      text-transform: uppercase;
      margin: 6px 0 12px;
      text-shadow: 0 0 16px rgba(252, 163, 17, 0.4);
    }
    .header-nav {
      display: flex;
      justify-content: center;
      gap: 12px;
      margin-top: 10px;
      flex-wrap: wrap;
    }
    .nav-btn {
      padding: 8px 18px;
      border-radius: 6px;
      text-decoration: none;
      font-size: 13px;
      font-weight: 600;
      transition: all 0.2s ease;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .btn-ep1 {
      background: #161822;
      color: var(--muted);
      border: 1px solid var(--border);
    }
    .btn-ep1:hover {
      color: #fff;
      border-color: #444;
    }
    .btn-ep2 {
      background: rgba(252, 163, 17, 0.15);
      color: var(--gold);
      border: 1px solid var(--gold);
    }

    .status-banner {
      max-width: 1200px;
      margin: 28px auto 0;
      padding: 20px 24px;
      background: #12141d;
      border: 1px solid #282d40;
      border-left: 5px solid var(--emerald);
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.6);
    }
    .banner-title {
      font-family: 'Cinzel', serif;
      font-size: 18px;
      color: var(--emerald);
      font-weight: 900;
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 8px;
    }
    .banner-desc {
      font-size: 14px;
      color: #c0c4d4;
    }
    .gate-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 12px;
      margin-top: 14px;
    }
    .gate-item {
      background: #0b0c10;
      padding: 10px 14px;
      border-radius: 6px;
      font-size: 12px;
      border: 1px solid #1a1e2c;
      color: #aaa;
    }
    .gate-item strong {
      color: #fff;
      display: block;
      margin-bottom: 2px;
    }

    .gallery-container {
      max-width: 1200px;
      margin: 40px auto 0;
      padding: 0 20px;
      display: flex;
      flex-direction: column;
      gap: 48px;
    }
    .panel-card {
      background: var(--card);
      border: 2px solid var(--border);
      border-radius: 10px;
      overflow: hidden;
      box-shadow: 0 16px 40px rgba(0,0,0,0.8);
      transition: border-color 0.25s ease;
    }
    .panel-card:hover {
      border-color: #3d425c;
    }
    .panel-header {
      background: #161824;
      padding: 14px 22px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #202336;
      flex-wrap: wrap;
      gap: 10px;
    }
    .panel-title-group {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .panel-badge {
      background: var(--crimson);
      color: #fff;
      font-family: 'Cinzel', serif;
      font-size: 12px;
      font-weight: 900;
      padding: 4px 10px;
      border-radius: 4px;
      letter-spacing: 1px;
    }
    .beat-act {
      font-size: 12px;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .panel-heading {
      font-family: 'Cinzel', serif;
      font-size: 18px;
      color: var(--gold);
      letter-spacing: 1px;
    }
    .panel-chars {
      font-size: 12px;
      color: #7b8196;
      background: #0c0d12;
      padding: 4px 10px;
      border-radius: 4px;
      border: 1px solid #1c1e2b;
    }

    .panel-img-wrap {
      position: relative;
      cursor: zoom-in;
      background: #000;
      overflow: hidden;
    }
    .panel-img {
      width: 100%;
      height: auto;
      display: block;
      transition: transform 0.3s ease;
    }
    .panel-img:hover {
      transform: scale(1.015);
    }
    .zoom-hint {
      position: absolute;
      bottom: 12px;
      right: 14px;
      background: rgba(0,0,0,0.75);
      color: #fff;
      font-size: 11px;
      padding: 4px 10px;
      border-radius: 4px;
      backdrop-filter: blur(4px);
      pointer-events: none;
    }

    .panel-body {
      padding: 20px 24px;
      display: flex;
      flex-direction: column;
      gap: 14px;
      background: #0e0f15;
    }
    .caption-box {
      background: #19140a;
      border-left: 4px solid var(--gold);
      padding: 10px 16px;
      border-radius: 4px;
    }
    .caption-label {
      font-size: 11px;
      color: var(--gold);
      text-transform: uppercase;
      letter-spacing: 1px;
      font-weight: bold;
      margin-bottom: 2px;
    }
    .caption-text {
      font-size: 15px;
      color: #f0e6d6;
      font-style: italic;
    }
    .dialogue-box {
      background: #141724;
      border-left: 4px solid var(--meta-blue);
      padding: 10px 16px;
      border-radius: 4px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .speech-quote {
      font-size: 14px;
      color: #d8e2fd;
    }
    .speaker {
      color: var(--meta-blue);
      font-weight: bold;
    }
    .action-desc {
      font-size: 13px;
      color: #9297a8;
      line-height: 1.5;
    }

    /* LIGHTBOX */
    #lightbox {
      display: none;
      position: fixed;
      top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(0, 0, 0, 0.95);
      z-index: 99999;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    #lightbox.active { display: flex; }
    #lightbox-img {
      max-width: 95vw;
      max-height: 92vh;
      object-fit: contain;
      border: 2px solid #333;
      box-shadow: 0 0 60px rgba(0,0,0,0.9);
    }
    #lightbox-caption {
      position: absolute;
      bottom: 20px;
      background: rgba(0,0,0,0.85);
      color: #fff;
      padding: 8px 24px;
      border-radius: 6px;
      font-family: 'Cinzel', serif;
      font-size: 14px;
    }
    #lightbox-close {
      position: absolute;
      top: 20px; right: 30px;
      color: #fff;
      font-size: 38px;
      cursor: pointer;
    }
  </style>
</head>
<body>

  <header>
    <div class="series-sub">Conan the Barbarian Studio &bull; Visual Director Review Deck</div>
    <h1>Episode 2: The Blood-Thieves of Valkash</h1>
    <div class="header-nav">
      <a href="./index.html" class="nav-btn btn-ep1">🎬 Episode 1 (Master Video)</a>
      <a href="#panel-01" class="nav-btn btn-ep2">🖼️ Episode 2 (20 Visual Panels Ready)</a>
      <a href="./compare_grok_meta.html" class="nav-btn btn-ep1">⚖️ Grok vs Meta AI Split View</a>
    </div>
  </header>

  <div class="status-banner">
    <div class="banner-title">
      <span>🛡️ 8-Point Visual Director Continuity Gate &bull; 100% Complete</span>
    </div>
    <div class="banner-desc">
      All 20 panels for Episode 2 have been generated via Meta AI in 1920&times;1280 2K masterwork Frazetta/Buscema graphic novel style. 
      <strong>Audio voice acting and video animation are intentionally on hold</strong> pending your visual review and sign-off.
    </div>

    <div class="gate-grid">
      <div class="gate-item">
        <strong>1. Wardrobe & The Mantle Rule</strong>
        Korvath wears his canonical ragged wolf-fur mantle, cross-chest harness & war kilt in every scene.
      </div>
      <div class="gate-item">
        <strong>2. Facial Likeness & Human Sanity</strong>
        Chiseled jaw, dark scruff stubble, intense wolfish eyes, natural wavy dark hair (NO ape-brow, NO bangs).
      </div>
      <div class="gate-item">
        <strong>3. Carried Object Permanence</strong>
        Straight 42" two-handed broadsword with central fuller; Blood-Ruby in black iron serpent talon claw.
      </div>
      <div class="gate-item">
        <strong>4. Lettering & Graphic Novel Art</strong>
        Clean vintage yellow caption boxes, authentic speech balloons, rich chiaroscuro cel shading.
      </div>
    </div>
  </div>

  <main class="gallery-container">
    ${panelsHtml}
  </main>

  <div id="lightbox" onclick="closeLightbox()">
    <span id="lightbox-close">&times;</span>
    <img id="lightbox-img" src="" alt="Zoomed view" />
    <div id="lightbox-caption"></div>
  </div>

  <script>
    function openLightbox(src, caption) {
      document.getElementById('lightbox-img').src = src;
      document.getElementById('lightbox-caption').innerText = caption;
      document.getElementById('lightbox').classList.add('active');
    }
    function closeLightbox() {
      document.getElementById('lightbox').classList.remove('active');
    }
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeLightbox();
    });
  </script>
</body>
</html>`;

  const outFile = path.join(root, 'docs', 'episode_02_review.html');
  fs.writeFileSync(outFile, fullHtml, 'utf8');
  console.log(`✅ Built Episode 2 Review Gallery -> ${outFile}`);
}

buildEp2Review();
