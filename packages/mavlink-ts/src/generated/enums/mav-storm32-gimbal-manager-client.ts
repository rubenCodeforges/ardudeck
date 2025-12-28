/**
 * Gimbal manager client ID. In a prioritizing profile, the priorities are determined by the implementation; they could e.g. be custom1 > onboard > GCS > autopilot/camera > GCS2 > custom2.
 */
export enum MavStorm32GimbalManagerClient {
  /** For convenience. */
  MAV_STORM32_GIMBAL_MANAGER_CLIENT_NONE = 0,
  /** This is the onboard/companion computer client. */
  MAV_STORM32_GIMBAL_MANAGER_CLIENT_ONBOARD = 1,
  /** This is the autopilot client. */
  MAV_STORM32_GIMBAL_MANAGER_CLIENT_AUTOPILOT = 2,
  /** This is the GCS client. */
  MAV_STORM32_GIMBAL_MANAGER_CLIENT_GCS = 3,
  /** This is the camera client. */
  MAV_STORM32_GIMBAL_MANAGER_CLIENT_CAMERA = 4,
  /** This is the GCS2 client. */
  MAV_STORM32_GIMBAL_MANAGER_CLIENT_GCS2 = 5,
  /** This is the camera2 client. */
  MAV_STORM32_GIMBAL_MANAGER_CLIENT_CAMERA2 = 6,
  /** This is the custom client. */
  MAV_STORM32_GIMBAL_MANAGER_CLIENT_CUSTOM = 7,
  /** This is the custom2 client. */
  MAV_STORM32_GIMBAL_MANAGER_CLIENT_CUSTOM2 = 8,
}

/** @deprecated Use MavStorm32GimbalManagerClient instead */
export const MAV_STORM32_GIMBAL_MANAGER_CLIENT = MavStorm32GimbalManagerClient;