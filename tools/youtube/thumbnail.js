/**
 * Per-episode YouTube thumbnail: a key panel from the episode, cropped to
 * 1280x720 with a darkened lower band and the episode title lettered on it.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..', '..');

const FONT_CANDIDATES = [
  'C:/Windows/Fonts/impact.ttf',
  'C:/Windows/Fonts/arialbd.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf',
  '/System/Library/Fonts/Supplemental/Impact.ttf'
];

function findFont() {
  return FONT_CANDIDATES.find(f => fs.existsSync(f)) || '';
}

// ffmpeg filter arguments need ':' and '\' escaped (Windows drive letters).
function filterPath(p) {
  return p.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

function panelImagePath(projectId, episodeId, panel) {
  const candidates = [];
  if (panel.imagePath) candidates.push(path.isAbsolute(panel.imagePath) ? panel.imagePath : path.join(rootDir, panel.imagePath));
  const pad = String(panel.panelId).padStart(2, '0');
  candidates.push(path.join(rootDir, 'projects', projectId, 'episodes', episodeId, 'panels', `panel_${pad}.webp`));
  return candidates.find(p => fs.existsSync(p)) || '';
}

// Picks the most thumbnail-worthy panel: dramatic shot types, both leads in
// frame, later in the story (but not the final page), well rated by QA.
function pickThumbnailPanel(manifest, projectId, episodeId) {
  const panels = (manifest.panels || []).filter(p => panelImagePath(projectId, episodeId, p));
  if (panels.length === 0) return null;
  let best = null;
  panels.forEach((p, idx) => {
    const text = `${p.shotType || ''} ${p.name || ''} ${p.summary || ''}`;
    let score = 0;
    if (/splash|heroic|epic|showdown|climax|confront|battle|duel|clash|action|charge|leap|monster|reveal/i.test(text)) score += 4;
    if (/close.?up|portrait|hero shot|low.?angle/i.test(text)) score += 2;
    if (/establishing|landscape|aftermath|walks? away|silhouette|dialogue|tavern|map/i.test(text)) score -= 2;
    score += Math.min((p.characters || []).length, 3);
    const pos = idx / Math.max(1, panels.length - 1);
    if (pos >= 0.4 && pos <= 0.9) score += 2;
    if (typeof p.qaScore === 'number') score += p.qaScore / 5;
    if (!best || score > best.score) best = { panel: p, score };
  });
  return best.panel;
}

function splitTitle(title, maxLen = 18) {
  const words = String(title || '').toUpperCase().split(/\s+/).filter(Boolean);
  const lines = [''];
  for (const w of words) {
    const cur = lines[lines.length - 1];
    if ((cur + ' ' + w).trim().length > maxLen && cur && lines.length < 2) lines.push(w);
    else lines[lines.length - 1] = (cur + ' ' + w).trim();
  }
  return lines;
}

// "Issue #2: The Shadow of the Spider [Grok Imagine]" -> { kicker: "ISSUE #2", title: "The Shadow of the Spider" }
function splitEpisodeTitle(rawTitle, episodeNumber) {
  const t = String(rawTitle || '').replace(/\s*\[[^\]]*\]\s*$/, '').trim();
  const m = t.match(/^(issue|episode|chapter|part)\s*#?\s*(\d+)\s*[:\-–—]\s*(.+)$/i);
  if (m) return { kicker: `${m[1].toUpperCase()} #${m[2]}`, title: m[3] };
  return { kicker: episodeNumber ? `EPISODE ${episodeNumber}` : '', title: t };
}

function generateThumbnail({ projectId, episodeId, panelId, seriesTitle } = {}) {
  const manifestPath = path.join(rootDir, 'projects', projectId, 'episodes', episodeId, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const panel = panelId
    ? (manifest.panels || []).find(p => Number(p.panelId) === Number(panelId))
    : pickThumbnailPanel(manifest, projectId, episodeId);
  if (!panel) throw new Error(`No rendered panel found for the thumbnail in ${projectId}/${episodeId}`);
  const src = panelImagePath(projectId, episodeId, panel);
  if (!src) throw new Error(`Panel #${panel.panelId} has no image yet`);

  if (!seriesTitle) {
    try {
      seriesTitle = JSON.parse(fs.readFileSync(path.join(rootDir, 'projects', projectId, 'project.json'), 'utf8')).title || '';
    } catch (_) { seriesTitle = ''; }
  }

  const outDir = path.join(rootDir, 'projects', projectId, 'episodes', episodeId, 'video');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'youtube_thumbnail.jpg');

  const { kicker, title } = splitEpisodeTitle(manifest.title, manifest.episodeNumber);
  const lines = splitTitle(title);
  const font = findFont();

  const filters = [
    'scale=1280:720:force_original_aspect_ratio=increase',
    'crop=1280:720',
    'eq=contrast=1.15:saturation=1.2:brightness=-0.02',
    'drawbox=x=0:y=ih*0.60:w=iw:h=ih*0.40:color=black@0.55:t=fill'
  ];
  const tmpFiles = [];
  if (font) {
    const textFile = (txt) => {
      const f = path.join(os.tmpdir(), `thumb_${process.pid}_${tmpFiles.length}.txt`);
      fs.writeFileSync(f, txt, 'utf8');
      tmpFiles.push(f);
      return filterPath(f);
    };
    const ff = filterPath(font);
    // Approximate glyph width per font so the longest line always fits 1180px.
    const widthFactor = /impact/i.test(font) ? 0.50 : /arialbd/i.test(font) ? 0.63 : 0.68;
    const longest = Math.max(...lines.map(l => l.length), 1);
    const big = Math.max(40, Math.min(lines.length > 1 ? 76 : 92, Math.floor(1180 / (longest * widthFactor))));
    const baseY = lines.length > 1 ? 720 - 40 - big * 2 - 8 : 720 - 60 - big;
    if (kicker || seriesTitle) {
      const k = [String(seriesTitle || '').toUpperCase(), kicker].filter(Boolean).join('  •  ');
      filters.push(`drawtext=fontfile='${ff}':textfile='${textFile(k)}':fontsize=34:fontcolor=0xF5B83D:borderw=3:bordercolor=black:x=48:y=${baseY - 52}`);
    }
    lines.forEach((ln, i) => {
      filters.push(`drawtext=fontfile='${ff}':textfile='${textFile(ln)}':fontsize=${big}:fontcolor=white:borderw=5:bordercolor=black:x=48:y=${baseY + i * (big + 8)}`);
    });
  }

  try {
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', src, '-vf', filters.join(','), '-frames:v', '1', '-q:v', '3', outPath], { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (err) {
    const detail = err.stderr ? String(err.stderr).trim().split('\n').slice(-2).join(' ') : err.message;
    throw new Error(`Thumbnail render failed: ${detail}`);
  } finally {
    for (const f of tmpFiles) { try { fs.unlinkSync(f); } catch (_) {} }
  }

  const rel = path.relative(rootDir, outPath).replace(/\\/g, '/');
  return { path: outPath, relPath: rel, panelId: panel.panelId, panelName: panel.name || '', lettered: Boolean(font), title, kicker };
}

module.exports = { generateThumbnail, pickThumbnailPanel, splitEpisodeTitle };
