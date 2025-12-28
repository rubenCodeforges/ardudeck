/**
 * General status information of an UAVCAN node. Please refer to the definition of the UAVCAN message "uavcan.protocol.NodeStatus" for the background information. The UAVCAN specification is available at http://uavcan.org.
 * Message ID: 310
 * CRC Extra: 28
 */
export interface UavcanNodeStatus {
  /** Timestamp (UNIX Epoch time or time since system boot). The receiving end can infer timestamp format (since 1.1.1970 or since system boot) by checking for the magnitude of the number. (us) */
  timeUsec: bigint;
  /** Time since the start-up of the node. (s) */
  uptimeSec: number;
  /** Generalized node health status. */
  health: number;
  /** Generalized operating mode. */
  mode: number;
  /** Not used currently. */
  subMode: number;
  /** Vendor-specific status information. */
  vendorSpecificStatusCode: number;
}

export const UAVCAN_NODE_STATUS_ID = 310;
export const UAVCAN_NODE_STATUS_CRC_EXTRA = 28;
export const UAVCAN_NODE_STATUS_MIN_LENGTH = 17;
export const UAVCAN_NODE_STATUS_MAX_LENGTH = 17;

export function serializeUavcanNodeStatus(msg: UavcanNodeStatus): Uint8Array {
  const buffer = new Uint8Array(17);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.timeUsec), true);
  view.setUint32(8, msg.uptimeSec, true);
  view.setUint16(12, msg.vendorSpecificStatusCode, true);
  buffer[14] = msg.health & 0xff;
  buffer[15] = msg.mode & 0xff;
  buffer[16] = msg.subMode & 0xff;

  return buffer;
}

export function deserializeUavcanNodeStatus(payload: Uint8Array): UavcanNodeStatus {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeUsec: view.getBigUint64(0, true),
    uptimeSec: view.getUint32(8, true),
    vendorSpecificStatusCode: view.getUint16(12, true),
    health: payload[14],
    mode: payload[15],
    subMode: payload[16],
  };
}