import { initializeMLBackend, readTfMemory } from '../ml/backend'
import { classifyBitmap } from '../ml/classifier'
import { disposeNsfwModel, loadNsfwModel } from '../ml/model'
import type { WorkerInboundMessage, WorkerOutboundMessage } from '../types/worker'

declare const self: DedicatedWorkerGlobalScope

function post(message: WorkerOutboundMessage, transfer?: Transferable[]): void {
  if (transfer && transfer.length > 0) {
    self.postMessage(message, transfer)
  } else {
    self.postMessage(message)
  }
}

async function handleInit(
  requestId: string,
  wasmPath: string,
): Promise<void> {
  const backendInfo = await initializeMLBackend(wasmPath)
  const modelInfo = await loadNsfwModel()
  post({
    type: 'init:ok',
    requestId,
    backend: backendInfo.backend,
    backendInitMs: backendInfo.initMs,
    modelLoadMs: modelInfo.loadMs,
    modelName: modelInfo.name,
    architecture: modelInfo.architecture,
  })
}

async function handleClassify(
  requestId: string,
  bitmap: ImageBitmap,
  timestamp: number,
  inputSize: number,
): Promise<void> {
  try {
    const model = (await loadNsfwModel()).model
    const result = await classifyBitmap(model, bitmap, timestamp, inputSize)
    post({
      type: 'classify:ok',
      requestId,
      timestamp: result.timestamp,
      score: result.score,
      predictions: result.predictions,
      processingMs: result.processingMs,
    })
  } catch (error) {
    try {
      bitmap.close()
    } catch {
      // ignore
    }
    throw error
  }
}

self.onmessage = (event: MessageEvent<WorkerInboundMessage>) => {
  const message = event.data

  void (async () => {
    try {
      switch (message.type) {
        case 'init':
          await handleInit(message.requestId, message.wasmPath)
          break
        case 'classify':
          await handleClassify(
            message.requestId,
            message.bitmap,
            message.timestamp,
            message.inputSize,
          )
          break
        case 'memory': {
          const memory = readTfMemory()
          post({
            type: 'memory:ok',
            requestId: message.requestId,
            numTensors: memory.numTensors,
            numBytes: memory.numBytes,
          })
          break
        }
        case 'dispose':
          await disposeNsfwModel()
          post({ type: 'dispose:ok', requestId: message.requestId })
          break
        default:
          break
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Worker processing failed.'
      console.error('[ml.worker]', error)
      post({
        type: 'error',
        requestId: message.requestId,
        message: errorMessage,
      })
    }
  })()
}
