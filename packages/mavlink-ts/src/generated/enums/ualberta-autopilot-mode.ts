/**
 * Available autopilot modes for ualberta uav
 */
export enum UalbertaAutopilotMode {
  /** Raw input pulse widts sent to output */
  MODE_MANUAL_DIRECT = 1,
  /** Inputs are normalized using calibration, the converted back to raw pulse widths for output */
  MODE_MANUAL_SCALED = 2,
  /** dfsdfs */
  MODE_AUTO_PID_ATT = 3,
  /** dfsfds */
  MODE_AUTO_PID_VEL = 4,
  /** dfsdfsdfs */
  MODE_AUTO_PID_POS = 5,
}

/** @deprecated Use UalbertaAutopilotMode instead */
export const UALBERTA_AUTOPILOT_MODE = UalbertaAutopilotMode;