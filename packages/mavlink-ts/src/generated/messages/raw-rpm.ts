/**
 * RPM sensor data message.
 * Message ID: 339
 * CRC Extra: 199
 */
export interface RawRpm {
  /** Index of this RPM sensor (0-indexed) */
  index: number;
  /** Indicated rate (rpm) */
  frequency: number;
}

export const RAW_RPM_ID = 339;
export const RAW_RPM_CRC_EXTRA = 199;
export const RAW_RPM_MIN_LENGTH = 5;
export const RAW_RPM_MAX_LENGTH = 5;

export function serializeRawRpm(msg: RawRpm): Uint8Array {
  const buffer = new Uint8Array(5);
  const view = new DataView(buffer.buffer);

  view.setFloat32(0, msg.frequency, true);
  buffer[4] = msg.index & 0xff;

  return buffer;
}

export function deserializeRawRpm(payload: Uint8Array): RawRpm {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    frequency: view.getFloat32(0, true),
    index: payload[4],
  };
}