/**
 * Flags for gimbal manager operation. Used for setting and reporting, unless specified otherwise. If a setting has been accepted by the gimbal manager is reported in the STORM32_GIMBAL_MANAGER_STATUS message.
 * @bitmask
 */
export enum MavStorm32GimbalManagerFlags {
  /** Request to set RC input to active, or report RC input is active. Implies RC mixed. RC exclusive is achieved by setting all clients to inactive. */
  MAV_STORM32_GIMBAL_MANAGER_FLAGS_RC_ACTIVE = 1,
  /** Request to set onboard/companion computer client to active, or report this client is active. */
  MAV_STORM32_GIMBAL_MANAGER_FLAGS_CLIENT_ONBOARD_ACTIVE = 2,
  /** Request to set autopliot client to active, or report this client is active. */
  MAV_STORM32_GIMBAL_MANAGER_FLAGS_CLIENT_AUTOPILOT_ACTIVE = 4,
  /** Request to set GCS client to active, or report this client is active. */
  MAV_STORM32_GIMBAL_MANAGER_FLAGS_CLIENT_GCS_ACTIVE = 8,
  /** Request to set camera client to active, or report this client is active. */
  MAV_STORM32_GIMBAL_MANAGER_FLAGS_CLIENT_CAMERA_ACTIVE = 16,
  /** Request to set GCS2 client to active, or report this client is active. */
  MAV_STORM32_GIMBAL_MANAGER_FLAGS_CLIENT_GCS2_ACTIVE = 32,
  /** Request to set camera2 client to active, or report this client is active. */
  MAV_STORM32_GIMBAL_MANAGER_FLAGS_CLIENT_CAMERA2_ACTIVE = 64,
  /** Request to set custom client to active, or report this client is active. */
  MAV_STORM32_GIMBAL_MANAGER_FLAGS_CLIENT_CUSTOM_ACTIVE = 128,
  /** Request to set custom2 client to active, or report this client is active. */
  MAV_STORM32_GIMBAL_MANAGER_FLAGS_CLIENT_CUSTOM2_ACTIVE = 256,
  /** Request supervision. This flag is only for setting, it is not reported. */
  MAV_STORM32_GIMBAL_MANAGER_FLAGS_SET_SUPERVISON = 512,
  /** Release supervision. This flag is only for setting, it is not reported. */
  MAV_STORM32_GIMBAL_MANAGER_FLAGS_SET_RELEASE = 1024,
}

/** @deprecated Use MavStorm32GimbalManagerFlags instead */
export const MAV_STORM32_GIMBAL_MANAGER_FLAGS = MavStorm32GimbalManagerFlags;