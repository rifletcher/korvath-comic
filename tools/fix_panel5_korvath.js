const fs = require('fs');
const path = require('path');
const { renderPromptVenice } = require('./render_panel_venice');

const fixedPrompt = `classic vintage 1970s sword-and-sorcery graphic novel comic book panel, Frank Frazetta and John Buscema illustration style, dramatic heavy black ink brushwork, crisp fine cross-hatching, rich cel-shaded digital colors, theatrical chiaroscuro lighting, dark pulp fantasy aesthetic, masterwork sequential art, Dynamic Action Ambush Shot, High Dutch Angle (Tension), Shattered fire embers, gleaming blades catching candle flame, Three agile shadow-assassins in black leather and web-spun masks leap from the tavern shadows, curved poisoned kris blades gleaming, overturning tables as tankards shatter across the stone floor toward Korvath seated in the foreground, in foreground seen from side profile, korvath, towering 6'4 barbarian warrior, facial blend of Henry Cavill and Jason Momoa, clean-shaven chiseled square jaw with subtle cleft, strictly clean-shaven NO beard, smoldering steely blue wolfish eyes, heavy dark brooding brow, distinctive square-cut mane of thick coarse raven-black hair with jagged front bangs, hair length strictly shoulder-length stopping at the collarbone, strictly raven black hair, deeply muscled scarred bronze torso, weathered leather chest harness with brass studs, wolf-fur loincloth, At the top corner of the panel, include a clean yellow vintage comic book narrative caption box with black border containing the exact readable English text: "The trap sprang not with a shout, but with the hiss of oiled steel.", Include an authentic white comic book speech balloon with black ink outline and directional pointer pointing toward Spider Assassin with the text: "Lord Malakor claims the jewel and your hides, northman!"`;

const rawDir = path.join(__dirname, '..', '02_Assets', 'Episode_02', 'raw');
const outPath = path.join(rawDir, 'panel_05.webp');

(async () => {
  console.log('⚡ Re-rendering Episode 2 Panel 5 with canonical raven-haired clean-shaven Korvath...');
  await renderPromptVenice(fixedPrompt, outPath);
  console.log('✅ Render complete: ' + outPath);
})();

