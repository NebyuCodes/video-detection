import { useCallback, useRef, useState, type DragEvent } from 'react'
import type { VideoSourceInfo } from '../types/video'
import {
  createLocalVideoSource,
  createRemoteVideoSource,
} from '../video/videoSource'

interface VideoUploaderProps {
  disabled?: boolean
  source: VideoSourceInfo | null
  onSource: (source: VideoSourceInfo) => void
  onError: (message: string) => void
}

export function VideoUploader({
  disabled = false,
  source,
  onSource,
  onError,
}: VideoUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [urlValue, setUrlValue] = useState('https://vimeo.com/347119375')
  const [dragging, setDragging] = useState(false)
  const [resolving, setResolving] = useState(false)

  const handleFile = useCallback(
    (file: File | undefined) => {
      if (!file) {
        return
      }
      try {
        onSource(createLocalVideoSource(file))
        setUrlValue('')
      } catch (error) {
        onError(error instanceof Error ? error.message : 'Invalid video file.')
      }
    },
    [onError, onSource],
  )

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      setDragging(false)
      if (disabled) {
        return
      }
      handleFile(event.dataTransfer.files?.[0])
    },
    [disabled, handleFile],
  )

  const onUrlSubmit = useCallback(async () => {
    setResolving(true)
    try {
      const next = await createRemoteVideoSource(urlValue)
      onSource(next)
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Invalid video URL.')
    } finally {
      setResolving(false)
    }
  }, [onError, onSource, urlValue])

  const busy = disabled || resolving

  return (
    <section className="panel">
      <div className="panel__header">
        <h2>Video input</h2>
        <p>
          Upload a local file, paste a Vimeo URL (for example
          https://vimeo.com/347119375), or use a direct .mp4/.webm file URL.
          YouTube page links are not supported.
        </p>
      </div>

      <div
        className={`dropzone${dragging ? ' dropzone--active' : ''}${busy ? ' dropzone--disabled' : ''}`}
        onDragEnter={(event) => {
          event.preventDefault()
          if (!busy) {
            setDragging(true)
          }
        }}
        onDragOver={(event) => {
          event.preventDefault()
        }}
        onDragLeave={(event) => {
          event.preventDefault()
          setDragging(false)
        }}
        onDrop={onDrop}
      >
        <p className="dropzone__title">Drop a video here</p>
        <p className="dropzone__hint">or choose a file from your device</p>
        <button
          type="button"
          className="button button--primary"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          Upload video
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="video/*,.mp4,.webm,.ogg,.mov,.m4v"
          hidden
          disabled={busy}
          onChange={(event) => {
            handleFile(event.target.files?.[0])
            event.currentTarget.value = ''
          }}
        />
      </div>

      <div className="url-row">
        <label className="field">
          <span>Remote video URL</span>
          <input
            type="url"
            placeholder="https://vimeo.com/347119375"
            value={urlValue}
            disabled={busy}
            onChange={(event) => setUrlValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void onUrlSubmit()
              }
            }}
          />
        </label>
        <button
          type="button"
          className="button button--secondary"
          disabled={busy || !urlValue.trim()}
          onClick={() => {
            void onUrlSubmit()
          }}
        >
          {resolving ? 'Resolving…' : 'Use URL'}
        </button>
      </div>

      {source ? (
        <div className="source-meta">
          <span
            className={`badge badge--${source.kind === 'local' ? 'local' : 'remote'}`}
          >
            {source.provider === 'vimeo'
              ? 'Vimeo URL'
              : source.kind === 'local'
                ? 'Local file'
                : 'Remote URL'}
          </span>
          <span className="source-meta__label">{source.label}</span>
        </div>
      ) : null}
    </section>
  )
}
