/**
 * Temperature and humidity from hygrometer.
 * Message ID: 12920
 * CRC Extra: 20
 */
export interface HygrometerSensor {
  /** Hygrometer ID */
  id: number;
  /** Temperature (cdegC) */
  temperature: number;
  /** Humidity (c%) */
  humidity: number;
}

export const HYGROMETER_SENSOR_ID = 12920;
export const HYGROMETER_SENSOR_CRC_EXTRA = 20;
export const HYGROMETER_SENSOR_MIN_LENGTH = 5;
export const HYGROMETER_SENSOR_MAX_LENGTH = 5;

export function serializeHygrometerSensor(msg: HygrometerSensor): Uint8Array {
  const buffer = new Uint8Array(5);
  const view = new DataView(buffer.buffer);

  view.setInt16(0, msg.temperature, true);
  view.setUint16(2, msg.humidity, true);
  buffer[4] = msg.id & 0xff;

  return buffer;
}

export function deserializeHygrometerSensor(payload: Uint8Array): HygrometerSensor {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    temperature: view.getInt16(0, true),
    humidity: view.getUint16(2, true),
    id: payload[4],
  };
}