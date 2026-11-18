/**
 * YouTube Data API v3 Resumable Uploader for the comic studio
 * Zero-dependency pure Node.js implementation:
 * - OAuth 2.0 Web Auth Server on localhost:8485 with offline refresh token
 * - YouTube Resumable Chunked Upload Protocol with live % progress
 * - High-CTR 1280x720 Custom Thumbnail Upload
 * - Automatic Chapter Timestamps, SEO Tags & Cast Description Generation
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const url = require('url');
const { exec, execSync } = require('child_process');
const { generateThumbnail } = require('./thumbnail');
const { updateManifestLocked } = require('../lib/manifest_lock');

const rootDir = path.resolve(__dirname, '..', '..');
const credsDir = path.join(rootDir, '.credentials');
const clientSecretPath = path.join(credsDir, 'client_secret.json');
const tokenPath = path.join(credsDir, 'youtube_token.json');

const OAUTH_PORT = 8485;
const REDIRECT_URI = `http://localhost:${OAUTH_PORT}/oauth2callback`;
const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube'
].join(' ');

// Helper for HTTP/HTTPS requests
function makeRequest(reqUrl, options, bodyData) {
  return new Promise((resolve, reject) => {
    const parsed = new url.URL(reqUrl);
    const lib = parsed.protocol === 'https:' ? https : http;

    const reqOpts = {
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = lib.request(reqOpts, (res) => {
      let data = [];
      res.on('data', chunk => data.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(data);
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: buffer.toString('utf8'),
          raw: buffer
        });
      });
    });

    req.on('error', reject);

    if (bodyData) {
      if (typeof bodyData.pipe === 'function') {
        bodyData.pipe(req);
        return;
      }
      req.write(bodyData);
    }
    req.end();
  });
}

// 1. Load or Validate Client Secret
function getClientCredentials() {
  if (!fs.existsSync(clientSecretPath)) {
    return null;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(clientSecretPath, 'utf8'));
    const config = raw.installed || raw.web;
    if (!config || !config.client_id || !config.client_secret) {
      return null;
    }
    return {
      clientId: config.client_id,
      clientSecret: config.client_secret
    };
  } catch (e) {
    return null;
  }
}

// 2. Refresh or Retrieve Valid Access Token
async function getAccessToken(creds) {
  if (!fs.existsSync(tokenPath)) {
    return null;
  }
  let tokenData;
  try {
    tokenData = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
  } catch (e) {
    return null;
  }

  // Check if current access token is valid (with 60s buffer)
  if (tokenData.access_token && tokenData.expiry_date && Date.now() < (tokenData.expiry_date - 60000)) {
    return tokenData.access_token;
  }

  // Refresh token
  if (!tokenData.refresh_token) {
    return null;
  }

  const postParams = new url.URLSearchParams({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    refresh_token: tokenData.refresh_token,
    grant_type: 'refresh_token'
  }).toString();

  const res = await makeRequest('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postParams)
    }
  }, postParams);

  if (res.statusCode !== 200) {
    throw new Error(`Failed to refresh YouTube token: ${res.body}`);
  }

  const refreshed = JSON.parse(res.body);
  tokenData.access_token = refreshed.access_token;
  tokenData.expiry_date = Date.now() + (refreshed.expires_in * 1000);
  fs.writeFileSync(tokenPath, JSON.stringify(tokenData, null, 2), 'utf8');

  return tokenData.access_token;
}

// 3. One-Time Interactive OAuth Flow
function startInteractiveAuth(creds) {
  return new Promise((resolve, reject) => {
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` + new url.URLSearchParams({
      client_id: creds.clientId,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: SCOPES,
      access_type: 'offline',
      prompt: 'consent'
    }).toString();

    console.log(JSON.stringify({
      type: 'auth_required',
      authUrl: authUrl
    }));
    console.log('\n======================================================');
    console.log('🔑 YOUTUBE OAUTH AUTHORIZATION REQUIRED');
    console.log('======================================================');
    console.log('Opening authorization URL in your browser:');
    console.log(authUrl);
    console.log('======================================================\n');

    const server = http.createServer(async (req, res) => {
      try {
        const parsed = url.parse(req.url, true);
        if (parsed.pathname === '/oauth2callback') {
          const code = parsed.query.code;
          if (!code) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end('<h3>❌ Authorization Failed. No code returned.</h3>');
            return;
          }

          // Exchange code for tokens
          const postParams = new url.URLSearchParams({
            code: code,
            client_id: creds.clientId,
            client_secret: creds.clientSecret,
            redirect_uri: REDIRECT_URI,
            grant_type: 'authorization_code'
          }).toString();

          const tokenRes = await makeRequest('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Content-Length': Buffer.byteLength(postParams)
            }
          }, postParams);

          if (tokenRes.statusCode !== 200) {
            res.writeHead(500, { 'Content-Type': 'text/html' });
            res.end(`<h3>❌ Token exchange failed:</h3><pre>${tokenRes.body}</pre>`);
            return;
          }

          const tokens = JSON.parse(tokenRes.body);
          tokens.expiry_date = Date.now() + (tokens.expires_in * 1000);

          fs.mkdirSync(credsDir, { recursive: true });
          fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2), 'utf8');

          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <div style="font-family:sans-serif; text-align:center; padding:40px; background:#0f172a; color:#f8fafc; height:100vh;">
              <h1 style="color:#10b981;">⚔️ Comic Studio Authorized!</h1>
              <p style="font-size:18px;">YouTube upload credentials saved successfully.</p>
              <p style="color:#94a3b8;">You may close this browser tab and return to the Studio UI.</p>
            </div>
          `);

          server.close();
          resolve(tokens.access_token);
        }
      } catch (err) {
        server.close();
        reject(err);
      }
    });

    server.listen(OAUTH_PORT, () => {
      // Launch browser
      exec(`start "" "${authUrl}"`);
    });

    server.on('error', (err) => {
      reject(err);
    });
  });
}

// Names and terms belonging to Robert E. Howard's Conan setting or to real artists.
// They must never appear in upload metadata for these original comics.
const DERIVATIVE_TERMS = [
  [/\bconan\b/gi, 'the barbarian'],
  [/\bcrom\b/gi, 'the gods'],
  [/\bcimmeri(a|an)s?\b/gi, 'northern'],
  [/\bhyborian\b/gi, 'ancient'],
  [/\b(aquiloni|stygi|zamori|zingari|nemedi|vanaheim|asgard|turani|hyrkani)\w*/gi, 'distant'],
  [/\bzamora\b/gi, 'the old city'],
  [/\b(robert e\.? howard|frank frazetta|frazetta|john buscema|buscema)('s)?\b/gi, ''],
];
const DERIVATIVE_RE = /\b(conan|crom|cimmeri|hyborian|aquiloni|stygi|zamor|zingari|nemedi|vanaheim|hyrkani|turani|howard|frazetta|buscema)/i;
function scrubDerivative(text) {
  let t = String(text || '');
  for (const [re, rep] of DERIVATIVE_TERMS) t = t.replace(re, rep);
  return t.replace(/ {2,}/g, ' ').replace(/ ([,.!?])/g, '$1').trim();
}

// 4. Build Metadata & Chapters from Episode Manifest
function buildEpisodeMetadata(projectId, episodeId, customTitle, customPrivacy) {
  const manifestPath = path.join(rootDir, 'projects', projectId, 'episodes', episodeId, 'manifest.json');
  let manifest = {};
  if (fs.existsSync(manifestPath)) {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  }

  // Master Video File Path
  const masterRel = manifest.outputs?.masterVideoPath || `projects/${projectId}/episodes/${episodeId}/video/${episodeId}_motion_comic.mp4`;
  const masterVideoPath = path.join(rootDir, masterRel);

  if (!fs.existsSync(masterVideoPath)) {
    throw new Error(`Master video file not found at: ${masterVideoPath}`);
  }

  // Chapters: YouTube needs >= 3 chapters, first at 0:00, each >= 10s.
  // Group panels into ~5 story beats, labelled with that beat's opening narration.
  const panels = manifest.panels || [];
  const fmtTime = (t) => `${Math.floor(t / 60)}:${Math.floor(t % 60).toString().padStart(2, '0')}`;
  const shortLabel = (txt, fallback) => {
    let t = scrubDerivative(String(txt || '').replace(/\s+/g, ' ').trim()).replace(/[.!?]+$/, '');
    if (!t) return fallback;
    t = t.split(/(?<=[.!?])\s/)[0].replace(/[.!?]+$/, '');
    if (t.length > 60) {
      const cut = t.slice(0, 60).search(/[,;—–-][^,;—–-]*$/);
      t = cut > 25 ? t.slice(0, cut) : t.slice(0, 57).replace(/\s+\S*$/, '') + '…';
    }
    return t.trim();
  };
  const chapterLines = [];
  if (panels.length >= 6) {
    const groups = Math.min(5, Math.floor(panels.length / 3));
    const per = Math.ceil(panels.length / groups);
    let t = 0;
    for (let i = 0; i < panels.length; i += per) {
      const chunk = panels.slice(i, i + per);
      const len = chunk.reduce((a, p) => a + (p.durationSeconds || 9.2), 0);
      if (len < 10 && chapterLines.length) { t += len; continue; }
      chapterLines.push(`${fmtTime(t)} ${shortLabel(chunk[0].caption, `Part ${chapterLines.length + 1}`)}`);
      t += len;
    }
  }

  const seriesTitle = (() => {
    try { return JSON.parse(fs.readFileSync(path.join(rootDir, 'projects', projectId, 'project.json'), 'utf8')).title || ''; }
    catch (e) { return ''; }
  })();
  const title = scrubDerivative(customTitle || manifest.title || `${seriesTitle || projectId}: ${episodeId.toUpperCase()} — Sword & Sorcery Motion Comic`);
  const privacy = customPrivacy || 'unlisted';

  // Voice cast: this comic's own registry, only the characters heard in this episode
  let castList = '';
  try {
    const projReg = path.join(rootDir, 'projects', projectId, 'reference', 'voice_registry.json');
    const reg = JSON.parse(fs.readFileSync(fs.existsSync(projReg) ? projReg : path.join(rootDir, '00_Reference', 'voice_registry.json'), 'utf8'));
    const chars = reg.characters || {};
    const heard = new Set(['narrator']);
    for (const p of panels) {
      for (const d of p.dialogue || []) {
        const sp = String(d.speaker || '').toLowerCase();
        const key = Object.keys(chars).find(k => k === sp || sp.startsWith(k + ' ') || (chars[k].aliases || []).some(a => sp.includes(String(a).toLowerCase())));
        if (key) heard.add(key);
      }
    }
    castList = [...heard].filter(k => chars[k]).map(k => `• ${scrubDerivative(chars[k].name || k)}: ${String(chars[k].actorName || 'ElevenLabs voice').replace(/\s*\(.*?\)\s*/g, ' ').trim()}`).join('\n');
  } catch (e) {}

  // Synopsis from this episode's own narration (first few captions)
  const captions = panels.map(p => String(p.caption || '').trim()).filter(Boolean);
  const synopsis = scrubDerivative(captions.slice(0, 3).join(' ').replace(/\s+/g, ' ').trim() ||
    `${manifest.title || episodeId}.`);

  const seriesTag = scrubDerivative(seriesTitle).split(/[^A-Za-z0-9]+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join('');
  const description = [
    synopsis,
    ``,
    `An original sword-and-sorcery motion comic${seriesTitle ? ` from the ${scrubDerivative(seriesTitle)} series` : ''}.`,
    ...(chapterLines.length >= 3 ? [``, `CHAPTERS:`, chapterLines.join('\n')] : []),
    ``,
    `VOICE CAST:`,
    castList || '• ElevenLabs voice cast',
    ``,
    `Artwork and voices are AI-generated.`,
    ``,
    [seriesTag ? `#${seriesTag}` : '', '#SwordAndSorcery', '#MotionComic', '#DarkFantasy', '#AudioDrama'].filter(Boolean).join(' ')
  ].join('\n');

  const tags = [...new Set([
    seriesTitle.toLowerCase(),
    ...String(seriesTitle).toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 3 && !['the', 'barbarian'].includes(w)),
    'motion comic',
    'sword and sorcery',
    'dark fantasy',
    'heroic fantasy',
    'graphic novel',
    'audio drama',
    'barbarian',
    'ai comic'
  ].filter(Boolean))].filter(t => !DERIVATIVE_RE.test(t));

  // Thumbnail: this episode's own (chosen in the Studio, or picked automatically)
  let thumbPath = null;
  let thumbPanelId = null;
  try {
    const outThumb = manifest.outputs && manifest.outputs.thumbnailPath ? path.join(rootDir, manifest.outputs.thumbnailPath) : '';
    if (outThumb && fs.existsSync(outThumb)) {
      thumbPath = outThumb;
      thumbPanelId = manifest.outputs.thumbnailPanelId || null;
    } else {
      const t = generateThumbnail({ projectId, episodeId });
      thumbPath = t.path;
      thumbPanelId = t.panelId;
    }
  } catch (e) {
    console.log(JSON.stringify({ type: 'thumbnail_warning', message: `Thumbnail could not be made: ${e.message}` }));
  }

  return {
    masterVideoPath,
    title,
    description,
    tags,
    privacy,
    thumbPath: thumbPath && fs.existsSync(thumbPath) ? thumbPath : null,
    thumbPanelId,
    manifestPath,
    manifest
  };
}

// Sets (or replaces) a video's custom thumbnail. YouTube requires a verified
// channel for custom thumbnails; the error says so if it isn't.
async function setYouTubeThumbnail(accessToken, videoId, thumbPath) {
  try {
    const thumbBuf = fs.readFileSync(thumbPath);
    const res = await makeRequest(
      `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'image/jpeg',
          'Content-Length': thumbBuf.length
        }
      },
      thumbBuf
    );
    if (res.statusCode >= 200 && res.statusCode < 300) {
      return { ok: true, message: `Thumbnail set on https://youtu.be/${videoId}` };
    }
    return { ok: false, message: `YouTube refused the thumbnail (${res.statusCode}): ${String(res.body).slice(0, 300)}` };
  } catch (err) {
    return { ok: false, message: `Thumbnail upload error: ${err.message}` };
  }
}

// 5. Upload Video via YouTube Resumable Protocol
async function uploadVideoToYouTube(accessToken, meta, onProgress) {
  const stat = fs.statSync(meta.masterVideoPath);
  const fileSize = stat.size;

  console.log(`\n🚀 Initializing YouTube Resumable Upload session for:`);
  console.log(`   Title    : ${meta.title}`);
  console.log(`   File     : ${meta.masterVideoPath} (${(fileSize / (1024 * 1024)).toFixed(1)} MB)`);
  console.log(`   Privacy  : ${meta.privacy}`);

  // Step 1: Initiate session
  const initPayload = JSON.stringify({
    snippet: {
      title: meta.title,
      description: meta.description,
      tags: meta.tags,
      categoryId: '24' // Entertainment
    },
    status: {
      privacyStatus: meta.privacy,
      selfDeclaredMadeForKids: false
    }
  });

  const initRes = await makeRequest(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Length': fileSize,
        'X-Upload-Content-Type': 'video/mp4'
      }
    },
    initPayload
  );

  if (initRes.statusCode !== 200) {
    throw new Error(`Failed to initiate YouTube upload session (${initRes.statusCode}): ${initRes.body}`);
  }

  const uploadUrl = initRes.headers.location;
  if (!uploadUrl) {
    throw new Error(`No upload Location returned by YouTube API.`);
  }

  // Step 2: Stream video bytes to the session URL with progress tracking
  console.log(`\n📡 Streaming video chunks to YouTube...`);
  
  const videoResult = await new Promise((resolve, reject) => {
    const parsed = new url.URL(uploadUrl);
    const req = https.request({
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: 443,
      path: parsed.pathname + parsed.search,
      method: 'PUT',
      headers: {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4'
      }
    }, (res) => {
      let data = [];
      res.on('data', chunk => data.push(chunk));
      res.on('end', () => {
        const bodyStr = Buffer.concat(data).toString('utf8');
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(bodyStr));
          } catch (e) {
            resolve({ raw: bodyStr });
          }
        } else {
          reject(new Error(`Upload failed with HTTP ${res.statusCode}: ${bodyStr}`));
        }
      });
    });

    req.on('error', reject);

    let uploadedBytes = 0;
    let lastPercent = -1;
    const fileStream = fs.createReadStream(meta.masterVideoPath);

    fileStream.on('data', (chunk) => {
      uploadedBytes += chunk.length;
      const pct = Math.floor((uploadedBytes / fileSize) * 100);
      if (pct !== lastPercent) {
        lastPercent = pct;
        if (onProgress) {
          onProgress(pct, uploadedBytes, fileSize);
        } else {
          process.stdout.write(`\r[YouTube Upload] ${pct}% completed (${(uploadedBytes / (1024 * 1024)).toFixed(1)} / ${(fileSize / (1024 * 1024)).toFixed(1)} MB)...`);
        }
      }
    });

    fileStream.pipe(req);
  });

  console.log('\n✅ Video stream finished processing on YouTube!');
  const videoId = videoResult.id;
  const youtubeUrl = `https://youtu.be/${videoId}`;
  console.log(`🎬 YouTube Video Live URL: ${youtubeUrl}`);

  // Step 3: Upload this episode's thumbnail
  const thumbResult = meta.thumbPath ? await setYouTubeThumbnail(accessToken, videoId, meta.thumbPath) : { ok: false, message: 'no thumbnail' };
  console.log(JSON.stringify({ type: thumbResult.ok ? 'thumbnail_set' : 'thumbnail_warning', message: thumbResult.message }));

  // Step 4: Persist to Manifest
  try {
    if (meta.manifestPath && fs.existsSync(meta.manifestPath)) {
      const m = meta.manifest;
      if (!m.outputs) m.outputs = {};
      m.outputs.youtubeVideoId = videoId;
      m.outputs.youtubeUrl = youtubeUrl;
      m.outputs.youtubePrivacy = meta.privacy;
      m.outputs.youtubeUploadedAt = new Date().toISOString();
      if (meta.thumbPath) {
        m.outputs.thumbnailPath = path.relative(rootDir, meta.thumbPath).replace(/\\/g, '/');
        m.outputs.thumbnailPanelId = meta.thumbPanelId;
      }
      updateManifestLocked(meta.manifestPath, (latest) => {
        latest.outputs = Object.assign(latest.outputs || {}, {
          youtubeVideoId: m.outputs.youtubeVideoId,
          youtubeUrl: m.outputs.youtubeUrl,
          youtubePrivacy: m.outputs.youtubePrivacy,
          youtubeUploadedAt: m.outputs.youtubeUploadedAt,
          thumbnailPath: m.outputs.thumbnailPath,
          thumbnailPanelId: m.outputs.thumbnailPanelId
        });
      });
      console.log(`📝 Manifest updated with YouTube release coordinates.`);
    }
  } catch (e) {}

  return {
    videoId,
    youtubeUrl,
    title: meta.title,
    privacy: meta.privacy
  };
}

// Main CLI Entry
async function main() {
  const args = process.argv.slice(2);
  let projectId = 'korvath-the-barbarian';
  let episodeId = 'ep01';
  let privacy = 'unlisted';
  let customTitle = null;
  let isAuthOnly = false;
  let isCheckStatus = false;
  let thumbnailOnly = false;
  let thumbPanel = null;
  let applyThumb = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--project' && args[i + 1]) projectId = args[++i];
    if (args[i] === '--episode' && args[i + 1]) episodeId = args[++i];
    if (args[i] === '--privacy' && args[i + 1]) privacy = args[++i];
    if (args[i] === '--title' && args[i + 1]) customTitle = args[++i];
    if (args[i] === '--auth-only') isAuthOnly = true;
    if (args[i] === '--status') isCheckStatus = true;
    if (args[i] === '--thumbnail-only') thumbnailOnly = true;
    if (args[i] === '--panel' && args[i + 1]) thumbPanel = Number(args[++i]);
    if (args[i] === '--apply') applyThumb = true;
  }

  // Thumbnail mode: make (and optionally apply) this episode's thumbnail, no video upload
  if (thumbnailOnly) {
    const t = generateThumbnail({ projectId, episodeId, panelId: thumbPanel || undefined });
    const manifestPath = path.join(rootDir, 'projects', projectId, 'episodes', episodeId, 'manifest.json');
    const m = updateManifestLocked(manifestPath, (latest) => {
      latest.outputs = latest.outputs || {};
      latest.outputs.thumbnailPath = t.relPath;
      latest.outputs.thumbnailPanelId = t.panelId;
    });
    let applied = null;
    if (applyThumb) {
      const videoId = m.outputs.youtubeVideoId || ((m.outputs.youtubeUrl || '').match(/youtu\.be\/([\w-]+)/) || [])[1];
      if (!videoId) {
        applied = { ok: false, message: 'This episode has not been uploaded to YouTube yet.' };
      } else {
        const c = getClientCredentials();
        const token = c ? await getAccessToken(c) : null;
        applied = token ? await setYouTubeThumbnail(token, videoId, t.path)
          : { ok: false, message: 'YouTube is not authorised yet. Upload once from the Studio to sign in.' };
      }
    }
    console.log(JSON.stringify({ type: 'thumbnail', relPath: t.relPath, panelId: t.panelId, panelName: t.panelName, lettered: t.lettered, applied }));
    return;
  }

  const creds = getClientCredentials();

  // Status Check Mode
  if (isCheckStatus) {
    const hasCreds = !!creds;
    const hasToken = fs.existsSync(tokenPath);
    let tokenValid = false;
    if (hasCreds && hasToken) {
      try {
        const t = await getAccessToken(creds);
        tokenValid = !!t;
      } catch (e) {}
    }
    const result = {
      hasClientSecret: hasCreds,
      clientSecretPath,
      hasToken,
      tokenValid
    };
    console.log(JSON.stringify(result));
    return;
  }

  if (!creds) {
    const errObj = {
      error: 'CREDENTIALS_MISSING',
      message: `Google Cloud OAuth client secret not found.\nPlease save your OAuth JSON as: ${clientSecretPath}`,
      path: clientSecretPath
    };
    console.error(JSON.stringify(errObj));
    process.exit(1);
  }

  let accessToken = await getAccessToken(creds);
  if (!accessToken) {
    console.log('No valid access token found. Initiating OAuth consent flow...');
    accessToken = await startInteractiveAuth(creds);
  }

  if (isAuthOnly) {
    console.log(JSON.stringify({ success: true, message: 'YouTube authorization verified.' }));
    return;
  }

  const meta = buildEpisodeMetadata(projectId, episodeId, customTitle, privacy);

  const result = await uploadVideoToYouTube(accessToken, meta, (pct, uploaded, total) => {
    // Structured JSON for IPC stream readers
    console.log(JSON.stringify({
      type: 'progress',
      percent: pct,
      uploadedBytes: uploaded,
      totalBytes: total,
      projectId,
      episodeId
    }));
  });

  console.log(JSON.stringify({
    type: 'complete',
    success: true,
    videoId: result.videoId,
    youtubeUrl: result.youtubeUrl,
    title: result.title,
    privacy: result.privacy
  }));
}

if (require.main === module) {
  main().catch((err) => {
    console.error(JSON.stringify({ error: 'UPLOAD_FAILED', message: err.message }));
    process.exit(1);
  });
}

module.exports = {
  setYouTubeThumbnail,
  getClientCredentials,
  getAccessToken,
  startInteractiveAuth,
  buildEpisodeMetadata,
  uploadVideoToYouTube
};

