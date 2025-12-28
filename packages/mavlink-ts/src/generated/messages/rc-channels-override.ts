/**
 * The RAW values of the RC channels sent to the MAV to override info received from the RC radio. The standard PPM modulation is as follows: 1000 microseconds: 0%, 2000 microseconds: 100%. Individual receivers/transmitters might violate this specification.  Note carefully the semantic differences between the first 8 channels and the subsequent channels
 * Message ID: 70
 * CRC Extra: 140
 */
export interface RcChannelsOverride {
  /** System ID */
  targetSystem: number;
  /** Component ID */
  targetComponent: number;
  /** RC channel 1 value. A value of UINT16_MAX means to ignore this field. A value of 0 means to release this channel back to the RC radio. (us) */
  chan1Raw: number;
  /** RC channel 2 value. A value of UINT16_MAX means to ignore this field. A value of 0 means to release this channel back to the RC radio. (us) */
  chan2Raw: number;
  /** RC channel 3 value. A value of UINT16_MAX means to ignore this field. A value of 0 means to release this channel back to the RC radio. (us) */
  chan3Raw: number;
  /** RC channel 4 value. A value of UINT16_MAX means to ignore this field. A value of 0 means to release this channel back to the RC radio. (us) */
  chan4Raw: number;
  /** RC channel 5 value. A value of UINT16_MAX means to ignore this field. A value of 0 means to release this channel back to the RC radio. (us) */
  chan5Raw: number;
  /** RC channel 6 value. A value of UINT16_MAX means to ignore this field. A value of 0 means to release this channel back to the RC radio. (us) */
  chan6Raw: number;
  /** RC channel 7 value. A value of UINT16_MAX means to ignore this field. A value of 0 means to release this channel back to the RC radio. (us) */
  chan7Raw: number;
  /** RC channel 8 value. A value of UINT16_MAX means to ignore this field. A value of 0 means to release this channel back to the RC radio. (us) */
  chan8Raw: number;
  /** RC channel 9 value. A value of 0 or UINT16_MAX means to ignore this field. A value of UINT16_MAX-1 means to release this channel back to the RC radio. (us) */
  chan9Raw: number;
  /** RC channel 10 value. A value of 0 or UINT16_MAX means to ignore this field. A value of UINT16_MAX-1 means to release this channel back to the RC radio. (us) */
  chan10Raw: number;
  /** RC channel 11 value. A value of 0 or UINT16_MAX means to ignore this field. A value of UINT16_MAX-1 means to release this channel back to the RC radio. (us) */
  chan11Raw: number;
  /** RC channel 12 value. A value of 0 or UINT16_MAX means to ignore this field. A value of UINT16_MAX-1 means to release this channel back to the RC radio. (us) */
  chan12Raw: number;
  /** RC channel 13 value. A value of 0 or UINT16_MAX means to ignore this field. A value of UINT16_MAX-1 means to release this channel back to the RC radio. (us) */
  chan13Raw: number;
  /** RC channel 14 value. A value of 0 or UINT16_MAX means to ignore this field. A value of UINT16_MAX-1 means to release this channel back to the RC radio. (us) */
  chan14Raw: number;
  /** RC channel 15 value. A value of 0 or UINT16_MAX means to ignore this field. A value of UINT16_MAX-1 means to release this channel back to the RC radio. (us) */
  chan15Raw: number;
  /** RC channel 16 value. A value of 0 or UINT16_MAX means to ignore this field. A value of UINT16_MAX-1 means to release this channel back to the RC radio. (us) */
  chan16Raw: number;
  /** RC channel 17 value. A value of 0 or UINT16_MAX means to ignore this field. A value of UINT16_MAX-1 means to release this channel back to the RC radio. (us) */
  chan17Raw: number;
  /** RC channel 18 value. A value of 0 or UINT16_MAX means to ignore this field. A value of UINT16_MAX-1 means to release this channel back to the RC radio. (us) */
  chan18Raw: number;
}

export const RC_CHANNELS_OVERRIDE_ID = 70;
export const RC_CHANNELS_OVERRIDE_CRC_EXTRA = 140;
export const RC_CHANNELS_OVERRIDE_MIN_LENGTH = 38;
export const RC_CHANNELS_OVERRIDE_MAX_LENGTH = 38;

export function serializeRcChannelsOverride(msg: RcChannelsOverride): Uint8Array {
  const buffer = new Uint8Array(38);
  const view = new DataView(buffer.buffer);

  view.setUint16(0, msg.chan1Raw, true);
  view.setUint16(2, msg.chan2Raw, true);
  view.setUint16(4, msg.chan3Raw, true);
  view.setUint16(6, msg.chan4Raw, true);
  view.setUint16(8, msg.chan5Raw, true);
  view.setUint16(10, msg.chan6Raw, true);
  view.setUint16(12, msg.chan7Raw, true);
  view.setUint16(14, msg.chan8Raw, true);
  view.setUint16(16, msg.chan9Raw, true);
  view.setUint16(18, msg.chan10Raw, true);
  view.setUint16(20, msg.chan11Raw, true);
  view.setUint16(22, msg.chan12Raw, true);
  view.setUint16(24, msg.chan13Raw, true);
  view.setUint16(26, msg.chan14Raw, true);
  view.setUint16(28, msg.chan15Raw, true);
  view.setUint16(30, msg.chan16Raw, true);
  view.setUint16(32, msg.chan17Raw, true);
  view.setUint16(34, msg.chan18Raw, true);
  buffer[36] = msg.targetSystem & 0xff;
  buffer[37] = msg.targetComponent & 0xff;

  return buffer;
}

export function deserializeRcChannelsOverride(payload: Uint8Array): RcChannelsOverride {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    chan1Raw: view.getUint16(0, true),
    chan2Raw: view.getUint16(2, true),
    chan3Raw: view.getUint16(4, true),
    chan4Raw: view.getUint16(6, true),
    chan5Raw: view.getUint16(8, true),
    chan6Raw: view.getUint16(10, true),
    chan7Raw: view.getUint16(12, true),
    chan8Raw: view.getUint16(14, true),
    chan9Raw: view.getUint16(16, true),
    chan10Raw: view.getUint16(18, true),
    chan11Raw: view.getUint16(20, true),
    chan12Raw: view.getUint16(22, true),
    chan13Raw: view.getUint16(24, true),
    chan14Raw: view.getUint16(26, true),
    chan15Raw: view.getUint16(28, true),
    chan16Raw: view.getUint16(30, true),
    chan17Raw: view.getUint16(32, true),
    chan18Raw: view.getUint16(34, true),
    targetSystem: payload[36],
    targetComponent: payload[37],
  };
}