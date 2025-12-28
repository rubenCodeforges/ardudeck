/**
 * Flexifunction type and parameters for component at function index from buffer
 * Message ID: 152
 * CRC Extra: 101
 */
export interface FlexifunctionBufferFunction {
  /** System ID */
  targetSystem: number;
  /** Component ID */
  targetComponent: number;
  /** Function index */
  funcIndex: number;
  /** Total count of functions */
  funcCount: number;
  /** Address in the flexifunction data, Set to 0xFFFF to use address in target memory */
  dataAddress: number;
  /** Size of the */
  dataSize: number;
  /** Settings data */
  data: number[];
}

export const FLEXIFUNCTION_BUFFER_FUNCTION_ID = 152;
export const FLEXIFUNCTION_BUFFER_FUNCTION_CRC_EXTRA = 101;
export const FLEXIFUNCTION_BUFFER_FUNCTION_MIN_LENGTH = 58;
export const FLEXIFUNCTION_BUFFER_FUNCTION_MAX_LENGTH = 58;

export function serializeFlexifunctionBufferFunction(msg: FlexifunctionBufferFunction): Uint8Array {
  const buffer = new Uint8Array(58);
  const view = new DataView(buffer.buffer);

  view.setUint16(0, msg.funcIndex, true);
  view.setUint16(2, msg.funcCount, true);
  view.setUint16(4, msg.dataAddress, true);
  view.setUint16(6, msg.dataSize, true);
  buffer[8] = msg.targetSystem & 0xff;
  buffer[9] = msg.targetComponent & 0xff;
  // Array: data
  for (let i = 0; i < 48; i++) {
    view.setInt8(10 + i * 1, msg.data[i] ?? 0);
  }

  return buffer;
}

export function deserializeFlexifunctionBufferFunction(payload: Uint8Array): FlexifunctionBufferFunction {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    funcIndex: view.getUint16(0, true),
    funcCount: view.getUint16(2, true),
    dataAddress: view.getUint16(4, true),
    dataSize: view.getUint16(6, true),
    targetSystem: payload[8],
    targetComponent: payload[9],
    data: Array.from({ length: 48 }, (_, i) => view.getInt8(10 + i * 1)),
  };
}