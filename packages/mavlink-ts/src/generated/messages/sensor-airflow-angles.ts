/**
 * Calibrated airflow angle measurements
 * Message ID: 8016
 * CRC Extra: 149
 */
export interface SensorAirflowAngles {
  /** Timestamp (us) */
  timestamp: bigint;
  /** Angle of attack (deg) */
  angleofattack: number;
  /** Angle of attack measurement valid */
  angleofattackValid: number;
  /** Sideslip angle (deg) */
  sideslip: number;
  /** Sideslip angle measurement valid */
  sideslipValid: number;
}

export const SENSOR_AIRFLOW_ANGLES_ID = 8016;
export const SENSOR_AIRFLOW_ANGLES_CRC_EXTRA = 149;
export const SENSOR_AIRFLOW_ANGLES_MIN_LENGTH = 18;
export const SENSOR_AIRFLOW_ANGLES_MAX_LENGTH = 18;

export function serializeSensorAirflowAngles(msg: SensorAirflowAngles): Uint8Array {
  const buffer = new Uint8Array(18);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.timestamp), true);
  view.setFloat32(8, msg.angleofattack, true);
  view.setFloat32(12, msg.sideslip, true);
  buffer[16] = msg.angleofattackValid & 0xff;
  buffer[17] = msg.sideslipValid & 0xff;

  return buffer;
}

export function deserializeSensorAirflowAngles(payload: Uint8Array): SensorAirflowAngles {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timestamp: view.getBigUint64(0, true),
    angleofattack: view.getFloat32(8, true),
    sideslip: view.getFloat32(12, true),
    angleofattackValid: payload[16],
    sideslipValid: payload[17],
  };
}