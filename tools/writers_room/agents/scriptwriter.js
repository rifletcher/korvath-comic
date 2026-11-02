/**
 * Agent 3: Scriptwriter & Dialogue Agent
 * Original Dark Bronze-Age Action, Savage Captions, and Rugged Dialogue.
 */

function generateScript(beats) {
  console.log("✍️ [Agent 3: Scriptwriter] Authoring 20-panel saga script for Korvath...");

  return beats.map((b, idx) => {
    const panelId = idx + 1;
    switch(panelId) {
      // --- ACT I: THE INFILTRATION & AMBUSH (1-6) ---
      case 1:
        return {
          panelId: 1,
          beat: b,
          action: "A solitary, massive barbarian warrior treks through towering scarlet desert dunes toward a monolithic, crumbling black basalt pyramid half-buried in shifting sand under a violent blood-orange dusk.",
          caption: "Before the first iron towers rose, and before the empires of dust forgot their makers, there walked an older breed of men—forged in blood, bound by no king's law.",
          dialogue: [],
          characters: ["korvath"],
          objects: ["broadsword"],
          focalSubject: "environment"
        };
      case 2:
        return {
          panelId: 2,
          beat: b,
          action: "Korvath kneels upon one knee in the wind-whipped sand, inspecting freshly disturbed footprints near a dry animal skull, scarred weathered fingers resting securely on the wire-bound hilt of his massive broadsword.",
          caption: "He smelled the bitter smoke of grey lotus on the desert wind—and the cold oil of drawn blades.",
          dialogue: [],
          characters: ["korvath"],
          objects: ["broadsword"],
          focalSubject: "korvath"
        };
      case 3:
        return {
          panelId: 3,
          beat: b,
          action: "Korvath heaves aside an ancient shattered granite door slab carved with writhing serpent reliefs, descending down steep stone stairs into the shadowed crypt, holding high a blazing pine pitch torch.",
          caption: "Into the bowels of forgotten Sarkesh he strode, where gods older than mankind slept in stagnant gloom.",
          dialogue: [],
          characters: ["korvath"],
          objects: ["broadsword", "pine_torch"],
          focalSubject: "korvath"
        };
      case 4:
        return {
          panelId: 4,
          beat: b,
          action: "Korvath stalks cautiously down a grand subterranean hall between colossal stone pillars carved like giant rearing cobras, dust and ancient web filaments floating in the orange torch flare.",
          caption: "The air tasted of tomb-rot and dried venom. A thousand dead eyes watched from the stone.",
          dialogue: [],
          characters: ["korvath"],
          objects: ["broadsword", "pine_torch"],
          focalSubject: "korvath"
        };
      case 5:
        return {
          panelId: 5,
          beat: b,
          action: "Three masked Sarkeshian cultists in flowing crimson robes and gilded bronze cobra masks drop from carved temple pillars, curved steel scimitars raised in ambush.",
          caption: "They sprang like shadows from the tomb pillars—silent as striking adders.",
          dialogue: [
            {
              speaker: "Sarkeshian Cultist",
              text: "Die, dog of the north! Sarkath claims your flesh!"
            }
          ],
          characters: ["cultist_trio"],
          objects: ["scimitars"],
          focalSubject: "cultist_trio"
        };
      case 6:
        return {
          panelId: 6,
          beat: b,
          action: "With explosive pantherish speed, Korvath ducks beneath a curved scimitar and swings his massive two-handed broadsword in a brutal horizontal cleave, cleaving through the central cultist's torso with a spray of crimson blood as the shattered bronze cobra mask flies across the flagstones, the other cultists recoiling in terror.",
          caption: "Civilized men debate right and wrong. The Northman answered with four feet of tempered steel.",
          dialogue: [
            {
              speaker: "Korvath",
              text: "Tell Sarkath his rent is due."
            }
          ],
          characters: ["korvath"],
          objects: ["broadsword"],
          focalSubject: "korvath"
        };

      // --- ACT II: THE TEMPLE OF SARKATH, BIKINIS & ELDER HORROR (7-13) ---
      case 7:
        return {
          panelId: 7,
          beat: b,
          action: "Wide view of the opulent temple cavern bathed in hazy green light and swirling lotus smoke. On plush silk cushions lounge two gorgeous exotic maidens in revealing hammered bronze scale bikinis and jeweled arm torcs, while smoking bronze serpent braziers exhale swirling grey incense into the vaulted gloom.",
          caption: "Behind the charnel-house lay decadence. Scented lotus, velvet pillows, and the captive flowers of conquered desert tribes.",
          dialogue: [],
          characters: ["temple_maidens"],
          objects: [],
          focalSubject: "temple_maidens"
        };
      case 8:
        return {
          panelId: 8,
          beat: b,
          action: "Dramatic medium shot of Natari, breathtaking exotic desert maiden in a revealing hammered bronze scale bikini and jeweled hip chains, bound by delicate gilded serpent chains to a black basalt pillar before the sacrificial dais, her smoldering kohl-lined feline eyes looking upward into the shadows where Korvath crouches ready.",
          caption: "She did not weep like the women of the south. Her dark eyes held the fire of a desert panther waiting for blood.",
          dialogue: [
            {
              speaker: "Natari",
              text: "Strike swiftly, barbarian... or we both feed the abyss."
            }
          ],
          characters: ["natari"],
          objects: [],
          focalSubject: "natari"
        };
      case 9:
        return {
          panelId: 9,
          beat: b,
          action: "At the far end of the grand colonnade, High Priest Kheshat in pleated black silk robes stands before an ancient stone dais bathed in swirling emerald sorcerous fire, holding aloft a carved ebony serpent staff, invoking the dark rites.",
          caption: "Upon the dais stood the high priest of the serpent, drunk on dark lotus and foul sorceries.",
          dialogue: [
            {
              speaker: "Kheshat",
              text: "O Sleeper of the Deep! Taste the virgin blood and rise!"
            }
          ],
          characters: ["kheshat"],
          objects: ["serpent_staff"],
          focalSubject: "kheshat"
        };
      case 10:
        return {
          panelId: 10,
          beat: b,
          action: "Korvath drops from the high balcony into the center of the sanctuary with earth-shaking impact, broadsword raised in two-handed grip, hurling his blazing torch directly into the altar brazier as sparks explode and temple guards scramble in panic.",
          caption: "He did not parley. He did not boast. A barbarian strikes while civilized men are still clearing their throats.",
          dialogue: [
            {
              speaker: "Korvath",
              text: "The only god you answer to today is cold iron!"
            }
          ],
          characters: ["korvath"],
          objects: ["broadsword", "pine_torch"],
          focalSubject: "korvath"
        };
      case 11:
        return {
          panelId: 11,
          beat: b,
          action: "An immense primordial serpent beast emerges from a subterranean trench behind the altar, emerald iridescent scales catching the mystic fire, unhinging jaws lined with dagger-like fangs as it hisses with earth-shaking venom.",
          caption: "Not a beast of nature, but a nightmare spawned before the stars grew cold.",
          dialogue: [],
          characters: [],
          objects: ["serpent_beast"],
          focalSubject: "serpent_beast"
        };
      case 12:
        return {
          panelId: 12,
          beat: b,
          action: "The colossal serpent thrashes violently, thick armored coils smashing through a massive stone pillar which splinters into falling granite boulders. In the foreground, Natari and the maidens in their bronze scale bikinis dive for cover behind the heavy throne dais.",
          caption: "The temple groaned under the wrath of an elder age. The foundations of Sarkesh began to crumble.",
          dialogue: [],
          characters: ["natari"],
          objects: ["serpent_beast"],
          focalSubject: "serpent_beast"
        };
      case 13:
        return {
          panelId: 13,
          beat: b,
          action: "High Priest Kheshat screams in horror as the titan serpent's gargantuan horned maw snaps shut around him, splintering his ebony staff and black silk robes mid-prayer as dark crimson blood sprays across the altar stones.",
          caption: "The gods of darkness have no love for their priests—only hunger.",
          dialogue: [
            {
              speaker: "Kheshat",
              text: "No! I am your voice! I am your—AARRGH!"
            }
          ],
          characters: ["kheshat"],
          objects: ["serpent_staff", "serpent_beast"],
          focalSubject: "serpent_beast"
        };

      // --- ACT III: CLIMAX, COLLAPSE & CRIMSON DAWN (14-20) ---
      case 14:
        return {
          panelId: 14,
          beat: b,
          action: "Korvath stands firm amid the green sorcerous glare and crashing debris, broad scarred muscles tensed, smoldering blue wolfish eyes wide with battle-fury, lips pulled back in a fierce, fearless warrior grin.",
          caption: "Men bred in cities trembled before the dark gods. But a barbarian from the northern crags knew only that anything that breathes can die.",
          dialogue: [
            {
              speaker: "Korvath",
              text: "Hiss all you want, worm! The Iron Gods do not care, and neither do I!"
            }
          ],
          characters: ["korvath"],
          objects: ["broadsword"],
          focalSubject: "korvath"
        };
      case 15:
        return {
          panelId: 15,
          beat: b,
          action: "The monstrous serpent lunges downward with dagger fangs bared, acidic venom hissing as it corrodes the flagstones, while Korvath executes an athletic combat roll across the shattered floor, broadsword trailing sparks across the stone.",
          caption: "Fast as a striking viper—faster still was the barbarian's wolfish instinct.",
          dialogue: [],
          characters: ["korvath"],
          objects: ["broadsword", "serpent_beast"],
          focalSubject: "korvath"
        };
      case 16:
        return {
          panelId: 16,
          beat: b,
          action: "Korvath leaps through the air from a shattered pillar, both hands gripping his broadsword overhead, driving the heavy broadsword downward with ferocious two-handed force deep between the serpent's armored skull plates, a violent eruption of dark venomous blood and emerald sorcerous sparks bursting from the fatal wound as the monster thrashes.",
          caption: "A leap that defied human limits—steel meeting ancient scale with the crash of thunder.",
          dialogue: [],
          characters: ["korvath"],
          objects: ["broadsword", "serpent_beast"],
          focalSubject: "korvath"
        };
      case 17:
        return {
          panelId: 17,
          beat: b,
          action: "The dying serpent titan convulses violently, black venom and blood pouring over the altar steps, as its heavy thrashing coils pull down the cavern ceiling in an avalanche of shattered stone and billowing dust clouds.",
          caption: "The serpent died as it lived—in a tempest of fury and black ichor that brought down the roof of the world.",
          dialogue: [],
          characters: [],
          objects: ["serpent_beast"],
          focalSubject: "serpent_beast"
        };
      case 18:
        return {
          panelId: 18,
          beat: b,
          action: "Amid falling stone boulders and billowing smoke, Korvath uses his notched broadsword to cleave the bronze chains binding Natari, pulling the beautiful bronze-bikini-clad maiden to her feet while clutching the glowing fist-sized Blood-Ruby of Sarkath in his scarred hand.",
          caption: "Gold, jewels, and a woman with fire in her veins—the only currency a barbarian respects.",
          dialogue: [
            {
              speaker: "Korvath",
              text: "Up, girl! Unless you fancy being buried with dead snakes!"
            },
            {
              speaker: "Natari",
              text: "Lead on, northern wolf!"
            }
          ],
          characters: ["korvath", "natari"],
          objects: ["broadsword", "blood_ruby"],
          focalSubject: "korvath"
        };
      case 19:
        return {
          panelId: 19,
          beat: b,
          action: "Korvath and Natari burst through the shattering stone entrance arch of the black pyramid into the blinding white-hot desert sunshine as the entire monolithic portal collapses behind them in a massive roaring eruption of sand and granite debris.",
          caption: "Behind them, a thousand years of serpent worship crashed into dust.",
          dialogue: [],
          characters: ["korvath", "natari"],
          objects: ["broadsword"],
          focalSubject: "korvath"
        };
      case 20:
        return {
          panelId: 20,
          beat: b,
          action: "Epic panoramic hero shot. Korvath stands upon the crest of a crimson sand dune, broadsword rested across his scarred bronze shoulders, wolf-fur loincloth windswept. At his side stands Natari, breathtaking desert maiden in her revealing hammered bronze scale bikini and crimson silk sash, gazing out over the vast untamed desert toward distant purple mountain peaks under a glorious golden sunrise.",
          caption: "From the frozen crags of the northern wastes strode Korvath—lone wolf, reaver, breaker of chains. With cold steel and an unbending will, he carved his legend across the burning sands of a dying world.",
          dialogue: [],
          characters: ["korvath", "natari"],
          objects: ["broadsword", "blood_ruby"],
          focalSubject: "korvath"
        };
      default:
        return {
          panelId,
          beat: b,
          action: b.summary,
          caption: "",
          dialogue: [],
          characters: ["korvath"],
          objects: ["broadsword"],
          focalSubject: "korvath"
        };
    }
  });
}

module.exports = { generateScript };
