export enum MavCmdDoAuxFunctionSwitchLevel {
  /** Switch Low. */
  MAV_CMD_DO_AUX_FUNCTION_SWITCH_LEVEL_LOW = 0,
  /** Switch Middle. */
  MAV_CMD_DO_AUX_FUNCTION_SWITCH_LEVEL_MIDDLE = 1,
  /** Switch High. */
  MAV_CMD_DO_AUX_FUNCTION_SWITCH_LEVEL_HIGH = 2,
}

/** @deprecated Use MavCmdDoAuxFunctionSwitchLevel instead */
export const MAV_CMD_DO_AUX_FUNCTION_SWITCH_LEVEL = MavCmdDoAuxFunctionSwitchLevel;