/**
 * The Korvath Writers' Room Orchestrator
 * Generates full saga scripts from zero existing text.
 * 
 * Chains:
 *  1. Lore Master (Original dark bronze-age pulp worldbuilding)
 *  2. Plot Architect (3-Act Saga beats, 20-panel full issue)
 *  3. Scriptwriter (Pulp dialogue, action, captions)
 *  4. Cinematographer (Frazetta / Buscema visual framing & lighting)
 *  5. Continuity Supervisor (Character & Object DNA injection -> storyboard.json)
 */

const fs = require('fs');
const path = require('path');

const { generatePremise } = require('./agents/lore_master');
const { buildSagaBeats } = require('./agents/plot_architect');
const { generateScript } = require('./agents/scriptwriter');
const { directVisuals } = require('./agents/cinematographer');
const { assembleStoryboard } = require('./agents/continuity_supervisor');

const CONFIG_PATH = path.join(__dirname, '..', 'comic.config.json');
const STORYBOARD_PATH = path.join(__dirname, '..', '..', '01_Script', 'storyboard.json');
const BEATS_PATH = path.join(__dirname, '..', '..', '01_Script', 'arcs', 'active_saga_beats.json');

function runWritersRoom(customTopic) {
  console.log("=========================================================");
  console.log("⚔️ KORVATH WRITERS' ROOM: 20-PANEL SAGA INITIATED");
  console.log("=========================================================\n");

  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const charPrompts = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', config.paths.characterPrompts), 'utf8'));
  const objPrompts = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', config.paths.objectPrompts), 'utf8'));

  // Stage 1: Lore Master
  const premise = generatePremise(customTopic);
  console.log(`📜 [Lore Master] Selected Tale: "${premise.title}" in ${premise.region}`);
  console.log(`   Logline: ${premise.logline}\n`);

  // Stage 2: Plot Architect
  const beats = buildSagaBeats(premise);
  fs.writeFileSync(BEATS_PATH, JSON.stringify({ premise, beats }, null, 2), 'utf8');

  // Stage 3: Scriptwriter
  const scriptPanels = generateScript(beats);

  // Stage 4: Cinematographer
  const visualPanels = directVisuals(scriptPanels);

  // Stage 5: Continuity Supervisor
  const storyboard = assembleStoryboard(
    visualPanels,
    charPrompts,
    objPrompts,
    config.style.baseStylePrompt,
    config.style.avoidTokens
  );

  fs.writeFileSync(STORYBOARD_PATH, JSON.stringify(storyboard, null, 2), 'utf8');
  console.log(`\n✅ Storyboard compiled with ${storyboard.length} panels -> ${STORYBOARD_PATH}`);
  console.log("=========================================================");
}

if (require.main === module) {
  const topic = process.argv.slice(2).join(' ') || 'sarkeshian_serpent';
  runWritersRoom(topic);
}

module.exports = { runWritersRoom };
