/**
 * Monitoring of sensorpod status
 * Message ID: 8012
 * CRC Extra: 54
 */
export interface SensorpodStatus {
  /** Timestamp in linuxtime (since 1.1.1970) (ms) */
  timestamp: bigint;
  /** Rate of ROS topic 1 */
  visensorRate_1: number;
  /** Rate of ROS topic 2 */
  visensorRate_2: number;
  /** Rate of ROS topic 3 */
  visensorRate_3: number;
  /** Rate of ROS topic 4 */
  visensorRate_4: number;
  /** Number of recording nodes */
  recordingNodesCount: number;
  /** Temperature of sensorpod CPU in (degC) */
  cpuTemp: number;
  /** Free space available in recordings directory in [Gb] * 1e2 */
  freeSpace: number;
}

export const SENSORPOD_STATUS_ID = 8012;
export const SENSORPOD_STATUS_CRC_EXTRA = 54;
export const SENSORPOD_STATUS_MIN_LENGTH = 16;
export const SENSORPOD_STATUS_MAX_LENGTH = 16;

export function serializeSensorpodStatus(msg: SensorpodStatus): Uint8Array {
  const buffer = new Uint8Array(16);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.timestamp), true);
  view.setUint16(8, msg.freeSpace, true);
  buffer[10] = msg.visensorRate_1 & 0xff;
  buffer[11] = msg.visensorRate_2 & 0xff;
  buffer[12] = msg.visensorRate_3 & 0xff;
  buffer[13] = msg.visensorRate_4 & 0xff;
  buffer[14] = msg.recordingNodesCount & 0xff;
  buffer[15] = msg.cpuTemp & 0xff;

  return buffer;
}

export function deserializeSensorpodStatus(payload: Uint8Array): SensorpodStatus {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timestamp: view.getBigUint64(0, true),
    freeSpace: view.getUint16(8, true),
    visensorRate_1: payload[10],
    visensorRate_2: payload[11],
    visensorRate_3: payload[12],
    visensorRate_4: payload[13],
    recordingNodesCount: payload[14],
    cpuTemp: payload[15],
  };
}