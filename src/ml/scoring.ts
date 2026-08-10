import { SAFE_CLASS_NAMES } from '../config/constants'
import type { ClassPrediction } from '../types/ml'
import type { AggregationState, ProcessingResult } from '../types/video'

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }
  if (value < 0) {
    return 0
  }
  if (value > 1) {
    return 1
  }
  return value
}

export function nsfwScoreFromPredictions(
  predictions: ClassPrediction[],
): number {
  if (predictions.length === 0) {
    return 0
  }

  const knownSafe = predictions.some((prediction) =>
    SAFE_CLASS_NAMES.has(prediction.className),
  )

  if (knownSafe) {
    const score = predictions
      .filter((prediction) => !SAFE_CLASS_NAMES.has(prediction.className))
      .reduce((sum, prediction) => sum + prediction.probability, 0)
    return clamp01(score)
  }

  const ranked = [...predictions].sort(
    (a, b) => b.probability - a.probability,
  )
  const top = ranked[0]
  return clamp01(top?.probability ?? 0)
}

export function createAggregationState(): AggregationState {
  return {
    processedFrames: 0,
    nsfwFrameCount: 0,
    nsfwScoreSum: 0,
  }
}

export function updateAggregation(
  state: AggregationState,
  score: number,
  frameThreshold: number,
): AggregationState {
  const clamped = clamp01(score)
  return {
    processedFrames: state.processedFrames + 1,
    nsfwScoreSum: state.nsfwScoreSum + clamped,
    nsfwFrameCount:
      state.nsfwFrameCount + (clamped >= frameThreshold ? 1 : 0),
  }
}

export function computeMeanNsfwScore(state: AggregationState): number {
  if (state.processedFrames === 0) {
    return 0
  }
  return clamp01(state.nsfwScoreSum / state.processedFrames)
}

export function computeNsfwFrameRatio(state: AggregationState): number {
  if (state.processedFrames === 0) {
    return 0
  }
  return clamp01(state.nsfwFrameCount / state.processedFrames)
}

export function computeConfidence(
  meanNsfwScore: number,
  nsfwFrameRatio: number,
): number {
  const mean = clamp01(meanNsfwScore)
  const ratio = clamp01(nsfwFrameRatio)
  return clamp01(mean * ratio)
}

export function buildProcessingResult(
  state: AggregationState,
  totalFrames: number,
  confidenceThreshold: number,
): ProcessingResult {
  const meanNsfwScore = computeMeanNsfwScore(state)
  const nsfwFrameRatio = computeNsfwFrameRatio(state)
  const confidence = computeConfidence(meanNsfwScore, nsfwFrameRatio)

  return {
    confidence,
    meanNsfwScore,
    nsfwFrameRatio,
    isNSFW: confidence >= confidenceThreshold,
    processedFrames: state.processedFrames,
    nsfwFrameCount: state.nsfwFrameCount,
    totalFrames,
  }
}
