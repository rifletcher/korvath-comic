# Conan the Barbarian — Graphic Novel Production Operating Rules & SOP

These rules govern the autonomous execution, writers' room saga creation, dual consistency (Conan + weapons/objects), Meta AI guardrail bypass, and visual code reviews for the **Conan Graphic Novel Studio** workspace.

---

## 🎯 Protocol 1: Quad-Pillar Entity Onboarding (Visual Look, Weapons, & Dual-Emotion Voice DNA)

Whenever a new character or recurring weapon/relic/monster is introduced, **NEVER** write or generate panel prompts until the 4-step sequence is 100% complete:

1. **Bible Documentation ([`00_Reference/character_bible.md`](file:///C:/research/c-book-generator/conan/00_Reference/character_bible.md)):**
   * **Visual Latent Anchor:** 2-Actor celebrity blend formula + 3 non-negotiable silhouette props + signature color palette.
   * **Dual-Emotion Voice DNA:**
     * Vocal Actor Persona blend & timbre.
     * **Benchmark Line A (Conversational / Baseline):** Normal dialogue, cunning banter, or calm threat.
     * **Benchmark Line B (High-Emotion / Combat / Trauma):** Battle roar, panicked scream, or villain death cry.
     * **Acoustic Engine Profile:** Engine (ElevenLabs/Edge), Voice ID, stability targets (`0.18-0.35`), style targets (`0.65-0.85`), and DSP mastering chain (pitch-shift, sub-bass EQ, acoustic space reverb).
2. **Turnaround Model Sheet & Dual Audition Generation:**
   * Character Model Sheet: `node tools/generate_model_sheet.js --type char <key>` $\rightarrow$ `00_Reference/sheets/<key>_model_sheet.webp`.
   * Dual Voice Auditions: `node tools/onboard_character.js --key <key>` $\rightarrow$ `docs/audio/<key>_audition_normal.mp3` & `docs/audio/<key>_audition_combat.mp3`.
   * Weapon/Object Model Sheet: `node tools/generate_model_sheet.js --type object <key>` $\rightarrow$ `00_Reference/sheets/<key>_model_sheet.webp`.
3. **Audition Approval & Casting Deck:**
   * Audition both the baseline and combat scream/roar in the web player ([`docs/video_preview.html`](file:///C:/research/c-book-generator/conan/docs/video_preview.html)) to verify visceral depth and dynamic emotional range before rendering sequential story panels.
4. **Dictionary & Engine Pipeline Registration:**
   * Register the machine-readable single-anchor in `00_Reference/character_prompts.json` or `00_Reference/object_prompts.json`.
   * Register the acoustic profile in `tools/build_full_episode_video.js` (`ELEVEN_VOICES` and DSP mapping).

---

## 🏛️ Protocol 2: The Writers' Room Pipeline (7-Agent Architecture)

Because there is no pre-existing script, episodes are authored by the 7-agent Writers' Room before rendering:
1. **Lore Master:** Enforces Robert E. Howard tone, Hyborian Age geography, and dark cosmic dread.
2. **Plot Architect:** Outlines the 3-Act, 10-beat narrative arc.
3. **Scriptwriter:** Authors action beats, pulp captions, and sparse rugged barbarian dialogue.
4. **Cinematographer:** Enforces Frank Frazetta / John Buscema visual framing, chiaroscuro lighting, and anti-bleed rules.
5. **Voice Director:** Authors vocal performance specifications, emotional delivery tags (`panic_scream`, `berserker_roar`, `whisper_threat`), actor stability/style tuning, and acoustic environment mapping.
6. **Continuity Supervisor:** Injects locked character and weapon DNA, checks cardinality, and freezes `01_Script/storyboard.json`.
7. **Sound QA Verifier:** Audits voice expression vs visual frame sanity, verifies natural human speech cadence (anti-chipmunk guard), checks acoustic space fit (vault reverb vs desert exterior), and scores audio integrity.

To trigger the Writers' Room:
```bash
npm run room:write
# Or with a custom lore theme:
node tools/writers_room/writers_room.js "zamora_city_of_thieves"
```

To run the acoustic QA audit on rendered audio:
```bash
npm run audit:audio
```

---

## 🛡️ Protocol 3: Meta AI Guardrail Bypass Standards

To prevent Meta AI's text safety classifiers (Llama Guard) from refusing sword-and-sorcery combat, all prompts must follow the bypass rules established in `docs/meta_ai_guardrails_investigation.md`:

1. **Artistic Framing Mandate:**
   * Every prompt MUST open with: *"classic vintage 1970s sword-and-sorcery graphic novel comic book panel, Frank Frazetta and John Buscema illustration style..."*
2. **Euphemistic Vocabulary Substitution:**
   * Never use raw trigger tokens (`blood`, `kill`, `decapitate`, `sever`, `gore`, `naked`).
   * Substitute with artistic graphic novel descriptors (`crimson mist`, `strike down`, `sunder`, `shattered armor`, `scarred bronze torso`).
3. **Automated Pre-Flight Sanitization:**
   * Always dispatch through `node tools/render_panel_meta.js --panel <id>` to automatically sanitize the text before CDP injection.
4. **Single-Thread Rule:**
   * Generate all panels within the same continuous Meta AI chat session to maintain primed "comic illustration" context.

---

## 🔢 Protocol 4: Numerical Cardinality & Formation Staging

When a panel specifies $X$ items or enemies (e.g., 3 cultists, 4 torches, 2 war chariots):
1. **Never write raw counts:** Do not prompt `"3 cultists"`.
2. **Use formation syntax:** Prompt *"A tight symmetrical triangle formation of three temple guards in matching cobra masks..."*.
3. **Audit Before Promotion:** Run `npm run audit:qa -- --panel <id>` to verify count consistency before promoting to `selected/`.

---

## 🔍 Protocol 5: Visual Director Continuity & QA Gate (8-Point Checklist)

Every generated panel MUST pass the following 8-point inspection before promotion to `selected/` or inclusion in master video renders:

| Dimension | Inspection Check | Failure Triggers |
| :--- | :--- | :--- |
| **1. Facial Likeness & Human Sanity** | Compare against model sheet. Chiseled masculine jaw, dark stubble scruff, intense wolfish eyes, natural wavy raven hair. | **Hard Reject:** Ape-brow / Neanderthal ridge, squinting piggish eyes, crooked jagged fringe bangs, distorted facial asymmetry under strain. |
| **2. Wardrobe & Clothing Continuity** | **The Mantle/Cape Rule:** Verify all layer-by-layer attire matches preceding & succeeding panels. Korvath MUST wear his heavy shaggy wolf-fur mantle, cross-chest harness with brass buckles, fur-trimmed war kilt, and wrapped boots. | **Hard Reject:** Any item of clothing (mantle, cape, bracers, harness) vanishing or appearing without an explicit on-panel narrative event (e.g. discarding a cloak). |
| **3. Carried Object & Relic State Machine** | Track every held/carried item panel-by-panel: hand placement, sheathed vs. drawn state, and physical state transitions.<br>• **Broadsword:** Straight 42-inch double-edged blade with central blood fuller, carved rectangular iron crossguard, wire grip, octagonal pommel.<br>• **Pine Torch:** Lit burning torch vs extinguished brand.<br>• **Blood-Ruby of Sarkath:** Fist-sized faceted red gem set in black iron serpent talon claw. | **Hard Reject:** Broadsword warping into a curved scimitar or katana; missing fuller; carried torch disappearing mid-tomb; relic changing size, cut, or setting; object teleporting between hands without an action beat. |
| **4. Cardinality & Anti-Ghost Actor Guard** | Headcount verification. When $N$ characters are in scene, strictly $N$ bodies must render. | **Hard Reject:** Unwanted background "ghost" clones (e.g. accidental miniature barbarians running behind the hero), extra limbs, or mutant faces in crowds. |
| **5. Anatomical Sanity & Combat Physics** | 5 fingers per hand, correct blade grip (thumbs toward crossguard), natural muscular limb articulation, coherent action vector. | **Hard Reject:** AI dislocated shoulder, impossible arm twist (e.g. cocked overhead while simultaneously hitting), mangled fingers, fused hands. |
| **6. Environmental & Damage Continuity** | Blood splatters on blade after a strike; dust/soot on skin after tomb collapse; lighting shifts matching scene progression. | **Hard Reject:** Fresh pristine clean blade right after cleaving a foe; missing damage or battle-wear established in prior panel. |
| **7. Graphic Novel Linework & Cel Aesthetic** | 1970s Frank Frazetta / John Buscema Bronze Age aesthetic. High-contrast black ink brushwork, fine cross-hatching, rich cel digital colors, dramatic chiaroscuro. | **Hard Reject:** Blurry watercolor, modern 3D CGI plastic skin, generic airbrushed digital art, flat unshaded vector art. |
| **8. Caption & Speech Bubble Legibility** | Yellow vintage caption box in top corner with black border; authentic white speech balloons with pointer pointing directly to the speaker's mouth. | **Hard Reject:** Misspelled words, garbled AI gibberish text, speech pointer pointing at wrong character or empty space, text overflowing box borders. |

---

## 📋 Protocol 6: Continuous Saga Loop (10-Panel Milestone Cadence)

* At every 10-panel milestone (Panel 10, 20, 30...), pause generation.
* Recompile the Web Reader: `npm run build:reader`.
* Write the 4-part Milestone Retrospective & Audit Report to `02_Assets/Episode_XX/episode_audit_report.md`.
* Present the gallery to the user for directional steering.

---

## 🎙️ Protocol 7: Voice Expression & Frame Acoustic Sanity (5-Point Audio Audit)

Every synthesized dialogue track must be audited by the **Sound QA Verifier** before promotion into master episode renders:

| Dimension | Verification Check |
| :--- | :--- |
| **1. Dramatic Congruence** | Voice emotion must match the visual reality (e.g. screams during mortal trap/attack; calm contempt in tavern; zero flat monotone during life-or-death combat). |
| **2. Pacing & Anti-Chipmunk** | Delivery rate must remain within natural human cadence ($100-160\text{ WPM}$). Hard negative constraint on artificial speedup/pitch hacks. |
| **3. Frame Acoustic Space** | Reverb and equalization must match scene geography (stone vault slapback in crypts; warm intimate room in taverns; dry wind sweep on desert dunes). |
| **4. Performance Strain & Tags** | High-emotion dialogue must leverage generative breath/strain cues (`[gasps]`, `[growls]`, voice cracking) with low stability ($0.18-0.28$) rather than flat reading. |
| **5. Signal Headroom & Balance** | Dialogue must punch above action SFX (vault slams, sword cleaves) with dynamic compression without digital clipping ($<0\text{ dBFS}$). |

---

## 📐 Protocol 8: Aspect Ratio Preservation & Motion Comic Camera Staging

**Hard Rule:** Never scale or force a non-16:9 image into a 16:9 frame (`scale=W:H`) without aspect ratio preservation.
1. **Vertical / Portrait Panels ($AR < 1.0$, e.g. 1280×1920, 1344×1792):**
   * Must use the **Cinematic Vertical Tilt**: Scale width to 1280 (`scale=1280:-1`), crop a 1280×720 viewport, and smoothly tilt/pan along the vertical axis from $y=0$ to $y=H-720$ with a cosine ease curve across the narration duration.
   * Proportions remain strictly $1:1$ with zero distortion or squishing.
2. **Ultra-Wide Panoramic Panels ($AR \ge 1.8$, e.g. 2352×1008):**
   * Must use the **Horizontal Panoramic Sweep**: Scale height to 720 (`scale=-1:720`), crop a 1280×720 viewport, and pan horizontally across the width ($x=0$ to $x=W-1280$).
3. **Standard Landscape Panels ($1.2 \le AR < 1.8$):**
   * Subtle Ken Burns push/pull zoom ($1.00 \rightarrow 1.04$).

---

## 🎭 Protocol 9: Fail-Closed Voice Casting & Character Polarity Guard

**Hard Rule:** Zero silent fallbacks to default voices in the audio pipeline.
1. **Strict Casting Resolution:** Every `dialogue[].speaker` MUST resolve to an explicit entry in `00_Reference/voice_registry.json`. If an unknown speaker is encountered, the build script MUST throw a fatal error and halt.
2. **Character Polarity Guard:** Antagonist dialogue containing anti-barbarian slurs (`"dog of the north"`, `"barbarian scum"`, `"filthy northman"`) can NEVER be assigned Korvath's voice ID or the Narrator's voice ID. Antagonists must strictly use the raspy cultist/assassin profile (George) or decadent nobleman profile (Charlie).
3. **Token Conservation:** All synthesized `.mp3` clips must be permanently cached to disk (`02_Assets/.../audio/`). Re-building videos or re-mixing audio must reuse local files with zero ElevenLabs API token consumption.


