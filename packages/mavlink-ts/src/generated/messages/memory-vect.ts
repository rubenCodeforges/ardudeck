/**
 * Send raw controller memory. The use of this message is discouraged for normal packets, but a quite efficient way for testing new messages and getting experimental debug output.
 * Message ID: 249
 * CRC Extra: 204
 */
export interface MemoryVect {
  /** Starting address of the debug variables */
  address: number;
  /** Version code of the type variable. 0=unknown, type ignored and assumed int16_t. 1=as below */
  ver: number;
  /** Type code of the memory variables. for ver = 1: 0=16 x int16_t, 1=16 x uint16_t, 2=16 x Q15, 3=16 x 1Q14 */
  type: number;
  /** Memory contents at specified address */
  value: number[];
}

export const MEMORY_VECT_ID = 249;
export const MEMORY_VECT_CRC_EXTRA = 204;
export const MEMORY_VECT_MIN_LENGTH = 36;
export const MEMORY_VECT_MAX_LENGTH = 36;

export function serializeMemoryVect(msg: MemoryVect): Uint8Array {
  const buffer = new Uint8Array(36);
  const view = new DataView(buffer.buffer);

  view.setUint16(0, msg.address, true);
  buffer[2] = msg.ver & 0xff;
  buffer[3] = msg.type & 0xff;
  // Array: value
  for (let i = 0; i < 32; i++) {
    view.setInt8(4 + i * 1, msg.value[i] ?? 0);
  }

  return buffer;
}

export function deserializeMemoryVect(payload: Uint8Array): MemoryVect {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    address: view.getUint16(0, true),
    ver: payload[2],
    type: payload[3],
    value: Array.from({ length: 32 }, (_, i) => view.getInt8(4 + i * 1)),
  };
}