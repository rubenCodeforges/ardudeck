/**
 * Acknowledge success or failure of a flexifunction command
 * Message ID: 156
 * CRC Extra: 218
 */
export interface FlexifunctionDirectoryAck {
  /** System ID */
  targetSystem: number;
  /** Component ID */
  targetComponent: number;
  /** 0=inputs, 1=outputs */
  directoryType: number;
  /** index of first directory entry to write */
  startIndex: number;
  /** count of directory entries to write */
  count: number;
  /** result of acknowledge, 0=fail, 1=good */
  result: number;
}

export const FLEXIFUNCTION_DIRECTORY_ACK_ID = 156;
export const FLEXIFUNCTION_DIRECTORY_ACK_CRC_EXTRA = 218;
export const FLEXIFUNCTION_DIRECTORY_ACK_MIN_LENGTH = 7;
export const FLEXIFUNCTION_DIRECTORY_ACK_MAX_LENGTH = 7;

export function serializeFlexifunctionDirectoryAck(msg: FlexifunctionDirectoryAck): Uint8Array {
  const buffer = new Uint8Array(7);
  const view = new DataView(buffer.buffer);

  view.setUint16(0, msg.result, true);
  buffer[2] = msg.targetSystem & 0xff;
  buffer[3] = msg.targetComponent & 0xff;
  buffer[4] = msg.directoryType & 0xff;
  buffer[5] = msg.startIndex & 0xff;
  buffer[6] = msg.count & 0xff;

  return buffer;
}

export function deserializeFlexifunctionDirectoryAck(payload: Uint8Array): FlexifunctionDirectoryAck {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    result: view.getUint16(0, true),
    targetSystem: payload[2],
    targetComponent: payload[3],
    directoryType: payload[4],
    startIndex: payload[5],
    count: payload[6],
  };
}