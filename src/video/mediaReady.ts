export async function waitForCondition(
  check: () => boolean,
  timeoutMs: number,
  abortSignal?: AbortSignal,
  label = 'media condition',
): Promise<void> {
  if (check()) {
    return
  }

  if (abortSignal?.aborted) {
    throw new DOMException('Aborted', 'AbortError')
  }

  await new Promise<void>((resolve, reject) => {
    const started = performance.now()
    let timer: number | null = null
    let raf = 0

    const onAbort = () => {
      cleanup()
      reject(new DOMException('Aborted', 'AbortError'))
    }

    const cleanup = () => {
      if (timer !== null) {
        window.clearTimeout(timer)
      }
      if (raf) {
        window.cancelAnimationFrame(raf)
      }
      abortSignal?.removeEventListener('abort', onAbort)
    }

    const tick = () => {
      if (check()) {
        cleanup()
        resolve()
        return
      }
      if (performance.now() - started >= timeoutMs) {
        cleanup()
        reject(new Error(`Timed out while waiting for ${label}.`))
        return
      }
      raf = window.requestAnimationFrame(tick)
    }

    abortSignal?.addEventListener('abort', onAbort, { once: true })
    timer = window.setTimeout(() => {
      cleanup()
      reject(new Error(`Timed out while waiting for ${label}.`))
    }, timeoutMs + 50)
    raf = window.requestAnimationFrame(tick)
  })
}

export async function ensureCurrentFrame(
  video: HTMLVideoElement,
  timeoutMs: number,
  abortSignal?: AbortSignal,
): Promise<void> {
  const ready = () =>
    video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
    video.videoWidth > 0 &&
    video.videoHeight > 0

  if (ready()) {
    return
  }

  try {
    video.muted = true
    const playPromise = video.play()
    if (playPromise) {
      await playPromise
    }
    video.pause()
  } catch {
    // ignore autoplay/play failures; polling below still waits for data
  }

  await waitForCondition(
    ready,
    timeoutMs,
    abortSignal,
    'a decodable video frame',
  )
}
