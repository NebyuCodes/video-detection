import type { ClassPrediction, MLBackendName } from './ml'

export type WorkerInboundMessage =
  | { type: 'init'; requestId: string; wasmPath: string }
  | {
      type: 'classify'
      requestId: string
      bitmap: ImageBitmap
      timestamp: number
      inputSize: number
    }
  | { type: 'dispose'; requestId: string }
  | { type: 'memory'; requestId: string }

export type WorkerOutboundMessage =
  | {
      type: 'init:ok'
      requestId: string
      backend: MLBackendName
      backendInitMs: number
      modelLoadMs: number
      modelName: string
      architecture: string
    }
  | {
      type: 'classify:ok'
      requestId: string
      timestamp: number
      score: number
      predictions: ClassPrediction[]
      processingMs: number
    }
  | {
      type: 'memory:ok'
      requestId: string
      numTensors: number
      numBytes: number
    }
  | { type: 'dispose:ok'; requestId: string }
  | { type: 'error'; requestId: string; message: string; code?: string }

export type VideoProcessorInbound =
  | { type: 'init'; requestId: string; wasmPath: string }
  | {
      type: 'process-frame'
      requestId: string
      bitmap: ImageBitmap
      timestamp: number
    }
  | { type: 'memory'; requestId: string }
  | { type: 'dispose'; requestId: string }

export type VideoProcessorOutbound =
  | {
      type: 'ready'
      requestId: string
      backend: MLBackendName
      backendInitMs: number
      modelLoadMs: number
      modelName: string
      architecture: string
    }
  | {
      type: 'frame-result'
      requestId: string
      timestamp: number
      score: number
      predictions: ClassPrediction[]
      processingMs: number
    }
  | {
      type: 'memory'
      requestId: string
      numTensors: number
      numBytes: number
    }
  | { type: 'disposed'; requestId: string }
  | { type: 'error'; requestId: string; message: string }
