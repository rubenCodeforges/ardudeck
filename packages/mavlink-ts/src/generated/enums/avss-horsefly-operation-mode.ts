export enum AvssHorseflyOperationMode {
  /** In manual control mode */
  MODE_HORSEFLY_MANUAL_CTRL = 0,
  /** In auto takeoff mode */
  MODE_HORSEFLY_AUTO_TAKEOFF = 1,
  /** In auto landing mode */
  MODE_HORSEFLY_AUTO_LANDING = 2,
  /** In go home mode */
  MODE_HORSEFLY_NAVI_GO_HOME = 3,
  /** In drop mode */
  MODE_HORSEFLY_DROP = 4,
}

/** @deprecated Use AvssHorseflyOperationMode instead */
export const AVSS_HORSEFLY_OPERATION_MODE = AvssHorseflyOperationMode;