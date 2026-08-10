export function revokeObjectUrl(url: string | null | undefined): void {
  if (!url) {
    return
  }
  try {
    URL.revokeObjectURL(url)
  } catch {
    // ignore
  }
}

export function closeImageBitmap(bitmap: ImageBitmap | null | undefined): void {
  if (!bitmap) {
    return
  }
  try {
    bitmap.close()
  } catch {
    // ignore
  }
}

export function closeVideoFrame(frame: VideoFrame | null | undefined): void {
  if (!frame) {
    return
  }
  try {
    frame.close()
  } catch {
    // ignore
  }
}

export function terminateWorker(worker: Worker | null | undefined): void {
  if (!worker) {
    return
  }
  try {
    worker.terminate()
  } catch {
    // ignore
  }
}

export function removeVideoElement(video: HTMLVideoElement | null): void {
  if (!video) {
    return
  }
  try {
    const withStream = video as HTMLVideoElement & {
      __attachedStream?: { destroy: () => void } | null
    }
    withStream.__attachedStream?.destroy()
    withStream.__attachedStream = null
    video.pause()
    video.removeAttribute('src')
    video.load()
    video.remove()
  } catch {
    // ignore
  }
}

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}
