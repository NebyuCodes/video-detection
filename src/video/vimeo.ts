export interface ResolvedVimeoSource {
  id: string
  title: string
  playUrl: string
  streamKind: 'file' | 'hls'
}

export function extractVimeoId(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl.trim())
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

export function isVimeoUrl(rawUrl: string): boolean {
  return extractVimeoId(rawUrl) !== null
}

export async function resolveVimeoUrl(
  rawUrl: string,
): Promise<ResolvedVimeoSource> {
  const id = extractVimeoId(rawUrl)
  if (!id) {
    throw new Error('Not a valid Vimeo URL.')
  }

  const endpoint = new URL('/api/vimeo/resolve', window.location.origin)
  endpoint.searchParams.set('id', id)

  const response = await fetch(endpoint.toString())
  const payload = (await response.json()) as ResolvedVimeoSource & {
    error?: string
  }

  if (!response.ok) {
    throw new Error(payload.error || 'Unable to resolve this Vimeo URL.')
  }

  if (!payload.playUrl) {
    throw new Error('Vimeo resolve response did not include a playable URL.')
  }

  return {
    id: payload.id,
    title: payload.title,
    playUrl: payload.playUrl,
    streamKind: payload.streamKind,
  }
}
