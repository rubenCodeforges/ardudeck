/**
 * RPM sensor output.
 * Message ID: 226
 * CRC Extra: 207
 */
export interface Rpm {
  /** RPM Sensor1. */
  rpm1: number;
  /** RPM Sensor2. */
  rpm2: number;
}

export const RPM_ID = 226;
export const RPM_CRC_EXTRA = 207;
export const RPM_MIN_LENGTH = 8;
export const RPM_MAX_LENGTH = 8;

export function serializeRpm(msg: Rpm): Uint8Array {
  const buffer = new Uint8Array(8);
  const view = new DataView(buffer.buffer);

  view.setFloat32(0, msg.rpm1, true);
  view.setFloat32(4, msg.rpm2, true);

  return buffer;
}

export function deserializeRpm(payload: Uint8Array): Rpm {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    rpm1: view.getFloat32(0, true),
    rpm2: view.getFloat32(4, true),
  };
}