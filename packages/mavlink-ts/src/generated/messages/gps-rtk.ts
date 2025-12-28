/**
 * RTK GPS data. Gives information on the relative baseline calculation the GPS is reporting
 * Message ID: 127
 * CRC Extra: 25
 */
export interface GpsRtk {
  /** Time since boot of last baseline message received. (ms) */
  timeLastBaselineMs: number;
  /** Identification of connected RTK receiver. */
  rtkReceiverId: number;
  /** GPS Week Number of last baseline */
  wn: number;
  /** GPS Time of Week of last baseline (ms) */
  tow: number;
  /** GPS-specific health report for RTK data. */
  rtkHealth: number;
  /** Rate of baseline messages being received by GPS (Hz) */
  rtkRate: number;
  /** Current number of sats used for RTK calculation. */
  nsats: number;
  /** Coordinate system of baseline */
  baselineCoordsType: number;
  /** Current baseline in ECEF x or NED north component. (mm) */
  baselineAMm: number;
  /** Current baseline in ECEF y or NED east component. (mm) */
  baselineBMm: number;
  /** Current baseline in ECEF z or NED down component. (mm) */
  baselineCMm: number;
  /** Current estimate of baseline accuracy. */
  accuracy: number;
  /** Current number of integer ambiguity hypotheses. */
  iarNumHypotheses: number;
}

export const GPS_RTK_ID = 127;
export const GPS_RTK_CRC_EXTRA = 25;
export const GPS_RTK_MIN_LENGTH = 35;
export const GPS_RTK_MAX_LENGTH = 35;

export function serializeGpsRtk(msg: GpsRtk): Uint8Array {
  const buffer = new Uint8Array(35);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.timeLastBaselineMs, true);
  view.setUint32(4, msg.tow, true);
  view.setInt32(8, msg.baselineAMm, true);
  view.setInt32(12, msg.baselineBMm, true);
  view.setInt32(16, msg.baselineCMm, true);
  view.setUint32(20, msg.accuracy, true);
  view.setInt32(24, msg.iarNumHypotheses, true);
  view.setUint16(28, msg.wn, true);
  buffer[30] = msg.rtkReceiverId & 0xff;
  buffer[31] = msg.rtkHealth & 0xff;
  buffer[32] = msg.rtkRate & 0xff;
  buffer[33] = msg.nsats & 0xff;
  buffer[34] = msg.baselineCoordsType & 0xff;

  return buffer;
}

export function deserializeGpsRtk(payload: Uint8Array): GpsRtk {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeLastBaselineMs: view.getUint32(0, true),
    tow: view.getUint32(4, true),
    baselineAMm: view.getInt32(8, true),
    baselineBMm: view.getInt32(12, true),
    baselineCMm: view.getInt32(16, true),
    accuracy: view.getUint32(20, true),
    iarNumHypotheses: view.getInt32(24, true),
    wn: view.getUint16(28, true),
    rtkReceiverId: payload[30],
    rtkHealth: payload[31],
    rtkRate: payload[32],
    nsats: payload[33],
    baselineCoordsType: payload[34],
  };
}