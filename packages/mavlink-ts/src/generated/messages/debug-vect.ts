/**
 * To debug something using a named 3D vector.
 * Message ID: 250
 * CRC Extra: 49
 */
export interface DebugVect {
  /** Name */
  name: string;
  /** Timestamp (UNIX Epoch time or time since system boot). The receiving end can infer timestamp format (since 1.1.1970 or since system boot) by checking for the magnitude of the number. (us) */
  timeUsec: bigint;
  /** x */
  x: number;
  /** y */
  y: number;
  /** z */
  z: number;
}

export const DEBUG_VECT_ID = 250;
export const DEBUG_VECT_CRC_EXTRA = 49;
export const DEBUG_VECT_MIN_LENGTH = 30;
export const DEBUG_VECT_MAX_LENGTH = 30;

export function serializeDebugVect(msg: DebugVect): Uint8Array {
  const buffer = new Uint8Array(30);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.timeUsec), true);
  view.setFloat32(8, msg.x, true);
  view.setFloat32(12, msg.y, true);
  view.setFloat32(16, msg.z, true);
  // String: name
  const nameBytes = new TextEncoder().encode(msg.name || '');
  buffer.set(nameBytes.slice(0, 10), 20);

  return buffer;
}

export function deserializeDebugVect(payload: Uint8Array): DebugVect {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeUsec: view.getBigUint64(0, true),
    x: view.getFloat32(8, true),
    y: view.getFloat32(12, true),
    z: view.getFloat32(16, true),
    name: new TextDecoder().decode(payload.slice(20, 30)).replace(/\0.*$/, ''),
  };
}