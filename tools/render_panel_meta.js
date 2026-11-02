/**
 * Meta AI Panel Renderer with Automated Guardrail Bypass & CDP Automation
 * 
 * Includes pre-flight Euphemism Filter to prevent Llama Guard safety refusals
 * for gritty barbarian action, combat, and anatomy.
 */

const fs = require('fs');
const path = require('path');
const { renderPromptViaMetaAI, sanitizePromptForMetaAI } = require('./meta_engine');

const CONFIG_PATH = path.join(__dirname, 'comic.config.json');
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

async function main() {
  const args = process.argv.slice(2);
  let panelId = 1;
  let customPrompt = null;
  let outputPath = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--panel' && args[i + 1]) {
      panelId = parseInt(args[++i], 10);
    } else if (args[i] === '--prompt' && args[i + 1]) {
      customPrompt = args[++i];
    } else if (args[i] === '--output' && args[i + 1]) {
      outputPath = args[++i];
    }
  }

  const storyboardPath = path.join(__dirname, '..', config.paths.storyboard);
  let rawPrompt = customPrompt;

  if (!rawPrompt && fs.existsSync(storyboardPath)) {
    const storyboard = JSON.parse(fs.readFileSync(storyboardPath, 'utf8'));
    const p = storyboard.find(item => item.panelId === panelId);
    if (p) rawPrompt = p.prompt;
  }

  if (!rawPrompt) {
    console.error(`Error: No prompt found for panel #${panelId}`);
    process.exit(1);
  }

  if (!outputPath) {
    const pad = String(panelId).padStart(2, '0');
    outputPath = path.join(__dirname, '..', config.paths.assetsDir, 'Episode_01', 'raw', `panel_${pad}.webp`);
  }

  console.log(`\nRendering Panel #${panelId}...`);
  await renderPromptViaMetaAI(rawPrompt, outputPath);
}

if (require.main === module) {
  main().catch(err => {
    console.error('Fatal render error:', err);
    process.exit(1);
  });
}

module.exports = { sanitizePromptForMetaAI, renderPromptViaMetaAI };
