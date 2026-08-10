import type { PerformanceMetrics } from '../types/ml'
import type { ProcessingProgress } from '../types/video'

interface ResultCardProps {
  progress: ProcessingProgress
  perf: PerformanceMetrics
  backend: string | null
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

export function ResultCard({ progress, perf, backend }: ResultCardProps) {
  if (progress.status !== 'completed' || progress.isNSFW === null) {
    return (
      <section className="panel">
        <div className="panel__header">
          <h2>Result</h2>
          <p>Final NSFW confidence will appear after analysis completes.</p>
        </div>
        <div className="result result--idle">Waiting for analysis</div>
      </section>
    )
  }

  const positive = progress.isNSFW

  return (
    <section className="panel">
      <div className="panel__header">
        <h2>Result</h2>
        <p>confidence = mean × nsfw frame ratio</p>
      </div>

      <div className={`result ${positive ? 'result--nsfw' : 'result--safe'}`}>
        <div className="result__label">{positive ? 'NSFW' : 'Safe'}</div>
        <div className="result__confidence">
          NSFW Confidence: {pct(progress.confidence)}
        </div>
      </div>

      <dl className="status-grid">
        <div>
          <dt>NSFW Frame Ratio</dt>
          <dd>{pct(progress.nsfwFrameRatio)}</dd>
        </div>
        <div>
          <dt>Mean NSFW Score</dt>
          <dd>{pct(progress.meanNsfwScore)}</dd>
        </div>
        <div>
          <dt>Frames</dt>
          <dd>
            {progress.processedFrames} / {progress.totalFrames}
          </dd>
        </div>
        <div>
          <dt>Backend</dt>
          <dd>{backend?.toUpperCase() ?? '—'}</dd>
        </div>
      </dl>

      {perf.totalProcessingMs !== null ? (
        <div className="perf-block">
          <h3>Performance</h3>
          <ul>
            {perf.modelLoadMs !== null ? (
              <li>Model load: {(perf.modelLoadMs / 1000).toFixed(2)}s</li>
            ) : null}
            {perf.backendInitMs !== null ? (
              <li>Backend init: {perf.backendInitMs.toFixed(0)}ms</li>
            ) : null}
            <li>
              Processing time: {(perf.totalProcessingMs / 1000).toFixed(2)}s
            </li>
            {perf.averageFrameMs !== null ? (
              <li>Average frame time: {perf.averageFrameMs.toFixed(0)}ms</li>
            ) : null}
            {perf.framesPerSecond !== null ? (
              <li>Throughput: {perf.framesPerSecond.toFixed(2)} fps</li>
            ) : null}
            {perf.tfNumTensors !== null ? (
              <li>
                TF memory: {perf.tfNumTensors} tensors /{' '}
                {((perf.tfNumBytes ?? 0) / (1024 * 1024)).toFixed(2)} MB
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
