/**
 * The RAW values of the RC channels received. The standard PPM modulation is as follows: 1000 microseconds: 0%, 2000 microseconds: 100%. A value of UINT16_MAX implies the channel is unused. Individual receivers/transmitters might violate this specification.
 * Message ID: 35
 * CRC Extra: 244
 */
export interface RcChannelsRaw {
  /** Timestamp (time since system boot). (ms) */
  timeBootMs: number;
  /** Servo output port (set of 8 outputs = 1 port). Flight stacks running on Pixhawk should use: 0 = MAIN, 1 = AUX. */
  port: number;
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
  /** Receive signal strength indicator in device-dependent units/scale. Values: [0-254], 255: invalid/unknown. */
  rssi: number;
}

export const RC_CHANNELS_RAW_ID = 35;
export const RC_CHANNELS_RAW_CRC_EXTRA = 244;
export const RC_CHANNELS_RAW_MIN_LENGTH = 22;
export const RC_CHANNELS_RAW_MAX_LENGTH = 22;

export function serializeRcChannelsRaw(msg: RcChannelsRaw): Uint8Array {
  const buffer = new Uint8Array(22);
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
  buffer[20] = msg.port & 0xff;
  buffer[21] = msg.rssi & 0xff;

  return buffer;
}

export function deserializeRcChannelsRaw(payload: Uint8Array): RcChannelsRaw {
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
    port: payload[20],
    rssi: payload[21],
  };
}