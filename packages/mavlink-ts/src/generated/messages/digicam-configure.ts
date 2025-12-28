/**
 * Configure on-board Camera Control System.
 * Message ID: 154
 * CRC Extra: 84
 */
export interface DigicamConfigure {
  /** System ID. */
  targetSystem: number;
  /** Component ID. */
  targetComponent: number;
  /** Mode enumeration from 1 to N //P, TV, AV, M, etc. (0 means ignore). */
  mode: number;
  /** Divisor number //e.g. 1000 means 1/1000 (0 means ignore). */
  shutterSpeed: number;
  /** F stop number x 10 //e.g. 28 means 2.8 (0 means ignore). */
  aperture: number;
  /** ISO enumeration from 1 to N //e.g. 80, 100, 200, Etc (0 means ignore). */
  iso: number;
  /** Exposure type enumeration from 1 to N (0 means ignore). */
  exposureType: number;
  /** Command Identity (incremental loop: 0 to 255). //A command sent multiple times will be executed or pooled just once. */
  commandId: number;
  /** Main engine cut-off time before camera trigger (0 means no cut-off). (ds) */
  engineCutOff: number;
  /** Extra parameters enumeration (0 means ignore). */
  extraParam: number;
  /** Correspondent value to given extra_param. */
  extraValue: number;
}

export const DIGICAM_CONFIGURE_ID = 154;
export const DIGICAM_CONFIGURE_CRC_EXTRA = 84;
export const DIGICAM_CONFIGURE_MIN_LENGTH = 15;
export const DIGICAM_CONFIGURE_MAX_LENGTH = 15;

export function serializeDigicamConfigure(msg: DigicamConfigure): Uint8Array {
  const buffer = new Uint8Array(15);
  const view = new DataView(buffer.buffer);

  view.setFloat32(0, msg.extraValue, true);
  view.setUint16(4, msg.shutterSpeed, true);
  buffer[6] = msg.targetSystem & 0xff;
  buffer[7] = msg.targetComponent & 0xff;
  buffer[8] = msg.mode & 0xff;
  buffer[9] = msg.aperture & 0xff;
  buffer[10] = msg.iso & 0xff;
  buffer[11] = msg.exposureType & 0xff;
  buffer[12] = msg.commandId & 0xff;
  buffer[13] = msg.engineCutOff & 0xff;
  buffer[14] = msg.extraParam & 0xff;

  return buffer;
}

export function deserializeDigicamConfigure(payload: Uint8Array): DigicamConfigure {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    extraValue: view.getFloat32(0, true),
    shutterSpeed: view.getUint16(4, true),
    targetSystem: payload[6],
    targetComponent: payload[7],
    mode: payload[8],
    aperture: payload[9],
    iso: payload[10],
    exposureType: payload[11],
    commandId: payload[12],
    engineCutOff: payload[13],
    extraParam: payload[14],
  };
}