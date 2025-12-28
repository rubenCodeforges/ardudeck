/**
 * Flags indicating errors in a GPS receiver.
 * @bitmask
 */
export enum GpsSystemErrorFlags {
  /** There are problems with incoming correction streams. */
  GPS_SYSTEM_ERROR_INCOMING_CORRECTIONS = 1,
  /** There are problems with the configuration. */
  GPS_SYSTEM_ERROR_CONFIGURATION = 2,
  /** There are problems with the software on the GPS receiver. */
  GPS_SYSTEM_ERROR_SOFTWARE = 4,
  /** There are problems with an antenna connected to the GPS receiver. */
  GPS_SYSTEM_ERROR_ANTENNA = 8,
  /** There are problems handling all incoming events. */
  GPS_SYSTEM_ERROR_EVENT_CONGESTION = 16,
  /** The GPS receiver CPU is overloaded. */
  GPS_SYSTEM_ERROR_CPU_OVERLOAD = 32,
  /** The GPS receiver is experiencing output congestion. */
  GPS_SYSTEM_ERROR_OUTPUT_CONGESTION = 64,
}

/** @deprecated Use GpsSystemErrorFlags instead */
export const GPS_SYSTEM_ERROR_FLAGS = GpsSystemErrorFlags;