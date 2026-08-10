import { useCallback, useState } from 'react'
import { ModelStatus } from './components/ModelStatus'
import { ProcessingProgress } from './components/ProcessingProgress'
import { ResultCard } from './components/ResultCard'
import { VideoPlayer } from './components/VideoPlayer'
import { VideoUploader } from './components/VideoUploader'
import { useVideoProcessor } from './hooks/useVideoProcessor'
import type { VideoSourceInfo } from './types/video'

export default function App() {
  const {
    source,
    progress,
    config,
    setConfig,
    assignSource,
    start,
    cancel,
    ml,
    perf,
  } = useVideoProcessor()

  const [inputError, setInputError] = useState<string | null>(null)

  const onSource = useCallback(
    (next: VideoSourceInfo) => {
      setInputError(null)
      assignSource(next)
    },
    [assignSource],
  )

  const busy =
    progress.status === 'loading' || progress.status === 'processing'

  return (
    <div className="app">
      <header className="hero">
        <div className="hero__inner">
          <p className="hero__brand">FrameSafe</p>
          <h1>Local video NSFW detection</h1>
          <p className="hero__lede">
            Progressive frame sampling with TensorFlow.js and NSFWJS. Frames are
            classified in a Web Worker using WebGPU when available, with WASM
            fallback.
          </p>
        </div>
      </header>

      <main className="layout">
        <div className="layout__primary">
          <VideoUploader
            disabled={busy}
            source={source}
            onSource={onSource}
            onError={setInputError}
          />
          {inputError ? <p className="inline-error">{inputError}</p> : null}
          <VideoPlayer source={source} />
          <ProcessingProgress
            progress={progress}
            config={config}
            onConfigChange={setConfig}
            onStart={() => {
              void start()
            }}
            onCancel={cancel}
            canStart={Boolean(source)}
          />
        </div>

        <aside className="layout__side">
          <ModelStatus
            backend={ml.backend}
            modelState={ml.modelState}
            workerState={ml.workerState}
            modelName={ml.modelName}
            architecture={ml.architecture}
            capabilities={ml.capabilities}
            error={ml.error}
          />
          <ResultCard
            progress={progress}
            perf={perf}
            backend={ml.backend}
          />
        </aside>
      </main>
    </div>
  )
}
