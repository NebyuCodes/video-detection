import { MODEL_INPUT_SIZE } from '../config/constants'
import { initializeMLBackend, readTfMemory } from '../ml/backend'
import { classifyBitmap } from '../ml/classifier'
import { disposeNsfwModel, loadNsfwModel } from '../ml/model'
import type {
  VideoProcessorInbound,
  VideoProcessorOutbound,
} from '../types/worker'

declare const self: DedicatedWorkerGlobalScope

function post(message: VideoProcessorOutbound): void {
  self.postMessage(message)
}

self.onmessage = (event: MessageEvent<VideoProcessorInbound>) => {
  const message = event.data

  void (async () => {
    try {
      switch (message.type) {
        case 'init': {
          const backendInfo = await initializeMLBackend(message.wasmPath)
          const modelInfo = await loadNsfwModel()
          post({
            type: 'ready',
            requestId: message.requestId,
            backend: backendInfo.backend,
            backendInitMs: backendInfo.initMs,
            modelLoadMs: modelInfo.loadMs,
            modelName: modelInfo.name,
            architecture: modelInfo.architecture,
          })
          break
        }
        case 'process-frame': {
          try {
            const model = (await loadNsfwModel()).model
            const result = await classifyBitmap(
              model,
              message.bitmap,
              message.timestamp,
              MODEL_INPUT_SIZE,
            )
            post({
              type: 'frame-result',
              requestId: message.requestId,
              timestamp: result.timestamp,
              score: result.score,
              predictions: result.predictions,
              processingMs: result.processingMs,
            })
          } catch (error) {
            try {
              message.bitmap.close()
            } catch {
              void 0
            }
            throw error
          }
          break
        }
        case 'memory': {
          const memory = readTfMemory()
          post({
            type: 'memory',
            requestId: message.requestId,
            numTensors: memory.numTensors,
            numBytes: memory.numBytes,
          })
          break
        }
        case 'dispose': {
          await disposeNsfwModel()
          post({ type: 'disposed', requestId: message.requestId })
          break
        }
        default:
          break
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Frame processing failed.'
      console.error('[videoProcessor.worker]', error)
      post({
        type: 'error',
        requestId: message.requestId,
        message: errorMessage,
      })
    }
  })()
}
