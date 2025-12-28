/**
 * A mapping of antenna tracker flight modes for custom_mode field of heartbeat.
 */
export enum TrackerMode {
  /** MANUAL */
  TRACKER_MODE_MANUAL = 0,
  /** STOP */
  TRACKER_MODE_STOP = 1,
  /** SCAN */
  TRACKER_MODE_SCAN = 2,
  /** SERVO TEST */
  TRACKER_MODE_SERVO_TEST = 3,
  /** GUIDED */
  TRACKER_MODE_GUIDED = 4,
  /** AUTO */
  TRACKER_MODE_AUTO = 10,
  /** INITIALISING */
  TRACKER_MODE_INITIALIZING = 16,
}

/** @deprecated Use TrackerMode instead */
export const TRACKER_MODE = TrackerMode;