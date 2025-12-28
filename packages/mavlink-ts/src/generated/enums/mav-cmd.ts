export enum MavCmd {
  /** Command to a gimbal manager to control the gimbal tilt and pan angles. It is possible to set combinations of the values below. E.g. an angle as well as a desired angular rate can be used to get to this angle at a certain angular rate, or an angular rate only will result in continuous turning. NaN is to be used to signal unset. A gimbal device is never to react to this command. */
  MAV_CMD_STORM32_DO_GIMBAL_MANAGER_CONTROL_PITCHYAW = 60002,
  /** Command to configure a gimbal manager. A gimbal device is never to react to this command. The selected profile is reported in the STORM32_GIMBAL_MANAGER_STATUS message. */
  MAV_CMD_STORM32_DO_GIMBAL_MANAGER_SETUP = 60010,
  /** Command to set the shot manager mode. */
  MAV_CMD_QSHOT_DO_CONFIGURE = 60020,
}

/** @deprecated Use MavCmd instead */
export const MAV_CMD = MavCmd;