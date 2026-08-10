# FrameSafe — Video NSFW Detection

React + TypeScript application that classifies potentially NSFW video content locally in the browser using TensorFlow.js and NSFWJS.

**Repository:** [github.com/NebyuCodes/video-detection](https://github.com/NebyuCodes/video-detection)  
**Clone:** `git@github.com:NebyuCodes/video-detection.git`

For the full assignment write-up (setup, architecture, model choice, tradeoffs, measurements, limitations, mobile path), see [DELIVERABLES.md](./DELIVERABLES.md).

## Features

- Local video upload (object URLs) and remote video URLs
- Explicit CORS checks before remote frame extraction
- Progressive frame sampling (configurable interval)
- Web Worker inference pipeline
- Backend selection: WebGPU → WASM → WebGL → CPU
- Running aggregation only (no full-frame buffers in React state)
- Configurable frame threshold and overall confidence threshold

## Run

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
npm run preview
```

## Deploy on Vercel

1. Push the repo to GitHub (`git@github.com:NebyuCodes/video-detection.git`).
2. Go to [vercel.com](https://vercel.com) → **Add New Project** → import `NebyuCodes/video-detection`.
3. Keep Vercel’s Vite defaults (do **not** override Output to a custom static-only setup):
   - **Framework Preset:** Vite
   - **Build Command:** `npm run build` (or default)
   - **Output Directory:** `dist` (Vite default)
   - **Install Command:** `npm install` (runs `postinstall` to copy WASM files)
4. Click **Deploy**.
5. After deploy, verify the API works by opening:
   `https://YOUR_DOMAIN/api/vimeo/resolve?id=347119375`
   You should see JSON (not an HTML 404 page).

Or from the CLI:

```bash
npm i -g vercel
vercel
```

`vercel.json` is already configured. Vimeo URL support on Vercel uses the serverless function at `api/vimeo/resolve.ts` (same path as local: `/api/vimeo/resolve`).

After deploy, open your Vercel URL and test:
- local video upload
- `https://vimeo.com/347119375`

## Notes

- NSFWJS currently ships MobileNetV2 / MobileNetV2Mid / InceptionV3. This app uses **MobileNetV2** (MobileNet-family backbone with NSFW-trained weights). MobileNetV3 is not available in NSFWJS.
- Remote videos require CORS headers from the media host (`Access-Control-Allow-Origin` and a CORS-enabled media response).
- Vimeo page URLs (for example `https://vimeo.com/347119375`) are supported via `/api/vimeo/resolve` + HLS playback (`hls.js`). YouTube page URLs are not supported.
- WASM binaries are copied into `public/wasm` on `npm install` and served from `/wasm`.
