import * as tf from '@tensorflow/tfjs'
import type { MLBackendInfo, MLBackendName } from '../types/ml'

let initializedBackend: MLBackendName | null = null
let initPromise: Promise<MLBackendInfo> | null = null

function isWorkerScope(): boolean {
  return (
    typeof WorkerGlobalScope !== 'undefined' &&
    typeof self !== 'undefined' &&
    self instanceof WorkerGlobalScope
  )
}

async function hasWebGPU(): Promise<boolean> {
  const nav = self.navigator as Navigator & {
    gpu?: { requestAdapter: () => Promise<unknown> }
  }
  if (!nav?.gpu?.requestAdapter) {
    return false
  }
  try {
    const adapter = await nav.gpu.requestAdapter()
    return Boolean(adapter)
  } catch {
    return false
  }
}

async function trySetBackend(name: MLBackendName): Promise<boolean> {
  try {
    const ok = await tf.setBackend(name)
    if (!ok) {
      return false
    }
    await tf.ready()
    return tf.getBackend() === name
  } catch (error) {
    console.warn(`[ml] Failed to initialize backend "${name}"`, error)
    return false
  }
}

async function ensureBackendRegistered(
  name: MLBackendName,
  wasmPath: string,
): Promise<void> {
  if (tf.findBackend(name)) {
    return
  }

  if (name === 'webgpu') {
    await import('@tensorflow/tfjs-backend-webgpu')
    return
  }

  if (name === 'wasm') {
    const wasm = await import('@tensorflow/tfjs-backend-wasm')
    wasm.setWasmPaths(wasmPath)
    return
  }

  if (name === 'webgl') {
    await import('@tensorflow/tfjs-backend-webgl')
  }
}

export async function initializeMLBackend(
  wasmPath = '/wasm/',
): Promise<MLBackendInfo> {
  if (initializedBackend) {
    return {
      backend: initializedBackend,
      initMs: 0,
    }
  }

  if (initPromise) {
    return initPromise
  }

  initPromise = (async () => {
    const started = performance.now()
    const workerScope = isWorkerScope()
    const webgpu = await hasWebGPU()
    const wasm =
      typeof WebAssembly !== 'undefined' &&
      typeof WebAssembly.instantiate === 'function'

    const candidates: MLBackendName[] = []
    if (webgpu) {
      candidates.push('webgpu')
    }
    if (wasm) {
      candidates.push('wasm')
    }
    if (!workerScope || typeof OffscreenCanvas !== 'undefined') {
      candidates.push('webgl')
    }
    candidates.push('cpu')

    for (const candidate of candidates) {
      try {
        await ensureBackendRegistered(candidate, wasmPath)
      } catch (error) {
        console.warn(`[ml] Could not register backend "${candidate}"`, error)
        continue
      }

      const ok = await trySetBackend(candidate)
      if (ok) {
        initializedBackend = candidate
        const initMs = performance.now() - started
        console.info(
          `[ml] Backend initialized: ${candidate} (${initMs.toFixed(1)}ms)`,
        )
        return {
          backend: candidate,
          initMs,
        }
      }
    }

    throw new Error(
      'No TensorFlow.js backend could be initialized in this browser.',
    )
  })()

  try {
    return await initPromise
  } catch (error) {
    initPromise = null
    throw error
  }
}

export function getActiveBackend(): MLBackendName | null {
  if (initializedBackend) {
    return initializedBackend
  }
  try {
    return tf.getBackend() as MLBackendName
  } catch {
    return null
  }
}

export function readTfMemory(): { numTensors: number; numBytes: number } {
  const memory = tf.memory()
  return {
    numTensors: memory.numTensors,
    numBytes: memory.numBytes,
  }
}
