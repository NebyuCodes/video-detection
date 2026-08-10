import Hls from 'hls.js'

export interface AttachedStream {
  destroy: () => void
}

function pickLowestLevel(
  levels: Array<{ bitrate?: number; height?: number; width?: number }>,
): number {
  if (!levels.length) {
    return 0
  }
  let bestIndex = 0
  let bestScore = Number.POSITIVE_INFINITY
  levels.forEach((level, index) => {
    const score =
      (level.height || 0) * 1000 +
      (level.width || 0) +
      (level.bitrate || 0) / 1000
    if (score < bestScore) {
      bestScore = score
      bestIndex = index
    }
  })
  return bestIndex
}

export async function attachMediaSource(
  video: HTMLVideoElement,
  url: string,
  streamKind: 'file' | 'hls',
): Promise<AttachedStream> {
  if (streamKind === 'file') {
    video.src = url
    return {
      destroy: () => {
        video.removeAttribute('src')
        video.load()
      },
    }
  }

  const nativeHls = video.canPlayType('application/vnd.apple.mpegurl')
  if (nativeHls) {
    video.src = url
    return {
      destroy: () => {
        video.removeAttribute('src')
        video.load()
      },
    }
  }

  if (!Hls.isSupported()) {
    throw new Error(
      'This browser cannot play Vimeo/HLS streams. Try Chrome, Edge, or Safari.',
    )
  }

  const hls = new Hls({
    enableWorker: true,
    lowLatencyMode: false,
    startLevel: -1,
    abrEwmaDefaultEstimate: 200000,
    maxBufferLength: 6,
    maxMaxBufferLength: 10,
    backBufferLength: 0,
    capLevelToPlayerSize: true,
    xhrSetup: (xhr) => {
      xhr.withCredentials = false
    },
  })

  await new Promise<void>((resolve, reject) => {
    let settled = false

    const finish = (error?: Error) => {
      if (settled) {
        return
      }
      settled = true
      hls.off(Hls.Events.MANIFEST_PARSED, onParsed)
      hls.off(Hls.Events.FRAG_BUFFERED, onBuffered)
      hls.off(Hls.Events.ERROR, onError)
      window.clearTimeout(timer)
      if (error) {
        reject(error)
      } else {
        resolve()
      }
    }

    const onParsed = (
      _event: string,
      data: {
        levels?: Array<{ bitrate?: number; height?: number; width?: number }>
      },
    ) => {
      const levels = data.levels || []
      const lowest = pickLowestLevel(levels)
      hls.currentLevel = lowest
      hls.loadLevel = lowest
      hls.nextLevel = lowest
      hls.startLoad(0)
    }

    const onBuffered = () => {
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        finish()
      }
    }

    const onError = (
      _event: string,
      data: {
        fatal?: boolean
        type?: string
        details?: string
        response?: { code?: number }
      },
    ) => {
      if (!data.fatal) {
        return
      }
      if (data.type === 'networkError') {
        try {
          hls.startLoad()
          return
        } catch {
          // fall through
        }
      }
      if (data.type === 'mediaError') {
        try {
          hls.recoverMediaError()
          return
        } catch {
          // fall through
        }
      }
      const code = data.response?.code
      finish(
        new Error(
          `Failed to load HLS stream (${data.type || 'error'}: ${data.details || 'unknown'}${code ? `, HTTP ${code}` : ''}).`,
        ),
      )
    }

    const timer = window.setTimeout(() => {
      if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
        finish()
        return
      }
      finish(new Error('Timed out while loading the HLS stream.'))
    }, 30000)

    hls.on(Hls.Events.MANIFEST_PARSED, onParsed)
    hls.on(Hls.Events.FRAG_BUFFERED, onBuffered)
    hls.on(Hls.Events.ERROR, onError)
    hls.attachMedia(video)
    hls.loadSource(url)
  })

  return {
    destroy: () => {
      hls.destroy()
      video.removeAttribute('src')
      video.load()
    },
  }
}
