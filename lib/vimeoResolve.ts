export interface VimeoConfig {
  request?: {
    files?: {
      hls?: {
        default_cdn?: string
        cdns?: Record<string, { url?: string; avc_url?: string }>
      }
      progressive?: Array<{ url?: string; width?: number; height?: number }>
    }
  }
  video?: {
    title?: string
  }
}

export interface ResolvedVimeoSource {
  id: string
  title: string
  playUrl: string
  streamKind: 'file' | 'hls'
}

export function extractVimeoId(raw: string): string | null {
  try {
    const url = new URL(raw)
    const host = url.hostname.toLowerCase()
    if (host === 'vimeo.com' || host === 'www.vimeo.com') {
      const match = url.pathname.match(/\/(?:video\/)?(\d+)/)
      return match?.[1] ?? null
    }
    if (host === 'player.vimeo.com') {
      const match = url.pathname.match(/\/video\/(\d+)/)
      return match?.[1] ?? null
    }
  } catch {
    return null
  }
  return null
}

export function pickPlayUrl(config: VimeoConfig): string | null {
  const progressive = config.request?.files?.progressive
  if (progressive && progressive.length > 0) {
    const sorted = [...progressive].sort(
      (a, b) => (b.width ?? 0) - (a.width ?? 0),
    )
    const best = sorted.find((item) => item.url)
    if (best?.url) {
      return best.url
    }
  }

  const hls = config.request?.files?.hls
  if (!hls?.cdns) {
    return null
  }
  const cdnName =
    hls.default_cdn && hls.cdns[hls.default_cdn]
      ? hls.default_cdn
      : Object.keys(hls.cdns)[0]
  if (!cdnName) {
    return null
  }
  const cdn = hls.cdns[cdnName]
  return cdn?.avc_url || cdn?.url || null
}

export async function resolveVimeo(id: string): Promise<ResolvedVimeoSource> {
  const response = await fetch(`https://player.vimeo.com/video/${id}/config`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'FrameSafeVideoDetector/1.0',
    },
  })

  if (!response.ok) {
    throw new Error(`Vimeo config request failed (${response.status}).`)
  }

  const config = (await response.json()) as VimeoConfig
  const playUrl = pickPlayUrl(config)
  if (!playUrl) {
    throw new Error('No playable stream was found for this Vimeo video.')
  }

  return {
    id,
    title: config.video?.title || `Vimeo ${id}`,
    playUrl,
    streamKind: playUrl.includes('.m3u8') ? 'hls' : 'file',
  }
}
