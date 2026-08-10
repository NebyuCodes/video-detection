import type { ProcessingConfig, ProcessingProgress as Progress } from '../types/video'

interface ProcessingProgressProps {
  progress: Progress
  config: ProcessingConfig
  onConfigChange: (config: ProcessingConfig) => void
  onStart: () => void
  onCancel: () => void
  canStart: boolean
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

function formatTime(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) {
    return '—'
  }
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toFixed(1).padStart(4, '0')}`
}

export function ProcessingProgress({
  progress,
  config,
  onConfigChange,
  onStart,
  onCancel,
  canStart,
}: ProcessingProgressProps) {
  const busy =
    progress.status === 'loading' || progress.status === 'processing'

  return (
    <section className="panel">
      <div className="panel__header">
        <h2>Processing</h2>
        <p>Frames are sampled progressively and classified one at a time.</p>
      </div>

      <div className="controls-grid">
        <label className="field">
          <span>Sample interval (seconds)</span>
          <input
            type="number"
            min={0.25}
            step={0.25}
            value={config.sampleIntervalSeconds}
            disabled={busy}
            onChange={(event) =>
              onConfigChange({
                ...config,
                sampleIntervalSeconds: Math.max(
                  0.25,
                  Number(event.target.value) || 1,
                ),
              })
            }
          />
        </label>
        <label className="field">
          <span>Frame NSFW threshold</span>
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={config.frameNsfwThreshold}
            disabled={busy}
            onChange={(event) =>
              onConfigChange({
                ...config,
                frameNsfwThreshold: Math.min(
                  1,
                  Math.max(0, Number(event.target.value) || 0),
                ),
              })
            }
          />
        </label>
        <label className="field">
          <span>Confidence threshold</span>
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={config.confidenceThreshold}
            disabled={busy}
            onChange={(event) =>
              onConfigChange({
                ...config,
                confidenceThreshold: Math.min(
                  1,
                  Math.max(0, Number(event.target.value) || 0),
                ),
              })
            }
          />
        </label>
      </div>

      <label className="simulate-toggle">
        <input
          type="checkbox"
          checked={config.simulateNsfw}
          disabled={busy}
          onChange={(event) =>
            onConfigChange({
              ...config,
              simulateNsfw: event.target.checked,
            })
          }
        />
        <span>
          Simulate NSFW scores (demo only — uses any safe video; about 1 in 3
          frames get a high fake score)
        </span>
      </label>

      <div className="action-row">
        <button
          type="button"
          className="button button--primary"
          disabled={!canStart || busy}
          onClick={onStart}
        >
          {busy ? 'Processing…' : 'Analyze video'}
        </button>
        <button
          type="button"
          className="button button--ghost"
          disabled={!busy}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>

      <div className="progress-block">
        <div className="progress-block__meta">
          <span className={`status-pill status-pill--${progress.status}`}>
            {progress.status}
          </span>
          <span>{formatPercent(progress.progress)}</span>
        </div>
        <div
          className="progress-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress.progress * 100)}
        >
          <div
            className="progress-bar__fill"
            style={{ width: `${Math.min(progress.progress * 100, 100)}%` }}
          />
        </div>
        <dl className="stats-row">
          <div>
            <dt>Processed</dt>
            <dd>
              {progress.processedFrames} / {progress.totalFrames || '—'}
            </dd>
          </div>
          <div>
            <dt>Timestamp</dt>
            <dd>{formatTime(progress.currentTimestamp)}</dd>
          </div>
          <div>
            <dt>Live confidence</dt>
            <dd>{formatPercent(progress.confidence)}</dd>
          </div>
        </dl>
      </div>

      {progress.error ? <p className="inline-error">{progress.error}</p> : null}
    </section>
  )
}
