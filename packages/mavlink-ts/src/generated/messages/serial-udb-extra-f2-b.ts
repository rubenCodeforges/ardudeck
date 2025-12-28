/**
 * Backwards compatible version of SERIAL_UDB_EXTRA - F2: Part B
 * Message ID: 171
 * CRC Extra: 245
 */
export interface SerialUdbExtraF2B {
  /** Serial UDB Extra Time */
  sueTime: number;
  /** Serial UDB Extra PWM Input Channel 1 */
  suePwmInput_1: number;
  /** Serial UDB Extra PWM Input Channel 2 */
  suePwmInput_2: number;
  /** Serial UDB Extra PWM Input Channel 3 */
  suePwmInput_3: number;
  /** Serial UDB Extra PWM Input Channel 4 */
  suePwmInput_4: number;
  /** Serial UDB Extra PWM Input Channel 5 */
  suePwmInput_5: number;
  /** Serial UDB Extra PWM Input Channel 6 */
  suePwmInput_6: number;
  /** Serial UDB Extra PWM Input Channel 7 */
  suePwmInput_7: number;
  /** Serial UDB Extra PWM Input Channel 8 */
  suePwmInput_8: number;
  /** Serial UDB Extra PWM Input Channel 9 */
  suePwmInput_9: number;
  /** Serial UDB Extra PWM Input Channel 10 */
  suePwmInput_10: number;
  /** Serial UDB Extra PWM Input Channel 11 */
  suePwmInput_11: number;
  /** Serial UDB Extra PWM Input Channel 12 */
  suePwmInput_12: number;
  /** Serial UDB Extra PWM Output Channel 1 */
  suePwmOutput_1: number;
  /** Serial UDB Extra PWM Output Channel 2 */
  suePwmOutput_2: number;
  /** Serial UDB Extra PWM Output Channel 3 */
  suePwmOutput_3: number;
  /** Serial UDB Extra PWM Output Channel 4 */
  suePwmOutput_4: number;
  /** Serial UDB Extra PWM Output Channel 5 */
  suePwmOutput_5: number;
  /** Serial UDB Extra PWM Output Channel 6 */
  suePwmOutput_6: number;
  /** Serial UDB Extra PWM Output Channel 7 */
  suePwmOutput_7: number;
  /** Serial UDB Extra PWM Output Channel 8 */
  suePwmOutput_8: number;
  /** Serial UDB Extra PWM Output Channel 9 */
  suePwmOutput_9: number;
  /** Serial UDB Extra PWM Output Channel 10 */
  suePwmOutput_10: number;
  /** Serial UDB Extra PWM Output Channel 11 */
  suePwmOutput_11: number;
  /** Serial UDB Extra PWM Output Channel 12 */
  suePwmOutput_12: number;
  /** Serial UDB Extra IMU Location X */
  sueImuLocationX: number;
  /** Serial UDB Extra IMU Location Y */
  sueImuLocationY: number;
  /** Serial UDB Extra IMU Location Z */
  sueImuLocationZ: number;
  /** Serial UDB Location Error Earth X */
  sueLocationErrorEarthX: number;
  /** Serial UDB Location Error Earth Y */
  sueLocationErrorEarthY: number;
  /** Serial UDB Location Error Earth Z */
  sueLocationErrorEarthZ: number;
  /** Serial UDB Extra Status Flags */
  sueFlags: number;
  /** Serial UDB Extra Oscillator Failure Count */
  sueOscFails: number;
  /** Serial UDB Extra IMU Velocity X */
  sueImuVelocityX: number;
  /** Serial UDB Extra IMU Velocity Y */
  sueImuVelocityY: number;
  /** Serial UDB Extra IMU Velocity Z */
  sueImuVelocityZ: number;
  /** Serial UDB Extra Current Waypoint Goal X */
  sueWaypointGoalX: number;
  /** Serial UDB Extra Current Waypoint Goal Y */
  sueWaypointGoalY: number;
  /** Serial UDB Extra Current Waypoint Goal Z */
  sueWaypointGoalZ: number;
  /** Aeroforce in UDB X Axis */
  sueAeroX: number;
  /** Aeroforce in UDB Y Axis */
  sueAeroY: number;
  /** Aeroforce in UDB Z axis */
  sueAeroZ: number;
  /** SUE barometer temperature */
  sueBaromTemp: number;
  /** SUE barometer pressure */
  sueBaromPress: number;
  /** SUE barometer altitude */
  sueBaromAlt: number;
  /** SUE battery voltage */
  sueBatVolt: number;
  /** SUE battery current */
  sueBatAmp: number;
  /** SUE battery milli amp hours used */
  sueBatAmpHours: number;
  /** Sue autopilot desired height */
  sueDesiredHeight: number;
  /** Serial UDB Extra Stack Memory Free */
  sueMemoryStackFree: number;
}

export const SERIAL_UDB_EXTRA_F2_B_ID = 171;
export const SERIAL_UDB_EXTRA_F2_B_CRC_EXTRA = 245;
export const SERIAL_UDB_EXTRA_F2_B_MIN_LENGTH = 108;
export const SERIAL_UDB_EXTRA_F2_B_MAX_LENGTH = 108;

export function serializeSerialUdbExtraF2B(msg: SerialUdbExtraF2B): Uint8Array {
  const buffer = new Uint8Array(108);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.sueTime, true);
  view.setUint32(4, msg.sueFlags, true);
  view.setInt32(8, msg.sueBaromPress, true);
  view.setInt32(12, msg.sueBaromAlt, true);
  view.setInt16(16, msg.suePwmInput_1, true);
  view.setInt16(18, msg.suePwmInput_2, true);
  view.setInt16(20, msg.suePwmInput_3, true);
  view.setInt16(22, msg.suePwmInput_4, true);
  view.setInt16(24, msg.suePwmInput_5, true);
  view.setInt16(26, msg.suePwmInput_6, true);
  view.setInt16(28, msg.suePwmInput_7, true);
  view.setInt16(30, msg.suePwmInput_8, true);
  view.setInt16(32, msg.suePwmInput_9, true);
  view.setInt16(34, msg.suePwmInput_10, true);
  view.setInt16(36, msg.suePwmInput_11, true);
  view.setInt16(38, msg.suePwmInput_12, true);
  view.setInt16(40, msg.suePwmOutput_1, true);
  view.setInt16(42, msg.suePwmOutput_2, true);
  view.setInt16(44, msg.suePwmOutput_3, true);
  view.setInt16(46, msg.suePwmOutput_4, true);
  view.setInt16(48, msg.suePwmOutput_5, true);
  view.setInt16(50, msg.suePwmOutput_6, true);
  view.setInt16(52, msg.suePwmOutput_7, true);
  view.setInt16(54, msg.suePwmOutput_8, true);
  view.setInt16(56, msg.suePwmOutput_9, true);
  view.setInt16(58, msg.suePwmOutput_10, true);
  view.setInt16(60, msg.suePwmOutput_11, true);
  view.setInt16(62, msg.suePwmOutput_12, true);
  view.setInt16(64, msg.sueImuLocationX, true);
  view.setInt16(66, msg.sueImuLocationY, true);
  view.setInt16(68, msg.sueImuLocationZ, true);
  view.setInt16(70, msg.sueLocationErrorEarthX, true);
  view.setInt16(72, msg.sueLocationErrorEarthY, true);
  view.setInt16(74, msg.sueLocationErrorEarthZ, true);
  view.setInt16(76, msg.sueOscFails, true);
  view.setInt16(78, msg.sueImuVelocityX, true);
  view.setInt16(80, msg.sueImuVelocityY, true);
  view.setInt16(82, msg.sueImuVelocityZ, true);
  view.setInt16(84, msg.sueWaypointGoalX, true);
  view.setInt16(86, msg.sueWaypointGoalY, true);
  view.setInt16(88, msg.sueWaypointGoalZ, true);
  view.setInt16(90, msg.sueAeroX, true);
  view.setInt16(92, msg.sueAeroY, true);
  view.setInt16(94, msg.sueAeroZ, true);
  view.setInt16(96, msg.sueBaromTemp, true);
  view.setInt16(98, msg.sueBatVolt, true);
  view.setInt16(100, msg.sueBatAmp, true);
  view.setInt16(102, msg.sueBatAmpHours, true);
  view.setInt16(104, msg.sueDesiredHeight, true);
  view.setInt16(106, msg.sueMemoryStackFree, true);

  return buffer;
}

export function deserializeSerialUdbExtraF2B(payload: Uint8Array): SerialUdbExtraF2B {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    sueTime: view.getUint32(0, true),
    sueFlags: view.getUint32(4, true),
    sueBaromPress: view.getInt32(8, true),
    sueBaromAlt: view.getInt32(12, true),
    suePwmInput_1: view.getInt16(16, true),
    suePwmInput_2: view.getInt16(18, true),
    suePwmInput_3: view.getInt16(20, true),
    suePwmInput_4: view.getInt16(22, true),
    suePwmInput_5: view.getInt16(24, true),
    suePwmInput_6: view.getInt16(26, true),
    suePwmInput_7: view.getInt16(28, true),
    suePwmInput_8: view.getInt16(30, true),
    suePwmInput_9: view.getInt16(32, true),
    suePwmInput_10: view.getInt16(34, true),
    suePwmInput_11: view.getInt16(36, true),
    suePwmInput_12: view.getInt16(38, true),
    suePwmOutput_1: view.getInt16(40, true),
    suePwmOutput_2: view.getInt16(42, true),
    suePwmOutput_3: view.getInt16(44, true),
    suePwmOutput_4: view.getInt16(46, true),
    suePwmOutput_5: view.getInt16(48, true),
    suePwmOutput_6: view.getInt16(50, true),
    suePwmOutput_7: view.getInt16(52, true),
    suePwmOutput_8: view.getInt16(54, true),
    suePwmOutput_9: view.getInt16(56, true),
    suePwmOutput_10: view.getInt16(58, true),
    suePwmOutput_11: view.getInt16(60, true),
    suePwmOutput_12: view.getInt16(62, true),
    sueImuLocationX: view.getInt16(64, true),
    sueImuLocationY: view.getInt16(66, true),
    sueImuLocationZ: view.getInt16(68, true),
    sueLocationErrorEarthX: view.getInt16(70, true),
    sueLocationErrorEarthY: view.getInt16(72, true),
    sueLocationErrorEarthZ: view.getInt16(74, true),
    sueOscFails: view.getInt16(76, true),
    sueImuVelocityX: view.getInt16(78, true),
    sueImuVelocityY: view.getInt16(80, true),
    sueImuVelocityZ: view.getInt16(82, true),
    sueWaypointGoalX: view.getInt16(84, true),
    sueWaypointGoalY: view.getInt16(86, true),
    sueWaypointGoalZ: view.getInt16(88, true),
    sueAeroX: view.getInt16(90, true),
    sueAeroY: view.getInt16(92, true),
    sueAeroZ: view.getInt16(94, true),
    sueBaromTemp: view.getInt16(96, true),
    sueBatVolt: view.getInt16(98, true),
    sueBatAmp: view.getInt16(100, true),
    sueBatAmpHours: view.getInt16(102, true),
    sueDesiredHeight: view.getInt16(104, true),
    sueMemoryStackFree: view.getInt16(106, true),
  };
}