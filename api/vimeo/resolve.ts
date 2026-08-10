import type { VercelRequest, VercelResponse } from '@vercel/node'
import { extractVimeoId, resolveVimeo } from '../../lib/vimeoResolve'

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    const input = typeof req.query.url === 'string' ? req.query.url : ''
    const idParam = typeof req.query.id === 'string' ? req.query.id : ''
    const id = idParam || extractVimeoId(input) || ''

    if (!id) {
      res.status(400).json({
        error: 'Provide a valid Vimeo URL such as https://vimeo.com/347119375',
      })
      return
    }

    const resolved = await resolveVimeo(id)
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json(resolved)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to resolve Vimeo URL.'
    res.status(502).json({ error: message })
  }
}
