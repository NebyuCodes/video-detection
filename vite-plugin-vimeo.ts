import type { Plugin } from 'vite'

interface VimeoConfig {
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

function extractVimeoId(raw: string): string | null {
  try {
    const url = new URL(raw)
    const host = url.hostname.toLowerCase()
    if (host === 'youtu.be') {
      return null
    }
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

function pickHlsUrl(config: VimeoConfig): string | null {
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
  const cdnName = hls.default_cdn && hls.cdns[hls.default_cdn]
    ? hls.default_cdn
    : Object.keys(hls.cdns)[0]
  if (!cdnName) {
    return null
  }
  const cdn = hls.cdns[cdnName]
  return cdn?.avc_url || cdn?.url || null
}

async function resolveVimeo(id: string): Promise<{
  id: string
  title: string
  playUrl: string
  streamKind: 'file' | 'hls'
}> {
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
  const playUrl = pickHlsUrl(config)
  if (!playUrl) {
    throw new Error('No playable stream was found for this Vimeo video.')
  }

  const streamKind = playUrl.includes('.m3u8') ? 'hls' : 'file'
  return {
    id,
    title: config.video?.title || `Vimeo ${id}`,
    playUrl,
    streamKind,
  }
}

function sendJson(
  res: import('http').ServerResponse,
  status: number,
  body: unknown,
): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

export function vimeoResolvePlugin(): Plugin {
  const handler = async (
    req: import('http').IncomingMessage,
    res: import('http').ServerResponse,
    next: (error?: unknown) => void,
  ) => {
    try {
      const requestUrl = req.url ? new URL(req.url, 'http://localhost') : null
      if (!requestUrl || requestUrl.pathname !== '/api/vimeo/resolve') {
        next()
        return
      }

      if (req.method !== 'GET') {
        sendJson(res, 405, { error: 'Method not allowed' })
        return
      }

      const input = requestUrl.searchParams.get('url') || ''
      const id =
        requestUrl.searchParams.get('id') || extractVimeoId(input) || ''

      if (!id) {
        sendJson(res, 400, {
          error:
            'Provide a valid Vimeo URL such as https://vimeo.com/347119375',
        })
        return
      }

      const resolved = await resolveVimeo(id)
      sendJson(res, 200, resolved)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to resolve Vimeo URL.'
      sendJson(res, 502, { error: message })
    }
  }

  return {
    name: 'vimeo-resolve-plugin',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        void handler(req, res, next)
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        void handler(req, res, next)
      })
    },
  }
}
