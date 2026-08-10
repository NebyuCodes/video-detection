import type { Plugin } from 'vite'
import { extractVimeoId, resolveVimeo } from './lib/vimeoResolve.ts'

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
