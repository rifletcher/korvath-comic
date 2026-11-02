const fs = require('fs');
const path = require('path');

// Read Venice API Key from comic-studio/.env or local environment
function getVeniceApiKey() {
  if (process.env.VENICE_API_KEY) return process.env.VENICE_API_KEY;
  const envPath = 'C:\\research\\c-book-generator\\comic-studio\\.env';
  if (fs.existsSync(envPath)) {
    const env = fs.readFileSync(envPath, 'utf8');
    const match = env.match(/VENICE_API_KEY=([^\r\n]+)/);
    if (match) return match[1].trim();
  }
  throw new Error('VENICE_API_KEY not found in process.env or comic-studio/.env');
}

const VENICE_API_KEY = getVeniceApiKey();
const MODEL_NAME = 'grok-imagine-image-2-0';

const CONFIG_PATH = path.join(__dirname, 'comic.config.json');
let config = {};
try {
  config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
} catch (e) {
  config = { style: { aspectRatio: '16:9', renderDimensions: { width: 1280, height: 720 } } };
}

async function renderPromptVenice(prompt, outPath, options = {}) {
  const width = options.width || config.style?.renderDimensions?.width || 1280;
  const height = options.height || config.style?.renderDimensions?.height || 720;
  const aspectRatio = options.aspect_ratio || config.style?.aspectRatio || '16:9';

  console.log(`\n🎨 [Venice.ai : ${MODEL_NAME}] Dispatching generation...`);
  console.log(`📐 Dimensions: ${width}x${height} (Aspect Ratio: ${aspectRatio})`);
  console.log(`📝 Output: ${outPath}`);

  const payload = {
    model: MODEL_NAME,
    prompt: prompt,
    aspect_ratio: aspectRatio,
    width: width,
    height: height,
    safe_mode: false
  };

  const startTime = Date.now();
  const res = await fetch('https://api.venice.ai/api/v1/image/generate', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + VENICE_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Venice API returned error ${res.status}: ${errorText}`);
  }

  const data = await res.json();
  if (!data.images || !data.images[0]) {
    throw new Error(`Venice API response missing images: ${JSON.stringify(data)}`);
  }

  const buf = Buffer.from(data.images[0], 'base64');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, buf);

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`✅ [Venice Grok] Successfully generated in ${durationSec}s: ${outPath} (${Math.round(buf.length / 1024)} KB)`);
  return outPath;
}

async function renderPanel(panelId, options = {}) {
  const storyboardPath = path.join(__dirname, '..', '01_Script', 'storyboard.json');
  const storyboard = JSON.parse(fs.readFileSync(storyboardPath, 'utf8'));
  const panel = storyboard.find(p => p.panelId === parseInt(panelId, 10));

  if (!panel) {
    throw new Error(`Panel ${panelId} not found in ${storyboardPath}`);
  }

  console.log(`\n==================================================`);
  console.log(`🎬 RENDER PANEL ${panel.panelId}: "${panel.beat?.name || 'Untitled'}"`);
  console.log(`==================================================`);
  console.log(`Action: ${panel.action}`);
  console.log(`Camera: ${panel.camera?.shotType || 'Standard'}, ${panel.camera?.angle || ''}`);

  const rawDir = path.join(__dirname, '..', '02_Assets', 'Episode_01', 'raw');
  const selectedDir = path.join(__dirname, '..', '02_Assets', 'Episode_01', 'selected');
  const filename = `panel_${String(panel.panelId).padStart(2, '0')}.webp`;
  const rawPath = path.join(rawDir, filename);

  await renderPromptVenice(panel.prompt, rawPath, options);

  // If auto-promote option is specified, copy to selected as well
  if (options.promote) {
    fs.mkdirSync(selectedDir, { recursive: true });
    const selectedPath = path.join(selectedDir, filename);
    fs.copyFileSync(rawPath, selectedPath);
    console.log(`🚀 [Auto-Promote] Promoted to: ${selectedPath}`);
  }

  return rawPath;
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  let panelId = null;
  let startId = null;
  let endId = null;
  let promote = false;
  let all = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--panel' && args[i + 1]) {
      panelId = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--start' && args[i + 1]) {
      startId = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--end' && args[i + 1]) {
      endId = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--promote') {
      promote = true;
    } else if (args[i] === '--all') {
      all = true;
    }
  }

  (async () => {
    try {
      const storyboardPath = path.join(__dirname, '..', '01_Script', 'storyboard.json');
      const storyboard = JSON.parse(fs.readFileSync(storyboardPath, 'utf8'));

      if (startId !== null && endId !== null) {
        console.log(`🚀 Rendering Batch: Panels ${startId} through ${endId} with Venice Grok Imagine...`);
        const targets = storyboard.filter(p => p.panelId >= startId && p.panelId <= endId);
        for (const p of targets) {
          await renderPanel(p.panelId, { promote });
        }
        console.log(`\n🎉 Batch ${startId}-${endId} rendered successfully!`);
      } else if (all) {
        console.log(`🚀 Rendering ALL ${storyboard.length} panels with Venice Grok Imagine...`);
        for (const p of storyboard) {
          await renderPanel(p.panelId, { promote });
        }
        console.log(`\n🎉 All panels rendered successfully!`);
      } else if (panelId) {
        await renderPanel(panelId, { promote });
      } else {
        console.log(`Usage: node tools/render_panel_venice.js [--panel <id>] [--start <id> --end <id>] [--promote] [--all]`);
      }
    } catch (err) {
      console.error(`❌ Render failed:`, err.message);
      process.exit(1);
    }
  })();
}

module.exports = {
  renderPromptVenice,
  renderPanel,
  MODEL_NAME
};

