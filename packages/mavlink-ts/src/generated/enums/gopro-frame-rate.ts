export enum GoproFrameRate {
  /** 12 FPS. */
  GOPRO_FRAME_RATE_12 = 0,
  /** 15 FPS. */
  GOPRO_FRAME_RATE_15 = 1,
  /** 24 FPS. */
  GOPRO_FRAME_RATE_24 = 2,
  /** 25 FPS. */
  GOPRO_FRAME_RATE_25 = 3,
  /** 30 FPS. */
  GOPRO_FRAME_RATE_30 = 4,
  /** 48 FPS. */
  GOPRO_FRAME_RATE_48 = 5,
  /** 50 FPS. */
  GOPRO_FRAME_RATE_50 = 6,
  /** 60 FPS. */
  GOPRO_FRAME_RATE_60 = 7,
  /** 80 FPS. */
  GOPRO_FRAME_RATE_80 = 8,
  /** 90 FPS. */
  GOPRO_FRAME_RATE_90 = 9,
  /** 100 FPS. */
  GOPRO_FRAME_RATE_100 = 10,
  /** 120 FPS. */
  GOPRO_FRAME_RATE_120 = 11,
  /** 240 FPS. */
  GOPRO_FRAME_RATE_240 = 12,
  /** 12.5 FPS. */
  GOPRO_FRAME_RATE_12_5 = 13,
}

/** @deprecated Use GoproFrameRate instead */
export const GOPRO_FRAME_RATE = GoproFrameRate;