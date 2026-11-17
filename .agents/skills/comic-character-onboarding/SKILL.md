---
name: comic-character-onboarding
description: >-
  Use this skill whenever onboarding a new character, villain, monster, weapon, or relic into a comic series, or before generating panels for an entity that lacks a turnaround model sheet, isolated prompt dictionary entry, or dual-emotion voice registration.
---

# Comic Character & Relic Quad-Pillar Onboarding

Never write or render story panels for a new character, recurring weapon, or relic until all four onboarding pillars are completed and verified.

## 1. Visual Latent Anchor & Anti-Bleed Isolation

1. **Document in [`00_Reference/character_bible.md`](file:///c:/research/c-book-generator/conan/00_Reference/character_bible.md)** (or the series-specific `projects/<comicId>/00_Reference/`):
   - **2-Actor Celebrity Blend Formula:** Anchor facial structure using two recognizable archetypes (e.g., young Arnold Schwarzenegger + Henry Cavill jaw/brow).
   - **3 Non-Negotiable Silhouette Props:** Lock wardrobe layers (e.g., heavy shaggy wolf-fur mantle, cross-chest leather harness with brass buckles, fur-trimmed war kilt).
   - **Signature Color Palette:** Define primary and accent hex/cel colors.
2. **Strict Character vs. Object Prompt Separation (Anti-Claw-Hand Rule):**
   - **NEVER** include relic or pedestal descriptors (such as *"black iron serpent claw setting"* or *"coiled tentacle hilt"*) inside a character's body or wardrobe prompt.
   - Store character body/wardrobe DNA exclusively in [`00_Reference/character_prompts.json`](file:///c:/research/c-book-generator/conan/00_Reference/character_prompts.json).
   - Store weapon/relic geometry exclusively in [`00_Reference/object_prompts.json`](file:///c:/research/c-book-generator/conan/00_Reference/object_prompts.json).
   - When a character holds an object in a panel, explicitly bind the interface with human anatomy: *"gripping the wire-wrapped hilt with five human fingers, thumb locked over the rectangular iron crossguard"*.

## 2. Turnaround Model Sheets

Generate visual reference sheets before rendering sequential panels:
- **Character Sheet:**
  ```bash
  node tools/generate_model_sheet.js --type char <key>
  ```
- **Weapon / Relic Sheet:**
  ```bash
  node tools/generate_model_sheet.js --type object <key>
  ```
- Verify output exists at `00_Reference/sheets/<key>_model_sheet.webp`.

## 3. Dual-Emotion Voice DNA & Auditions

1. **Register Actor & DSP Mastering Chain in [`00_Reference/voice_registry.json`](file:///c:/research/c-book-generator/conan/00_Reference/voice_registry.json):**
   - Verify the ElevenLabs `voice_id` returns HTTP 200 (never use unverified placeholder IDs).
   - Define both `stability` (`0.18–0.35` for combat, `0.40–0.55` for baseline) and `style` (`0.65–0.85`).
   - Specify the FFmpeg `dsp_filter` chain (e.g., Korvath's canonical Subterranean Kratos chain: `asetrate=44100*0.88,aresample=44100,equalizer=f=95:width_type=h:width=60:g=8,volume=1.45`).
2. **Generate Dual Audition Clips:**
   - **Benchmark Line A (Conversational / Baseline):** Cunning banter or low threat.
   - **Benchmark Line B (High-Emotion / Combat):** Battle roar, mortal strain, or death cry.
   ```bash
   node tools/onboard_character.js --key <key>
   ```

## 4. Verification Checklist

- [ ] Entry added to `character_prompts.json` or `object_prompts.json` with zero cross-entity attribute bleed.
- [ ] Model sheet `.webp` inspected for 5-finger human hands and consistent weapon geometry.
- [ ] Entry added to `00_Reference/voice_registry.json` with verified ElevenLabs Voice ID and DSP filter string.

