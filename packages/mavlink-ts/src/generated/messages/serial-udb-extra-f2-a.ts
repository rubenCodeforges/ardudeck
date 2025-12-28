/**
 * Backwards compatible MAVLink version of SERIAL_UDB_EXTRA - F2: Format Part A
 * Message ID: 170
 * CRC Extra: 103
 */
export interface SerialUdbExtraF2A {
  /** Serial UDB Extra Time */
  sueTime: number;
  /** Serial UDB Extra Status */
  sueStatus: number;
  /** Serial UDB Extra Latitude */
  sueLatitude: number;
  /** Serial UDB Extra Longitude */
  sueLongitude: number;
  /** Serial UDB Extra Altitude */
  sueAltitude: number;
  /** Serial UDB Extra Waypoint Index */
  sueWaypointIndex: number;
  /** Serial UDB Extra Rmat 0 */
  sueRmat0: number;
  /** Serial UDB Extra Rmat 1 */
  sueRmat1: number;
  /** Serial UDB Extra Rmat 2 */
  sueRmat2: number;
  /** Serial UDB Extra Rmat 3 */
  sueRmat3: number;
  /** Serial UDB Extra Rmat 4 */
  sueRmat4: number;
  /** Serial UDB Extra Rmat 5 */
  sueRmat5: number;
  /** Serial UDB Extra Rmat 6 */
  sueRmat6: number;
  /** Serial UDB Extra Rmat 7 */
  sueRmat7: number;
  /** Serial UDB Extra Rmat 8 */
  sueRmat8: number;
  /** Serial UDB Extra GPS Course Over Ground */
  sueCog: number;
  /** Serial UDB Extra Speed Over Ground */
  sueSog: number;
  /** Serial UDB Extra CPU Load */
  sueCpuLoad: number;
  /** Serial UDB Extra 3D IMU Air Speed */
  sueAirSpeed_3dimu: number;
  /** Serial UDB Extra Estimated Wind 0 */
  sueEstimatedWind_0: number;
  /** Serial UDB Extra Estimated Wind 1 */
  sueEstimatedWind_1: number;
  /** Serial UDB Extra Estimated Wind 2 */
  sueEstimatedWind_2: number;
  /** Serial UDB Extra Magnetic Field Earth 0 */
  sueMagfieldearth0: number;
  /** Serial UDB Extra Magnetic Field Earth 1 */
  sueMagfieldearth1: number;
  /** Serial UDB Extra Magnetic Field Earth 2 */
  sueMagfieldearth2: number;
  /** Serial UDB Extra Number of Satellites in View */
  sueSvs: number;
  /** Serial UDB Extra GPS Horizontal Dilution of Precision */
  sueHdop: number;
}

export const SERIAL_UDB_EXTRA_F2_A_ID = 170;
export const SERIAL_UDB_EXTRA_F2_A_CRC_EXTRA = 103;
export const SERIAL_UDB_EXTRA_F2_A_MIN_LENGTH = 61;
export const SERIAL_UDB_EXTRA_F2_A_MAX_LENGTH = 61;

export function serializeSerialUdbExtraF2A(msg: SerialUdbExtraF2A): Uint8Array {
  const buffer = new Uint8Array(61);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.sueTime, true);
  view.setInt32(4, msg.sueLatitude, true);
  view.setInt32(8, msg.sueLongitude, true);
  view.setInt32(12, msg.sueAltitude, true);
  view.setUint16(16, msg.sueWaypointIndex, true);
  view.setInt16(18, msg.sueRmat0, true);
  view.setInt16(20, msg.sueRmat1, true);
  view.setInt16(22, msg.sueRmat2, true);
  view.setInt16(24, msg.sueRmat3, true);
  view.setInt16(26, msg.sueRmat4, true);
  view.setInt16(28, msg.sueRmat5, true);
  view.setInt16(30, msg.sueRmat6, true);
  view.setInt16(32, msg.sueRmat7, true);
  view.setInt16(34, msg.sueRmat8, true);
  view.setUint16(36, msg.sueCog, true);
  view.setInt16(38, msg.sueSog, true);
  view.setUint16(40, msg.sueCpuLoad, true);
  view.setUint16(42, msg.sueAirSpeed_3dimu, true);
  view.setInt16(44, msg.sueEstimatedWind_0, true);
  view.setInt16(46, msg.sueEstimatedWind_1, true);
  view.setInt16(48, msg.sueEstimatedWind_2, true);
  view.setInt16(50, msg.sueMagfieldearth0, true);
  view.setInt16(52, msg.sueMagfieldearth1, true);
  view.setInt16(54, msg.sueMagfieldearth2, true);
  view.setInt16(56, msg.sueSvs, true);
  view.setInt16(58, msg.sueHdop, true);
  buffer[60] = msg.sueStatus & 0xff;

  return buffer;
}

export function deserializeSerialUdbExtraF2A(payload: Uint8Array): SerialUdbExtraF2A {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    sueTime: view.getUint32(0, true),
    sueLatitude: view.getInt32(4, true),
    sueLongitude: view.getInt32(8, true),
    sueAltitude: view.getInt32(12, true),
    sueWaypointIndex: view.getUint16(16, true),
    sueRmat0: view.getInt16(18, true),
    sueRmat1: view.getInt16(20, true),
    sueRmat2: view.getInt16(22, true),
    sueRmat3: view.getInt16(24, true),
    sueRmat4: view.getInt16(26, true),
    sueRmat5: view.getInt16(28, true),
    sueRmat6: view.getInt16(30, true),
    sueRmat7: view.getInt16(32, true),
    sueRmat8: view.getInt16(34, true),
    sueCog: view.getUint16(36, true),
    sueSog: view.getInt16(38, true),
    sueCpuLoad: view.getUint16(40, true),
    sueAirSpeed_3dimu: view.getUint16(42, true),
    sueEstimatedWind_0: view.getInt16(44, true),
    sueEstimatedWind_1: view.getInt16(46, true),
    sueEstimatedWind_2: view.getInt16(48, true),
    sueMagfieldearth0: view.getInt16(50, true),
    sueMagfieldearth1: view.getInt16(52, true),
    sueMagfieldearth2: view.getInt16(54, true),
    sueSvs: view.getInt16(56, true),
    sueHdop: view.getInt16(58, true),
    sueStatus: payload[60],
  };
}