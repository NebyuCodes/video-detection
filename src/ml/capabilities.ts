import type { CapabilityReport } from '../types/ml'

export function detectCapabilities(): CapabilityReport {
  const webgpu =
    typeof navigator !== 'undefined' &&
    'gpu' in navigator &&
    typeof (navigator as Navigator & { gpu?: unknown }).gpu !== 'undefined'

  const wasm =
    typeof WebAssembly !== 'undefined' &&
    typeof WebAssembly.instantiate === 'function'

  const offscreenCanvas = typeof OffscreenCanvas !== 'undefined'
  const videoFrame = typeof VideoFrame !== 'undefined'
  const imageBitmap = typeof createImageBitmap === 'function'
  const webWorkers = typeof Worker !== 'undefined'

  return {
    webgpu,
    wasm,
    offscreenCanvas,
    videoFrame,
    imageBitmap,
    webWorkers,
  }
}
