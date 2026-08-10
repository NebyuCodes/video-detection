import { useCallback, useEffect, useRef, useState } from 'react'
import { IS_DEV } from '../config/constants'
import { detectCapabilities } from '../ml/capabilities'
import type {
  CapabilityReport,
  MLBackendName,
  ModelLoadState,
  PerformanceMetrics,
  WorkerReadyState,
} from '../types/ml'
import type {
  VideoProcessorInbound,
  VideoProcessorOutbound,
} from '../types/worker'
import { terminateWorker } from '../utils/resourceCleanup'

interface UseMLModelResult {
  backend: MLBackendName | null
  modelState: ModelLoadState
  workerState: WorkerReadyState
  modelName: string | null
  architecture: string | null
  error: string | null
  capabilities: CapabilityReport
  metrics: PerformanceMetrics
  ensureReady: () => Promise<Worker>
  classifyFrame: (
    worker: Worker,
    bitmap: ImageBitmap,
    timestamp: number,
  ) => Promise<{
    timestamp: number
    score: number
    predictions: { className: string; probability: number }[]
    processingMs: number
  }>
  readMemory: (
    worker: Worker,
  ) => Promise<{ numTensors: number; numBytes: number }>
  dispose: () => Promise<void>
}

let requestCounter = 0

function nextRequestId(prefix: string): string {
  requestCounter += 1
  return `${prefix}-${requestCounter}`
}

function wasmBaseUrl(): string {
  const base = import.meta.env.BASE_URL || '/'
  const normalized = base.endsWith('/') ? base : `${base}/`
  return new URL(`${normalized}wasm/`, self.location.origin).toString()
}

function postToWorker(
  worker: Worker,
  message: VideoProcessorInbound,
  transfer?: Transferable[],
): void {
  if (transfer && transfer.length > 0) {
    worker.postMessage(message, transfer)
  } else {
    worker.postMessage(message)
  }
}

function requestWorker<T extends VideoProcessorOutbound>(
  worker: Worker,
  message: VideoProcessorInbound,
  expectedType: T['type'],
  transfer?: Transferable[],
): Promise<T> {
  const requestId = message.requestId

  return new Promise<T>((resolve, reject) => {
    const onMessage = (event: MessageEvent<VideoProcessorOutbound>) => {
      const data = event.data
      if (data.requestId !== requestId) {
        return
      }

      if (data.type === 'error') {
        cleanup()
        reject(new Error(data.message))
        return
      }

      if (data.type === expectedType) {
        cleanup()
        resolve(data as T)
      }
    }

    const onError = (event: ErrorEvent) => {
      cleanup()
      reject(new Error(event.message || 'Worker crashed.'))
    }

    const cleanup = () => {
      worker.removeEventListener('message', onMessage)
      worker.removeEventListener('error', onError)
    }

    worker.addEventListener('message', onMessage)
    worker.addEventListener('error', onError)
    postToWorker(worker, message, transfer)
  })
}

export function useMLModel(): UseMLModelResult {
  const workerRef = useRef<Worker | null>(null)
  const initPromiseRef = useRef<Promise<Worker> | null>(null)

  const [backend, setBackend] = useState<MLBackendName | null>(null)
  const [modelState, setModelState] = useState<ModelLoadState>('idle')
  const [workerState, setWorkerState] = useState<WorkerReadyState>('idle')
  const [modelName, setModelName] = useState<string | null>(null)
  const [architecture, setArchitecture] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [capabilities] = useState<CapabilityReport>(() => detectCapabilities())
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    backendInitMs: null,
    modelLoadMs: null,
    totalProcessingMs: null,
    averageFrameMs: null,
    framesPerSecond: null,
    tfNumTensors: null,
    tfNumBytes: null,
  })

  const dispose = useCallback(async () => {
    const worker = workerRef.current
    workerRef.current = null
    initPromiseRef.current = null

    if (worker) {
      try {
        await requestWorker(
          worker,
          { type: 'dispose', requestId: nextRequestId('dispose') },
          'disposed',
        )
      } catch {
        // ignore
      }
      terminateWorker(worker)
    }

    setWorkerState('idle')
    setModelState('idle')
    setBackend(null)
    setModelName(null)
    setArchitecture(null)
  }, [])

  const ensureReady = useCallback(async (): Promise<Worker> => {
    if (workerRef.current && workerState === 'ready') {
      return workerRef.current
    }

    if (initPromiseRef.current) {
      return initPromiseRef.current
    }

    if (!capabilities.webWorkers) {
      throw new Error('Web Workers are not supported in this browser.')
    }

    if (!capabilities.imageBitmap) {
      throw new Error('ImageBitmap is not supported in this browser.')
    }

    setError(null)
    setWorkerState('initializing')
    setModelState('loading')

    initPromiseRef.current = (async () => {
      const worker = new Worker(
        new URL('../workers/videoProcessor.worker.ts', import.meta.url),
        { type: 'module' },
      )
      workerRef.current = worker

      try {
        const ready = await requestWorker<
          Extract<VideoProcessorOutbound, { type: 'ready' }>
        >(
          worker,
          {
            type: 'init',
            requestId: nextRequestId('init'),
            wasmPath: wasmBaseUrl(),
          },
          'ready',
        )

        setBackend(ready.backend)
        setModelName(ready.modelName)
        setArchitecture(ready.architecture)
        setModelState('loaded')
        setWorkerState('ready')
        setMetrics((prev) => ({
          ...prev,
          backendInitMs: ready.backendInitMs,
          modelLoadMs: ready.modelLoadMs,
        }))

        if (IS_DEV) {
          console.info('[perf] Model load', {
            backend: ready.backend,
            backendInitMs: ready.backendInitMs,
            modelLoadMs: ready.modelLoadMs,
          })
        }

        return worker
      } catch (err) {
        terminateWorker(worker)
        workerRef.current = null
        initPromiseRef.current = null
        const message =
          err instanceof Error ? err.message : 'Failed to initialize ML worker.'
        setError(message)
        setWorkerState('error')
        setModelState('error')
        throw err
      }
    })()

    return initPromiseRef.current
  }, [capabilities.imageBitmap, capabilities.webWorkers, workerState])

  const classifyFrame = useCallback(
    async (worker: Worker, bitmap: ImageBitmap, timestamp: number) => {
      return requestWorker<
        Extract<VideoProcessorOutbound, { type: 'frame-result' }>
      >(
        worker,
        {
          type: 'process-frame',
          requestId: nextRequestId('frame'),
          bitmap,
          timestamp,
        },
        'frame-result',
        [bitmap],
      )
    },
    [],
  )

  const readMemory = useCallback(async (worker: Worker) => {
    const result = await requestWorker<
      Extract<VideoProcessorOutbound, { type: 'memory' }>
    >(
      worker,
      { type: 'memory', requestId: nextRequestId('memory') },
      'memory',
    )
    setMetrics((prev) => ({
      ...prev,
      tfNumTensors: result.numTensors,
      tfNumBytes: result.numBytes,
    }))
    return {
      numTensors: result.numTensors,
      numBytes: result.numBytes,
    }
  }, [])

  useEffect(() => {
    return () => {
      const worker = workerRef.current
      workerRef.current = null
      initPromiseRef.current = null
      terminateWorker(worker)
    }
  }, [])

  return {
    backend,
    modelState,
    workerState,
    modelName,
    architecture,
    error,
    capabilities,
    metrics,
    ensureReady,
    classifyFrame,
    readMemory,
    dispose,
  }
}
