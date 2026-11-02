const fs = require('fs');
const path = require('path');
const { getMetaTab, CDPClient } = require('./cdp_helper');

const OUT_DIR = path.join(__dirname, '..', '02_Assets', 'pipeline_comparison');
fs.mkdirSync(OUT_DIR, { recursive: true });

// Read Venice API Key from comic-studio/.env
const envPath = 'C:\\research\\c-book-generator\\comic-studio\\.env';
const env = fs.readFileSync(envPath, 'utf8');
const match = env.match(/VENICE_API_KEY=([^\r\n]+)/);
const VENICE_API_KEY = match ? match[1].trim() : '';

const UNCENSORED_PROMPT = `classic vintage 1970s sword-and-sorcery graphic novel comic book panel, Frank Frazetta and John Buscema illustration style, dramatic heavy black ink brushwork, crisp fine cross-hatching, rich cel-shaded digital colors, theatrical chiaroscuro lighting, dark pulp fantasy aesthetic, masterwork sequential art. Wide Throne Room Hero Shot, Dramatic Low-Angle View. Conan the Barbarian sits slumped with savage arrogance upon a massive carved stone skull throne, towering muscled build, scarred bronze muscular torso, shaggy raven hair, wolf-fur loincloth. In his scarred hand he grips his massive two-handed iron broadsword, blade point planted into the stone floor, the notched steel blade visibly dripping with dark crimson blood onto the flagstones. At the foot of the throne dais on lavish silk cushions lounge two gorgeous exotic women in revealing hammered bronze scale bikinis with jeweled armbands and alluring expressions. In the background, smoking bronze braziers exhale swirling grey lotus incense smoke into the high vaulted shadows, warm flickering torchlight casting deep chiaroscuro contrasts.`;

const META_SANITIZED_PROMPT = `classic vintage 1970s sword-and-sorcery graphic novel comic book panel, Frank Frazetta and John Buscema illustration style, dramatic heavy black ink brushwork, crisp fine cross-hatching, rich cel-shaded digital colors, theatrical chiaroscuro lighting, dark pulp fantasy aesthetic, masterwork sequential art. Wide Throne Room Hero Shot, Dramatic Low-Angle View. Conan the Barbarian sits with savage arrogance upon a massive carved stone skull throne, towering muscled build, battle-scarred bronze torso in studded leather warrior harness, square jaw, smoldering blue wolfish eyes, shaggy raven hair, wolf-fur loincloth. One scarred hand rests on the carved armrest while his other hand grips the wire hilt of his massive 42-inch iron broadsword with clean notched steel resting against the flagstones. At the foot of the dais on lavish crimson silk pillows lounge two gorgeous exotic women in hammered bronze battle-garb and sheer silk cloaks with jeweled serpent armbands, alluring smoldering gazes. In the background, ornate smoking bronze braziers exhale thick swirling grey lotus incense smoke into the high vaulted shadows, warm flickering torchlight casting deep chiaroscuro contrasts.`;

async function renderVeniceModel(modelName, filename, prompt) {
  console.log(`\n🎨 [Venice.ai] Rendering model: ${modelName}...`);
  const payload = {
    model: modelName,
    prompt: prompt,
    width: 1280,
    height: 720,
    safe_mode: false
  };

  const res = await fetch('https://api.venice.ai/api/v1/image/generate', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + VENICE_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (data.images && data.images[0]) {
    const buf = Buffer.from(data.images[0], 'base64');
    const outPath = path.join(OUT_DIR, filename);
    fs.writeFileSync(outPath, buf);
    console.log(`✅ [${modelName}] Saved: ${outPath} (${Math.round(buf.length / 1024)} KB)`);
    return outPath;
  } else {
    throw new Error(`Venice model ${modelName} failed: ${JSON.stringify(data)}`);
  }
}

async function renderMetaSanitized(filename, prompt) {
  console.log(`\n🌐 [Meta AI CDP] Rendering corporate-sanitized compromise...`);
  const tab = await getMetaTab();
  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();

  try {
    const initialMediaCount = await client.evaluate(`
      document.querySelectorAll('button[aria-label="View media"]').length
    `);

    // Focus composer & insert
    await client.evaluate(`
      (() => {
        const el = document.querySelector('div[contenteditable="true"]');
        if (!el) throw new Error('Composer div not found');
        el.focus();
        document.execCommand('selectAll', false, null);
        document.execCommand('delete', false, null);
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      })()
    `);

    await client.send('Input.insertText', { text: prompt });
    await new Promise(r => setTimeout(r, 400));

    // Send
    await client.evaluate(`
      (() => {
        const btn = document.querySelector('button[aria-label="Send"]');
        if (btn && !btn.disabled) btn.click();
      })()
    `);

    // Poll up to 60s
    let newMedia = false;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const count = await client.evaluate(`document.querySelectorAll('button[aria-label="View media"]').length`);
      if (count > initialMediaCount) {
        newMedia = true;
        break;
      }
    }

    if (!newMedia) throw new Error('Meta AI did not return image within 60s');

    await new Promise(r => setTimeout(r, 1200));

    // Click last media button to open lightbox
    await client.evaluate(`
      (() => {
        const btns = Array.from(document.querySelectorAll('button[aria-label="View media"]'));
        if (btns.length > 0) btns[btns.length - 1].click();
      })()
    `);
    await new Promise(r => setTimeout(r, 1000));

    const highResUrl = await client.evaluate(`
      (() => {
        const imgs = Array.from(document.querySelectorAll('img[src*="fbcdn.net"]'));
        if (imgs.length === 0) return null;
        imgs.sort((a, b) => (b.naturalWidth || b.width) - (a.naturalWidth || a.width));
        return imgs[0].src;
      })()
    `);

    await client.evaluate(`
      (() => {
        const closeBtn = document.querySelector('button[aria-label="Close" i]');
        if (closeBtn) closeBtn.click();
      })()
    `);

    if (!highResUrl) throw new Error('Failed to find high res image URL');

    const res = await fetch(highResUrl);
    const buf = Buffer.from(await res.arrayBuffer());
    const outPath = path.join(OUT_DIR, filename);
    fs.writeFileSync(outPath, buf);
    console.log(`✅ [Meta AI Sanitized] Saved: ${outPath} (${Math.round(buf.length / 1024)} KB)`);
    return outPath;
  } finally {
    client.close();
  }
}

function generateComparisonHTML() {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>⚔️ Pipeline Shootout: Conan on Skull Throne</title>
  <style>
    body {
      background: #0d0a08;
      color: #e5ded6;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Georgia, serif;
      padding: 30px 20px;
      margin: 0;
    }
    header {
      text-align: center;
      max-width: 900px;
      margin: 0 auto 36px;
    }
    h1 {
      color: #c98939;
      letter-spacing: 2px;
      text-transform: uppercase;
      font-size: 26px;
      margin-bottom: 8px;
    }
    .scene-box {
      background: #18110c;
      border: 1px solid #3c2415;
      padding: 16px 20px;
      border-radius: 6px;
      margin-top: 16px;
      font-size: 14px;
      color: #ad9a87;
      text-align: left;
      line-height: 1.5;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(460px, 1fr));
      gap: 30px;
      max-width: 1600px;
      margin: 0 auto;
    }
    .card {
      background: #150e09;
      border: 1px solid #352114;
      border-radius: 6px;
      overflow: hidden;
      box-shadow: 0 10px 30px rgba(0,0,0,0.8);
      display: flex;
      flex-direction: column;
    }
    .card-header {
      padding: 14px 18px;
      background: #1e130d;
      border-bottom: 1px solid #352114;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .model-badge {
      font-weight: bold;
      color: #e0993f;
      font-size: 15px;
      letter-spacing: 1px;
    }
    .tag {
      font-size: 11px;
      padding: 3px 8px;
      border-radius: 3px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .tag-censored { background: #5c2018; color: #ff9d91; }
    .tag-uncensored { background: #1b4d24; color: #9df0a8; }
    .img-wrap {
      width: 100%;
      aspect-ratio: 16 / 9;
      background: #000;
      overflow: hidden;
      position: relative;
    }
    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      transition: transform 0.25s ease;
      cursor: pointer;
    }
    img:hover {
      transform: scale(1.02);
    }
    .card-body {
      padding: 16px 18px;
      flex-grow: 1;
      font-size: 13px;
      color: #b5a494;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <header>
    <h1>⚔️ Sword & Sorcery Pipeline Shootout</h1>
    <p>Comparing Meta AI (Safety Compromise) vs. Venice.ai Uncensored Diffusion Models</p>
    <div class="scene-box">
      <strong>🎯 Tested Scene:</strong> Conan sitting on a skull throne, heavy broadsword in hand dripping blood, two beautiful women in bikinis lounging at his feet, smoking lotus braziers in 1970s Frank Frazetta / John Buscema comic style.
    </div>
  </header>

  <div class="grid">
    <div class="card">
      <div class="card-header">
        <span class="model-badge">1. Meta AI (CDP Live)</span>
        <span class="tag tag-censored">Sanitized Filter</span>
      </div>
      <div class="img-wrap">
        <img src="01_meta_ai_sanitized.webp" alt="Meta AI Sanitized" onclick="window.open(this.src)">
      </div>
      <div class="card-body">
        <strong>Filter Modifications:</strong> Meta AI refused "bikinis" and "dripping blood". Prompt was forced to: <em>"clean notched steel, no gore"</em> and <em>"hammered bronze battle-garb and sheer silk cloaks rather than bikinis"</em>.
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <span class="model-badge">2. Venice.ai: Recraft v4</span>
        <span class="tag tag-uncensored">Uncensored Raw</span>
      </div>
      <div class="img-wrap">
        <img src="02_venice_recraft_v4.webp" alt="Recraft v4" onclick="window.open(this.src)">
      </div>
      <div class="card-body">
        <strong>Capabilities:</strong> World-class vector/comic illustration engine. Full blood-dripping broadsword, hammered bronze scale bikinis, zero safety triggers.
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <span class="model-badge">3. Venice.ai: FLUX-2 Pro</span>
        <span class="tag tag-uncensored">Uncensored Raw</span>
      </div>
      <div class="img-wrap">
        <img src="03_venice_flux_2_pro.webp" alt="FLUX-2 Pro" onclick="window.open(this.src)">
      </div>
      <div class="card-body">
        <strong>Capabilities:</strong> State-of-the-art FLUX 12B diffusion. Cinematic chiaroscuro lighting, anatomy, uncompromised blood and sensual pulp attire.
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <span class="model-badge">4. Venice.ai: Lustify v8</span>
        <span class="tag tag-uncensored">Uncensored Raw</span>
      </div>
      <div class="img-wrap">
        <img src="04_venice_lustify_v8.webp" alt="Lustify v8" onclick="window.open(this.src)">
      </div>
      <div class="card-body">
        <strong>Capabilities:</strong> Dark fantasy & barbarian grit specialist. Built for heroic anatomy, high sensuality, bikinis, and uninhibited combat blood.
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <span class="model-badge">5. Venice.ai: Grok Imagine 2.0</span>
        <span class="tag tag-uncensored">Uncensored Raw</span>
      </div>
      <div class="img-wrap">
        <img src="05_venice_grok_imagine.webp" alt="Grok Imagine 2.0" onclick="window.open(this.src)">
      </div>
      <div class="card-body">
        <strong>Capabilities:</strong> Vibrant color saturation, dynamic composition, dramatic perspective on throne and characters.
      </div>
    </div>
  </div>
</body>
</html>`;

  const htmlPath = path.join(OUT_DIR, 'comparison_viewer.html');
  fs.writeFileSync(htmlPath, html, 'utf8');
  console.log(`\n📊 Comparison Viewer generated -> ${htmlPath}`);
}

async function runShootout() {
  console.log(`======================================================`);
  console.log(`⚔️ LAUNCHING MULTI-PIPELINE COMPARATIVE SHOOTOUT`);
  console.log(`======================================================`);

  // 1. Meta AI (Sanitized compromise)
  try {
    await renderMetaSanitized('01_meta_ai_sanitized.webp', META_SANITIZED_PROMPT);
  } catch (e) {
    console.error('Meta AI render error:', e.message);
  }

  // 2. Venice Recraft v4
  try {
    await renderVeniceModel('recraft-v4', '02_venice_recraft_v4.webp', UNCENSORED_PROMPT);
  } catch (e) {
    console.error('Recraft error:', e.message);
  }

  // 3. Venice FLUX-2 Pro
  try {
    await renderVeniceModel('flux-2-pro', '03_venice_flux_2_pro.webp', UNCENSORED_PROMPT);
  } catch (e) {
    console.error('FLUX-2 Pro error:', e.message);
  }

  // 4. Venice Lustify v8
  try {
    await renderVeniceModel('lustify-v8', '04_venice_lustify_v8.webp', UNCENSORED_PROMPT);
  } catch (e) {
    console.error('Lustify error:', e.message);
  }

  // 5. Venice Grok Imagine 2.0
  try {
    await renderVeniceModel('grok-imagine-image-2-0', '05_venice_grok_imagine.webp', UNCENSORED_PROMPT);
  } catch (e) {
    console.error('Grok error:', e.message);
  }

  generateComparisonHTML();
  console.log(`\n🎉 Shootout complete!`);
}

runShootout().catch(console.error);

