import Hls from 'hls.js'

export interface AttachedStream {
  destroy: () => void
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
    startLevel: 0,
    abrEwmaDefaultEstimate: 500000,
    maxBufferLength: 8,
    maxMaxBufferLength: 12,
    backBufferLength: 0,
  })

  await new Promise<void>((resolve, reject) => {
    let settled = false

    const finish = (error?: Error) => {
      if (settled) {
        return
      }
      settled = true
      hls.off(Hls.Events.MANIFEST_PARSED, onParsed)
      hls.off(Hls.Events.FRAG_LOADED, onFrag)
      hls.off(Hls.Events.ERROR, onError)
      window.clearTimeout(timer)
      if (error) {
        reject(error)
      } else {
        resolve()
      }
    }

    const onParsed = (_event: string, data: { levels?: unknown[] }) => {
      if (data.levels && data.levels.length > 0) {
        hls.currentLevel = 0
      }
      hls.startLoad(0)
    }

    const onFrag = () => {
      finish()
    }

    const onError = (
      _event: string,
      data: { fatal?: boolean; type?: string; details?: string },
    ) => {
      if (!data.fatal) {
        return
      }
      finish(
        new Error(
          `Failed to load HLS stream (${data.type || 'error'}: ${data.details || 'unknown'}).`,
        ),
      )
    }

    const timer = window.setTimeout(() => {
      finish(new Error('Timed out while loading the HLS stream.'))
    }, 20000)

    hls.on(Hls.Events.MANIFEST_PARSED, onParsed)
    hls.on(Hls.Events.FRAG_LOADED, onFrag)
    hls.on(Hls.Events.ERROR, onError)
    hls.loadSource(url)
    hls.attachMedia(video)
  })

  return {
    destroy: () => {
      hls.destroy()
      video.removeAttribute('src')
      video.load()
    },
  }
}
