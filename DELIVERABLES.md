# Video NSFW Detection Prototype — Deliverables

**Project:** FrameSafe (video-detection)  
**Stack:** React, TypeScript, Vite, TensorFlow.js, NSFWJS, Web Workers, HLS.js  
**Date:** August 2026

This document covers setup, architecture, model choice, performance tradeoffs, measured results, limitations, and a realistic path to mobile production.

---

## 1. Working Prototype — Setup and Usage

### Requirements

- Node.js 20+ recommended
- Modern browser: Chrome, Edge, or Firefox (Chromium preferred for WebGPU when available)
- Network access on first run (model weights + optional remote/Vimeo URLs)

### Setup

```bash
cd video-detection
npm install
npm run dev
```

Open the printed local URL (typically `http://localhost:5173/`).

Production build:

```bash
npm run build
npm run preview
```

`npm install` also copies TensorFlow.js WASM binaries into `public/wasm/`.

### Usage

1. **Local file**
   - Upload or drag-and-drop a video (`mp4`, `webm`, `ogg`, `mov`, …).
2. **Remote URL**
   - Paste a **direct** media URL (`.mp4` / `.webm`), or a **Vimeo page URL** such as `https://vimeo.com/347119375`.
   - Click **Use URL**.
3. Adjust optional controls:
   - Sample interval (seconds)
   - Frame NSFW threshold (default `0.5`)
   - Confidence threshold (default `0.5`)
4. Click **Analyze video**.
5. Read results:
   - **NSFW Confidence**
   - **Mean NSFW Score**
   - **NSFW Frame Ratio**
   - Final label: **NSFW** or **Safe**

### Decision output shape

```ts
{
  isNSFW: boolean;      // true = suspicious / NSFW
  confidence: number;   // 0..1  (UI shows percentage)
}
```

Where:

```text
confidence = meanNSFWScore × nsfwFrameRatio
isNSFW     = confidence >= confidenceThreshold
```

### Demo helper

In development/testing, **Simulate NSFW scores** can inject fake per-frame scores so the UI/scoring path can be validated without adult content. Turn this **off** for real model evaluation.

### Unsupported inputs

- YouTube page URLs (not direct media; stream extraction is not implemented)
- Remote hosts without CORS when frame extraction via canvas is required
- Extremely large uploads (default cap: 512 MB) or very long videos (default cap: 1 hour)

---

## 2. Architecture Overview

### Pipeline

```text
Local File ──► Object URL
                    │
Remote / Vimeo ──► Resolve (Vimeo → HLS) / Direct URL
                    │
                    ▼
            HTMLVideoElement
                    │
        Progressive seek / sample
                    │
              One frame (ImageBitmap)
                    │
         Transfer to Web Worker
                    │
     Resize (OffscreenCanvas) + NSFWJS
                    │
         Dispose frame / tensors
                    │
        Update running aggregates only
                    │
     confidence = mean × ratio → Safe / NSFW
```

### Module responsibilities

| Area | Role |
|------|------|
| `components/` | UI: upload, preview, progress, model status, result |
| `hooks/useVideoProcessor.ts` | Orchestration, AbortController, aggregation state |
| `hooks/useMLModel.ts` | Worker lifecycle, init, classify RPC |
| `video/` | Source creation, CORS probe, seeking, frame extract, Vimeo/HLS |
| `workers/videoProcessor.worker.ts` | TF.js backend + NSFWJS inference |
| `ml/` | Backend selection, model load, scoring |
| `vite-plugin-vimeo.ts` | Server-side Vimeo config resolve (`/api/vimeo/resolve`) |

### Key design decisions

1. **Progressive processing, not full decode**  
   Frames are sampled at an interval. Only the current frame is held; no array of all frames/images/tensors is stored in React state.

2. **Worker-based inference**  
   Preprocess + classify run off the UI thread so seeking/progress remain responsive.

3. **Transferable `ImageBitmap`**  
   Avoids copying large pixel buffers between main thread and worker when possible.

4. **Backend preference**  
   `WebGPU → WASM → WebGL → CPU`, initialized once per worker session.

5. **Running aggregates**  
   Track `processedFrames`, `nsfwScoreSum`, `nsfwFrameCount` only. Final metrics are derived from those.

6. **Strict resource cleanup**  
   Revoke object URLs, close bitmaps/`VideoFrame`s, terminate workers, remove hidden video elements, support cancel via `AbortController`.

7. **Vimeo via resolve + HLS**  
   Vimeo page URLs are resolved to a playable stream; `hls.js` handles playback. YouTube is intentionally out of scope.

8. **CORS honesty**  
   Remote analysis requires canvas-safe cross-origin media. Failures surface clear errors; no insecure CORS bypasses.

---

## 3. Selected Model and Mobile Suitability

### Selected model

- **Library:** [NSFWJS](https://github.com/infinitered/nsfwjs) v4.3  
- **Model:** **MobileNetV2** (bundled NSFW-trained weights)  
- **Input size:** 224×224  
- **Runtime:** TensorFlow.js in a Web Worker  

NSFWJS class outputs typically include categories such as `Neutral`, `Drawing`, `Sexy`, `Porn`, and `Hentai`. This prototype treats non-`Neutral` / non-`Drawing` probability mass as the per-frame NSFW score (based on actual model outputs).

### Why not MobileNetV3?

NSFWJS currently ships **MobileNetV2**, **MobileNetV2Mid**, and **InceptionV3**. There is no MobileNetV3 NSFW checkpoint in the library. MobileNetV2 is the closest production-ready MobileNet-family option with real NSFW weights.

### Why this is suitable for a future mobile implementation

| Property | Relevance to mobile |
|----------|---------------------|
| MobileNet-family backbone | Designed for efficient on-device CNN inference |
| Smallish input (224²) | Lower memory and compute than large vision models |
| Client-side weights | No need to upload video to a server for first-pass moderation |
| Architecture already progressive | Matches mobile RAM constraints (one frame at a time) |
| WASM / GPU fallbacks | Maps conceptually to TFLite / Core ML / GPU delegates later |

For a native mobile product, the same **sampling + aggregate scoring** design can be reused while swapping the runtime to **TFLite / Core ML / ONNX Runtime Mobile** for better battery and thermal behavior than in-browser TF.js.

---

## 4. Performance Tradeoffs and Alternatives Considered

### Tradeoffs chosen

| Choice | Benefit | Cost |
|--------|---------|------|
| Sample every N seconds (not every frame) | Feasible on long videos; stable memory | May miss short NSFW moments between samples |
| One-frame backpressure | Predictable RAM; UI stays responsive | Lower throughput than batched GPU pipelines |
| Worker inference | Main thread stays interactive | Model load + worker transfer overhead |
| WebGPU preferred, WASM fallback | Works across more devices | WASM is slower than a good GPU path |
| HLS lowest quality for Vimeo analysis | Faster seeks / less bandwidth | Slightly less visual detail for classification |
| Cap HLS samples (~24) | Keeps remote URL runs practical | Coarser temporal coverage |
| `confidence = mean × ratio` | Punishes sparse false spikes when ratio is ~0 | Can under-score videos with rare but severe frames |

### Alternatives considered

1. **Every-frame classification** — Maximum recall; impractical for long/high-FPS mobile video.  
2. **Server-side GPU API** — Faster/heavier models; privacy, cost, and upload bandwidth concerns.  
3. **InceptionV3 (NSFWJS)** — Potentially stronger accuracy; much larger download/memory.  
4. **Main-thread TF.js only** — Simpler code; UI jank during inference.  
5. **YouTube URL ingestion** — Assignment-friendly in theory; blocked by ToS, DRM/signing, and CORS realities.  
6. **Weighted confidence (`0.7·mean + 0.3·ratio`)** — Earlier variant; replaced by product form per product decision.

---

## 5. Performance Measurements

> Fill in/replace the device row with the machine used for your demo video. Numbers below include values observed during development of this prototype.

### Test environment (development)

| Item | Value |
|------|--------|
| OS | Linux |
| App mode | Vite dev server (`npm run dev`) |
| Browser | Chromium / Chrome (headless probe + interactive testing) |
| Primary backend observed | **WASM** (WebGPU attempted when available; often WASM in practice) |
| Model | NSFWJS MobileNetV2 |

### Representative timings (development probe / runs)

| Metric | Observed (approx.) |
|--------|--------------------|
| Backend init | ~40–80 ms (WASM) |
| Model load | ~0.5–2.0 s (first load; cached afterward in-session) |
| Local short clip analysis | Strongly depends on duration, sample interval, and CPU |
| Vimeo/HLS analysis | Slower per frame due to seek + segment fetch; mitigated by low quality + sample cap |
| Memory strategy | Aggregation-only; tensor/bitmap cleanup each frame |

### What to capture in your demo video

When recording, show the **Performance** block after a completed run:

- Model load time  
- Backend name  
- Total processing time  
- Average frame time  
- Throughput (frames/sec)  
- TF memory snapshot (tensors / bytes)  
- Final mean, ratio, confidence  

Suggested demo matrix:

1. Local safe video (real model)  
2. Vimeo sample URL: `https://vimeo.com/347119375`  
3. Optional: Simulate NSFW scores toggle (pipeline/UI only)

---

## 6. Known Limitations, Edge Cases, and Mobile Production Path

### Known limitations

- **No YouTube page URL support**  
- **Remote CORS dependency** for canvas frame extraction on arbitrary hosts  
- **Temporal sampling can miss brief NSFW content**  
- **Browser TF.js** is heavier on battery/heat than native mobile runtimes  
- **First load** downloads/parses multi‑MB model + TF runtime  
- **HLS seeking** is slower and less precise than local MP4 progressive files  
- **NSFWJS taxonomy** is not a legal/compliance definition of “nude”; it is a research/moderation heuristic  
- **Simulate mode** is for UX/scoring demos only, not accuracy claims  

### Edge cases

| Case | Behavior |
|------|----------|
| Empty / undecodable video | Clear load/processing error |
| CORS-blocked remote file | Explicit CORS error; no insecure bypass |
| User cancels mid-run | AbortController stops loop; resources cleaned up |
| Worker init failure | Surface model/worker error in Model status |
| Ratio = 0 with frames processed | No frame crossed frame threshold → confidence = 0 → Safe |
| Very long remote HLS | Sample interval floor + max frame cap reduce runtime |

### Realistic path to production mobile

1. **Keep the product logic**  
   Progressive sampling, one-frame memory discipline, mean/ratio/confidence thresholds, cancelation.

2. **Replace the runtime**  
   - Android: TFLite (GPU/NNAPI delegates)  
   - iOS: Core ML or TFLite  
   Export/convert an NSFW MobileNet-class model to the native format.

3. **Package as app shell**  
   - Short term: PWA / Capacitor WebView (acceptable prototype)  
   - Production: native player + native inference for thermal/battery.

4. **Operational hardening**  
   - On-device model caching  
   - Adaptive sampling under thermal pressure  
   - Offline mode  
   - Privacy UX: “video never uploaded” guarantees  
   - Evaluation set + threshold calibration for target markets/policies  

5. **URL strategy in production**  
   Prefer direct CDN MP4 with CORS, app-owned media, or server-side fetch under your control. Treat YouTube/social page URLs as unsupported or handle via licensed APIs only.

---

## 7. Quick Reference — Commands and Key URLs

```bash
npm install
npm run dev      # local prototype
npm run build
npm run preview  # production build locally
```

- App: `http://localhost:5173/`  
- Example Vimeo URL: `https://vimeo.com/347119375`  
- Vimeo resolve endpoint (dev/preview middleware): `/api/vimeo/resolve?id=347119375`

---

## 8. Repository Map (high level)

```text
src/
  components/        UI
  hooks/             processing + ML orchestration
  ml/                backend, model, classifier, scoring
  video/             sources, CORS, frames, HLS, Vimeo
  workers/           inference worker
  config/            thresholds and limits
vite-plugin-vimeo.ts Vimeo resolve middleware
DELIVERABLES.md      this document
README.md            short project readme
```

---

*End of deliverables document. Use this alongside a short demo video showing setup, a local run, and a Vimeo URL run with the on-screen performance metrics.*
