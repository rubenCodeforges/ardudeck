/**
 * RADIO_RC_CHANNELS flags (bitmask).
 * @bitmask
 */
export enum RadioRcChannelsFlags {
  /** Failsafe is active. The content of the RC channels data in the RADIO_RC_CHANNELS message is implementation dependent. */
  RADIO_RC_CHANNELS_FLAGS_FAILSAFE = 1,
  /** Channel data may be out of date. This is set when the receiver is unable to validate incoming data from the transmitter and has therefore resent the last valid data it received. */
  RADIO_RC_CHANNELS_FLAGS_OUTDATED = 2,
}

/** @deprecated Use RadioRcChannelsFlags instead */
export const RADIO_RC_CHANNELS_FLAGS = RadioRcChannelsFlags;