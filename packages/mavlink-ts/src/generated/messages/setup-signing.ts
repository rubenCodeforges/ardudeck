/**
 * Setup a MAVLink2 signing key. If called with secret_key of all zero and zero initial_timestamp will disable signing
 * Message ID: 256
 * CRC Extra: 71
 */
export interface SetupSigning {
  /** system id of the target */
  targetSystem: number;
  /** component ID of the target */
  targetComponent: number;
  /** signing key */
  secretKey: number[];
  /** initial timestamp */
  initialTimestamp: bigint;
}

export const SETUP_SIGNING_ID = 256;
export const SETUP_SIGNING_CRC_EXTRA = 71;
export const SETUP_SIGNING_MIN_LENGTH = 42;
export const SETUP_SIGNING_MAX_LENGTH = 42;

export function serializeSetupSigning(msg: SetupSigning): Uint8Array {
  const buffer = new Uint8Array(42);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.initialTimestamp), true);
  buffer[8] = msg.targetSystem & 0xff;
  buffer[9] = msg.targetComponent & 0xff;
  // Array: secret_key
  for (let i = 0; i < 32; i++) {
    buffer[10 + i * 1] = msg.secretKey[i] ?? 0 & 0xff;
  }

  return buffer;
}

export function deserializeSetupSigning(payload: Uint8Array): SetupSigning {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    initialTimestamp: view.getBigUint64(0, true),
    targetSystem: payload[8],
    targetComponent: payload[9],
    secretKey: Array.from({ length: 32 }, (_, i) => payload[10 + i * 1]),
  };
}