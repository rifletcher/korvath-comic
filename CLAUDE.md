# Comic Studio — notes for Claude

Rob's personal tool for making AI motion comics (Korvath the Barbarian and other series) and publishing them to YouTube. Single user, runs on Rob's own Windows PC. Rob is not deep in this code: explain in plain terms, give exact clicks, and say what has and hasn't been tested on his real accounts.

## How it runs

- `launch_studio.bat` starts `conan-studio.exe --port 8484 --window` (a Go HTTP server opened in Chrome app mode). If `conan-studio-new.exe` exists it is swapped in first, so build to that name while the Studio is running (Windows locks the live exe).
- Despite `wails.json` and "Go + Wails" wording, there is no Wails build and no frontend source: `studio/frontend/dist/index.html` is one hand-edited file.
- Go server (`studio/`) owns projects, the gate/stage orchestrator, the job queue and the event bus. It spawns Node workers (`tools/workers/comic_cli_worker.js`) for rendering, voicing and video.
- Data lives in `projects/<comic>/` (`project.json`, `episodes/<ep>/manifest.json`, `reference/voice_registry.json`, `audio_takes/`).

## Build and test

```
npm install
npm test              # Node worker + writers' room tests
npm run test:go       # Go tests (studio/)
npm run build:studio  # writes conan-studio-new.exe
```

After server changes Rob must close the Studio and rerun `launch_studio.bat`. Frontend-only changes need just Ctrl+R in the Studio window.

## Needs on a machine (not in git)

- `.env`: `ELEVENLABS_API_KEY`, `VENICE_API_KEY`, `FAL_KEY` (see `.env.example`). Read fresh on each render. Never ask Rob to paste keys into chat.
- `.credentials/`: `client_secret.json`, `youtube_token.json` for the YouTube uploader.
- `.chrome_profile/`: only for the legacy Meta AI browser (CDP) engine.
- ffmpeg on PATH, Node, Go 1.23+, Chrome. Optional `agy.exe` (Antigravity CLI): the AI Director plans with Gemini through it (`tools/lib/headless_ai.js`); without it the rule-based director is used.

## Image engines

`tools/workers/providers/`: `venice.js` (Grok Imagine, Flux etc., `safe_mode: false`), `fal_muse.js` (Meta Muse Image via fal, the official replacement for driving meta.ai), `meta_cdp.js` (legacy browser automation of meta.ai; account-ban risk, prefer Muse). Unknown engine names must fail loudly; never silently fall back to Meta.

## Rules decided with Rob — keep them

- **No silent fallbacks.** ElevenLabs failures stop with a plain-English error (bad key, missing permission, out of credits). Never substitute Edge TTS voices. Gates fail closed if an audit script is missing.
- **Don't waste ElevenLabs credits.** Every paid call goes through the take cache in `projects/<comic>/audio_takes/` (same line + voice + settings = reuse). Effects-only notes are applied locally. Check the balance and estimate cost before voicing. Only one audio job per episode at a time.
- **One cast per comic.** `reference/voice_registry.json` is the cast for every episode; clips record which actor voiced them and off-cast clips get re-voiced.
- **Manifest writes** go through the shared `manifest.json.lock` (Go `store/manifest_lock.go`, Node `tools/lib/manifest_lock.js`) with read-modify-write.
- **Studio API security:** per-launch token, POST + JSON only for writes, no wildcard CORS, every project/episode ID validated (`studio/security.go`). Keep new endpoints behind the same middleware.
- **Windows file names are case-insensitive.** Compare paths/speaker names case-insensitively when cleaning up files.
- **YouTube uploads** set `status.containsSyntheticMedia` (AI disclosure label).
- **Re-render as copy** clones an episode for another model (`ep02-grok`, `ep02-muse`), reusing script and paid audio; the original is untouched.
- Don't commit, push or delete without Rob's say-so. Don't change story content (names, lore) unless asked — it's Rob's call.

## Open items / known issues

- Episode 1 was uploaded (unlisted) before the AI-disclosure label existed; it needs the label set in YouTube Studio or via a Studio "update label" step (not built yet).
- Story content still has legal exposure Rob knows about: celebrity-blend character prompts (Cavill/Momoa, Hayek/de Armas) and leftover Conan/Hyborian/Crom references. The "Conan" name also remains in file and exe names.
- `README.md` and `AGENTS.md` are out of date (describe old 5-/7-agent pipelines and npm scripts that no longer exist). Trust the code and this file over them.
- The ElevenLabs key only needs Text to Speech + User → Read; Rob's current key is full-access.
- Full history before 2026-11-17 is in the local-only branch `old-history` on Rob's original PC.
