/**
 * RC channel outputs from a MAVLink RC receiver for input to a flight controller or other components (allows an RC receiver to connect via MAVLink instead of some other protocol such as PPM-Sum or S.BUS).
        Note that this is not intended to be an over-the-air format, and does not replace RC_CHANNELS and similar messages reported by the flight controller.
        The target_system field should normally be set to the system id of the system to control, typically the flight controller.
        The target_component field can normally be set to 0, so that all components of the system can receive the message.
        The channels array field can publish up to 32 channels; the number of channel items used in the array is specified in the count field.
        The time_last_update_ms field contains the timestamp of the last received valid channels data in the receiver's time domain.
        The count field indicates the first index of the channel array that is not used for channel data (this and later indexes are zero-filled).
        The RADIO_RC_CHANNELS_FLAGS_OUTDATED flag is set by the receiver if the channels data is not up-to-date (for example, if new data from the transmitter could not be validated so the last valid data is resent).
        The RADIO_RC_CHANNELS_FLAGS_FAILSAFE failsafe flag is set by the receiver if the receiver's failsafe condition is met (implementation dependent, e.g., connection to the RC radio is lost).
        In this case time_last_update_ms still contains the timestamp of the last valid channels data, but the content of the channels data is not defined by the protocol (it is up to the implementation of the receiver).
        For instance, the channels data could contain failsafe values configured in the receiver; the default is to carry the last valid data.
        Note: The RC channels fields are extensions to ensure that they are located at the end of the serialized payload and subject to MAVLink's trailing-zero trimming.
 * Message ID: 420
 * CRC Extra: 189
 */
export interface RadioRcChannels {
  /** System ID (ID of target system, normally flight controller). */
  targetSystem: number;
  /** Component ID (normally 0 for broadcast). */
  targetComponent: number;
  /** Time when the data in the channels field were last updated (time since boot in the receiver's time domain). (ms) */
  timeLastUpdateMs: number;
  /** Radio RC channels status flags. */
  flags: number;
  /** Total number of RC channels being received. This can be larger than 32, indicating that more channels are available but not given in this message. */
  count: number;
  /** RC channels.         Channel values are in centered 13 bit format. Range is -4096 to 4096, center is 0. Conversion to PWM is x * 5/32 + 1500.         Channels with indexes equal or above count should be set to 0, to benefit from MAVLink's trailing-zero trimming. */
  channels: number[];
}

export const RADIO_RC_CHANNELS_ID = 420;
export const RADIO_RC_CHANNELS_CRC_EXTRA = 189;
export const RADIO_RC_CHANNELS_MIN_LENGTH = 73;
export const RADIO_RC_CHANNELS_MAX_LENGTH = 73;

export function serializeRadioRcChannels(msg: RadioRcChannels): Uint8Array {
  const buffer = new Uint8Array(73);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.timeLastUpdateMs, true);
  view.setUint16(4, msg.flags, true);
  // Array: channels
  for (let i = 0; i < 32; i++) {
    view.setInt16(6 + i * 2, msg.channels[i] ?? 0, true);
  }
  buffer[70] = msg.targetSystem & 0xff;
  buffer[71] = msg.targetComponent & 0xff;
  buffer[72] = msg.count & 0xff;

  return buffer;
}

export function deserializeRadioRcChannels(payload: Uint8Array): RadioRcChannels {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeLastUpdateMs: view.getUint32(0, true),
    flags: view.getUint16(4, true),
    channels: Array.from({ length: 32 }, (_, i) => view.getInt16(6 + i * 2, true)),
    targetSystem: payload[70],
    targetComponent: payload[71],
    count: payload[72],
  };
}