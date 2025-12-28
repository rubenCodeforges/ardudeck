/**
 * Simulated optical flow from a flow sensor (e.g. PX4FLOW or optical mouse sensor)
 * Message ID: 114
 * CRC Extra: 237
 */
export interface HilOpticalFlow {
  /** Timestamp (UNIX Epoch time or time since system boot). The receiving end can infer timestamp format (since 1.1.1970 or since system boot) by checking for the magnitude of the number. (us) */
  timeUsec: bigint;
  /** Sensor ID */
  sensorId: number;
  /** Integration time. Divide integrated_x and integrated_y by the integration time to obtain average flow. The integration time also indicates the. (us) */
  integrationTimeUs: number;
  /** Flow in radians around X axis (Sensor RH rotation about the X axis induces a positive flow. Sensor linear motion along the positive Y axis induces a negative flow.) (rad) */
  integratedX: number;
  /** Flow in radians around Y axis (Sensor RH rotation about the Y axis induces a positive flow. Sensor linear motion along the positive X axis induces a positive flow.) (rad) */
  integratedY: number;
  /** RH rotation around X axis (rad) */
  integratedXgyro: number;
  /** RH rotation around Y axis (rad) */
  integratedYgyro: number;
  /** RH rotation around Z axis (rad) */
  integratedZgyro: number;
  /** Temperature (cdegC) */
  temperature: number;
  /** Optical flow quality / confidence. 0: no valid flow, 255: maximum quality */
  quality: number;
  /** Time since the distance was sampled. (us) */
  timeDeltaDistanceUs: number;
  /** Distance to the center of the flow field. Positive value (including zero): distance known. Negative value: Unknown distance. (m) */
  distance: number;
}

export const HIL_OPTICAL_FLOW_ID = 114;
export const HIL_OPTICAL_FLOW_CRC_EXTRA = 237;
export const HIL_OPTICAL_FLOW_MIN_LENGTH = 44;
export const HIL_OPTICAL_FLOW_MAX_LENGTH = 44;

export function serializeHilOpticalFlow(msg: HilOpticalFlow): Uint8Array {
  const buffer = new Uint8Array(44);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.timeUsec), true);
  view.setUint32(8, msg.integrationTimeUs, true);
  view.setFloat32(12, msg.integratedX, true);
  view.setFloat32(16, msg.integratedY, true);
  view.setFloat32(20, msg.integratedXgyro, true);
  view.setFloat32(24, msg.integratedYgyro, true);
  view.setFloat32(28, msg.integratedZgyro, true);
  view.setUint32(32, msg.timeDeltaDistanceUs, true);
  view.setFloat32(36, msg.distance, true);
  view.setInt16(40, msg.temperature, true);
  buffer[42] = msg.sensorId & 0xff;
  buffer[43] = msg.quality & 0xff;

  return buffer;
}

export function deserializeHilOpticalFlow(payload: Uint8Array): HilOpticalFlow {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeUsec: view.getBigUint64(0, true),
    integrationTimeUs: view.getUint32(8, true),
    integratedX: view.getFloat32(12, true),
    integratedY: view.getFloat32(16, true),
    integratedXgyro: view.getFloat32(20, true),
    integratedYgyro: view.getFloat32(24, true),
    integratedZgyro: view.getFloat32(28, true),
    timeDeltaDistanceUs: view.getUint32(32, true),
    distance: view.getFloat32(36, true),
    temperature: view.getInt16(40, true),
    sensorId: payload[42],
    quality: payload[43],
  };
}