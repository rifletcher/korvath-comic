const fs = require('fs');
const path = require('path');

const storyboardPath = path.join(__dirname, '..', '01_Script', 'storyboard.json');
let s = fs.readFileSync(storyboardPath, 'utf8');

const conanOld = "conan, towering 6'4 barbarian warrior, facial blend of young Arnold Schwarzenegger and Jason Momoa, massive square jaw, smoldering blue wolfish eyes, heavy dark brow, square-cut shaggy raven-black hair falling to broad shoulders, deeply muscled scarred bronze torso, weathered leather chest harness with brass studs, wolf-fur loincloth, heavy leather combat boots with calf wraps, diagonal scar across left collarbone";
const korvathNew = "korvath, towering 6'4 barbarian warrior, facial blend of Henry Cavill and Jason Momoa, massive chiseled square jaw with subtle cleft, smoldering steely blue wolfish eyes, heavy dark brooding brow, square-cut shaggy raven-black hair falling to broad shoulders, deeply muscled scarred bronze torso, weathered leather chest harness with brass studs, wolf-fur loincloth, heavy leather combat boots with calf wraps, diagonal scar across left collarbone";

s = s.replaceAll(conanOld, korvathNew);
s = s.replaceAll('"conan"', '"korvath"');
s = s.replaceAll('Conan', 'Korvath');

fs.writeFileSync(storyboardPath, s, 'utf8');
console.log('✅ Storyboard successfully updated to Korvath with Henry Cavill + Jason Momoa DNA!');

