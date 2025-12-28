/**
 * Send a secure command. Data should be signed with a private key corresponding with a public key known to the recipient. Signature should be over the concatenation of the sequence number (little-endian format), the operation (little-endian format) the data and the session key. For SECURE_COMMAND_GET_SESSION_KEY the session key should be zero length. The data array consists of the data followed by the signature. The sum of the data_length and the sig_length cannot be more than 220. The format of the data is command specific.
 * Message ID: 11004
 * CRC Extra: 11
 */
export interface SecureCommand {
  /** System ID. */
  targetSystem: number;
  /** Component ID. */
  targetComponent: number;
  /** Sequence ID for tagging reply. */
  sequence: number;
  /** Operation being requested. */
  operation: number;
  /** Data length. */
  dataLength: number;
  /** Signature length. */
  sigLength: number;
  /** Signed data. */
  data: number[];
}

export const SECURE_COMMAND_ID = 11004;
export const SECURE_COMMAND_CRC_EXTRA = 11;
export const SECURE_COMMAND_MIN_LENGTH = 232;
export const SECURE_COMMAND_MAX_LENGTH = 232;

export function serializeSecureCommand(msg: SecureCommand): Uint8Array {
  const buffer = new Uint8Array(232);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.sequence, true);
  view.setUint32(4, msg.operation, true);
  buffer[8] = msg.targetSystem & 0xff;
  buffer[9] = msg.targetComponent & 0xff;
  buffer[10] = msg.dataLength & 0xff;
  buffer[11] = msg.sigLength & 0xff;
  // Array: data
  for (let i = 0; i < 220; i++) {
    buffer[12 + i * 1] = msg.data[i] ?? 0 & 0xff;
  }

  return buffer;
}

export function deserializeSecureCommand(payload: Uint8Array): SecureCommand {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    sequence: view.getUint32(0, true),
    operation: view.getUint32(4, true),
    targetSystem: payload[8],
    targetComponent: payload[9],
    dataLength: payload[10],
    sigLength: payload[11],
    data: Array.from({ length: 220 }, (_, i) => payload[12 + i * 1]),
  };
}