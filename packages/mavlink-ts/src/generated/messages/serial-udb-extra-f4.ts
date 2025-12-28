/**
 * Backwards compatible version of SERIAL_UDB_EXTRA F4: format
 * Message ID: 172
 * CRC Extra: 191
 */
export interface SerialUdbExtraF4 {
  /** Serial UDB Extra Roll Stabilization with Ailerons Enabled */
  sueRollStabilizationAilerons: number;
  /** Serial UDB Extra Roll Stabilization with Rudder Enabled */
  sueRollStabilizationRudder: number;
  /** Serial UDB Extra Pitch Stabilization Enabled */
  suePitchStabilization: number;
  /** Serial UDB Extra Yaw Stabilization using Rudder Enabled */
  sueYawStabilizationRudder: number;
  /** Serial UDB Extra Yaw Stabilization using Ailerons Enabled */
  sueYawStabilizationAileron: number;
  /** Serial UDB Extra Navigation with Ailerons Enabled */
  sueAileronNavigation: number;
  /** Serial UDB Extra Navigation with Rudder Enabled */
  sueRudderNavigation: number;
  /** Serial UDB Extra Type of Alitude Hold when in Stabilized Mode */
  sueAltitudeholdStabilized: number;
  /** Serial UDB Extra Type of Alitude Hold when in Waypoint Mode */
  sueAltitudeholdWaypoint: number;
  /** Serial UDB Extra Firmware racing mode enabled */
  sueRacingMode: number;
}

export const SERIAL_UDB_EXTRA_F4_ID = 172;
export const SERIAL_UDB_EXTRA_F4_CRC_EXTRA = 191;
export const SERIAL_UDB_EXTRA_F4_MIN_LENGTH = 10;
export const SERIAL_UDB_EXTRA_F4_MAX_LENGTH = 10;

export function serializeSerialUdbExtraF4(msg: SerialUdbExtraF4): Uint8Array {
  const buffer = new Uint8Array(10);
  const view = new DataView(buffer.buffer);

  buffer[0] = msg.sueRollStabilizationAilerons & 0xff;
  buffer[1] = msg.sueRollStabilizationRudder & 0xff;
  buffer[2] = msg.suePitchStabilization & 0xff;
  buffer[3] = msg.sueYawStabilizationRudder & 0xff;
  buffer[4] = msg.sueYawStabilizationAileron & 0xff;
  buffer[5] = msg.sueAileronNavigation & 0xff;
  buffer[6] = msg.sueRudderNavigation & 0xff;
  buffer[7] = msg.sueAltitudeholdStabilized & 0xff;
  buffer[8] = msg.sueAltitudeholdWaypoint & 0xff;
  buffer[9] = msg.sueRacingMode & 0xff;

  return buffer;
}

export function deserializeSerialUdbExtraF4(payload: Uint8Array): SerialUdbExtraF4 {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    sueRollStabilizationAilerons: payload[0],
    sueRollStabilizationRudder: payload[1],
    suePitchStabilization: payload[2],
    sueYawStabilizationRudder: payload[3],
    sueYawStabilizationAileron: payload[4],
    sueAileronNavigation: payload[5],
    sueRudderNavigation: payload[6],
    sueAltitudeholdStabilized: payload[7],
    sueAltitudeholdWaypoint: payload[8],
    sueRacingMode: payload[9],
  };
}