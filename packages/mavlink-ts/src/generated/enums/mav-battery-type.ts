/**
 * Enumeration of battery types
 */
export enum MavBatteryType {
  /** Not specified. */
  MAV_BATTERY_TYPE_UNKNOWN = 0,
  /** Lithium polymer battery */
  MAV_BATTERY_TYPE_LIPO = 1,
  /** Lithium-iron-phosphate battery */
  MAV_BATTERY_TYPE_LIFE = 2,
  /** Lithium-ION battery */
  MAV_BATTERY_TYPE_LION = 3,
  /** Nickel metal hydride battery */
  MAV_BATTERY_TYPE_NIMH = 4,
}

/** @deprecated Use MavBatteryType instead */
export const MAV_BATTERY_TYPE = MavBatteryType;