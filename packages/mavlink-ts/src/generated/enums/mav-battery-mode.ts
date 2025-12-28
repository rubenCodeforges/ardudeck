/**
 * Battery mode. Note, the normal operation mode (i.e. when flying) should be reported as MAV_BATTERY_MODE_UNKNOWN to allow message trimming in normal flight.
 */
export enum MavBatteryMode {
  /** Battery mode not supported/unknown battery mode/normal operation. */
  MAV_BATTERY_MODE_UNKNOWN = 0,
  /** Battery is auto discharging (towards storage level). */
  MAV_BATTERY_MODE_AUTO_DISCHARGING = 1,
  /** Battery in hot-swap mode (current limited to prevent spikes that might damage sensitive electrical circuits). */
  MAV_BATTERY_MODE_HOT_SWAP = 2,
}

/** @deprecated Use MavBatteryMode instead */
export const MAV_BATTERY_MODE = MavBatteryMode;