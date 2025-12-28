/**
 * Acknowledge success or failure of a flexifunction command
 * Message ID: 155
 * CRC Extra: 12
 */
export interface FlexifunctionDirectory {
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
  /** Settings data */
  directoryData: number[];
}

export const FLEXIFUNCTION_DIRECTORY_ID = 155;
export const FLEXIFUNCTION_DIRECTORY_CRC_EXTRA = 12;
export const FLEXIFUNCTION_DIRECTORY_MIN_LENGTH = 53;
export const FLEXIFUNCTION_DIRECTORY_MAX_LENGTH = 53;

export function serializeFlexifunctionDirectory(msg: FlexifunctionDirectory): Uint8Array {
  const buffer = new Uint8Array(53);
  const view = new DataView(buffer.buffer);

  buffer[0] = msg.targetSystem & 0xff;
  buffer[1] = msg.targetComponent & 0xff;
  buffer[2] = msg.directoryType & 0xff;
  buffer[3] = msg.startIndex & 0xff;
  buffer[4] = msg.count & 0xff;
  // Array: directory_data
  for (let i = 0; i < 48; i++) {
    view.setInt8(5 + i * 1, msg.directoryData[i] ?? 0);
  }

  return buffer;
}

export function deserializeFlexifunctionDirectory(payload: Uint8Array): FlexifunctionDirectory {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    targetSystem: payload[0],
    targetComponent: payload[1],
    directoryType: payload[2],
    startIndex: payload[3],
    count: payload[4],
    directoryData: Array.from({ length: 48 }, (_, i) => view.getInt8(5 + i * 1)),
  };
}