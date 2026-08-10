export class CorsError extends Error {
  readonly code = 'CORS_BLOCKED'

  constructor(message: string) {
    super(message)
    this.name = 'CorsError'
  }
}

export async function probeCanvasExport(
  video: HTMLVideoElement,
): Promise<void> {
  const width = Math.max(1, Math.min(16, video.videoWidth || 16))
  const height = Math.max(1, Math.min(16, video.videoHeight || 16))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) {
    throw new Error('Canvas is unavailable in this browser.')
  }

  try {
    ctx.drawImage(video, 0, 0, width, height)
    ctx.getImageData(0, 0, width, height)
  } catch (error) {
    const message =
      error instanceof DOMException || error instanceof Error
        ? error.message
        : 'Unknown canvas security error'
    throw new CorsError(
      `This remote video cannot be processed because the server does not allow cross-origin access (CORS). The remote host must send Access-Control-Allow-Origin headers and the media must be CORS-enabled. Details: ${message}`,
    )
  } finally {
    canvas.width = 0
    canvas.height = 0
  }
}

export function isLikelyCorsFailure(error: unknown): boolean {
  if (error instanceof CorsError) {
    return true
  }
  if (!(error instanceof Error)) {
    return false
  }
  const text = error.message.toLowerCase()
  return (
    text.includes('cors') ||
    text.includes('tainted') ||
    text.includes('cross-origin') ||
    text.includes('securityerror')
  )
}
