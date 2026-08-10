import type { FrameSample, VideoMetadata } from '../types/video'
import { closeImageBitmap, closeVideoFrame } from '../utils/resourceCleanup'
import { ensureCurrentFrame, waitForCondition } from './mediaReady'
import { seekVideo } from './videoSource'

export function readVideoMetadata(video: HTMLVideoElement): VideoMetadata {
  return {
    duration: video.duration,
    width: video.videoWidth,
    height: video.videoHeight,
    fps: null,
  }
}

export function buildSamplePlan(
  duration: number,
  sampleIntervalSeconds: number,
  maxSamples = Number.POSITIVE_INFINITY,
): FrameSample[] {
  if (!Number.isFinite(duration) || duration <= 0) {
    return []
  }

  const interval = Math.max(sampleIntervalSeconds, 0.1)
  const samples: FrameSample[] = []
  let index = 0

  for (let timestamp = 0; timestamp < duration; timestamp += interval) {
    const clamped =
      timestamp >= duration ? Math.max(duration - 0.05, 0) : timestamp
    samples.push({ timestamp: clamped, index })
    index += 1
  }

  if (samples.length === 0) {
    samples.push({ timestamp: 0, index: 0 })
  } else {
    const last = samples[samples.length - 1]
    const end = Math.max(duration - 0.05, 0)
    if (last && end - last.timestamp > interval * 0.5) {
      samples.push({ timestamp: end, index: samples.length })
    }
  }

  if (!Number.isFinite(maxSamples) || samples.length <= maxSamples) {
    return samples
  }

  const limited: FrameSample[] = []
  const lastIndex = Math.max(maxSamples - 1, 1)
  for (let i = 0; i < maxSamples; i += 1) {
    const sourceIndex = Math.round((i / lastIndex) * (samples.length - 1))
    const sample = samples[sourceIndex]
    if (!sample) {
      continue
    }
    limited.push({
      timestamp: sample.timestamp,
      index: limited.length,
    })
  }
  return limited
}

async function extractWithVideoFrame(
  video: HTMLVideoElement,
): Promise<ImageBitmap> {
  const frame = new VideoFrame(video)
  try {
    return await createImageBitmap(frame)
  } finally {
    closeVideoFrame(frame)
  }
}

async function extractWithCanvas(
  video: HTMLVideoElement,
): Promise<ImageBitmap> {
  const width = video.videoWidth
  const height = video.videoHeight

  if (width <= 0 || height <= 0) {
    throw new Error('Video frame dimensions are unavailable.')
  }

  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) {
      throw new Error('Unable to create OffscreenCanvas context.')
    }
    ctx.drawImage(video, 0, 0, width, height)
    return await createImageBitmap(canvas)
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) {
    throw new Error('Unable to create canvas context.')
  }

  try {
    ctx.drawImage(video, 0, 0, width, height)
    return await createImageBitmap(canvas)
  } finally {
    canvas.width = 0
    canvas.height = 0
  }
}

export async function captureCurrentFrame(
  video: HTMLVideoElement,
): Promise<ImageBitmap> {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    throw new Error('Frame unavailable at current playback position.')
  }

  try {
    if (typeof VideoFrame !== 'undefined') {
      return await extractWithVideoFrame(video)
    }
  } catch (error) {
    console.warn('[video] VideoFrame extraction failed, falling back', error)
  }

  return extractWithCanvas(video)
}

export async function extractFrameBitmap(
  video: HTMLVideoElement,
  timestamp: number,
  abortSignal?: AbortSignal,
): Promise<ImageBitmap> {
  await seekVideo(video, timestamp, abortSignal)

  if (abortSignal?.aborted) {
    throw new DOMException('Aborted', 'AbortError')
  }

  await ensureCurrentFrame(video, 8000, abortSignal)
  return captureCurrentFrame(video)
}

export async function* iterateFrames(
  video: HTMLVideoElement,
  samples: FrameSample[],
  abortSignal?: AbortSignal,
): AsyncGenerator<{ sample: FrameSample; bitmap: ImageBitmap }> {
  for (const sample of samples) {
    if (abortSignal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }

    let bitmap: ImageBitmap | null = null
    try {
      bitmap = await extractFrameBitmap(video, sample.timestamp, abortSignal)
      yield { sample, bitmap }
      bitmap = null
    } catch (error) {
      closeImageBitmap(bitmap)
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw error
      }
      console.warn(
        `[video] Skipping frame at ${sample.timestamp.toFixed(2)}s`,
        error,
      )
    }
  }
}

export async function* iterateFramesByPlayback(
  video: HTMLVideoElement,
  samples: FrameSample[],
  abortSignal?: AbortSignal,
): AsyncGenerator<{ sample: FrameSample; bitmap: ImageBitmap }> {
  const ordered = [...samples].sort((a, b) => a.timestamp - b.timestamp)
  video.muted = true
  video.playbackRate = 1

  try {
    await video.play()
  } catch {
    // continue; wait loop still advances on timeupdate/currentTime
  }

  for (const sample of ordered) {
    if (abortSignal?.aborted) {
      video.pause()
      throw new DOMException('Aborted', 'AbortError')
    }

    try {
      if (video.paused) {
        await video.play().catch(() => undefined)
      }

      await waitForCondition(
        () =>
          video.ended ||
          video.currentTime + 0.2 >= sample.timestamp ||
          (Number.isFinite(video.duration) &&
            video.currentTime >= video.duration - 0.05),
        90000,
        abortSignal,
        `playback near ${sample.timestamp.toFixed(1)}s`,
      )

      video.pause()
      await ensureCurrentFrame(video, 8000, abortSignal)

      let bitmap: ImageBitmap | null = null
      try {
        bitmap = await captureCurrentFrame(video)
        const frame = bitmap
        bitmap = null
        yield {
          sample: {
            ...sample,
            timestamp: video.currentTime,
          },
          bitmap: frame,
        }
      } catch (captureError) {
        closeImageBitmap(bitmap)
        throw captureError
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        video.pause()
        throw error
      }
      console.warn(
        `[video] Skipping playback sample near ${sample.timestamp.toFixed(2)}s`,
        error,
      )
    }
  }

  video.pause()
}
