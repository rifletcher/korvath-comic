const fs = require('fs');
const path = require('path');

const sbPath = path.join(__dirname, '..', '01_Script', 'storyboard.json');
let sb = JSON.parse(fs.readFileSync(sbPath, 'utf8'));

// Polish lore & uncensor action beats for Venice Grok
sb.forEach(p => {
  // Replace Cimmerian / Crom references with original Northern lore
  if (p.caption) {
    p.caption = p.caption.replaceAll('The Cimmerian', 'The Northman');
    p.caption = p.caption.replaceAll('the Cimmerian', 'the Iron-Born');
  }
  if (p.dialogue) {
    p.dialogue.forEach(d => {
      d.text = d.text.replaceAll('Crom', 'the Iron Gods');
    });
  }

  // Panel 5: Uncensored savage combat
  if (p.panelId === 5) {
    p.action = "With explosive pantherish speed, Korvath ducks beneath a curved scimitar and swings his massive two-handed broadsword in a brutal horizontal cleave, cleaving through the central cultist's torso with a spray of crimson blood as the shattered bronze cobra mask flies across the flagstones, the other cultists recoiling in terror.";
    p.prompt = p.prompt.replace(
      "shattering the gilded cobra mask into flying bronze splinters and knocking him backward off balance as the others recoil in shock.",
      "cleaving through the central cultist's bronze armor in a savage lethal arc with a spray of dark crimson blood as the shattered gilded cobra mask flies free and the remaining cultists recoil in terror."
    );
  }

  // Panel 9: Uncensored climax kill
  if (p.panelId === 9) {
    p.action = "Korvath leaps from a shattered pillar high into the air, driving his massive broadsword downward with both hands deep into the serpent titan's skull between its burning eyes, a geyser of black venomous blood and mystic emerald sparks erupting from the death blow.";
    p.prompt = p.prompt.replace(
      "striking the heavy broadsword downward against the serpent's armored skull plates between its glowing eyes amidst an explosion of emerald sparks and mystic venom mist.",
      "driving the heavy broadsword downward with ferocious two-handed force deep between the serpent's armored skull plates, a violent eruption of dark venomous blood and emerald sorcerous sparks bursting from the fatal wound as the monster thrashes."
    );
  }
});

fs.writeFileSync(sbPath, JSON.stringify(sb, null, 2), 'utf8');
console.log('✅ Storyboard fully polished, de-copyrighted, and uncensored for Venice Grok!');

