/**
 * SERIAL_CONTROL device types
 */
export enum SerialControlDev {
  /** First telemetry port */
  SERIAL_CONTROL_DEV_TELEM1 = 0,
  /** Second telemetry port */
  SERIAL_CONTROL_DEV_TELEM2 = 1,
  /** First GPS port */
  SERIAL_CONTROL_DEV_GPS1 = 2,
  /** Second GPS port */
  SERIAL_CONTROL_DEV_GPS2 = 3,
  /** system shell */
  SERIAL_CONTROL_DEV_SHELL = 10,
  /** SERIAL0 */
  SERIAL_CONTROL_SERIAL0 = 100,
  /** SERIAL1 */
  SERIAL_CONTROL_SERIAL1 = 101,
  /** SERIAL2 */
  SERIAL_CONTROL_SERIAL2 = 102,
  /** SERIAL3 */
  SERIAL_CONTROL_SERIAL3 = 103,
  /** SERIAL4 */
  SERIAL_CONTROL_SERIAL4 = 104,
  /** SERIAL5 */
  SERIAL_CONTROL_SERIAL5 = 105,
  /** SERIAL6 */
  SERIAL_CONTROL_SERIAL6 = 106,
  /** SERIAL7 */
  SERIAL_CONTROL_SERIAL7 = 107,
  /** SERIAL8 */
  SERIAL_CONTROL_SERIAL8 = 108,
  /** SERIAL9 */
  SERIAL_CONTROL_SERIAL9 = 109,
}

/** @deprecated Use SerialControlDev instead */
export const SERIAL_CONTROL_DEV = SerialControlDev;