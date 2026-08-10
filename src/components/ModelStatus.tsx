import type {
  CapabilityReport,
  MLBackendName,
  ModelLoadState,
  WorkerReadyState,
} from '../types/ml'

interface ModelStatusProps {
  backend: MLBackendName | null
  modelState: ModelLoadState
  workerState: WorkerReadyState
  modelName: string | null
  architecture: string | null
  capabilities: CapabilityReport
  error: string | null
}

function statusLabel(state: ModelLoadState | WorkerReadyState): string {
  switch (state) {
    case 'loaded':
    case 'ready':
      return 'Ready'
    case 'loading':
    case 'initializing':
      return 'Loading'
    case 'error':
      return 'Error'
    default:
      return 'Idle'
  }
}

export function ModelStatus({
  backend,
  modelState,
  workerState,
  modelName,
  architecture,
  capabilities,
  error,
}: ModelStatusProps) {
  return (
    <section className="panel">
      <div className="panel__header">
        <h2>Model status</h2>
        <p>Runtime backend and worker readiness.</p>
      </div>

      <dl className="status-grid">
        <div>
          <dt>Backend</dt>
          <dd>{backend ? backend.toUpperCase() : 'Not initialized'}</dd>
        </div>
        <div>
          <dt>Model</dt>
          <dd>
            {statusLabel(modelState)}
            {modelName ? ` · ${modelName}` : ''}
          </dd>
        </div>
        <div>
          <dt>Architecture</dt>
          <dd>{architecture ?? 'MobileNetV2 (NSFWJS)'}</dd>
        </div>
        <div>
          <dt>Worker</dt>
          <dd>{statusLabel(workerState)}</dd>
        </div>
      </dl>

      <div className="capability-row">
        <span className={capabilities.webgpu ? 'ok' : 'warn'}>WebGPU</span>
        <span className={capabilities.wasm ? 'ok' : 'warn'}>WASM</span>
        <span className={capabilities.offscreenCanvas ? 'ok' : 'warn'}>
          OffscreenCanvas
        </span>
        <span className={capabilities.videoFrame ? 'ok' : 'warn'}>VideoFrame</span>
        <span className={capabilities.webWorkers ? 'ok' : 'bad'}>Workers</span>
      </div>

      {error ? <p className="inline-error">{error}</p> : null}
    </section>
  )
}
