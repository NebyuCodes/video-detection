export const SAMPLE_INTERVAL_SECONDS = 1

export const HLS_SAMPLE_INTERVAL_SECONDS = 3

export const HLS_MAX_SAMPLED_FRAMES = 12

export const FRAME_NSFW_THRESHOLD = 0.5

export const NSFW_CONFIDENCE_THRESHOLD = 0.5

export const MODEL_NAME = 'MobileNetV2' as const

export const MODEL_INPUT_SIZE = 224

export const MAX_UPLOAD_BYTES = 512 * 1024 * 1024

export const MAX_VIDEO_DURATION_SECONDS = 60 * 60

export const SAFE_CLASS_NAMES = new Set(['Neutral', 'Drawing'])

export const IS_DEV = import.meta.env.DEV
