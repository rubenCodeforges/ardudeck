/**
 * Request reading of flexifunction data
 * Message ID: 151
 * CRC Extra: 26
 */
export interface FlexifunctionReadReq {
  /** System ID */
  targetSystem: number;
  /** Component ID */
  targetComponent: number;
  /** Type of flexifunction data requested */
  readReqType: number;
  /** index into data where needed */
  dataIndex: number;
}

export const FLEXIFUNCTION_READ_REQ_ID = 151;
export const FLEXIFUNCTION_READ_REQ_CRC_EXTRA = 26;
export const FLEXIFUNCTION_READ_REQ_MIN_LENGTH = 6;
export const FLEXIFUNCTION_READ_REQ_MAX_LENGTH = 6;

export function serializeFlexifunctionReadReq(msg: FlexifunctionReadReq): Uint8Array {
  const buffer = new Uint8Array(6);
  const view = new DataView(buffer.buffer);

  view.setInt16(0, msg.readReqType, true);
  view.setInt16(2, msg.dataIndex, true);
  buffer[4] = msg.targetSystem & 0xff;
  buffer[5] = msg.targetComponent & 0xff;

  return buffer;
}

export function deserializeFlexifunctionReadReq(payload: Uint8Array): FlexifunctionReadReq {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    readReqType: view.getInt16(0, true),
    dataIndex: view.getInt16(2, true),
    targetSystem: payload[4],
    targetComponent: payload[5],
  };
}