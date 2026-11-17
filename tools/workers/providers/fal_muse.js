const fs = require('fs');
const path = require('path');

// Meta Muse Image via fal.ai (official Meta Model API distribution).
// Docs: https://fal.ai/models/meta/muse-image/text-to-image  ($0.01/image)
const FAL_MUSE_MODELS = new Set(['meta-muse-image']);
const FAL_ENDPOINT = 'https://fal.run/meta/muse-image/text-to-image';
const FAL_EDIT_ENDPOINT = 'https://fal.run/meta/muse-image/edit'; // same price, takes 1-10 reference images

function getFalApiKey() {
  if (process.env.FAL_KEY) return process.env.FAL_KEY.trim();
  const envPath = path.join(__dirname, '..', '..', '..', '.env');
  if (fs.existsSync(envPath)) {
    const match = fs.readFileSync(envPath, 'utf8').match(/^FAL_KEY=([^\r\n]+)/m);
    if (match) return match[1].trim();
  }
  throw new Error('FAL_KEY not found. Add FAL_KEY=<your fal.ai key> to the .env file in the project root.');
}

// Reference images (character sheets) as data URLs for the Muse edit endpoint.
function imageToDataUrl(file) {
  const ext = path.extname(file).toLowerCase().replace('.', '');
  const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'png' ? 'image/png' : 'image/webp';
  return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
}

// options.referenceImages: up to 10 local image paths. When given, Muse's edit
// endpoint is used so it can match the faces/costumes in those images.
async function renderViaFalMuse(prompt, options = {}) {
  const apiKey = getFalApiKey();
  const refs = (options.referenceImages || []).filter(f => f && fs.existsSync(f)).slice(0, 10);
  const timeoutMs = options.timeoutMs || 180000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(refs.length ? FAL_EDIT_ENDPOINT : FAL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': 'Key ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt,
        ...(refs.length ? { image_urls: refs.map(imageToDataUrl) } : {}),
        aspect_ratio: options.aspectRatio || '16:9',
        num_images: 1,
        output_format: 'webp'
      }),
      signal: controller.signal
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Muse Image (fal) API error (${res.status}): ${errText.slice(0, 500)}`);
    }

    const data = await res.json();
    const img = data && Array.isArray(data.images) ? data.images[0] : null;
    if (!img || !img.url) {
      throw new Error(`Muse Image (fal) response missing image: ${JSON.stringify(data).slice(0, 300)}`);
    }

    // fal returns either a hosted URL or a data: URI
    if (img.url.startsWith('data:')) {
      return Buffer.from(img.url.slice(img.url.indexOf(',') + 1), 'base64');
    }
    const imgRes = await fetch(img.url, { signal: controller.signal });
    if (!imgRes.ok) {
      throw new Error(`Muse Image (fal) image download failed (${imgRes.status})`);
    }
    return Buffer.from(await imgRes.arrayBuffer());
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Muse Image (fal) timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  FAL_MUSE_MODELS,
  getFalApiKey,
  renderViaFalMuse
};
