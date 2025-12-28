export enum GoproCaptureMode {
  /** Video mode. */
  GOPRO_CAPTURE_MODE_VIDEO = 0,
  /** Photo mode. */
  GOPRO_CAPTURE_MODE_PHOTO = 1,
  /** Burst mode, Hero 3+ only. */
  GOPRO_CAPTURE_MODE_BURST = 2,
  /** Time lapse mode, Hero 3+ only. */
  GOPRO_CAPTURE_MODE_TIME_LAPSE = 3,
  /** Multi shot mode, Hero 4 only. */
  GOPRO_CAPTURE_MODE_MULTI_SHOT = 4,
  /** Playback mode, Hero 4 only, silver only except when LCD or HDMI is connected to black. */
  GOPRO_CAPTURE_MODE_PLAYBACK = 5,
  /** Playback mode, Hero 4 only. */
  GOPRO_CAPTURE_MODE_SETUP = 6,
  /** Mode not yet known. */
  GOPRO_CAPTURE_MODE_UNKNOWN = 255,
}

/** @deprecated Use GoproCaptureMode instead */
export const GOPRO_CAPTURE_MODE = GoproCaptureMode;