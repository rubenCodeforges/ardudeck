/**
 * Stream status flags (Bitmap)
 * @bitmask
 */
export enum VideoStreamStatusFlags {
  /** Stream is active (running) */
  VIDEO_STREAM_STATUS_FLAGS_RUNNING = 1,
  /** Stream is thermal imaging */
  VIDEO_STREAM_STATUS_FLAGS_THERMAL = 2,
  /** Stream can report absolute thermal range (see CAMERA_THERMAL_RANGE). */
  VIDEO_STREAM_STATUS_FLAGS_THERMAL_RANGE_ENABLED = 4,
}

/** @deprecated Use VideoStreamStatusFlags instead */
export const VIDEO_STREAM_STATUS_FLAGS = VideoStreamStatusFlags;