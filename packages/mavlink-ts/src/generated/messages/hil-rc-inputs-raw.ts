/**
 * Sent from simulation to autopilot. The RAW values of the RC channels received. The standard PPM modulation is as follows: 1000 microseconds: 0%, 2000 microseconds: 100%. Individual receivers/transmitters might violate this specification.
 * Message ID: 92
 * CRC Extra: 54
 */
export interface HilRcInputsRaw {
  /** Timestamp (UNIX Epoch time or time since system boot). The receiving end can infer timestamp format (since 1.1.1970 or since system boot) by checking for the magnitude of the number. (us) */
  timeUsec: bigint;
  /** RC channel 1 value (us) */
  chan1Raw: number;
  /** RC channel 2 value (us) */
  chan2Raw: number;
  /** RC channel 3 value (us) */
  chan3Raw: number;
  /** RC channel 4 value (us) */
  chan4Raw: number;
  /** RC channel 5 value (us) */
  chan5Raw: number;
  /** RC channel 6 value (us) */
  chan6Raw: number;
  /** RC channel 7 value (us) */
  chan7Raw: number;
  /** RC channel 8 value (us) */
  chan8Raw: number;
  /** RC channel 9 value (us) */
  chan9Raw: number;
  /** RC channel 10 value (us) */
  chan10Raw: number;
  /** RC channel 11 value (us) */
  chan11Raw: number;
  /** RC channel 12 value (us) */
  chan12Raw: number;
  /** Receive signal strength indicator in device-dependent units/scale. Values: [0-254], UINT8_MAX: invalid/unknown. */
  rssi: number;
}

export const HIL_RC_INPUTS_RAW_ID = 92;
export const HIL_RC_INPUTS_RAW_CRC_EXTRA = 54;
export const HIL_RC_INPUTS_RAW_MIN_LENGTH = 33;
export const HIL_RC_INPUTS_RAW_MAX_LENGTH = 33;

export function serializeHilRcInputsRaw(msg: HilRcInputsRaw): Uint8Array {
  const buffer = new Uint8Array(33);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.timeUsec), true);
  view.setUint16(8, msg.chan1Raw, true);
  view.setUint16(10, msg.chan2Raw, true);
  view.setUint16(12, msg.chan3Raw, true);
  view.setUint16(14, msg.chan4Raw, true);
  view.setUint16(16, msg.chan5Raw, true);
  view.setUint16(18, msg.chan6Raw, true);
  view.setUint16(20, msg.chan7Raw, true);
  view.setUint16(22, msg.chan8Raw, true);
  view.setUint16(24, msg.chan9Raw, true);
  view.setUint16(26, msg.chan10Raw, true);
  view.setUint16(28, msg.chan11Raw, true);
  view.setUint16(30, msg.chan12Raw, true);
  buffer[32] = msg.rssi & 0xff;

  return buffer;
}

export function deserializeHilRcInputsRaw(payload: Uint8Array): HilRcInputsRaw {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeUsec: view.getBigUint64(0, true),
    chan1Raw: view.getUint16(8, true),
    chan2Raw: view.getUint16(10, true),
    chan3Raw: view.getUint16(12, true),
    chan4Raw: view.getUint16(14, true),
    chan5Raw: view.getUint16(16, true),
    chan6Raw: view.getUint16(18, true),
    chan7Raw: view.getUint16(20, true),
    chan8Raw: view.getUint16(22, true),
    chan9Raw: view.getUint16(24, true),
    chan10Raw: view.getUint16(26, true),
    chan11Raw: view.getUint16(28, true),
    chan12Raw: view.getUint16(30, true),
    rssi: payload[32],
  };
}