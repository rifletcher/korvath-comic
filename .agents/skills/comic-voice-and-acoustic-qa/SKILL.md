---
name: comic-voice-and-acoustic-qa
description: >-
  Use this skill before or during voice synthesis, audio mixing, or acoustic QA (VOICE_SYNTHESIS and AUDIO_QA_GATE / Gate C) to enforce fail-closed voice casting, visual speech-bubble speaker alignment, canonical DSP mastering chains, and zero-token cache reuse.
---

# Voice Casting, Visual-Speaker Alignment & Acoustic QA (Gate C)

Use this skill whenever synthesizing dialogue, rebuilding panel audio mixes (`pXX_mixed.wav`), or auditing episode audio at `AUDIO_QA_GATE` (Gate C).

## 1. Fail-Closed Voice Registry & Canonical Cast

All speakers in `storyboard.json` **MUST** resolve to [`00_Reference/voice_registry.json`](file:///c:/research/c-book-generator/conan/00_Reference/voice_registry.json). Silent fallback to a default voice is strictly forbidden.

| Speaker Key | Role | Canonical ElevenLabs Voice ID | Mandatory FFmpeg DSP Mastering Chain |
| :--- | :--- | :--- | :--- |
| `narrator` | Chronicler | `JBFqnCBsd6RMkjVDRZzb` (`George`) | `asetrate=44100*0.92,aresample=44100,atempo=1.02,equalizer=f=110:width_type=h:width=80:g=5,volume=1.25` |
| `korvath` | Barbarian Hero | `nPczCjzI2devNBz1zQrb` (`Brian`) | **Subterranean Kratos Chain:** `asetrate=44100*0.88,aresample=44100,equalizer=f=95:width_type=h:width=60:g=8,aecho=0.8:0.88:40:0.25,volume=1.45` |
| `cultist_guard` / `acolyte` / `thief` | Antagonist | `JBFqnCBsd6RMkjVDRZzb` (`George`) | `asetrate=44100*1.06,aresample=44100,atempo=0.98,highpass=f=180,aecho=0.8:0.85:55:0.35,volume=1.35` |
| `high_priest` / `lord_malakor` | Sorcerer / Noble | `IKne3meq5aSn9XLyUdCD` (`Charlie`) | `asetrate=44100*0.94,aresample=44100,aecho=0.8:0.9:70:0.4,volume=1.35` |

> **CRITICAL WARNING:** Never use `fX7UqA143pM34zT6bVzF` (invalid 404 ID). Always use `nPczCjzI2devNBz1zQrb` (`Brian`) + the `0.88x` pitch-shifted Subterranean Kratos DSP chain for `korvath`.

## 2. Visual Speech-Bubble Alignment Check (The Panel 5 Rule)

Before synthesizing or mixing any panel that contains dialogue:
1. Inspect the rendered panel image (`panel_XX.webp`) with `read_file`.
2. Locate every speech balloon and trace its pointer tail to the character's mouth in the artwork.
3. Verify that the `speaker` field in `storyboard.json` matches the character the speech balloon actually points to on screen:
   - If the speech balloon points to **Korvath the Barbarian**, the voice track **MUST** use `korvath` (`nPczCjzI2devNBz1zQrb` + Subterranean Kratos `0.88x` DSP).
   - If the speech balloon points to a **Cultist / Antagonist**, the voice track **MUST** use `cultist_guard` or `high_priest`.

## 3. Run the Pre-Flight Casting & Audio Verifier Script

Run the automated verification script included in this skill before promoting past `AUDIO_QA_GATE`:
```bash
node .agents/skills/comic-voice-and-acoustic-qa/scripts/verify_voice_casting.js --storyboard 01_Script/storyboard.json --registry 00_Reference/voice_registry.json
```

## 4. 5-Point Acoustic QA Rubric

1. **Dramatic Congruence:** Emotion and stability (`0.18–0.28` for combat roars) match the visual intensity of the panel.
2. **Pacing & Anti-Chipmunk:** Speech rate stays within natural cadence ($100\text{–}160\text{ WPM}$); never use high-pitched speedup hacks.
3. **Frame Acoustic Space:** Reverb matches scene environment (stone vault slapback in crypts; dry wind sweep outdoors).
4. **Visual-Audio Speaker Lock:** The voice actor heard on every panel matches the character whose mouth the speech bubble points to.
5. **Token Conservation:** Reuse cached `.mp3` clips on disk whenever re-mixing audio or re-rendering video segments unless the line or voice actor changed.

