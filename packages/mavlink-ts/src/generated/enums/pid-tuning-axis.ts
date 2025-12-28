export enum PidTuningAxis {
  PID_TUNING_ROLL = 1,
  PID_TUNING_PITCH = 2,
  PID_TUNING_YAW = 3,
  PID_TUNING_ACCZ = 4,
  PID_TUNING_STEER = 5,
  PID_TUNING_LANDING = 6,
}

/** @deprecated Use PidTuningAxis instead */
export const PID_TUNING_AXIS = PidTuningAxis;