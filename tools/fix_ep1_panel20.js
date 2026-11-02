const fs = require('fs');
const path = require('path');
const { renderPromptVenice } = require('./render_panel_venice');

const ep1Path = path.join(__dirname, '..', '01_Script', 'episodes', 'episode_01.json');
const ep1 = JSON.parse(fs.readFileSync(ep1Path, 'utf8'));
const p20 = ep1.find(p => p.panelId === 20);

const fixedPrompt = `classic vintage 1970s sword-and-sorcery graphic novel comic book panel, Frank Frazetta and John Buscema illustration style, dramatic heavy black ink brushwork, crisp fine cross-hatching, rich cel-shaded digital colors, theatrical chiaroscuro lighting, dark pulp fantasy aesthetic, masterwork sequential art, Epic Panoramic Sunset/Sunrise Hero Shot, Low Heroic Upward Perspective, Warm golden dawn sunlight washing over their bronze sun-kissed skin and glittering scale armor, long dramatic shadows across the red dunes, Korvath stands upon the crest of a crimson sand dune, his massive two-handed straight iron broadsword rested across his scarred bronze shoulders with plain rectangular carved iron crossguard, straight black wire-wrapped grip, and unadorned solid iron octagonal pommel, strictly NO jewels or gems on the sword hilt or pommel. At his side stands Natari, breathtaking desert maiden in her revealing hammered bronze scale bikini and crimson silk sash, holding aloft on a separate braided copper necklace the pulsing scarlet Blood-Ruby of Sarkath completely detached from any weapon, gazing out over the vast untamed desert under a glorious golden sunrise, korvath, towering 6'4 barbarian warrior, facial blend of Henry Cavill and Jason Momoa, massive chiseled square jaw with subtle cleft, smoldering steely blue wolfish eyes, heavy dark brooding brow, square-cut shaggy raven-black hair falling to broad shoulders, deeply muscled scarred bronze torso, weathered leather chest harness with brass studs, wolf-fur loincloth, heavy leather combat boots with calf wraps, diagonal scar across left collarbone, natari, breathtaking exotic desert maiden, facial blend of Salma Hayek and Ana de Armas, high chiseled cheekbones, smoldering kohl-lined feline eyes, luscious lips, long cascading glossy raven hair adorned with bronze beads, revealing hammered bronze scale bikini top, matching low-slung chain bikini bottoms, sheer gossamer crimson silk loincloth sash, coiled gilded serpent armbands and jeweled hip chains, flawless sun-kissed bronze skin, At the top corner of the panel, include a clean yellow vintage comic book narrative caption box with black border containing the exact readable English text: "From the frozen crags of the northern wastes strode Korvath—lone wolf, reaver, breaker of chains. With cold steel and an unbending will, he carved his legend across the burning sands of a dying world."`;

p20.prompt = fixedPrompt;
fs.writeFileSync(ep1Path, JSON.stringify(ep1, null, 2), 'utf8');

const targetRaw = path.join(__dirname, '..', '02_Assets', 'Episode_01', 'raw', 'panel_20.webp');
const targetSelected = path.join(__dirname, '..', '02_Assets', 'Episode_01', 'selected', 'panel_20.webp');
const docsTarget = path.join(__dirname, '..', 'docs', 'assets', 'panel_20.webp');

console.log('⚡ Re-rendering Episode 1 Panel 20 with isolated unadorned broadsword...');
renderPromptVenice(fixedPrompt, targetRaw)
  .then(() => {
    fs.copyFileSync(targetRaw, targetSelected);
    fs.copyFileSync(targetRaw, docsTarget);
    console.log('✅ Episode 1 Panel 20 re-rendered and updated across selected and docs!');
  })
  .catch(err => {
    console.error('Error re-rendering Ep1 P20:', err);
  });

