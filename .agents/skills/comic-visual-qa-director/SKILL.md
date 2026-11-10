---
name: comic-visual-qa-director
description: >-
  Use this skill when inspecting rendered comic panels (.webp/.png), executing the 8-Point Visual Director QA Gate (VISUAL_QA_GATE / Gate B), regenerating defective panels via Chrome CDP, or checking visual continuity before allowing voice synthesis.
---

# 8-Point Visual Continuity & QA Director (Gate B)

**HARD GATE RULE:** No episode may advance from `VISUAL_QA_GATE` to `VOICE_SYNTHESIS` until every panel passes this 8-point visual inspection against the series' configured style and model sheets, and receives explicit user sign-off.

## 1. How to Inspect Panels

Always view the actual rendered `.webp` image files using `read_file` alongside:
1. The series configuration in `projects/<comicId>/project.json` (`artStyleAnchor`, `genre`, and `invariants`).
2. The character and object turnaround model sheets in [`00_Reference/sheets/`](file:///c:/research/c-book-generator/conan/00_Reference/sheets) (or `projects/<comicId>/00_Reference/sheets/`).

Never mark any panel as `APPROVED` based solely on text metadata.

## 2. The 8-Point Inspection Rubric (Series-Configurable)

| # | Dimension | Pass Criteria | Hard Reject Triggers |
| :--- | :--- | :--- | :--- |
| **1** | **Facial Likeness & Sanity** | Matches the character's registered model sheet and 2-actor blend in `character_prompts.json`. | Distorted facial proportions, squinting/warped eyes, inconsistent hair cut/color, or off-model face. |
| **2** | **Wardrobe Continuity** | Every clothing/armor layer matches preceding and succeeding panels in the scene as defined in `character_prompts.json`. | Cloak, mantle, harness, or headgear vanishing or appearing mid-scene without an explicit narrative action beat. |
| **3** | **Carried Object & Equipment State** | Matches the geometry and count in `object_prompts.json` and `project.json` `invariants` (e.g., single straight broadsword vs. twin daggers). | Weapon warping shape, **accidental dual-wielding / duplicate weapons**, or carried items vanishing mid-scene. |
| **4** | **Cardinality & Anti-Ghost Guard** | Exact headcount $N$ matches the script's formation staging. | Accidental background "ghost" clones, extra limbs, or fused crowd bodies. |
| **5** | **Anatomical Sanity & Hands** | 5 human fingers per hand, natural grip on weapons/props, coherent shoulder and elbow articulation. | **Monster/claw hands** (relic prompt bleed), 6+ mangled fingers, impossible dislocated limb twist. |
| **6** | **Environmental & Damage Continuity** | Battle wear, splatters, dust, and lighting direction persist consistently across sequential beats. | Pristine clean weapon/gear immediately after impact; abrupt lighting or background teleportation. |
| **7** | **Series `artStyleAnchor` Fidelity** | Matches the series' configured `artStyleAnchor` and `genre` in `project.json` (e.g., 1970s Frazetta/Buscema ink brushwork, noir cross-hatching, or custom series palette). | Unwanted style drift (e.g., 3D plastic CGI skin, blurry watercolor, or flat vector art violating the series' `artStyleAnchor`). |
| **8** | **Caption & Speech Bubble Pointer** | Legible English text; **speech balloon pointer tail points directly to the actual speaker's mouth**. | Gibberish text, cut-off borders, or **pointer tail pointing at the wrong character** (e.g., antagonist line pointing at the hero's mouth). |

## 3. Speech Bubble Pointer Reconciliation Rule

If a panel's artwork passes points 1–7 and has legible text, **trace where the drawn speech balloon pointer tail points**:
- If the balloon points at Character A's mouth, the `storyboard.json` speaker for that line **MUST** be Character A (so the voice actor matches the visual speaker on screen), OR the panel must be regenerated with the pointer pointing at Character B.
- **Never** leave a panel where the visual speech pointer points at one character while a different character's voice actor speaks the line.

## 4. Regenerating Defective Panels in Isolated Worker Tabs

To regenerate a failed panel using the isolated Chrome CDP tab pool:
```bash
node tools/workers/comic_cli_worker.js --comic <comicId> --episode <episodeId> --stage render --panel <panelNum>
```
Or for the root pipeline:
```bash
node tools/render_panel_meta.js --panel <panelNum>
```
After regeneration, re-read the new `.webp` image with `read_file` to confirm all 8 points pass.
