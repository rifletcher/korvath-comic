/**
 * Conan Dual Model Sheet Generator (Characters & Objects)
 * 
 * Generates Frank Frazetta / John Buscema multi-angle turnarounds to establish canonical ground truth.
 * Usage:
 *   node tools/generate_model_sheet.js --type char conan
 *   node tools/generate_model_sheet.js --type object broadsword
 */

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'comic.config.json');
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

const CHAR_PROMPTS_PATH = path.join(__dirname, '..', config.paths.characterPrompts);
const OBJ_PROMPTS_PATH = path.join(__dirname, '..', config.paths.objectPrompts);
const SHEETS_DIR = path.join(__dirname, '..', '00_Reference', 'sheets');

const charPrompts = JSON.parse(fs.readFileSync(CHAR_PROMPTS_PATH, 'utf8'));
const objPrompts = JSON.parse(fs.readFileSync(OBJ_PROMPTS_PATH, 'utf8'));

function formatPrompt(type, key) {
  const charBase = "classic vintage 1970s sword-and-sorcery character model sheet turnaround, Frank Frazetta and John Buscema illustration style, three full-body views: front heroic stance, 3/4 portrait closeup with intense smoldering gaze, dynamic combat action pose, crisp black ink linework, cross-hatching, cel-shaded coloring, neutral off-white parchment background, consistent anatomical proportions and gear across all views";
  const objBase = "classic vintage graphic novel object turnaround model sheet, 3-view technical reference sheet, Frank Frazetta style, profile side view, top perspective view, dynamic battle angle, clean neutral background, crisp black ink brushwork, cel-shaded digital colors";

  if (type === 'char') {
    const desc = charPrompts[key];
    if (!desc) throw new Error(`Unknown character key: ${key}`);
    return `${desc}, ${charBase}`;
  } else if (type === 'object') {
    const desc = objPrompts[key];
    if (!desc) throw new Error(`Unknown object key: ${key}`);
    return `${desc}, ${objBase}`;
  } else {
    throw new Error(`Unsupported type: ${type}. Use 'char' or 'object'`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  let type = 'char';
  let key = 'conan';
  let doRender = true;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--type' && args[i + 1]) {
      type = args[i + 1];
      i++;
    } else if (args[i] === '--no-render') {
      doRender = false;
    } else if (!args[i].startsWith('--')) {
      key = args[i];
    }
  }

  console.log(`🎨 Generating Model Sheet Recipe for [${type.toUpperCase()}]: "${key}"`);
  const prompt = formatPrompt(type, key);
  console.log(`\n📌 Generated Turnaround Prompt:\n${prompt}\n`);

  fs.mkdirSync(SHEETS_DIR, { recursive: true });
  const recipePath = path.join(SHEETS_DIR, `${type}_${key}_prompt.txt`);
  fs.writeFileSync(recipePath, prompt, 'utf8');
  console.log(`✅ Saved turnaround recipe to: ${recipePath}`);

  if (doRender) {
    const webpPath = path.join(SHEETS_DIR, `${type}_${key}_model_sheet.webp`);
    if (config.inference && config.inference.engine === 'venice_grok') {
      const { renderPromptVenice } = require('./render_panel_venice');
      console.log(`🎨 Dispatching model sheet render to Venice Grok Imagine...`);
      await renderPromptVenice(prompt, webpPath, { width: 1280, height: 720 });
    } else {
      const { renderPromptViaMetaAI } = require('./meta_engine');
      console.log(`🎨 Dispatching model sheet render to Meta AI...`);
      await renderPromptViaMetaAI(prompt, webpPath);
    }
    
    // Also copy to canonical name if needed
    const altPath = path.join(SHEETS_DIR, `${key}_model_sheet.webp`);
    if (webpPath !== altPath && fs.existsSync(webpPath)) {
      fs.copyFileSync(webpPath, altPath);
      console.log(`🔗 Mirrored canonical model sheet to: ${altPath}`);
    }
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('Error generating model sheet:', err);
    process.exit(1);
  });
}

module.exports = { formatPrompt };
