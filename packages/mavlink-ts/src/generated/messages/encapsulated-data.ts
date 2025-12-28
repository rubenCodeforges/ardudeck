/**
 * Data packet for images sent using the Image Transmission Protocol: https://mavlink.io/en/services/image_transmission.html.
 * Message ID: 131
 * CRC Extra: 223
 */
export interface EncapsulatedData {
  /** sequence number (starting with 0 on every transmission) */
  seqnr: number;
  /** image data bytes */
  data: number[];
}

export const ENCAPSULATED_DATA_ID = 131;
export const ENCAPSULATED_DATA_CRC_EXTRA = 223;
export const ENCAPSULATED_DATA_MIN_LENGTH = 255;
export const ENCAPSULATED_DATA_MAX_LENGTH = 255;

export function serializeEncapsulatedData(msg: EncapsulatedData): Uint8Array {
  const buffer = new Uint8Array(255);
  const view = new DataView(buffer.buffer);

  view.setUint16(0, msg.seqnr, true);
  // Array: data
  for (let i = 0; i < 253; i++) {
    buffer[2 + i * 1] = msg.data[i] ?? 0 & 0xff;
  }

  return buffer;
}

export function deserializeEncapsulatedData(payload: Uint8Array): EncapsulatedData {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    seqnr: view.getUint16(0, true),
    data: Array.from({ length: 253 }, (_, i) => payload[2 + i * 1]),
  };
}