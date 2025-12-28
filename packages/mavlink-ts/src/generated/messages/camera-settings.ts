/**
 * Settings of a camera. Can be requested with a MAV_CMD_REQUEST_MESSAGE command.
 * Message ID: 260
 * CRC Extra: 8
 */
export interface CameraSettings {
  /** Timestamp (time since system boot). (ms) */
  timeBootMs: number;
  /** Camera mode */
  modeId: number;
  /** Current zoom level as a percentage of the full range (0.0 to 100.0, NaN if not known) */
  zoomlevel: number;
  /** Current focus level as a percentage of the full range (0.0 to 100.0, NaN if not known) */
  focuslevel: number;
}

export const CAMERA_SETTINGS_ID = 260;
export const CAMERA_SETTINGS_CRC_EXTRA = 8;
export const CAMERA_SETTINGS_MIN_LENGTH = 13;
export const CAMERA_SETTINGS_MAX_LENGTH = 13;

export function serializeCameraSettings(msg: CameraSettings): Uint8Array {
  const buffer = new Uint8Array(13);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.timeBootMs, true);
  view.setFloat32(4, msg.zoomlevel, true);
  view.setFloat32(8, msg.focuslevel, true);
  buffer[12] = msg.modeId & 0xff;

  return buffer;
}

export function deserializeCameraSettings(payload: Uint8Array): CameraSettings {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeBootMs: view.getUint32(0, true),
    zoomlevel: view.getFloat32(4, true),
    focuslevel: view.getFloat32(8, true),
    modeId: payload[12],
  };
}