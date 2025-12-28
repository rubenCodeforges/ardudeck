/**
 * The scaled values of the RC channels received: (-100%) -10000, (0%) 0, (100%) 10000. Channels that are inactive should be set to UINT16_MAX.
 * Message ID: 34
 * CRC Extra: 237
 */
export interface RcChannelsScaled {
  /** Timestamp (time since system boot). (ms) */
  timeBootMs: number;
  /** Servo output port (set of 8 outputs = 1 port). Flight stacks running on Pixhawk should use: 0 = MAIN, 1 = AUX. */
  port: number;
  /** RC channel 1 value scaled. */
  chan1Scaled: number;
  /** RC channel 2 value scaled. */
  chan2Scaled: number;
  /** RC channel 3 value scaled. */
  chan3Scaled: number;
  /** RC channel 4 value scaled. */
  chan4Scaled: number;
  /** RC channel 5 value scaled. */
  chan5Scaled: number;
  /** RC channel 6 value scaled. */
  chan6Scaled: number;
  /** RC channel 7 value scaled. */
  chan7Scaled: number;
  /** RC channel 8 value scaled. */
  chan8Scaled: number;
  /** Receive signal strength indicator in device-dependent units/scale. Values: [0-254], 255: invalid/unknown. */
  rssi: number;
}

export const RC_CHANNELS_SCALED_ID = 34;
export const RC_CHANNELS_SCALED_CRC_EXTRA = 237;
export const RC_CHANNELS_SCALED_MIN_LENGTH = 22;
export const RC_CHANNELS_SCALED_MAX_LENGTH = 22;

export function serializeRcChannelsScaled(msg: RcChannelsScaled): Uint8Array {
  const buffer = new Uint8Array(22);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.timeBootMs, true);
  view.setInt16(4, msg.chan1Scaled, true);
  view.setInt16(6, msg.chan2Scaled, true);
  view.setInt16(8, msg.chan3Scaled, true);
  view.setInt16(10, msg.chan4Scaled, true);
  view.setInt16(12, msg.chan5Scaled, true);
  view.setInt16(14, msg.chan6Scaled, true);
  view.setInt16(16, msg.chan7Scaled, true);
  view.setInt16(18, msg.chan8Scaled, true);
  buffer[20] = msg.port & 0xff;
  buffer[21] = msg.rssi & 0xff;

  return buffer;
}

export function deserializeRcChannelsScaled(payload: Uint8Array): RcChannelsScaled {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeBootMs: view.getUint32(0, true),
    chan1Scaled: view.getInt16(4, true),
    chan2Scaled: view.getInt16(6, true),
    chan3Scaled: view.getInt16(8, true),
    chan4Scaled: view.getInt16(10, true),
    chan5Scaled: view.getInt16(12, true),
    chan6Scaled: view.getInt16(14, true),
    chan7Scaled: view.getInt16(16, true),
    chan8Scaled: view.getInt16(18, true),
    port: payload[20],
    rssi: payload[21],
  };
}