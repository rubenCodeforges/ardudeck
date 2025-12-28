/**
 * Information about a low level gimbal. This message should be requested by the gimbal manager or a ground station using MAV_CMD_REQUEST_MESSAGE. The maximum angles and rates are the limits by hardware. However, the limits by software used are likely different/smaller and dependent on mode/settings/etc..
 * Message ID: 283
 * CRC Extra: 205
 */
export interface GimbalDeviceInformation {
  /** Timestamp (time since system boot). (ms) */
  timeBootMs: number;
  /** Name of the gimbal vendor. */
  vendorName: string;
  /** Name of the gimbal model. */
  modelName: string;
  /** Custom name of the gimbal given to it by the user. */
  customName: string;
  /** Version of the gimbal firmware, encoded as: (Dev & 0xff) << 24 | (Patch & 0xff) << 16 | (Minor & 0xff) << 8 | (Major & 0xff). */
  firmwareVersion: number;
  /** Version of the gimbal hardware, encoded as: (Dev & 0xff) << 24 | (Patch & 0xff) << 16 | (Minor & 0xff) << 8 | (Major & 0xff). */
  hardwareVersion: number;
  /** UID of gimbal hardware (0 if unknown). */
  uid: bigint;
  /** Bitmap of gimbal capability flags. */
  capFlags: number;
  /** Bitmap for use for gimbal-specific capability flags. */
  customCapFlags: number;
  /** Minimum hardware roll angle (positive: rolling to the right, negative: rolling to the left). NAN if unknown. (rad) */
  rollMin: number;
  /** Maximum hardware roll angle (positive: rolling to the right, negative: rolling to the left). NAN if unknown. (rad) */
  rollMax: number;
  /** Minimum hardware pitch angle (positive: up, negative: down). NAN if unknown. (rad) */
  pitchMin: number;
  /** Maximum hardware pitch angle (positive: up, negative: down). NAN if unknown. (rad) */
  pitchMax: number;
  /** Minimum hardware yaw angle (positive: to the right, negative: to the left). NAN if unknown. (rad) */
  yawMin: number;
  /** Maximum hardware yaw angle (positive: to the right, negative: to the left). NAN if unknown. (rad) */
  yawMax: number;
  /** This field is to be used if the gimbal manager and the gimbal device are the same component and hence have the same component ID. This field is then set to a number between 1-6. If the component ID is separate, this field is not required and must be set to 0. */
  gimbalDeviceId: number;
}

export const GIMBAL_DEVICE_INFORMATION_ID = 283;
export const GIMBAL_DEVICE_INFORMATION_CRC_EXTRA = 205;
export const GIMBAL_DEVICE_INFORMATION_MIN_LENGTH = 145;
export const GIMBAL_DEVICE_INFORMATION_MAX_LENGTH = 145;

export function serializeGimbalDeviceInformation(msg: GimbalDeviceInformation): Uint8Array {
  const buffer = new Uint8Array(145);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.uid), true);
  view.setUint32(8, msg.timeBootMs, true);
  view.setUint32(12, msg.firmwareVersion, true);
  view.setUint32(16, msg.hardwareVersion, true);
  view.setFloat32(20, msg.rollMin, true);
  view.setFloat32(24, msg.rollMax, true);
  view.setFloat32(28, msg.pitchMin, true);
  view.setFloat32(32, msg.pitchMax, true);
  view.setFloat32(36, msg.yawMin, true);
  view.setFloat32(40, msg.yawMax, true);
  view.setUint16(44, msg.capFlags, true);
  view.setUint16(46, msg.customCapFlags, true);
  // String: vendor_name
  const vendorNameBytes = new TextEncoder().encode(msg.vendorName || '');
  buffer.set(vendorNameBytes.slice(0, 32), 48);
  // String: model_name
  const modelNameBytes = new TextEncoder().encode(msg.modelName || '');
  buffer.set(modelNameBytes.slice(0, 32), 80);
  // String: custom_name
  const customNameBytes = new TextEncoder().encode(msg.customName || '');
  buffer.set(customNameBytes.slice(0, 32), 112);
  buffer[144] = msg.gimbalDeviceId & 0xff;

  return buffer;
}

export function deserializeGimbalDeviceInformation(payload: Uint8Array): GimbalDeviceInformation {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    uid: view.getBigUint64(0, true),
    timeBootMs: view.getUint32(8, true),
    firmwareVersion: view.getUint32(12, true),
    hardwareVersion: view.getUint32(16, true),
    rollMin: view.getFloat32(20, true),
    rollMax: view.getFloat32(24, true),
    pitchMin: view.getFloat32(28, true),
    pitchMax: view.getFloat32(32, true),
    yawMin: view.getFloat32(36, true),
    yawMax: view.getFloat32(40, true),
    capFlags: view.getUint16(44, true),
    customCapFlags: view.getUint16(46, true),
    vendorName: new TextDecoder().decode(payload.slice(48, 80)).replace(/\0.*$/, ''),
    modelName: new TextDecoder().decode(payload.slice(80, 112)).replace(/\0.*$/, ''),
    customName: new TextDecoder().decode(payload.slice(112, 144)).replace(/\0.*$/, ''),
    gimbalDeviceId: payload[144],
  };
}