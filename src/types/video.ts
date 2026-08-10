export type VideoSourceKind = 'local' | 'remote'

export type VideoStreamKind = 'file' | 'hls'

export type VideoProvider = 'local' | 'direct' | 'vimeo'

export type ProcessingStatus =
  | 'idle'
  | 'loading'
  | 'processing'
  | 'completed'
  | 'cancelled'
  | 'error'

export interface VideoSourceInfo {
  kind: VideoSourceKind
  url: string
  label: string
  objectUrl: string | null
  mimeType: string | null
  fileSize: number | null
  streamKind: VideoStreamKind
  provider: VideoProvider
  pageUrl: string | null
}

export interface VideoMetadata {
  duration: number
  width: number
  height: number
  fps: number | null
}

export interface FrameSample {
  timestamp: number
  index: number
}

export interface ProcessingConfig {
  sampleIntervalSeconds: number
  frameNsfwThreshold: number
  confidenceThreshold: number
  simulateNsfw: boolean
}

export interface AggregationState {
  processedFrames: number
  nsfwFrameCount: number
  nsfwScoreSum: number
}

export interface ProcessingResult {
  confidence: number
  meanNsfwScore: number
  nsfwFrameRatio: number
  isNSFW: boolean
  processedFrames: number
  nsfwFrameCount: number
  totalFrames: number
}

export interface ProcessingProgress {
  progress: number
  processedFrames: number
  totalFrames: number
  currentTimestamp: number | null
  status: ProcessingStatus
  confidence: number
  meanNsfwScore: number
  nsfwFrameRatio: number
  isNSFW: boolean | null
  error: string | null
}
