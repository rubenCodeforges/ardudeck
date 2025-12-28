/**
 * Depreciated but used as a compiler flag.  Do not remove
 * Message ID: 150
 * CRC Extra: 181
 */
export interface FlexifunctionSet {
  /** System ID */
  targetSystem: number;
  /** Component ID */
  targetComponent: number;
}

export const FLEXIFUNCTION_SET_ID = 150;
export const FLEXIFUNCTION_SET_CRC_EXTRA = 181;
export const FLEXIFUNCTION_SET_MIN_LENGTH = 2;
export const FLEXIFUNCTION_SET_MAX_LENGTH = 2;

export function serializeFlexifunctionSet(msg: FlexifunctionSet): Uint8Array {
  const buffer = new Uint8Array(2);
  const view = new DataView(buffer.buffer);

  buffer[0] = msg.targetSystem & 0xff;
  buffer[1] = msg.targetComponent & 0xff;

  return buffer;
}

export function deserializeFlexifunctionSet(payload: Uint8Array): FlexifunctionSet {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    targetSystem: payload[0],
    targetComponent: payload[1],
  };
}