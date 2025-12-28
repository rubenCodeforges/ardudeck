/**
 * Smart battery supply status/fault flags (bitmask) for health indication. The battery must also report either MAV_BATTERY_CHARGE_STATE_FAILED or MAV_BATTERY_CHARGE_STATE_UNHEALTHY if any of these are set.
 * @bitmask
 */
export enum MavBatteryFault {
  /** Battery has deep discharged. */
  MAV_BATTERY_FAULT_DEEP_DISCHARGE = 1,
  /** Voltage spikes. */
  MAV_BATTERY_FAULT_SPIKES = 2,
  /** One or more cells have failed. Battery should also report MAV_BATTERY_CHARGE_STATE_FAILE (and should not be used). */
  MAV_BATTERY_FAULT_CELL_FAIL = 4,
  /** Over-current fault. */
  MAV_BATTERY_FAULT_OVER_CURRENT = 8,
  /** Over-temperature fault. */
  MAV_BATTERY_FAULT_OVER_TEMPERATURE = 16,
  /** Under-temperature fault. */
  MAV_BATTERY_FAULT_UNDER_TEMPERATURE = 32,
  /** Vehicle voltage is not compatible with this battery (batteries on same power rail should have similar voltage). */
  MAV_BATTERY_FAULT_INCOMPATIBLE_VOLTAGE = 64,
  /** Battery firmware is not compatible with current autopilot firmware. */
  MAV_BATTERY_FAULT_INCOMPATIBLE_FIRMWARE = 128,
  /** Battery is not compatible due to cell configuration (e.g. 5s1p when vehicle requires 6s). */
  BATTERY_FAULT_INCOMPATIBLE_CELLS_CONFIGURATION = 256,
}

/** @deprecated Use MavBatteryFault instead */
export const MAV_BATTERY_FAULT = MavBatteryFault;