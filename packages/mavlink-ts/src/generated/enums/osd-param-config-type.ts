/**
 * The type of parameter for the OSD parameter editor.
 */
export enum OsdParamConfigType {
  OSD_PARAM_NONE = 0,
  OSD_PARAM_SERIAL_PROTOCOL = 1,
  OSD_PARAM_SERVO_FUNCTION = 2,
  OSD_PARAM_AUX_FUNCTION = 3,
  OSD_PARAM_FLIGHT_MODE = 4,
  OSD_PARAM_FAILSAFE_ACTION = 5,
  OSD_PARAM_FAILSAFE_ACTION_1 = 6,
  OSD_PARAM_FAILSAFE_ACTION_2 = 7,
  OSD_PARAM_NUM_TYPES = 8,
}

/** @deprecated Use OsdParamConfigType instead */
export const OSD_PARAM_CONFIG_TYPE = OsdParamConfigType;