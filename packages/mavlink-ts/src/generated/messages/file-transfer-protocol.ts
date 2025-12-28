/**
 * File transfer protocol message: https://mavlink.io/en/services/ftp.html.
 * Message ID: 110
 * CRC Extra: 84
 */
export interface FileTransferProtocol {
  /** Network ID (0 for broadcast) */
  targetNetwork: number;
  /** System ID (0 for broadcast) */
  targetSystem: number;
  /** Component ID (0 for broadcast) */
  targetComponent: number;
  /** Variable length payload. The length is defined by the remaining message length when subtracting the header and other fields.  The entire content of this block is opaque unless you understand any the encoding message_type.  The particular encoding used can be extension specific and might not always be documented as part of the mavlink specification. */
  payload: number[];
}

export const FILE_TRANSFER_PROTOCOL_ID = 110;
export const FILE_TRANSFER_PROTOCOL_CRC_EXTRA = 84;
export const FILE_TRANSFER_PROTOCOL_MIN_LENGTH = 254;
export const FILE_TRANSFER_PROTOCOL_MAX_LENGTH = 254;

export function serializeFileTransferProtocol(msg: FileTransferProtocol): Uint8Array {
  const buffer = new Uint8Array(254);
  const view = new DataView(buffer.buffer);

  buffer[0] = msg.targetNetwork & 0xff;
  buffer[1] = msg.targetSystem & 0xff;
  buffer[2] = msg.targetComponent & 0xff;
  // Array: payload
  for (let i = 0; i < 251; i++) {
    buffer[3 + i * 1] = msg.payload[i] ?? 0 & 0xff;
  }

  return buffer;
}

export function deserializeFileTransferProtocol(payload: Uint8Array): FileTransferProtocol {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    targetNetwork: payload[0],
    targetSystem: payload[1],
    targetComponent: payload[2],
    payload: Array.from({ length: 251 }, (_, i) => payload[3 + i * 1]),
  };
}