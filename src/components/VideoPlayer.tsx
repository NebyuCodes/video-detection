import { useEffect, useMemo, useRef, useState } from 'react'
import type { VideoSourceInfo } from '../types/video'
import { extractVimeoId } from '../video/vimeo'
import { attachMediaSource } from '../video/hlsAttach'

interface VideoPlayerProps {
  source: VideoSourceInfo | null
}

export function VideoPlayer({ source }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  const vimeoId = useMemo(() => {
    if (!source || source.provider !== 'vimeo') {
      return null
    }
    return extractVimeoId(source.pageUrl || '') || extractVimeoId(source.url)
  }, [source])

  useEffect(() => {
    setLoadError(null)
    setReady(false)

    if (!source || vimeoId) {
      if (vimeoId) {
        setReady(true)
      }
      return
    }

    const video = videoRef.current
    if (!video) {
      return
    }

    let cancelled = false
    let destroy: (() => void) | null = null

    void (async () => {
      try {
        video.removeAttribute('crossorigin')
        video.removeAttribute('src')
        video.load()

        const attached = await attachMediaSource(
          video,
          source.url,
          source.streamKind,
        )
        if (cancelled) {
          attached.destroy()
          return
        }
        destroy = attached.destroy
        setReady(true)
        setLoadError(null)
      } catch (error) {
        if (cancelled) {
          return
        }
        setReady(false)
        setLoadError(
          error instanceof Error
            ? error.message
            : 'Could not load this video for preview.',
        )
      }
    })()

    return () => {
      cancelled = true
      destroy?.()
    }
  }, [source, vimeoId])

  if (!source) {
    return (
      <section className="panel panel--preview">
        <div className="preview preview--empty">
          <p>Video preview will appear here</p>
        </div>
      </section>
    )
  }

  const badgeLabel =
    source.provider === 'vimeo'
      ? 'Vimeo URL'
      : source.kind === 'local'
        ? 'Local file'
        : 'Remote URL'

  return (
    <section className="panel panel--preview">
      <div className="panel__header panel__header--row">
        <h2>Preview</h2>
        <span
          className={`badge badge--${source.kind === 'local' ? 'local' : 'remote'}`}
        >
          {badgeLabel}
        </span>
      </div>
      <div className="preview">
        {vimeoId ? (
          <iframe
            title={source.label || 'Vimeo preview'}
            src={`https://player.vimeo.com/video/${vimeoId}?title=0&byline=0&portrait=0`}
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <video
            ref={videoRef}
            controls
            playsInline
            muted
            preload="auto"
            onLoadedData={() => {
              setReady(true)
              setLoadError(null)
            }}
            onError={() => {
              if (source.streamKind === 'hls') {
                return
              }
              setLoadError(
                source.kind === 'remote'
                  ? 'Could not load this remote video for preview. The URL may be invalid, blocked, or unavailable.'
                  : 'Could not load this video for preview.',
              )
            }}
          />
        )}
      </div>
      {source.provider === 'vimeo' ? (
        <p className="preview-note">
          Preview uses the Vimeo player embed. Analysis still samples frames from
          the resolved stream.
          {source.pageUrl ? ` Source: ${source.pageUrl}` : ''}
        </p>
      ) : source.kind === 'remote' ? (
        <p className="preview-note">
          Remote URL mode. Analysis requires CORS-enabled media access.
        </p>
      ) : null}
      {!ready && !loadError ? (
        <p className="preview-note">Loading preview…</p>
      ) : null}
      {loadError ? <p className="inline-error">{loadError}</p> : null}
    </section>
  )
}
