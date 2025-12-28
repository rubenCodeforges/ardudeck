/**
 * Flexifunction type and parameters for component at function index from buffer
 * Message ID: 153
 * CRC Extra: 109
 */
export interface FlexifunctionBufferFunctionAck {
  /** System ID */
  targetSystem: number;
  /** Component ID */
  targetComponent: number;
  /** Function index */
  funcIndex: number;
  /** result of acknowledge, 0=fail, 1=good */
  result: number;
}

export const FLEXIFUNCTION_BUFFER_FUNCTION_ACK_ID = 153;
export const FLEXIFUNCTION_BUFFER_FUNCTION_ACK_CRC_EXTRA = 109;
export const FLEXIFUNCTION_BUFFER_FUNCTION_ACK_MIN_LENGTH = 6;
export const FLEXIFUNCTION_BUFFER_FUNCTION_ACK_MAX_LENGTH = 6;

export function serializeFlexifunctionBufferFunctionAck(msg: FlexifunctionBufferFunctionAck): Uint8Array {
  const buffer = new Uint8Array(6);
  const view = new DataView(buffer.buffer);

  view.setUint16(0, msg.funcIndex, true);
  view.setUint16(2, msg.result, true);
  buffer[4] = msg.targetSystem & 0xff;
  buffer[5] = msg.targetComponent & 0xff;

  return buffer;
}

export function deserializeFlexifunctionBufferFunctionAck(payload: Uint8Array): FlexifunctionBufferFunctionAck {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    funcIndex: view.getUint16(0, true),
    result: view.getUint16(2, true),
    targetSystem: payload[4],
    targetComponent: payload[5],
  };
}