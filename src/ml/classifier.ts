import * as tf from '@tensorflow/tfjs'
import type { NSFWJS } from 'nsfwjs/core'
import { MODEL_INPUT_SIZE } from '../config/constants'
import type { ClassPrediction, FrameClassification } from '../types/ml'
import { nsfwScoreFromPredictions } from './scoring'

function closeBitmap(bitmap: ImageBitmap): void {
  if (typeof bitmap.close === 'function') {
    bitmap.close()
  }
}

async function resizeToImageData(
  bitmap: ImageBitmap,
  inputSize: number,
): Promise<ImageData> {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(inputSize, inputSize)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) {
      throw new Error('Unable to create OffscreenCanvas 2D context.')
    }
    ctx.drawImage(bitmap, 0, 0, inputSize, inputSize)
    return ctx.getImageData(0, 0, inputSize, inputSize)
  }

  throw new Error('OffscreenCanvas is required for worker frame preprocessing.')
}

export async function classifyBitmap(
  model: NSFWJS,
  bitmap: ImageBitmap,
  timestamp: number,
  inputSize = MODEL_INPUT_SIZE,
): Promise<FrameClassification> {
  const started = performance.now()
  let imageData: ImageData | null = null

  try {
    imageData = await resizeToImageData(bitmap, inputSize)

    const predictions = await model.classify(imageData)
    const normalized: ClassPrediction[] = predictions.map((prediction) => ({
      className: prediction.className,
      probability: prediction.probability,
    }))

    return {
      timestamp,
      score: nsfwScoreFromPredictions(normalized),
      predictions: normalized,
      processingMs: performance.now() - started,
    }
  } finally {
    closeBitmap(bitmap)
    imageData = null
    const memory = tf.memory()
    if (memory.numTensors > 32) {
      console.warn('[ml] Elevated tensor count after classify', memory)
    }
  }
}
