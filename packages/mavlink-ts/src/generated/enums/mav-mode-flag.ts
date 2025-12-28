/**
 * These flags encode the MAV mode, see MAV_MODE enum for useful combinations.
 * @bitmask
 */
export enum MavModeFlag {
  /** 0b10000000 MAV safety set to armed. Motors are enabled / running / can start. Ready to fly. Additional note: this flag is to be ignore when sent in the command MAV_CMD_DO_SET_MODE and MAV_CMD_COMPONENT_ARM_DISARM shall be used instead. The flag can still be used to report the armed state. */
  MAV_MODE_FLAG_SAFETY_ARMED = 128,
  /** 0b01000000 remote control input is enabled. */
  MAV_MODE_FLAG_MANUAL_INPUT_ENABLED = 64,
  /** 0b00100000 hardware in the loop simulation. All motors / actuators are blocked, but internal software is full operational. */
  MAV_MODE_FLAG_HIL_ENABLED = 32,
  /** 0b00010000 system stabilizes electronically its attitude (and optionally position). It needs however further control inputs to move around. */
  MAV_MODE_FLAG_STABILIZE_ENABLED = 16,
  /** 0b00001000 guided mode enabled, system flies waypoints / mission items. */
  MAV_MODE_FLAG_GUIDED_ENABLED = 8,
  /** 0b00000100 autonomous mode enabled, system finds its own goal positions. Guided flag can be set or not, depends on the actual implementation. */
  MAV_MODE_FLAG_AUTO_ENABLED = 4,
  /** 0b00000010 system has a test mode enabled. This flag is intended for temporary system tests and should not be used for stable implementations. */
  MAV_MODE_FLAG_TEST_ENABLED = 2,
  /** 0b00000001 Reserved for future use. */
  MAV_MODE_FLAG_CUSTOM_MODE_ENABLED = 1,
}

/** @deprecated Use MavModeFlag instead */
export const MAV_MODE_FLAG = MavModeFlag;