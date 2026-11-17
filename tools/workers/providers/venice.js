const fs = require('fs');

const VENICE_MODELS = new Set([
  'grok-imagine-image-2-0',
  'flux-2-pro',
  'recraft-v4',
  'lustify-v8'
]);

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

async function renderViaVeniceModel(modelName, prompt) {
  const apiKey = getVeniceApiKey();
  const payload = {
    model: modelName,
    prompt,
    aspect_ratio: '16:9',
    width: 1280,
    height: 720,
    safe_mode: false
  };

  const res = await fetch('https://api.venice.ai/api/v1/image/generate', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Model ${modelName} API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  if (!data.images || !data.images[0]) {
    throw new Error(`Model ${modelName} response missing image payload`);
  }
  return Buffer.from(data.images[0], 'base64');
}

module.exports = {
  VENICE_MODELS,
  getVeniceApiKey,
  renderViaVeniceModel
};
