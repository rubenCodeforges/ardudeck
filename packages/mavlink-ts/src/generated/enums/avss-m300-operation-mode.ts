export enum AvssM300OperationMode {
  /** In manual control mode */
  MODE_M300_MANUAL_CTRL = 0,
  /** In attitude mode */
  MODE_M300_ATTITUDE = 1,
  /** In GPS mode */
  MODE_M300_P_GPS = 6,
  /** In hotpoint mode */
  MODE_M300_HOTPOINT_MODE = 9,
  /** In assisted takeoff mode */
  MODE_M300_ASSISTED_TAKEOFF = 10,
  /** In auto takeoff mode */
  MODE_M300_AUTO_TAKEOFF = 11,
  /** In auto landing mode */
  MODE_M300_AUTO_LANDING = 12,
  /** In go home mode */
  MODE_M300_NAVI_GO_HOME = 15,
  /** In sdk control mode */
  MODE_M300_NAVI_SDK_CTRL = 17,
  /** In sport mode */
  MODE_M300_S_SPORT = 31,
  /** In force auto landing mode */
  MODE_M300_FORCE_AUTO_LANDING = 33,
  /** In tripod mode */
  MODE_M300_T_TRIPOD = 38,
  /** In search mode */
  MODE_M300_SEARCH_MODE = 40,
  /** In engine mode */
  MODE_M300_ENGINE_START = 41,
}

/** @deprecated Use AvssM300OperationMode instead */
export const AVSS_M300_OPERATION_MODE = AvssM300OperationMode;