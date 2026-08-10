# FrameSafe — Video NSFW Detection

React + TypeScript application that classifies potentially NSFW video content locally in the browser using TensorFlow.js and NSFWJS.

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

## Notes

- NSFWJS currently ships MobileNetV2 / MobileNetV2Mid / InceptionV3. This app uses **MobileNetV2** (MobileNet-family backbone with NSFW-trained weights). MobileNetV3 is not available in NSFWJS.
- Remote videos require CORS headers from the media host (`Access-Control-Allow-Origin` and a CORS-enabled media response).
- Vimeo page URLs (for example `https://vimeo.com/347119375`) are supported via `/api/vimeo/resolve` + HLS playback (`hls.js`). YouTube page URLs are not supported.
- WASM binaries are copied into `public/wasm` on `npm install` and served from `/wasm`.
