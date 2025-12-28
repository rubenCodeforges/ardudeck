/**
 * The error type for the OSD parameter editor.
 */
export enum OsdParamConfigError {
  OSD_PARAM_SUCCESS = 0,
  OSD_PARAM_INVALID_SCREEN = 1,
  OSD_PARAM_INVALID_PARAMETER_INDEX = 2,
  OSD_PARAM_INVALID_PARAMETER = 3,
}

/** @deprecated Use OsdParamConfigError instead */
export const OSD_PARAM_CONFIG_ERROR = OsdParamConfigError;