---
name: comic-motion-video-assembly
description: >-
  Use this skill when rendering panel video segments (pXX_meta_seg.mp4), applying motion-comic camera staging (vertical tilts, panoramic sweeps, Ken Burns), concatenating segments into a full episode motion comic (.mp4), or verifying audio-video sync at FINAL_CUT_GATE (Gate D).
---

# Motion Comic Camera Staging & Zero-Drift Video Assembly (Gate D)

Use this skill whenever compiling per-panel video segments or assembling a master episode `.mp4` movie.

## 1. Aspect Ratio Preservation & Camera Staging Rules

**HARD RULE:** Never stretch or squash a non-16:9 comic panel directly to `1280x720` (`scale=1280:720` is strictly forbidden). Measure the panel image dimensions ($W \times H$, aspect ratio $AR = W / H$) first and apply the matching camera movement into a `1280x720` (`30 fps`) viewport:

1. **Vertical / Portrait Panels ($AR < 1.0$, e.g., $1280 \times 1920$ or $1344 \times 1792$):**
   - **Cinematic Vertical Tilt:** Scale width to `1280` preserving aspect ratio (`scale=1280:-1`), crop a `1280x720` window, and smoothly pan vertically from top ($y = 0$) to bottom ($y = \text{ih} - 720$) across duration $D$:
     ```text
     scale=1280:-1,crop=1280:720:0:'(ih-720)*(0.5-0.5*cos(PI*t/DURATION))',fps=30,format=yuv420p
     ```
2. **Ultra-Wide Panoramic Panels ($AR \ge 1.8$, e.g., $2352 \times 1008$):**
   - **Horizontal Panoramic Sweep:** Scale height to `720` preserving aspect ratio (`scale=-1:720`), crop `1280x720`, and pan horizontally from $x = 0$ to $x = \text{iw} - 1280$:
     ```text
     scale=-1:720,crop=1280:720:'(iw-1280)*(0.5-0.5*cos(PI*t/DURATION))':0,fps=30,format=yuv420p
     ```
3. **Standard Landscape / Square Panels ($1.0 \le AR < 1.8$):**
   - **Ken Burns Push/Pull:** Scale to cover `1344x756` (with aspect-ratio-safe `force_original_aspect_ratio=increase` + center crop) and apply a gentle cosine zoom/pan over duration $D$, ending with `fps=30,format=yuv420p`.

## 2. Zero-Drift Segment Encoding Standards

When encoding individual panel segments (`p01_meta_seg.mp4` ... `pNN_meta_seg.mp4`), enforce identical stream parameters across all segments so concatenation never drifts:
- Video: `-c:v libx264 -preset fast -crf 18 -r 30 -pix_fmt yuv420p`
- Audio: `-c:a aac -b:a 192k -ar 44100 -ac 2`
- Duration: Explicitly match `-t <exact_wav_duration>` of `pXX_mixed.wav`.

## 3. Zero-Drift Master Movie Concatenation

Never concatenate `.mp4` segments with mismatched timebases directly. Always use intermediate MPEG-TS (`pXX.ts`) transport streams or a normalized concat demuxer with explicit audio/video re-sync:
1. Convert each `pXX_meta_seg.mp4` to `pXX.ts`:
   ```bash
   ffmpeg -y -i pXX_meta_seg.mp4 -c copy -bsf:v h264_mp4toannexb -f mpegts pXX.ts
   ```
2. Assemble into master `.mp4` with `44100 Hz` audio timestamp alignment:
   ```bash
   ffmpeg -y -i "concat:p01.ts|p02.ts|..." -c:v libx264 -preset fast -crf 18 -r 30 -pix_fmt yuv420p -c:a aac -b:a 192k -ar 44100 -ac 2 -af "aresample=async=1:first_pts=0" -movflags +faststart master.mp4
   ```

## 4. Mandatory Sync Verification (Gate D Check)

After building or updating any episode video, run the automated sync verifier to confirm that total video duration matches the sum of all `pXX_mixed.wav` files within $\le 0.10\text{s}$:
```bash
node tools/check_ep1_sync.js
```

