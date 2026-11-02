# Conan the Barbarian — Graphic Novel Production Operating Rules & SOP

These rules govern the autonomous execution, writers' room saga creation, dual consistency (Conan + weapons/objects), Meta AI guardrail bypass, and visual code reviews for the **Conan Graphic Novel Studio** workspace.

---

## 🎯 Protocol 1: Dual Entity Onboarding (Characters & Weapons/Relics)

Whenever a new character or recurring weapon/relic/monster is introduced, **NEVER** write or generate panel prompts until the 3-step sequence is 100% complete:

1. **Bible Documentation:**
   * **Characters ([`00_Reference/character_bible.md`](file:///C:/research/c-book-generator/conan/00_Reference/character_bible.md)):** 2-Actor celebrity blend formula + 3 non-negotiable silhouette props + signature color palette.
   * **Objects & Relics ([`00_Reference/object_bible.md`](file:///C:/research/c-book-generator/conan/00_Reference/object_bible.md)):** Geometric shape language + surface materials + 3 non-negotiable silhouette anchors.
2. **Turnaround Model Sheet Generation:**
   * Character: `node tools/generate_model_sheet.js --type char <key>` (Front, 3/4, Action).
   * Weapon/Object: `node tools/generate_model_sheet.js --type object <key>` (Side Profile, Perspective, Action).
   * Save canonical webp to: `00_Reference/sheets/<key>_model_sheet.webp`.
3. **Dictionary Registration:**
   * Register the machine-readable single-anchor in `00_Reference/character_prompts.json` or `00_Reference/object_prompts.json`.

---

## 🏛️ Protocol 2: The Writers' Room Pipeline (Zero-Script Sagas)

Because there is no pre-existing script, episodes are authored by the 5-agent Writers' Room before rendering:
1. **Lore Master:** Enforces Robert E. Howard tone, Hyborian Age geography, and dark cosmic dread.
2. **Plot Architect:** Outlines the 3-Act, 10-beat narrative arc.
3. **Scriptwriter:** Authors action beats, pulp captions, and sparse rugged barbarian dialogue.
4. **Cinematographer:** Enforces Frank Frazetta / John Buscema visual framing, chiaroscuro lighting, and anti-bleed rules.
5. **Continuity Supervisor:** Injects locked character and weapon DNA, checks cardinality, and freezes `01_Script/storyboard.json`.

To trigger the Writers' Room:
```bash
npm run room:write
# Or with a custom lore theme:
node tools/writers_room/writers_room.js "zamora_city_of_thieves"
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

## 🔍 Protocol 5: Visual Code Review (6-Point Checklist)

| Dimension | Inspection Check |
| :--- | :--- |
| **1. Conan Likeness** | Compare against `00_Reference/sheets/char_conan_model_sheet.webp`. Square jaw, blue wolfish eyes, shaggy raven hair. |
| **2. Broadsword Consistency** | 42-inch straight double-edged blade with central fuller, carved iron crossguard, wire hilt. |
| **3. Anatomical Sanity** | 5 fingers per hand, powerful muscular proportions, correct blade grip. |
| **4. Cardinality & Count** | Verify enemy/prop counts match the geometric formation. |
| **5. Graphic Novel Linework** | High-contrast black ink brushwork, cross-hatching, rich cel digital colors. Zero blurry watercolor or CGI drift. |
| **6. Narrative & Caption Fit** | Framing leaves composition room for narrative caption boxes and dialogue bubbles. |

---

## 📋 Protocol 6: Continuous Saga Loop (10-Panel Milestone Cadence)

* At every 10-panel milestone (Panel 10, 20, 30...), pause generation.
* Recompile the Web Reader: `npm run build:reader`.
* Write the 4-part Milestone Retrospective & Audit Report to `02_Assets/Episode_XX/episode_audit_report.md`.
* Present the gallery to the user for directional steering.

