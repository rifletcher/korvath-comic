const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const ep1 = JSON.parse(fs.readFileSync(path.join(rootDir, '01_Script', 'episodes', 'episode_01.json'), 'utf8'));
const ep2 = JSON.parse(fs.readFileSync(path.join(rootDir, '01_Script', 'episodes', 'episode_02.json'), 'utf8'));

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Conan the Barbarian — Studio Comparison: Grok vs Meta AI</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=MedievalSharp&family=Montserrat:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #090a0f;
      --card-bg: #12131b;
      --border-grok: #fca311;
      --border-meta: #00b4d8;
      --text: #eae2d6;
      --gold: #fca311;
      --crimson: #e63946;
      --meta-blue: #00b4d8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: 'Montserrat', sans-serif;
      padding: 30px 20px 80px;
    }
    header {
      text-align: center;
      max-width: 1400px;
      margin: 0 auto 24px;
    }
    .series-title {
      font-family: 'Cinzel', serif;
      font-size: 14px;
      color: var(--crimson);
      letter-spacing: 4px;
      text-transform: uppercase;
      font-weight: 900;
      margin-bottom: 6px;
    }
    h1 {
      font-family: 'Cinzel', serif;
      font-size: 34px;
      color: var(--gold);
      letter-spacing: 2px;
      text-transform: uppercase;
      text-shadow: 0 0 20px rgba(252, 163, 17, 0.4);
    }
    .subtitle {
      font-size: 15px;
      color: #aaa;
      margin-top: 8px;
      letter-spacing: 1px;
    }

    .controls {
      display: flex;
      justify-content: center;
      gap: 14px;
      margin-top: 22px;
      flex-wrap: wrap;
    }
    .btn {
      font-family: 'Cinzel', serif;
      font-size: 13px;
      font-weight: bold;
      padding: 10px 22px;
      border-radius: 6px;
      cursor: pointer;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      transition: all 0.25s ease;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .btn-tab {
      background: #181924;
      border: 1px solid #333;
      color: #bbb;
    }
    .btn-tab.active {
      background: #241910;
      border-color: var(--gold);
      color: var(--gold);
      box-shadow: 0 0 15px rgba(252, 163, 17, 0.35);
    }
    .btn-nav {
      background: #101924;
      border: 1px solid var(--meta-blue);
      color: var(--meta-blue);
    }
    .btn-nav:hover {
      background: #162a3f;
      color: #fff;
    }

    /* MOTION COMIC VIDEO SECTION */
    .video-section {
      max-width: 1100px;
      margin: 0 auto 40px;
      background: #000;
      border: 2px solid #232533;
      border-radius: 10px;
      overflow: hidden;
      box-shadow: 0 20px 60px rgba(0,0,0,0.95);
    }
    .video-header {
      background: #161824;
      padding: 14px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #282a3a;
      flex-wrap: wrap;
      gap: 12px;
    }
    .video-title {
      font-family: 'Cinzel', serif;
      font-size: 16px;
      color: var(--gold);
      letter-spacing: 1.5px;
      text-transform: uppercase;
    }
    .video-switcher {
      display: flex;
      gap: 10px;
    }
    .video-btn {
      padding: 6px 14px;
      font-family: 'Cinzel', serif;
      font-size: 11px;
      font-weight: bold;
      letter-spacing: 1px;
      text-transform: uppercase;
      border-radius: 4px;
      cursor: pointer;
      border: 1px solid #444;
      background: #12131b;
      color: #bbb;
      transition: all 0.2s;
    }
    .video-btn.active.grok {
      background: #241910;
      border-color: var(--gold);
      color: var(--gold);
      box-shadow: 0 0 10px rgba(252, 163, 17, 0.3);
    }
    .video-btn.active.meta {
      background: #0c1a24;
      border-color: var(--meta-blue);
      color: var(--meta-blue);
      box-shadow: 0 0 10px rgba(0, 180, 216, 0.4);
    }
    video {
      width: 100%;
      aspect-ratio: 16 / 9;
      display: block;
      background: #000;
    }
    .video-meta-bar {
      background: #111218;
      padding: 12px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12px;
      color: #999;
      flex-wrap: wrap;
      gap: 10px;
    }
    .video-meta-bar strong {
      color: var(--gold);
    }

    /* VOICE DNA CAST BAR */
    .voice-bar {
      max-width: 1700px;
      margin: 0 auto 30px;
      background: #12131b;
      border: 1px solid #282a3a;
      border-radius: 10px;
      padding: 14px 22px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 14px;
    }
    .voice-title {
      font-family: 'Cinzel', serif;
      font-size: 13px;
      color: var(--gold);
      letter-spacing: 1.5px;
      text-transform: uppercase;
    }
    .voice-chips {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .voice-chip {
      background: #1a1c27;
      border: 1px solid #33374d;
      border-radius: 6px;
      padding: 5px 10px;
      font-size: 11px;
      color: #ccc;
    }
    .voice-chip strong {
      color: var(--gold);
    }
    .voice-chip span.actor {
      color: var(--meta-blue);
      font-weight: 600;
    }

    .comparison-container {
      max-width: 1700px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 50px;
    }
    .issue-section {
      display: none;
      flex-direction: column;
      gap: 50px;
    }
    .issue-section.active {
      display: flex;
    }

    .panel-row {
      background: var(--card-bg);
      border: 1px solid #232533;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 16px 40px rgba(0,0,0,0.7);
    }
    .panel-header-bar {
      background: #181924;
      padding: 14px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #28293a;
      flex-wrap: wrap;
      gap: 10px;
    }
    .panel-title {
      font-family: 'Cinzel', serif;
      font-size: 18px;
      font-weight: 700;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .panel-number {
      background: #e63946;
      color: #fff;
      font-size: 11px;
      padding: 3px 8px;
      border-radius: 4px;
      letter-spacing: 1px;
      font-weight: bold;
    }
    .panel-action {
      padding: 14px 24px;
      background: #0d0e14;
      font-size: 13px;
      line-height: 1.5;
      color: #bbb;
      border-bottom: 1px solid #1c1d28;
    }
    .panel-action strong {
      color: var(--gold);
    }
    .panel-caption-text {
      margin-top: 6px;
      color: #ffd166;
      font-family: 'MedievalSharp', serif;
      font-size: 14px;
    }

    /* AUDIO PLAYER ROW */
    .panel-audio-bar {
      background: #151622;
      padding: 10px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid #222436;
      flex-wrap: wrap;
      gap: 12px;
    }
    .audio-info {
      font-size: 12px;
      color: #bbb;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .audio-info strong {
      color: var(--gold);
    }
    .audio-player-widget audio {
      height: 32px;
      outline: none;
      filter: invert(0.85) hue-rotate(180deg);
    }

    /* DIALOGUE BOX */
    .dialogue-box {
      margin-top: 10px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .dia-line {
      font-size: 12px;
      background: #151722;
      padding: 6px 12px;
      border-radius: 4px;
      border-left: 3px solid var(--gold);
    }
    .dia-speaker {
      font-weight: bold;
      color: var(--gold);
      margin-right: 8px;
    }
    .dia-text {
      color: #e2e2e8;
      font-style: italic;
    }

    .split-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      padding: 20px;
      background: #08090d;
    }
    @media (max-width: 900px) {
      .split-grid { grid-template-columns: 1fr; }
    }

    .edition-col {
      display: flex;
      flex-direction: column;
      border-radius: 8px;
      overflow: hidden;
      border: 2px solid transparent;
      background: #000;
      position: relative;
    }
    .col-grok {
      border-color: rgba(252, 163, 17, 0.45);
    }
    .col-meta {
      border-color: rgba(0, 180, 216, 0.55);
    }
    .edition-tag {
      padding: 10px 16px;
      font-family: 'Cinzel', serif;
      font-size: 13px;
      font-weight: bold;
      letter-spacing: 1px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .tag-grok {
      background: #241910;
      color: var(--gold);
      border-bottom: 1px solid rgba(252, 163, 17, 0.3);
    }
    .tag-meta {
      background: #0c1a24;
      color: var(--meta-blue);
      border-bottom: 1px solid rgba(0, 180, 216, 0.3);
    }
    .image-wrap {
      width: 100%;
      min-height: 400px;
      background: #000;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      cursor: zoom-in;
    }
    .image-wrap img {
      width: 100%;
      height: auto;
      max-height: 80vh;
      object-fit: contain;
      display: block;
      transition: transform 0.25s ease;
    }
    .image-wrap:hover img {
      transform: scale(1.02);
    }

    .pill-badge {
      font-size: 10px;
      padding: 3px 8px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 1px;
      font-weight: bold;
    }
    .pill-grok { background: #3d2508; color: #ffbe0b; }
    .pill-meta { background: #072a3a; color: #48cae4; }

    /* LIGHTBOX MODAL */
    #lightbox {
      display: none;
      position: fixed;
      z-index: 9999;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0,0,0,0.92);
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    #lightbox.active {
      display: flex;
    }
    #lightbox img {
      max-width: 95vw;
      max-height: 95vh;
      object-fit: contain;
      box-shadow: 0 0 40px rgba(0,0,0,0.9);
      border: 2px solid #333;
    }
    #lightbox-caption {
      position: absolute;
      bottom: 24px;
      background: rgba(0,0,0,0.8);
      padding: 8px 20px;
      border-radius: 6px;
      color: #fff;
      font-family: 'Cinzel', serif;
      font-size: 14px;
      letter-spacing: 1px;
    }
    #lightbox-close {
      position: absolute;
      top: 20px;
      right: 30px;
      color: #fff;
      font-size: 32px;
      cursor: pointer;
      user-select: none;
    }
  </style>
</head>
<body>

  <header>
    <div class="series-title">Conan the Barbarian Studio</div>
    <h1>Multi-Comic Studio Comparison</h1>
    <div class="subtitle">Complete Side-by-Side Comparison: Grok Edition vs. Meta AI (2K Frazetta) Edition — with Full Motion Comic Video & Audio</div>

    <div class="controls">
      <button class="btn btn-tab active" id="btn-ep1" onclick="switchEpisode(1)">⚔️ Issue #1: The Slumbering Serpent</button>
      <button class="btn btn-tab" id="btn-ep2" onclick="switchEpisode(2)">🗡️ Issue #2: The Blood-Thieves of Valkash</button>
      <a href="./index.html" class="btn btn-nav">📖 Graphic Novel Reader</a>
      <a href="./video_preview.html" class="btn btn-nav">🎬 Standalone Video Theater</a>
    </div>
  </header>

  <!-- DUAL MOTION COMIC MOVIE PLAYER -->
  <section class="video-section">
    <div class="video-header">
      <div class="video-title">🎬 Motion Comic Movie Player (Dual Edition)</div>
      <div class="video-switcher">
        <button class="video-btn active grok" id="vbtn-grok" onclick="switchVideoEdition('grok')">🎨 Grok Video</button>
        <button class="video-btn meta" id="vbtn-meta" onclick="switchVideoEdition('meta')">🌟 Meta AI (2K Frazetta) Video</button>
      </div>
    </div>
    <video id="dual-video-player" controls playsinline poster="./assets/ep2/panel_01.webp">
      <source id="video-src" src="./episode_02_motion_comic.mp4" type="video/mp4">
      Your browser does not support the video tag.
    </video>
    <div class="video-meta-bar">
      <span><strong>Track:</strong> <span id="video-edition-label">Grok Edition</span> (Full 20-Panel Cinematic Motion Comic)</span>
      <span><strong>Voices:</strong> Brian (Korvath Kratos DSP) • Sarah (Natari) • Charlie (Lord Malakor)</span>
    </div>
  </section>

  <!-- CANONICAL VOICE CAST DNA -->
  <div class="voice-bar">
    <div class="voice-title">🎙️ Canonical Voice Cast & DSP Engine:</div>
    <div class="voice-chips">
      <div class="voice-chip">
        <strong>Korvath:</strong> <span class="actor">Subterranean Kratos</span> (Brian -12% Pitch + 8dB Sub-Bass)
      </div>
      <div class="voice-chip">
        <strong>Natari:</strong> <span class="actor">Sarah</span> (Sultry Rogue / Terrified Screams)
      </div>
      <div class="voice-chip">
        <strong>Lord Malakor:</strong> <span class="actor">Charlie</span> (Charles Dance Silk Prince)
      </div>
      <div class="voice-chip">
        <strong>Spider Assassin:</strong> <span class="actor">George</span> (Whispered Hiss)
      </div>
      <div class="voice-chip">
        <strong>Narrator:</strong> <span class="actor">The Dark Bard</span> (Brian Cinematic Trailer Actor)
      </div>
    </div>
  </div>

  <main class="comparison-container">

    <!-- ISSUE 1 -->
    <section class="issue-section active" id="sec-issue-1">
      ${ep1.map(p => {
        const pad = String(p.panelId).padStart(2, '0');
        const hasDialogue = p.dialogue && p.dialogue.length > 0;
        return `
        <article class="panel-row" id="panel-ep1-${p.panelId}">
          <div class="panel-header-bar">
            <div class="panel-title">
              <span class="panel-number">PANEL ${p.panelId} / 20</span>
              <span>${p.beat?.name || 'Scene ' + p.panelId}</span>
            </div>
            <div style="font-size:12px; color:#888;">${p.camera?.shotType || ''}</div>
          </div>
          <div class="panel-action">
            <strong>Action:</strong> ${p.action}
            ${p.caption ? `<div class="panel-caption-text">📜 "${p.caption}"</div>` : ''}
            ${hasDialogue ? `
              <div class="dialogue-box">
                ${p.dialogue.map(d => `
                  <div class="dia-line">
                    <span class="dia-speaker">${d.speaker}:</span>
                    <span class="dia-text">"${d.text}"</span>
                  </div>
                `).join('')}
              </div>
            ` : ''}
          </div>
          <div class="split-grid">
            <!-- GROK -->
            <div class="edition-col col-grok">
              <div class="edition-tag tag-grok">
                <span>🎨 Grok Edition</span>
                <span class="pill-badge pill-grok">Original</span>
              </div>
              <div class="image-wrap" onclick="openLightbox('./assets/ep1/panel_${pad}.webp', 'Issue 1 Panel ${p.panelId} — Grok Edition')">
                <img src="./assets/ep1/panel_${pad}.webp" loading="lazy" alt="Issue 1 Panel ${p.panelId} Grok">
              </div>
            </div>
            <!-- META AI -->
            <div class="edition-col col-meta">
              <div class="edition-tag tag-meta">
                <span>🌟 Meta AI Edition</span>
                <span class="pill-badge pill-meta">2K Frazetta</span>
              </div>
              <div class="image-wrap" onclick="openLightbox('./assets/ep1_meta/panel_${pad}.webp', 'Issue 1 Panel ${p.panelId} — Meta AI Edition')">
                <img src="./assets/ep1_meta/panel_${pad}.webp" loading="lazy" alt="Issue 1 Panel ${p.panelId} Meta AI">
              </div>
            </div>
          </div>
        </article>
        `;
      }).join('')}
    </section>

    <!-- ISSUE 2 -->
    <section class="issue-section" id="sec-issue-2">
      ${ep2.map(p => {
        const pad = String(p.panelId).padStart(2, '0');
        const hasDialogue = p.dialogue && p.dialogue.length > 0;
        return `
        <article class="panel-row" id="panel-ep2-${p.panelId}">
          <div class="panel-header-bar">
            <div class="panel-title">
              <span class="panel-number">PANEL ${p.panelId} / 20</span>
              <span>${p.beat?.name || 'Scene ' + p.panelId}</span>
            </div>
            <div style="font-size:12px; color:#888;">${p.camera?.shotType || ''}</div>
          </div>
          <div class="panel-action">
            <strong>Action:</strong> ${p.action}
            ${p.caption ? `<div class="panel-caption-text">📜 "${p.caption}"</div>` : ''}
            ${hasDialogue ? `
              <div class="dialogue-box">
                ${p.dialogue.map(d => `
                  <div class="dia-line">
                    <span class="dia-speaker">${d.speaker}:</span>
                    <span class="dia-text">"${d.text}"</span>
                  </div>
                `).join('')}
              </div>
            ` : ''}
          </div>
          <!-- AUDIO PLAYER BAR -->
          <div class="panel-audio-bar">
            <div class="audio-info">
              <span>🎙️ <strong>Master Audio & Voice Track:</strong> ${hasDialogue ? p.dialogue.map(d => d.speaker).join(' & ') : 'Narration'} + Dynamic SFX & Ambient Score</span>
            </div>
            <div class="audio-player-widget">
              <audio controls preload="none" src="./assets/audio/ep2/p${pad}_mixed.mp3"></audio>
            </div>
          </div>
          <div class="split-grid">
            <!-- GROK -->
            <div class="edition-col col-grok">
              <div class="edition-tag tag-grok">
                <span>🎨 Grok Edition</span>
                <span class="pill-badge pill-grok">Original</span>
              </div>
              <div class="image-wrap" onclick="openLightbox('./assets/ep2/panel_${pad}.webp', 'Issue 2 Panel ${p.panelId} — Grok Edition')">
                <img src="./assets/ep2/panel_${pad}.webp" loading="lazy" alt="Issue 2 Panel ${p.panelId} Grok">
              </div>
            </div>
            <!-- META AI -->
            <div class="edition-col col-meta">
              <div class="edition-tag tag-meta">
                <span>🌟 Meta AI Edition</span>
                <span class="pill-badge pill-meta">2K Frazetta</span>
              </div>
              <div class="image-wrap" onclick="openLightbox('./assets/ep2_meta/panel_${pad}.webp', 'Issue 2 Panel ${p.panelId} — Meta AI Edition')">
                <img src="./assets/ep2_meta/panel_${pad}.webp" loading="lazy" alt="Issue 2 Panel ${p.panelId} Meta AI">
              </div>
            </div>
          </div>
        </article>
        `;
      }).join('')}
    </section>
  </main>

  <!-- LIGHTBOX -->
  <div id="lightbox" onclick="closeLightbox()">
    <span id="lightbox-close">&times;</span>
    <img id="lightbox-img" src="" alt="Zoomed Panel">
    <div id="lightbox-caption"></div>
  </div>

  <script>
    function switchEpisode(epNum) {
      document.getElementById('sec-issue-1').classList.toggle('active', epNum === 1);
      document.getElementById('sec-issue-2').classList.toggle('active', epNum === 2);
      document.getElementById('btn-ep1').classList.toggle('active', epNum === 1);
      document.getElementById('btn-ep2').classList.toggle('active', epNum === 2);
      window.scrollTo({ top: document.querySelector('.comparison-container').offsetTop - 30, behavior: 'smooth' });
    }

    function switchVideoEdition(edition) {
      const player = document.getElementById('dual-video-player');
      const label = document.getElementById('video-edition-label');
      const btnGrok = document.getElementById('vbtn-grok');
      const btnMeta = document.getElementById('vbtn-meta');
      const currentTime = player.currentTime;
      const isPaused = player.paused;

      if (edition === 'meta') {
        player.src = './episode_02_meta_motion_comic.mp4';
        label.innerText = 'Meta AI Edition (2K Frank Frazetta Artwork)';
        btnMeta.classList.add('active');
        btnGrok.classList.remove('active');
      } else {
        player.src = './episode_02_motion_comic.mp4';
        label.innerText = 'Grok Edition (Original Motion Comic)';
        btnGrok.classList.add('active');
        btnMeta.classList.remove('active');
      }

      player.currentTime = currentTime;
      if (!isPaused) player.play();
    }

    function openLightbox(src, caption) {
      document.getElementById('lightbox-img').src = src;
      document.getElementById('lightbox-caption').innerText = caption;
      document.getElementById('lightbox').classList.add('active');
    }
    function closeLightbox() {
      document.getElementById('lightbox').classList.remove('active');
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeLightbox();
    });
  </script>
</body>
</html>
`;

fs.writeFileSync(path.join(rootDir, 'docs', 'compare_grok_meta.html'), html, 'utf8');
console.log('✅ Generated unified docs/compare_grok_meta.html with dual motion comic video and audio successfully!');
