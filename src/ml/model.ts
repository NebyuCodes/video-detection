import { load, type NSFWJS } from 'nsfwjs/core'
import { MobileNetV2Model } from 'nsfwjs/models/mobilenet_v2'
import { MODEL_NAME } from '../config/constants'

let model: NSFWJS | null = null
let loadPromise: Promise<{ model: NSFWJS; loadMs: number }> | null = null

export async function loadNsfwModel(): Promise<{
  model: NSFWJS
  loadMs: number
  name: string
  architecture: string
}> {
  if (model) {
    return {
      model,
      loadMs: 0,
      name: MODEL_NAME,
      architecture: 'MobileNetV2',
    }
  }

  if (!loadPromise) {
    loadPromise = (async () => {
      const started = performance.now()
      const loaded = await load(MODEL_NAME, {
        modelDefinitions: [MobileNetV2Model],
      })
      const loadMs = performance.now() - started
      model = loaded
      console.info(
        `[ml] NSFW model loaded: ${MODEL_NAME} (${loadMs.toFixed(1)}ms)`,
      )
      return { model: loaded, loadMs }
    })()
  }

  try {
    const result = await loadPromise
    return {
      model: result.model,
      loadMs: result.loadMs,
      name: MODEL_NAME,
      architecture: 'MobileNetV2',
    }
  } catch (error) {
    loadPromise = null
    model = null
    throw error
  }
}

export function getLoadedModel(): NSFWJS | null {
  return model
}

export async function disposeNsfwModel(): Promise<void> {
  if (model && typeof (model as { dispose?: () => void }).dispose === 'function') {
    ;(model as { dispose: () => void }).dispose()
  }
  model = null
  loadPromise = null
}
