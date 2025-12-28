/**
 * The PPM values of the RC channels received. The standard PPM modulation is as follows: 1000 microseconds: 0%, 2000 microseconds: 100%.  A value of UINT16_MAX implies the channel is unused. Individual receivers/transmitters might violate this specification.
 * Message ID: 65
 * CRC Extra: 118
 */
export interface RcChannels {
  /** Timestamp (time since system boot). (ms) */
  timeBootMs: number;
  /** Total number of RC channels being received. This can be larger than 18, indicating that more channels are available but not given in this message. This value should be 0 when no RC channels are available. */
  chancount: number;
  /** RC channel 1 value. (us) */
  chan1Raw: number;
  /** RC channel 2 value. (us) */
  chan2Raw: number;
  /** RC channel 3 value. (us) */
  chan3Raw: number;
  /** RC channel 4 value. (us) */
  chan4Raw: number;
  /** RC channel 5 value. (us) */
  chan5Raw: number;
  /** RC channel 6 value. (us) */
  chan6Raw: number;
  /** RC channel 7 value. (us) */
  chan7Raw: number;
  /** RC channel 8 value. (us) */
  chan8Raw: number;
  /** RC channel 9 value. (us) */
  chan9Raw: number;
  /** RC channel 10 value. (us) */
  chan10Raw: number;
  /** RC channel 11 value. (us) */
  chan11Raw: number;
  /** RC channel 12 value. (us) */
  chan12Raw: number;
  /** RC channel 13 value. (us) */
  chan13Raw: number;
  /** RC channel 14 value. (us) */
  chan14Raw: number;
  /** RC channel 15 value. (us) */
  chan15Raw: number;
  /** RC channel 16 value. (us) */
  chan16Raw: number;
  /** RC channel 17 value. (us) */
  chan17Raw: number;
  /** RC channel 18 value. (us) */
  chan18Raw: number;
  /** Receive signal strength indicator in device-dependent units/scale. Values: [0-254], 255: invalid/unknown. */
  rssi: number;
}

export const RC_CHANNELS_ID = 65;
export const RC_CHANNELS_CRC_EXTRA = 118;
export const RC_CHANNELS_MIN_LENGTH = 42;
export const RC_CHANNELS_MAX_LENGTH = 42;

export function serializeRcChannels(msg: RcChannels): Uint8Array {
  const buffer = new Uint8Array(42);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.timeBootMs, true);
  view.setUint16(4, msg.chan1Raw, true);
  view.setUint16(6, msg.chan2Raw, true);
  view.setUint16(8, msg.chan3Raw, true);
  view.setUint16(10, msg.chan4Raw, true);
  view.setUint16(12, msg.chan5Raw, true);
  view.setUint16(14, msg.chan6Raw, true);
  view.setUint16(16, msg.chan7Raw, true);
  view.setUint16(18, msg.chan8Raw, true);
  view.setUint16(20, msg.chan9Raw, true);
  view.setUint16(22, msg.chan10Raw, true);
  view.setUint16(24, msg.chan11Raw, true);
  view.setUint16(26, msg.chan12Raw, true);
  view.setUint16(28, msg.chan13Raw, true);
  view.setUint16(30, msg.chan14Raw, true);
  view.setUint16(32, msg.chan15Raw, true);
  view.setUint16(34, msg.chan16Raw, true);
  view.setUint16(36, msg.chan17Raw, true);
  view.setUint16(38, msg.chan18Raw, true);
  buffer[40] = msg.chancount & 0xff;
  buffer[41] = msg.rssi & 0xff;

  return buffer;
}

export function deserializeRcChannels(payload: Uint8Array): RcChannels {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeBootMs: view.getUint32(0, true),
    chan1Raw: view.getUint16(4, true),
    chan2Raw: view.getUint16(6, true),
    chan3Raw: view.getUint16(8, true),
    chan4Raw: view.getUint16(10, true),
    chan5Raw: view.getUint16(12, true),
    chan6Raw: view.getUint16(14, true),
    chan7Raw: view.getUint16(16, true),
    chan8Raw: view.getUint16(18, true),
    chan9Raw: view.getUint16(20, true),
    chan10Raw: view.getUint16(22, true),
    chan11Raw: view.getUint16(24, true),
    chan12Raw: view.getUint16(26, true),
    chan13Raw: view.getUint16(28, true),
    chan14Raw: view.getUint16(30, true),
    chan15Raw: view.getUint16(32, true),
    chan16Raw: view.getUint16(34, true),
    chan17Raw: view.getUint16(36, true),
    chan18Raw: view.getUint16(38, true),
    chancount: payload[40],
    rssi: payload[41],
  };
}