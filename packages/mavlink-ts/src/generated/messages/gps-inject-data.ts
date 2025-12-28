/**
 * Data for injecting into the onboard GPS (used for DGPS)
 * Message ID: 123
 * CRC Extra: 250
 */
export interface GpsInjectData {
  /** System ID */
  targetSystem: number;
  /** Component ID */
  targetComponent: number;
  /** Data length (bytes) */
  len: number;
  /** Raw data (110 is enough for 12 satellites of RTCMv2) */
  data: number[];
}

export const GPS_INJECT_DATA_ID = 123;
export const GPS_INJECT_DATA_CRC_EXTRA = 250;
export const GPS_INJECT_DATA_MIN_LENGTH = 113;
export const GPS_INJECT_DATA_MAX_LENGTH = 113;

export function serializeGpsInjectData(msg: GpsInjectData): Uint8Array {
  const buffer = new Uint8Array(113);
  const view = new DataView(buffer.buffer);

  buffer[0] = msg.targetSystem & 0xff;
  buffer[1] = msg.targetComponent & 0xff;
  buffer[2] = msg.len & 0xff;
  // Array: data
  for (let i = 0; i < 110; i++) {
    buffer[3 + i * 1] = msg.data[i] ?? 0 & 0xff;
  }

  return buffer;
}

export function deserializeGpsInjectData(payload: Uint8Array): GpsInjectData {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    targetSystem: payload[0],
    targetComponent: payload[1],
    len: payload[2],
    data: Array.from({ length: 110 }, (_, i) => payload[3 + i * 1]),
  };
}