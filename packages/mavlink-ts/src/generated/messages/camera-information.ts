/**
 * Information about a camera. Can be requested with a MAV_CMD_REQUEST_MESSAGE command.
 * Message ID: 259
 * CRC Extra: 160
 */
export interface CameraInformation {
  /** Timestamp (time since system boot). (ms) */
  timeBootMs: number;
  /** Name of the camera vendor */
  vendorName: number[];
  /** Name of the camera model */
  modelName: number[];
  /** Version of the camera firmware, encoded as: (Dev & 0xff) << 24 | (Patch & 0xff) << 16 | (Minor & 0xff) << 8 | (Major & 0xff). Use 0 if not known. */
  firmwareVersion: number;
  /** Focal length. Use NaN if not known. (mm) */
  focalLength: number;
  /** Image sensor size horizontal. Use NaN if not known. (mm) */
  sensorSizeH: number;
  /** Image sensor size vertical. Use NaN if not known. (mm) */
  sensorSizeV: number;
  /** Horizontal image resolution. Use 0 if not known. (pix) */
  resolutionH: number;
  /** Vertical image resolution. Use 0 if not known. (pix) */
  resolutionV: number;
  /** Reserved for a lens ID.  Use 0 if not known. */
  lensId: number;
  /** Bitmap of camera capability flags. */
  flags: number;
  /** Camera definition version (iteration).  Use 0 if not known. */
  camDefinitionVersion: number;
  /** Camera definition URI (if any, otherwise only basic functions will be available). HTTP- (http://) and MAVLink FTP- (mavlinkftp://) formatted URIs are allowed (and both must be supported by any GCS that implements the Camera Protocol). The definition file may be xz compressed, which will be indicated by the file extension .xml.xz (a GCS that implements the protocol must support decompressing the file). The string needs to be zero terminated.  Use a zero-length string if not known. */
  camDefinitionUri: string;
  /** Gimbal id of a gimbal associated with this camera. This is the component id of the gimbal device, or 1-6 for non mavlink gimbals. Use 0 if no gimbal is associated with the camera. */
  gimbalDeviceId: number;
}

export const CAMERA_INFORMATION_ID = 259;
export const CAMERA_INFORMATION_CRC_EXTRA = 160;
export const CAMERA_INFORMATION_MIN_LENGTH = 236;
export const CAMERA_INFORMATION_MAX_LENGTH = 236;

export function serializeCameraInformation(msg: CameraInformation): Uint8Array {
  const buffer = new Uint8Array(236);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.timeBootMs, true);
  view.setUint32(4, msg.firmwareVersion, true);
  view.setFloat32(8, msg.focalLength, true);
  view.setFloat32(12, msg.sensorSizeH, true);
  view.setFloat32(16, msg.sensorSizeV, true);
  view.setUint32(20, msg.flags, true);
  view.setUint16(24, msg.resolutionH, true);
  view.setUint16(26, msg.resolutionV, true);
  view.setUint16(28, msg.camDefinitionVersion, true);
  // Array: vendor_name
  for (let i = 0; i < 32; i++) {
    buffer[30 + i * 1] = msg.vendorName[i] ?? 0 & 0xff;
  }
  // Array: model_name
  for (let i = 0; i < 32; i++) {
    buffer[62 + i * 1] = msg.modelName[i] ?? 0 & 0xff;
  }
  buffer[94] = msg.lensId & 0xff;
  // String: cam_definition_uri
  const camDefinitionUriBytes = new TextEncoder().encode(msg.camDefinitionUri || '');
  buffer.set(camDefinitionUriBytes.slice(0, 140), 95);
  buffer[235] = msg.gimbalDeviceId & 0xff;

  return buffer;
}

export function deserializeCameraInformation(payload: Uint8Array): CameraInformation {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeBootMs: view.getUint32(0, true),
    firmwareVersion: view.getUint32(4, true),
    focalLength: view.getFloat32(8, true),
    sensorSizeH: view.getFloat32(12, true),
    sensorSizeV: view.getFloat32(16, true),
    flags: view.getUint32(20, true),
    resolutionH: view.getUint16(24, true),
    resolutionV: view.getUint16(26, true),
    camDefinitionVersion: view.getUint16(28, true),
    vendorName: Array.from({ length: 32 }, (_, i) => payload[30 + i * 1]),
    modelName: Array.from({ length: 32 }, (_, i) => payload[62 + i * 1]),
    lensId: payload[94],
    camDefinitionUri: new TextDecoder().decode(payload.slice(95, 235)).replace(/\0.*$/, ''),
    gimbalDeviceId: payload[235],
  };
}