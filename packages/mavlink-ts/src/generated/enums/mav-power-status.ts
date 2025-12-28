/**
 * Power supply status flags (bitmask)
 * @bitmask
 */
export enum MavPowerStatus {
  /** main brick power supply valid */
  MAV_POWER_STATUS_BRICK_VALID = 1,
  /** main servo power supply valid for FMU */
  MAV_POWER_STATUS_SERVO_VALID = 2,
  /** USB power is connected */
  MAV_POWER_STATUS_USB_CONNECTED = 4,
  /** peripheral supply is in over-current state */
  MAV_POWER_STATUS_PERIPH_OVERCURRENT = 8,
  /** hi-power peripheral supply is in over-current state */
  MAV_POWER_STATUS_PERIPH_HIPOWER_OVERCURRENT = 16,
  /** Power status has changed since boot */
  MAV_POWER_STATUS_CHANGED = 32,
}

/** @deprecated Use MavPowerStatus instead */
export const MAV_POWER_STATUS = MavPowerStatus;