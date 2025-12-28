/**
 * Enumeration of battery functions
 */
export enum MavBatteryFunction {
  /** Battery function is unknown */
  MAV_BATTERY_FUNCTION_UNKNOWN = 0,
  /** Battery supports all flight systems */
  MAV_BATTERY_FUNCTION_ALL = 1,
  /** Battery for the propulsion system */
  MAV_BATTERY_FUNCTION_PROPULSION = 2,
  /** Avionics battery */
  MAV_BATTERY_FUNCTION_AVIONICS = 3,
  /** Payload battery */
  MAV_BATTERY_TYPE_PAYLOAD = 4,
}

/** @deprecated Use MavBatteryFunction instead */
export const MAV_BATTERY_FUNCTION = MavBatteryFunction;