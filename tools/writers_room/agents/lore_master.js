/**
 * Agent 1: Lore Master & Tone Keeper
 * Original Dark Bronze-Age Worldbuilding & Grim Pulp Thematic Rules
 */

const ANCIENT_REALMS = {
  iron_wastes: "A gloomy northern realm of frozen crags, dark pine forests, black iron peaks, and unrelenting storms, homeland of the iron-born barbarians.",
  sarkesh: "A sinister southern kingdom of brooding black basalt pyramids, serpent sorcery, grey lotus incense, and subterranean wyrm worship.",
  valkash: "The City of Shadows, narrow labyrinthine alleys, hidden poison markets, spider cults, and cutthroats.",
  ophirion: "A proud decadent kingdom of marble citadels, gilded war chariots, corrupt oligarchs, and mercenary legions."
};

const THEMATIC_PILLARS = [
  "Barbarism vs. Decadence (civilized empires rot from luxury, deceit, and greed; the barbarian survives on raw instinct, unbending grit, and cold steel)",
  "Cosmic Dread & Elder Terrors (sorcery is foul, eldritch, and dangerous—blood sacrifices awakening primordial abominations older than mankind)",
  "Visceral Physicality & Iron Law (steel, muscle, swift reflexes, and unyielding courage overcome supernatural corruption)",
  "Moody Evocative Prose (dark brooding landscapes, crimson sunsets, heavy ink chiaroscuro shadows, ancient crumbling ruins)"
];

function generatePremise(themeKeyword = "sarkeshian_serpent") {
  return {
    title: "The Slumbering Serpent of Sarkesh",
    region: "Sarkesh",
    regionDescription: ANCIENT_REALMS.sarkesh,
    logline: "In the shadow of a forgotten black obsidian pyramid on the Sarkeshian border, Korvath breaches an ophidian cult's crypt to claim the Blood-Ruby of Sarkath, freeing the captive desert dancer Natari while awakening and sundering an elder titan wyrm.",
    themes: THEMATIC_PILLARS
  };
}

module.exports = { generatePremise, ANCIENT_REALMS, THEMATIC_PILLARS };
