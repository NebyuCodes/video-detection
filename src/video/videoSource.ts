import { MAX_UPLOAD_BYTES } from '../config/constants'
import type { VideoSourceInfo, VideoSourceKind } from '../types/video'
import { revokeObjectUrl } from '../utils/resourceCleanup'
import { CorsError, probeCanvasExport } from './cors'
import { attachMediaSource, type AttachedStream } from './hlsAttach'
import { ensureCurrentFrame, waitForCondition } from './mediaReady'
import { isVimeoUrl, resolveVimeoUrl } from './vimeo'

const VIDEO_READY_TIMEOUT_MS = 35000

const BLOCKED_STREAMING_HOSTS = [
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
  'tiktok.com',
  'www.tiktok.com',
  'instagram.com',
  'www.instagram.com',
]

function isBlockedStreamingHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return BLOCKED_STREAMING_HOSTS.some(
    (entry) => host === entry || host.endsWith(`.${entry}`),
  )
}

export function createLocalVideoSource(file: File): VideoSourceInfo {
  if (!file.type.startsWith('video/') && !/\.(mp4|webm|ogg|mov|m4v)$/i.test(file.name)) {
    throw new Error(
      'Unsupported file type. Please upload a valid video file (mp4, webm, ogg, mov).',
    )
  }

  if (file.size <= 0) {
    throw new Error('The selected file is empty.')
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(
      `Video is too large (${formatBytes(file.size)}). Maximum supported upload size is ${formatBytes(MAX_UPLOAD_BYTES)}.`,
    )
  }

  const objectUrl = URL.createObjectURL(file)
  return {
    kind: 'local',
    url: objectUrl,
    label: file.name,
    objectUrl,
    mimeType: file.type || null,
    fileSize: file.size,
    streamKind: 'file',
    provider: 'local',
    pageUrl: null,
  }
}

export async function createRemoteVideoSource(
  rawUrl: string,
): Promise<VideoSourceInfo> {
  const trimmed = rawUrl.trim()
  if (!trimmed) {
    throw new Error('Please enter a video URL.')
  }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error('The provided video URL is invalid.')
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http and https video URLs are supported.')
  }

  if (isVimeoUrl(trimmed)) {
    const resolved = await resolveVimeoUrl(trimmed)
    return {
      kind: 'remote',
      url: resolved.playUrl,
      label: resolved.title,
      objectUrl: null,
      mimeType:
        resolved.streamKind === 'hls'
          ? 'application/vnd.apple.mpegurl'
          : null,
      fileSize: null,
      streamKind: resolved.streamKind,
      provider: 'vimeo',
      pageUrl: parsed.toString(),
    }
  }

  if (isBlockedStreamingHost(parsed.hostname)) {
    throw new Error(
      'This streaming page link is not supported. Use a Vimeo URL, a direct .mp4/.webm file URL, or upload a local file.',
    )
  }

  const streamKind = /\.m3u8($|\?)/i.test(parsed.pathname + parsed.search)
    ? 'hls'
    : 'file'

  return {
    kind: 'remote',
    url: parsed.toString(),
    label: parsed.hostname + parsed.pathname,
    objectUrl: null,
    mimeType: null,
    fileSize: null,
    streamKind,
    provider: 'direct',
    pageUrl: null,
  }
}

export function releaseVideoSource(source: VideoSourceInfo | null): void {
  if (!source) {
    return
  }
  revokeObjectUrl(source.objectUrl)
}

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(1)} GB`
  }
  return `${mb.toFixed(1)} MB`
}

type VideoWithStream = HTMLVideoElement & {
  __attachedStream?: AttachedStream | null
}

export async function prepareVideoElement(
  source: VideoSourceInfo,
  abortSignal?: AbortSignal,
): Promise<HTMLVideoElement> {
  const video = document.createElement('video') as VideoWithStream
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  video.controls = false
  video.style.position = 'fixed'
  video.style.left = '-10000px'
  video.style.width = '320px'
  video.style.height = '180px'
  video.style.opacity = '0'
  video.style.pointerEvents = 'none'

  if (source.kind === 'remote') {
    video.crossOrigin = 'anonymous'
  }

  document.body.appendChild(video)

  let attached: AttachedStream | null = null

  try {
    attached = await attachMediaSource(video, source.url, source.streamKind)
    video.__attachedStream = attached

    await waitForCondition(
      () =>
        Number.isFinite(video.duration) &&
        video.duration > 0 &&
        video.readyState >= HTMLMediaElement.HAVE_METADATA,
      VIDEO_READY_TIMEOUT_MS,
      abortSignal,
      'video metadata',
    )

    try {
      await video.play()
    } catch {
      // ignore
    }

    await ensureCurrentFrame(video, VIDEO_READY_TIMEOUT_MS, abortSignal)
    video.pause()

    if (source.kind === 'remote') {
      await probeCanvasExport(video)
    }

    return video
  } catch (error) {
    attached?.destroy()
    video.__attachedStream = null
    video.pause()
    video.removeAttribute('src')
    video.load()
    video.remove()

    if (error instanceof CorsError) {
      throw error
    }

    if (source.kind === 'remote') {
      const message = error instanceof Error ? error.message : 'Unknown error'
      if (
        message.toLowerCase().includes('cors') ||
        message.toLowerCase().includes('tainted')
      ) {
        throw new CorsError(
          'This remote video cannot be processed because the server does not allow cross-origin access (CORS).',
        )
      }
    }

    throw error
  }
}

export async function seekVideo(
  video: HTMLVideoElement,
  timestamp: number,
  abortSignal?: AbortSignal,
): Promise<void> {
  if (abortSignal?.aborted) {
    throw new DOMException('Aborted', 'AbortError')
  }

  const duration = Number.isFinite(video.duration) ? video.duration : 0
  const target = Math.min(Math.max(timestamp, 0), Math.max(duration - 0.05, 0))

  if (
    Math.abs(video.currentTime - target) < 0.05 &&
    video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
    video.videoWidth > 0
  ) {
    return
  }

  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      cleanup()
      reject(new DOMException('Aborted', 'AbortError'))
    }

    const timer = window.setTimeout(() => {
      cleanup()
      reject(new Error(`Failed to seek to ${target.toFixed(2)}s.`))
    }, 12000)

    const onSeeked = () => {
      cleanup()
      resolve()
    }

    const onError = () => {
      cleanup()
      reject(new Error(`Seek failed at ${target.toFixed(2)}s.`))
    }

    const cleanup = () => {
      window.clearTimeout(timer)
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('error', onError)
      abortSignal?.removeEventListener('abort', onAbort)
    }

    video.addEventListener('seeked', onSeeked, { once: true })
    video.addEventListener('error', onError, { once: true })
    abortSignal?.addEventListener('abort', onAbort, { once: true })
    video.currentTime = target
  })

  await ensureCurrentFrame(video, 8000, abortSignal)
}

export function describeSourceKind(kind: VideoSourceKind): string {
  return kind === 'local' ? 'Local file' : 'Remote URL'
}
