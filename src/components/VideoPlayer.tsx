import { useEffect, useRef, useState } from 'react'
import type { VideoSourceInfo } from '../types/video'
import { attachMediaSource } from '../video/hlsAttach'

interface VideoPlayerProps {
  source: VideoSourceInfo | null
}

export function VideoPlayer({ source }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setLoadError(null)
    setReady(false)

    const video = videoRef.current
    if (!source || !video) {
      return
    }

    let cancelled = false
    let destroy: (() => void) | null = null

    void (async () => {
      try {
        if (source.kind === 'remote') {
          video.crossOrigin = 'anonymous'
        } else {
          video.removeAttribute('crossorigin')
        }

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
  }, [source])

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
        <video
          ref={videoRef}
          controls
          playsInline
          preload="metadata"
          onLoadedData={() => {
            setReady(true)
            setLoadError(null)
          }}
          onError={() => {
            setLoadError(
              source.kind === 'remote'
                ? 'Could not load this remote video for preview. The URL may be invalid, blocked, or unavailable.'
                : 'Could not load this video for preview.',
            )
          }}
        />
      </div>
      {source.provider === 'vimeo' ? (
        <p className="preview-note">
          Vimeo page URL resolved to a stream for preview and analysis.
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
