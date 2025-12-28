/**
 * General information describing a particular UAVCAN node. Please refer to the definition of the UAVCAN service "uavcan.protocol.GetNodeInfo" for the background information. This message should be emitted by the system whenever a new node appears online, or an existing node reboots. Additionally, it can be emitted upon request from the other end of the MAVLink channel (see MAV_CMD_UAVCAN_GET_NODE_INFO). It is also not prohibited to emit this message unconditionally at a low frequency. The UAVCAN specification is available at http://uavcan.org.
 * Message ID: 311
 * CRC Extra: 95
 */
export interface UavcanNodeInfo {
  /** Timestamp (UNIX Epoch time or time since system boot). The receiving end can infer timestamp format (since 1.1.1970 or since system boot) by checking for the magnitude of the number. (us) */
  timeUsec: bigint;
  /** Time since the start-up of the node. (s) */
  uptimeSec: number;
  /** Node name string. For example, "sapog.px4.io". */
  name: string;
  /** Hardware major version number. */
  hwVersionMajor: number;
  /** Hardware minor version number. */
  hwVersionMinor: number;
  /** Hardware unique 128-bit ID. */
  hwUniqueId: number[];
  /** Software major version number. */
  swVersionMajor: number;
  /** Software minor version number. */
  swVersionMinor: number;
  /** Version control system (VCS) revision identifier (e.g. git short commit hash). 0 if unknown. */
  swVcsCommit: number;
}

export const UAVCAN_NODE_INFO_ID = 311;
export const UAVCAN_NODE_INFO_CRC_EXTRA = 95;
export const UAVCAN_NODE_INFO_MIN_LENGTH = 116;
export const UAVCAN_NODE_INFO_MAX_LENGTH = 116;

export function serializeUavcanNodeInfo(msg: UavcanNodeInfo): Uint8Array {
  const buffer = new Uint8Array(116);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.timeUsec), true);
  view.setUint32(8, msg.uptimeSec, true);
  view.setUint32(12, msg.swVcsCommit, true);
  // String: name
  const nameBytes = new TextEncoder().encode(msg.name || '');
  buffer.set(nameBytes.slice(0, 80), 16);
  buffer[96] = msg.hwVersionMajor & 0xff;
  buffer[97] = msg.hwVersionMinor & 0xff;
  // Array: hw_unique_id
  for (let i = 0; i < 16; i++) {
    buffer[98 + i * 1] = msg.hwUniqueId[i] ?? 0 & 0xff;
  }
  buffer[114] = msg.swVersionMajor & 0xff;
  buffer[115] = msg.swVersionMinor & 0xff;

  return buffer;
}

export function deserializeUavcanNodeInfo(payload: Uint8Array): UavcanNodeInfo {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeUsec: view.getBigUint64(0, true),
    uptimeSec: view.getUint32(8, true),
    swVcsCommit: view.getUint32(12, true),
    name: new TextDecoder().decode(payload.slice(16, 96)).replace(/\0.*$/, ''),
    hwVersionMajor: payload[96],
    hwVersionMinor: payload[97],
    hwUniqueId: Array.from({ length: 16 }, (_, i) => payload[98 + i * 1]),
    swVersionMajor: payload[114],
    swVersionMinor: payload[115],
  };
}