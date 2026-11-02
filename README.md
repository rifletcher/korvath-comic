# ⚔️ Korvath the Barbarian — Graphic Novel Studio

An autonomous, sequential sword-and-sorcery graphic novel studio featuring an autonomous **5-Agent Writers' Room**, **Dual Character & Weapon Consistency**, and a high-fidelity **Venice Grok Imagine Pipeline** (`grok-imagine-image-2-0`, 16:9 widescreen, `safe_mode: false`).

---

## 🌟 Core Highlights

### 1. The Autonomous 20-Panel Writers' Room
Authors full 20-page comic book issues from scratch:
* **Lore Master:** Enforces grim dark bronze-age pulp worldbuilding (Sarkesh, The Iron Wastes, Valkash, Ophirion).
* **Plot Architect:** Constructs a 3-Act, 20-beat graphic novel issue arc.
* **Scriptwriter:** Drafts visceral barbarian action, archaic narrative captions, and rugged dialogue.
* **Cinematographer:** Applies Frank Frazetta / John Buscema visual framing and theatrical chiaroscuro lighting.
* **Continuity Supervisor:** Injects locked character (Korvath & Natari) and weapon DNA into `storyboard.json`.

### 2. Venice Grok Imagine Pipeline
* **Model:** `grok-imagine-image-2-0` via Venice.ai API with zero corporate censorship filters (`safe_mode: false`).
* **Lettering:** In-canvas, organically composed vintage yellow narrative caption boxes and dialogue speech balloons.
* **Resolution:** 1280x720 (16:9 Cinematic Widescreen).

### 3. Dual Consistency (Character & Weapon Model Sheets)
* **Korvath:** Henry Cavill (50%) + Jason Momoa (50%) in `00_Reference/sheets/korvath_model_sheet.webp`.
* **Natari:** Salma Hayek (50%) + Ana de Armas (50%) in `00_Reference/sheets/natari_model_sheet.webp`.
* **Iron-Breaker Broadsword:** 42-inch ancestral notched blade in `00_Reference/sheets/broadsword_model_sheet.webp`.

---

## 🌐 Instant Vercel Deployment

This repository is pre-configured for zero-config Vercel deployment:
* `vercel.json` routes to `docs/`
* `docs/index.html` is the standalone, responsive web comic reader.
* `docs/assets/` contains all 20 production WebP panels.

---

## 🚀 Quick Start CLI

```bash
cd C:\research\c-book-generator\conan

# 1. Author a new saga via the 20-Panel Writers' Room
npm run room:write

# 2. Render all 20 panels with Venice Grok Imagine
npm run render:all

# 3. Export and bundle for Vercel deployment
npm run export:vercel

# 4. Open the Web Reader locally
npm run open:reader
```
