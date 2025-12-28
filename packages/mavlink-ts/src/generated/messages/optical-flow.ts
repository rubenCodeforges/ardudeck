/**
 * Optical flow from a flow sensor (e.g. optical mouse sensor)
 * Message ID: 100
 * CRC Extra: 145
 */
export interface OpticalFlow {
  /** Timestamp (UNIX Epoch time or time since system boot). The receiving end can infer timestamp format (since 1.1.1970 or since system boot) by checking for the magnitude of the number. (us) */
  timeUsec: bigint;
  /** Sensor ID */
  sensorId: number;
  /** Flow rate around X-axis (deprecated; use flow_rate_x) (rad/s) */
  flowX: number;
  /** Flow rate around Y-axis (deprecated; use flow_rate_y) (rad/s) */
  flowY: number;
  /** Flow in x-sensor direction, angular-speed compensated (m/s) */
  flowCompMX: number;
  /** Flow in y-sensor direction, angular-speed compensated (m/s) */
  flowCompMY: number;
  /** Optical flow quality / confidence. 0: bad, 255: maximum quality */
  quality: number;
  /** Ground distance. Positive value: distance known. Negative value: Unknown distance (m) */
  groundDistance: number;
  /** Flow rate about X axis (rad/s) */
  flowRateX: number;
  /** Flow rate about Y axis (rad/s) */
  flowRateY: number;
}

export const OPTICAL_FLOW_ID = 100;
export const OPTICAL_FLOW_CRC_EXTRA = 145;
export const OPTICAL_FLOW_MIN_LENGTH = 34;
export const OPTICAL_FLOW_MAX_LENGTH = 34;

export function serializeOpticalFlow(msg: OpticalFlow): Uint8Array {
  const buffer = new Uint8Array(34);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.timeUsec), true);
  view.setFloat32(8, msg.flowCompMX, true);
  view.setFloat32(12, msg.flowCompMY, true);
  view.setFloat32(16, msg.groundDistance, true);
  view.setFloat32(20, msg.flowRateX, true);
  view.setFloat32(24, msg.flowRateY, true);
  view.setInt16(28, msg.flowX, true);
  view.setInt16(30, msg.flowY, true);
  buffer[32] = msg.sensorId & 0xff;
  buffer[33] = msg.quality & 0xff;

  return buffer;
}

export function deserializeOpticalFlow(payload: Uint8Array): OpticalFlow {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeUsec: view.getBigUint64(0, true),
    flowCompMX: view.getFloat32(8, true),
    flowCompMY: view.getFloat32(12, true),
    groundDistance: view.getFloat32(16, true),
    flowRateX: view.getFloat32(20, true),
    flowRateY: view.getFloat32(24, true),
    flowX: view.getInt16(28, true),
    flowY: view.getInt16(30, true),
    sensorId: payload[32],
    quality: payload[33],
  };
}