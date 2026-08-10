import { extractVimeoId, resolveVimeo } from '../../lib/vimeoResolve'

export const config = {
  runtime: 'edge',
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'GET') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 })
  }

  try {
    const url = new URL(request.url)
    const input = url.searchParams.get('url') || ''
    const id = url.searchParams.get('id') || extractVimeoId(input) || ''

    if (!id) {
      return Response.json(
        {
          error:
            'Provide a valid Vimeo URL such as https://vimeo.com/347119375',
        },
        { status: 400 },
      )
    }

    const resolved = await resolveVimeo(id)
    return Response.json(resolved, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to resolve Vimeo URL.'
    return Response.json({ error: message }, { status: 502 })
  }
}
