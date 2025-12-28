/**
 * PID tuning information.
 * Message ID: 194
 * CRC Extra: 146
 */
export interface PidTuning {
  /** Axis. */
  axis: number;
  /** Desired rate. */
  desired: number;
  /** Achieved rate. */
  achieved: number;
  /** FF component. */
  ff: number;
  /** P component. */
  p: number;
  /** I component. */
  i: number;
  /** D component. */
  d: number;
  /** Slew rate. */
  srate: number;
  /** P/D oscillation modifier. */
  pdmod: number;
}

export const PID_TUNING_ID = 194;
export const PID_TUNING_CRC_EXTRA = 146;
export const PID_TUNING_MIN_LENGTH = 33;
export const PID_TUNING_MAX_LENGTH = 33;

export function serializePidTuning(msg: PidTuning): Uint8Array {
  const buffer = new Uint8Array(33);
  const view = new DataView(buffer.buffer);

  view.setFloat32(0, msg.desired, true);
  view.setFloat32(4, msg.achieved, true);
  view.setFloat32(8, msg.ff, true);
  view.setFloat32(12, msg.p, true);
  view.setFloat32(16, msg.i, true);
  view.setFloat32(20, msg.d, true);
  view.setFloat32(24, msg.srate, true);
  view.setFloat32(28, msg.pdmod, true);
  buffer[32] = msg.axis & 0xff;

  return buffer;
}

export function deserializePidTuning(payload: Uint8Array): PidTuning {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    desired: view.getFloat32(0, true),
    achieved: view.getFloat32(4, true),
    ff: view.getFloat32(8, true),
    p: view.getFloat32(12, true),
    i: view.getFloat32(16, true),
    d: view.getFloat32(20, true),
    srate: view.getFloat32(24, true),
    pdmod: view.getFloat32(28, true),
    axis: payload[32],
  };
}