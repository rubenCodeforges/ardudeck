/**
 * Reports results of completed compass calibration. Sent until MAG_CAL_ACK received.
 * Message ID: 192
 * CRC Extra: 104
 */
export interface MagCalReport {
  /** Compass being calibrated. */
  compassId: number;
  /** Bitmask of compasses being calibrated. */
  calMask: number;
  /** Calibration Status. */
  calStatus: number;
  /** 0=requires a MAV_CMD_DO_ACCEPT_MAG_CAL, 1=saved to parameters. */
  autosaved: number;
  /** RMS milligauss residuals. (mgauss) */
  fitness: number;
  /** X offset. */
  ofsX: number;
  /** Y offset. */
  ofsY: number;
  /** Z offset. */
  ofsZ: number;
  /** X diagonal (matrix 11). */
  diagX: number;
  /** Y diagonal (matrix 22). */
  diagY: number;
  /** Z diagonal (matrix 33). */
  diagZ: number;
  /** X off-diagonal (matrix 12 and 21). */
  offdiagX: number;
  /** Y off-diagonal (matrix 13 and 31). */
  offdiagY: number;
  /** Z off-diagonal (matrix 32 and 23). */
  offdiagZ: number;
  /** Confidence in orientation (higher is better). */
  orientationConfidence: number;
  /** orientation before calibration. */
  oldOrientation: number;
  /** orientation after calibration. */
  newOrientation: number;
  /** field radius correction factor */
  scaleFactor: number;
}

export const MAG_CAL_REPORT_ID = 192;
export const MAG_CAL_REPORT_CRC_EXTRA = 104;
export const MAG_CAL_REPORT_MIN_LENGTH = 54;
export const MAG_CAL_REPORT_MAX_LENGTH = 54;

export function serializeMagCalReport(msg: MagCalReport): Uint8Array {
  const buffer = new Uint8Array(54);
  const view = new DataView(buffer.buffer);

  view.setFloat32(0, msg.fitness, true);
  view.setFloat32(4, msg.ofsX, true);
  view.setFloat32(8, msg.ofsY, true);
  view.setFloat32(12, msg.ofsZ, true);
  view.setFloat32(16, msg.diagX, true);
  view.setFloat32(20, msg.diagY, true);
  view.setFloat32(24, msg.diagZ, true);
  view.setFloat32(28, msg.offdiagX, true);
  view.setFloat32(32, msg.offdiagY, true);
  view.setFloat32(36, msg.offdiagZ, true);
  view.setFloat32(40, msg.orientationConfidence, true);
  view.setFloat32(44, msg.scaleFactor, true);
  buffer[48] = msg.compassId & 0xff;
  buffer[49] = msg.calMask & 0xff;
  buffer[50] = msg.calStatus & 0xff;
  buffer[51] = msg.autosaved & 0xff;
  buffer[52] = msg.oldOrientation & 0xff;
  buffer[53] = msg.newOrientation & 0xff;

  return buffer;
}

export function deserializeMagCalReport(payload: Uint8Array): MagCalReport {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    fitness: view.getFloat32(0, true),
    ofsX: view.getFloat32(4, true),
    ofsY: view.getFloat32(8, true),
    ofsZ: view.getFloat32(12, true),
    diagX: view.getFloat32(16, true),
    diagY: view.getFloat32(20, true),
    diagZ: view.getFloat32(24, true),
    offdiagX: view.getFloat32(28, true),
    offdiagY: view.getFloat32(32, true),
    offdiagZ: view.getFloat32(36, true),
    orientationConfidence: view.getFloat32(40, true),
    scaleFactor: view.getFloat32(44, true),
    compassId: payload[48],
    calMask: payload[49],
    calStatus: payload[50],
    autosaved: payload[51],
    oldOrientation: payload[52],
    newOrientation: payload[53],
  };
}