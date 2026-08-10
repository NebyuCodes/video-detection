export type MLBackendName = 'webgpu' | 'wasm' | 'webgl' | 'cpu'

export type ModelLoadState = 'idle' | 'loading' | 'loaded' | 'error'

export type WorkerReadyState = 'idle' | 'initializing' | 'ready' | 'error'

export interface ClassPrediction {
  className: string
  probability: number
}

export interface FrameClassification {
  timestamp: number
  score: number
  predictions: ClassPrediction[]
  processingMs: number
}

export interface MLBackendInfo {
  backend: MLBackendName
  initMs: number
}

export interface ModelInfo {
  name: string
  architecture: string
  state: ModelLoadState
  loadMs: number | null
  error: string | null
}

export interface PerformanceMetrics {
  backendInitMs: number | null
  modelLoadMs: number | null
  totalProcessingMs: number | null
  averageFrameMs: number | null
  framesPerSecond: number | null
  tfNumTensors: number | null
  tfNumBytes: number | null
}

export interface CapabilityReport {
  webgpu: boolean
  wasm: boolean
  offscreenCanvas: boolean
  videoFrame: boolean
  imageBitmap: boolean
  webWorkers: boolean
}
