---
name: comic-writers-room-and-prompts
description: >-
  Use this skill when authoring or modifying comic episode scripts, storyboards, or image generation prompts, applying a series' configurable artStyleAnchor and genre tone, adapting prompts for different image models (Meta AI, Grok, Flux, Recraft), or scaling an episode to a custom targetPanelCount (SCRIPT_GATE / Gate A).
---

# Writers' Room Scripting, Configurable Tone & Multi-Model Prompt Engineering (Gate A)

Use this runbook whenever generating or editing `storyboard.json` scripts and panel prompts for any comic series in the studio.

## 1. Configurable Series Tone & Artistic Framing Prefix (`artStyleAnchor`)

Because the studio renders multiple comic series across different genres, visual tones, and AI models, **never hardcode a single comic's tone across all projects**. Read the series configuration from `projects/<comicId>/project.json`:

- **`genre`:** Defines the narrative tone, pacing, and dialogue cadence for the Writers' Room (e.g., `"1970s Sword-and-Sorcery Pulp Graphic Novel"`, `"Dark Stealth Heist Anthology"`, `"Cyberpunk Noir"`, `"Gothic Horror"`).
- **`artStyleAnchor`:** Defines the mandatory visual style prefix prepended to every panel prompt in that series.
- **How to Apply `artStyleAnchor`:**
  1. Every panel prompt in an episode **MUST** begin with its parent series' configured `artStyleAnchor`.
  2. Include `"graphic novel comic book panel"` or `"sequential comic art illustration"` inside the anchor so image generators lock onto sequential comic framing rather than live-action photography.

## 2. Multi-Model Selection & Model-Specific Prompt Rules (`imageEngine`)

Each comic series sets a `defaultImageEngine` in `projects/<comicId>/project.json`, and individual episodes can override `imageEngine` in `projects/<comicId>/episodes/<episodeId>/manifest.json`. Adapt prompt vocabulary based on the active model:

| Engine ID | Provider / Transport | Safety Filter Profile & Prompt Strategy |
| :--- | :--- | :--- |
| `meta-ai-cdp` | Meta AI (Chrome CDP) | **Strict Llama Guard Classifier:** Requires euphemistic vocabulary substitution (see table below). Never send raw trigger words (`blood`, `kill`, `decapitate`, `gore`, `naked`). |
| `grok-imagine-image-2-0` | xAI Grok Imagine 2.0 (Venice API) | **Uncensored / Direct (`safe_mode: false`):** Supports uncompromised pulp fantasy and visceral combat descriptors (`"blade dripping with dark crimson blood"`, `"revealing hammered bronze scale bikini"`). Excels at in-panel speech bubble text. |
| `grok-cdp` | xAI Grok Web (Chrome CDP) | **Permissive Direct Mode:** Supports direct action and dark fantasy prompts in an isolated `grok.com` browser tab without corporate Llama Guard refusals. |
| `flux-2-pro` | Black Forest Labs FLUX-2 Pro (Venice API) | **Uncensored High-Fidelity (`safe_mode: false`):** Best for complex anatomical poses, dramatic chiaroscuro lighting, and exact weapon geometry. |
| `recraft-v4` | Recraft v4 (Venice API) | **Crisp Ink & Typography (`safe_mode: false`):** Excels at heavy black ink brushwork, cross-hatching, and razor-sharp English lettering in captions/balloons. |
| `lustify-v8` | Lustify v8 (Venice API) | **Uncensored Pulp Pin-Up (`safe_mode: false`):** Specialized for classic Frank Frazetta / Boris Vallejo heroic proportions and exotic pulp wardrobe. |

### Meta AI (`meta-ai-cdp`) Euphemistic Substitutions
*Apply these substitutions **only** when rendering on `meta-ai-cdp` (or strict-guardrail engines):*
- `blood` / `bleeding` / `gore` $\rightarrow$ `crimson mist`, `dark ichor`, `scarlet splatter`
- `kill` / `murder` / `slaughter` $\rightarrow$ `strike down`, `vanquish`, `overpower`
- `decapitate` / `sever` / `dismember` $\rightarrow$ `sunder`, `cleave through`, `shatter armor`
- `naked` / `nude` $\rightarrow$ `scarred bronze muscular torso`, `silhouette in shadow`, or explicit wardrobe layers
- `corpse` / `dead body` $\rightarrow$ `fallen warrior`, `ancient skeletal remains`

## 3. Configurable Episode & Panel Pacing (`targetPanelCount`)

Every episode dynamically scales its 3-Act structure to match the configured `targetPanelCount` (from `manifest.json` or `project.json`'s `defaultPanelsPerEpisode`):
- **Act I — Setup & Atmosphere ($\approx 25\%$ of panels):** Establish geography, lighting, wardrobe state, and carried items using the series' `genre` tone.
- **Act II — Escalation & Confrontation ($\approx 50\%$ of panels):** Introduce antagonists/obstacles using formation syntax, environmental hazards, and action exchanges.
- **Act III — Climax & Resolution/Cliffhanger ($\approx 25\%$ of panels):** Decisive turning point, object/relic state transition, and closing hook for the next episode in the `targetEpisodeCount` arc.

## 4. Configurable Series Invariants (Anti-Hallucination Guards)

Regardless of which AI model renders the panel (`meta-ai-cdp`, `grok-imagine-image-2-0`, `flux-2-pro`, etc.), inject the series-specific `invariants` from `projects/<comicId>/project.json`, `character_prompts.json`, and `object_prompts.json`:

1. **Weapon / Equipment Count & Attribution Invariant:**
   - Lock each character to their registered weapon/gear in `object_prompts.json` and explicitly forbid accidental duplication (e.g., `"only one <weapon> in the entire scene"` to prevent AI dual-wielding hallucinations).
2. **Human Hand & Grip Invariant:**
   - Prevent claw/monster hands when holding ornate relics, weapons, or devices:
     `"anatomically natural five-fingered human hands gripping the <object>"`
3. **Numerical Cardinality via Formation Syntax:**
   - Never write raw numbers like `"3 guards"`. Always specify geometric formation:
     `"A tight symmetrical triangle formation of three <antagonists>..."`
4. **Speech Bubble Pointer Placement:**
   - When requesting in-panel text, explicitly state which character the speech balloon pointer must point to:
     `"white comic speech balloon at top right with its pointer tail pointing directly at <Speaker>'s mouth (NOT pointing at <OtherCharacter>)"`

## 5. Gate A Validation Checklist & Automated Verifier

Run the Gate A prompt invariant verifier before promoting past `SCRIPT_GATE` (automatically detects the series/episode `imageEngine` or accepts `--engine <modelId>`):
```bash
node .agents/skills/comic-writers-room-and-prompts/scripts/verify_storyboard_prompts.js --project projects/korvath-the-barbarian/project.json --storyboard 01_Script/storyboard.json --target-panels 20
```

- [ ] Panel count in `storyboard.json` (or `manifest.json`) matches the configured `targetPanelCount`.
- [ ] Every panel prompt begins with the series' configured `artStyleAnchor` from `project.json`.
- [ ] Prompt vocabulary matches the active `imageEngine` safety profile (`meta-ai-cdp` sanitized vs. `grok-imagine-image-2-0` / `flux-2-pro` direct uncensored).
- [ ] Every `dialogue[].speaker` maps to a valid key or alias in `voice_registry.json`.
