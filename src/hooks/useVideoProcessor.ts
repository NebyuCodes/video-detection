import { useCallback, useEffect, useRef, useState } from 'react'
import {
  FRAME_NSFW_THRESHOLD,
  HLS_MAX_SAMPLED_FRAMES,
  HLS_SAMPLE_INTERVAL_SECONDS,
  IS_DEV,
  MAX_VIDEO_DURATION_SECONDS,
  NSFW_CONFIDENCE_THRESHOLD,
  SAMPLE_INTERVAL_SECONDS,
} from '../config/constants'
import {
  buildProcessingResult,
  createAggregationState,
  updateAggregation,
} from '../ml/scoring'
import type { PerformanceMetrics } from '../types/ml'
import type {
  ProcessingConfig,
  ProcessingProgress,
  VideoSourceInfo,
} from '../types/video'
import { isLikelyCorsFailure } from '../video/cors'
import {
  buildSamplePlan,
  iterateFrames,
  iterateFramesByPlayback,
  readVideoMetadata,
} from '../video/frameExtractor'
import {
  prepareVideoElement,
  releaseVideoSource,
} from '../video/videoSource'
import { closeImageBitmap, removeVideoElement } from '../utils/resourceCleanup'
import { useMLModel } from './useMLModel'

const initialProgress: ProcessingProgress = {
  progress: 0,
  processedFrames: 0,
  totalFrames: 0,
  currentTimestamp: null,
  status: 'idle',
  confidence: 0,
  meanNsfwScore: 0,
  nsfwFrameRatio: 0,
  isNSFW: null,
  error: null,
}

function toUserError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return 'Processing was cancelled.'
  }
  if (isLikelyCorsFailure(error)) {
    return error instanceof Error
      ? error.message
      : 'Remote video blocked by CORS.'
  }
  if (error instanceof Error) {
    return error.message
  }
  return 'An unexpected error occurred while processing the video.'
}

export function useVideoProcessor() {
  const ml = useMLModel()
  const [source, setSource] = useState<VideoSourceInfo | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [progress, setProgress] = useState<ProcessingProgress>(initialProgress)
  const [config, setConfig] = useState<ProcessingConfig>({
    sampleIntervalSeconds: SAMPLE_INTERVAL_SECONDS,
    frameNsfwThreshold: FRAME_NSFW_THRESHOLD,
    confidenceThreshold: NSFW_CONFIDENCE_THRESHOLD,
    simulateNsfw: false,
  })
  const [perf, setPerf] = useState<PerformanceMetrics>(ml.metrics)

  const abortRef = useRef<AbortController | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const sourceRef = useRef<VideoSourceInfo | null>(null)
  const runningRef = useRef(false)

  useEffect(() => {
    setPerf((prev) => ({ ...prev, ...ml.metrics }))
  }, [ml.metrics])

  const clearSource = useCallback(() => {
    releaseVideoSource(sourceRef.current)
    sourceRef.current = null
    setSource(null)
    setPreviewUrl(null)
  }, [])

  const assignSource = useCallback(
    (next: VideoSourceInfo) => {
      releaseVideoSource(sourceRef.current)
      sourceRef.current = next
      setSource(next)
      setPreviewUrl(next.url)
      setProgress(initialProgress)
    },
    [],
  )

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    runningRef.current = false
    removeVideoElement(videoRef.current)
    videoRef.current = null
    setProgress((prev) => ({
      ...prev,
      status: prev.status === 'processing' ? 'cancelled' : prev.status,
      error:
        prev.status === 'processing' ? 'Processing was cancelled.' : prev.error,
    }))
  }, [])

  const processSource = useCallback(
    async (activeSource: VideoSourceInfo) => {
      if (runningRef.current) {
        throw new Error('A video is already being processed.')
      }

      runningRef.current = true
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      removeVideoElement(videoRef.current)
      videoRef.current = null

      setProgress({
        ...initialProgress,
        status: 'loading',
      })

      const startedAt = performance.now()
      let frameTimeTotal = 0
      let processed = 0

      try {
        const worker = config.simulateNsfw ? null : await ml.ensureReady()
        const video = await prepareVideoElement(
          activeSource,
          controller.signal,
        )
        videoRef.current = video

        const metadata = readVideoMetadata(video)
        if (metadata.duration > MAX_VIDEO_DURATION_SECONDS) {
          throw new Error(
            `Video duration (${metadata.duration.toFixed(0)}s) exceeds the maximum supported duration of ${MAX_VIDEO_DURATION_SECONDS}s.`,
          )
        }

        const isHls = activeSource.streamKind === 'hls'
        const sampleInterval = isHls
          ? Math.max(
              config.sampleIntervalSeconds,
              HLS_SAMPLE_INTERVAL_SECONDS,
            )
          : config.sampleIntervalSeconds
        const samples = buildSamplePlan(
          metadata.duration,
          sampleInterval,
          isHls ? HLS_MAX_SAMPLED_FRAMES : Number.POSITIVE_INFINITY,
        )
        if (samples.length === 0) {
          throw new Error('No frames could be sampled from this video.')
        }

        setProgress({
          ...initialProgress,
          status: 'processing',
          totalFrames: samples.length,
        })

        let aggregation = createAggregationState()

        const frameIterator = isHls
          ? iterateFramesByPlayback(video, samples, controller.signal)
          : iterateFrames(video, samples, controller.signal)

        for await (const { sample, bitmap } of frameIterator) {
          if (controller.signal.aborted) {
            closeImageBitmap(bitmap)
            throw new DOMException('Aborted', 'AbortError')
          }

          try {
            let score: number
            let processingMs = 0

            if (config.simulateNsfw || !worker) {
              closeImageBitmap(bitmap)
              score = sample.index % 3 === 0 ? 0.9 : 0.08
              processingMs = 1
            } else {
              const result = await ml.classifyFrame(
                worker,
                bitmap,
                sample.timestamp,
              )
              score = result.score
              processingMs = result.processingMs
            }

            frameTimeTotal += processingMs
            aggregation = updateAggregation(
              aggregation,
              score,
              config.frameNsfwThreshold,
            )
            processed = aggregation.processedFrames

            const partial = buildProcessingResult(
              aggregation,
              samples.length,
              config.confidenceThreshold,
            )

            setProgress({
              progress: Math.min(processed / samples.length, 1),
              processedFrames: processed,
              totalFrames: samples.length,
              currentTimestamp: sample.timestamp,
              status: 'processing',
              confidence: partial.confidence,
              meanNsfwScore: partial.meanNsfwScore,
              nsfwFrameRatio: partial.nsfwFrameRatio,
              isNSFW: null,
              error: null,
            })
          } catch (frameError) {
            closeImageBitmap(bitmap)
            if (
              frameError instanceof DOMException &&
              frameError.name === 'AbortError'
            ) {
              throw frameError
            }
            console.warn('[processor] Frame classification failed', frameError)
          }

          if (IS_DEV && worker && processed > 0 && processed % 10 === 0) {
            try {
              const memory = await ml.readMemory(worker)
              console.info('[perf] Checkpoint', {
                processed,
                memory,
              })
            } catch {
              // ignore
            }
          }
        }

        if (aggregation.processedFrames === 0) {
          throw new Error(
            'No frames were successfully processed. The video may be unsupported or CORS-blocked.',
          )
        }

        const finalResult = buildProcessingResult(
          aggregation,
          samples.length,
          config.confidenceThreshold,
        )
        const totalProcessingMs = performance.now() - startedAt
        const averageFrameMs =
          processed > 0 ? frameTimeTotal / processed : null
        const framesPerSecond =
          totalProcessingMs > 0 ? (processed / totalProcessingMs) * 1000 : null

        let tfNumTensors: number | null = null
        let tfNumBytes: number | null = null
        if (worker) {
          try {
            const memory = await ml.readMemory(worker)
            tfNumTensors = memory.numTensors
            tfNumBytes = memory.numBytes
          } catch {
            // ignore
          }
        }

        setPerf({
          backendInitMs: ml.metrics.backendInitMs,
          modelLoadMs: ml.metrics.modelLoadMs,
          totalProcessingMs,
          averageFrameMs,
          framesPerSecond,
          tfNumTensors,
          tfNumBytes,
        })

        if (IS_DEV) {
          console.info('[perf] Processing complete', {
            backend: ml.backend,
            frames: processed,
            totalProcessingMs,
            averageFrameMs,
            framesPerSecond,
            meanScore: finalResult.meanNsfwScore,
            nsfwRatio: finalResult.nsfwFrameRatio,
            confidence: finalResult.confidence,
            tfNumTensors,
            tfNumBytes,
          })
        }

        setProgress({
          progress: 1,
          processedFrames: finalResult.processedFrames,
          totalFrames: finalResult.totalFrames,
          currentTimestamp: null,
          status: 'completed',
          confidence: finalResult.confidence,
          meanNsfwScore: finalResult.meanNsfwScore,
          nsfwFrameRatio: finalResult.nsfwFrameRatio,
          isNSFW: finalResult.isNSFW,
          error: null,
        })
      } catch (error) {
        const message = toUserError(error)
        const cancelled =
          error instanceof DOMException && error.name === 'AbortError'

        if (IS_DEV) {
          console.error('[processor] Processing failed', error)
        }

        setProgress((prev) => ({
          ...prev,
          status: cancelled ? 'cancelled' : 'error',
          error: message,
        }))
      } finally {
        removeVideoElement(videoRef.current)
        videoRef.current = null
        runningRef.current = false
        if (abortRef.current === controller) {
          abortRef.current = null
        }
      }
    },
    [config, ml],
  )

  const start = useCallback(async () => {
    if (!sourceRef.current) {
      setProgress((prev) => ({
        ...prev,
        status: 'error',
        error: 'Select a local video or provide a remote URL first.',
      }))
      return
    }
    await processSource(sourceRef.current)
  }, [processSource])

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      removeVideoElement(videoRef.current)
      videoRef.current = null
      releaseVideoSource(sourceRef.current)
      sourceRef.current = null
    }
  }, [])

  return {
    source,
    previewUrl,
    progress,
    config,
    setConfig,
    assignSource,
    clearSource,
    start,
    cancel,
    ml,
    perf,
  }
}
