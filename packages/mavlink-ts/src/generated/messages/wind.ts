/**
 * Wind estimation.
 * Message ID: 168
 * CRC Extra: 1
 */
export interface Wind {
  /** Wind direction (that wind is coming from). (deg) */
  direction: number;
  /** Wind speed in ground plane. (m/s) */
  speed: number;
  /** Vertical wind speed. (m/s) */
  speedZ: number;
}

export const WIND_ID = 168;
export const WIND_CRC_EXTRA = 1;
export const WIND_MIN_LENGTH = 12;
export const WIND_MAX_LENGTH = 12;

export function serializeWind(msg: Wind): Uint8Array {
  const buffer = new Uint8Array(12);
  const view = new DataView(buffer.buffer);

  view.setFloat32(0, msg.direction, true);
  view.setFloat32(4, msg.speed, true);
  view.setFloat32(8, msg.speedZ, true);

  return buffer;
}

export function deserializeWind(payload: Uint8Array): Wind {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    direction: view.getFloat32(0, true),
    speed: view.getFloat32(4, true),
    speedZ: view.getFloat32(8, true),
  };
}