/**
 * Airspeed sensor flags
 * @bitmask
 */
export enum AirspeedSensorFlags {
  /** Airspeed sensor is unhealthy */
  AIRSPEED_SENSOR_UNHEALTHY = 1,
  /** True if the data from this sensor is being actively used by the flight controller for guidance, navigation or control. */
  AIRSPEED_SENSOR_USING = 2,
}

/** @deprecated Use AirspeedSensorFlags instead */
export const AIRSPEED_SENSOR_FLAGS = AirspeedSensorFlags;