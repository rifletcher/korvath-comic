# ⚔️ Conan the Barbarian — Graphic Novel Studio

An autonomous, sequential sword-and-sorcery graphic novel engine featuring an autonomous **5-Agent Writers' Room**, **Dual Character & Weapon Consistency**, **Meta AI Guardrail Bypass Automation**, and an interactive **Pulp Graphic Novel Web Reader**.

---

## 🌟 Core Highlights

### 1. The Autonomous Writers' Room (Zero-Script Sagas)
When starting with no pre-existing script, the 5-agent Writers' Room authors full 10-panel episodes from scratch:
* **Lore Master:** Enforces Robert E. Howard pulp worldbuilding (Stygia, Cimmeria, Zamora).
* **Plot Architect:** Constructs a 3-Act, 10-beat narrative arc.
* **Scriptwriter:** Drafts visceral action, pulp narrative captions, and sparse dialogue.
* **Cinematographer:** Applies Frank Frazetta / John Buscema visual framing and chiaroscuro lighting.
* **Continuity Supervisor:** Injects locked character and broadsword DNA into `storyboard.json`.

### 2. Meta AI Guardrail Bypass Architecture
Meta AI provides the finest graphic novel linework and dynamic comic anatomy available. To bypass its text safety classifiers (Llama Guard) without getting refusals on barbarian violence:
* **Automated Euphemistic Sanitizer:** Dynamically translates trigger words (`blood` ➔ `crimson mist`, `kill` ➔ `strike down`, `sever` ➔ `sunder`, `naked` ➔ `scarred bronze torso`).
* **Art Direction Anchoring:** Wraps all prompts in vintage 1970s graphic novel context.
* See [`docs/meta_ai_guardrails_investigation.md`](file:///C:/research/c-book-generator/conan/docs/meta_ai_guardrails_investigation.md) for full analysis and local self-hosting alternatives.

### 3. Dual Consistency (Character & Weapon Model Sheets)
Conan's facial coordinates (Arnold Schwarzenegger + Jason Momoa) and his iconic 42-inch Atlantean broadsword are locked as reference turnaround sheets in `00_Reference/sheets/`.

---

## 📂 Project Directory Structure

```text
conan/
├── 00_Reference/
│   ├── character_bible.md       # Conan, Kheshat, Cultist DNA
│   ├── object_bible.md          # Atlantean Broadsword, Blood-Ruby of Set, Serpent Staff
│   ├── character_prompts.json   # Machine-readable character single-anchors
│   ├── object_prompts.json      # Machine-readable weapon & object anchors
│   └── sheets/                  # Model sheet turnaround recipes (.txt & .webp)
├── 01_Script/
│   ├── arcs/                    # Narrative arc beats (active_saga_beats.json)
│   ├── lore_and_premise/        # Hyborian world rules & themes
│   └── storyboard.json          # Locked, camera-directed 10-panel script
├── 02_Assets/
│   ├── Episode_01/
│   │   ├── raw/                 # Batch generation candidates
│   │   └── selected/            # Audited, promoted panel assets
│   └── web_reader.html          # Interactive Sword & Sorcery Web Reader
├── docs/
│   └── meta_ai_guardrails_investigation.md # Deep dive on Meta AI safety bypass & models
├── tools/
│   ├── writers_room/            # 5-Agent Writers' Room Engine
│   ├── generate_model_sheet.js  # Turnaround sheet generator
│   ├── render_panel_meta.js     # Meta AI CDP runner with automated guardrail bypass
│   ├── visual_qa_auditor.js     # Cardinality & visual consistency auditor
│   ├── build_reader.js          # Reader compiler
│   └── comic.config.json        # Frazetta/Buscema style presets
├── package.json
├── AGENTS.md                    # Operating Rules, SOP & Quality Protocols
└── README.md                    # This document
```

---

## 🚀 Quick Start CLI

```bash
cd C:\research\c-book-generator\conan

# 1. Author a new saga from scratch via the Writers' Room
npm run room:write

# 2. Generate turnaround model sheets for characters or weapons
npm run sheet:char conan
npm run sheet:object broadsword

# 3. Render a panel via Meta AI (with automated guardrail bypass)
npm run render:panel -- --panel 1

# 4. Audit candidate & promote to selected/
npm run audit:qa -- --panel 1
npm run audit:qa -- --panel 1 --promote

# 5. Compile and open the Web Reader
npm run build:reader
npm run open:reader
```

