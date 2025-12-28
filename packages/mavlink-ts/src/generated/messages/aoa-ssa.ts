/**
 * Angle of Attack and Side Slip Angle.
 * Message ID: 11020
 * CRC Extra: 205
 */
export interface AoaSsa {
  /** Timestamp (since boot or Unix epoch). (us) */
  timeUsec: bigint;
  /** Angle of Attack. (deg) */
  aoa: number;
  /** Side Slip Angle. (deg) */
  ssa: number;
}

export const AOA_SSA_ID = 11020;
export const AOA_SSA_CRC_EXTRA = 205;
export const AOA_SSA_MIN_LENGTH = 16;
export const AOA_SSA_MAX_LENGTH = 16;

export function serializeAoaSsa(msg: AoaSsa): Uint8Array {
  const buffer = new Uint8Array(16);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.timeUsec), true);
  view.setFloat32(8, msg.aoa, true);
  view.setFloat32(12, msg.ssa, true);

  return buffer;
}

export function deserializeAoaSsa(payload: Uint8Array): AoaSsa {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeUsec: view.getBigUint64(0, true),
    aoa: view.getFloat32(8, true),
    ssa: view.getFloat32(12, true),
  };
}