/**
 * These values encode the bit positions of the decode position. These values can be used to read the value of a flag bit by combining the base_mode variable with AND with the flag position value. The result will be either 0 or 1, depending on if the flag is set or not.
 * @bitmask
 */
export enum MavModeFlagDecodePosition {
  /** First bit:  10000000 */
  MAV_MODE_FLAG_DECODE_POSITION_SAFETY = 128,
  /** Second bit: 01000000 */
  MAV_MODE_FLAG_DECODE_POSITION_MANUAL = 64,
  /** Third bit:  00100000 */
  MAV_MODE_FLAG_DECODE_POSITION_HIL = 32,
  /** Fourth bit: 00010000 */
  MAV_MODE_FLAG_DECODE_POSITION_STABILIZE = 16,
  /** Fifth bit:  00001000 */
  MAV_MODE_FLAG_DECODE_POSITION_GUIDED = 8,
  /** Sixth bit:   00000100 */
  MAV_MODE_FLAG_DECODE_POSITION_AUTO = 4,
  /** Seventh bit: 00000010 */
  MAV_MODE_FLAG_DECODE_POSITION_TEST = 2,
  /** Eighth bit: 00000001 */
  MAV_MODE_FLAG_DECODE_POSITION_CUSTOM_MODE = 1,
}

/** @deprecated Use MavModeFlagDecodePosition instead */
export const MAV_MODE_FLAG_DECODE_POSITION = MavModeFlagDecodePosition;