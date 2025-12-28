/**
 * The general system state. If the system is following the MAVLink standard, the system state is mainly defined by three orthogonal states/modes: The system mode, which is either LOCKED (motors shut down and locked), MANUAL (system under RC control), GUIDED (system with autonomous position control, position setpoint controlled manually) or AUTO (system guided by path/waypoint planner). The NAV_MODE defined the current flight state: LIFTOFF (often an open-loop maneuver), LANDING, WAYPOINTS or VECTOR. This represents the internal navigation state machine. The system status shows whether the system is currently active or not and if an emergency occurred. During the CRITICAL and EMERGENCY states the MAV is still considered to be active, but should start emergency procedures autonomously. After a failure occurred it should first move from active to critical to allow manual intervention and then move to emergency after a certain timeout.
 * Message ID: 1
 * CRC Extra: 124
 */
export interface SysStatus {
  /** Bitmap showing which onboard controllers and sensors are present. Value of 0: not present. Value of 1: present. */
  onboardControlSensorsPresent: number;
  /** Bitmap showing which onboard controllers and sensors are enabled:  Value of 0: not enabled. Value of 1: enabled. */
  onboardControlSensorsEnabled: number;
  /** Bitmap showing which onboard controllers and sensors have an error (or are operational). Value of 0: error. Value of 1: healthy. */
  onboardControlSensorsHealth: number;
  /** Maximum usage in percent of the mainloop time. Values: [0-1000] - should always be below 1000 (d%) */
  load: number;
  /** Battery voltage, UINT16_MAX: Voltage not sent by autopilot (mV) */
  voltageBattery: number;
  /** Battery current, -1: Current not sent by autopilot (cA) */
  currentBattery: number;
  /** Battery energy remaining, -1: Battery remaining energy not sent by autopilot (%) */
  batteryRemaining: number;
  /** Communication drop rate, (UART, I2C, SPI, CAN), dropped packets on all links (packets that were corrupted on reception on the MAV) (c%) */
  dropRateComm: number;
  /** Communication errors (UART, I2C, SPI, CAN), dropped packets on all links (packets that were corrupted on reception on the MAV) */
  errorsComm: number;
  /** Autopilot-specific errors */
  errorsCount1: number;
  /** Autopilot-specific errors */
  errorsCount2: number;
  /** Autopilot-specific errors */
  errorsCount3: number;
  /** Autopilot-specific errors */
  errorsCount4: number;
}

export const SYS_STATUS_ID = 1;
export const SYS_STATUS_CRC_EXTRA = 124;
export const SYS_STATUS_MIN_LENGTH = 31;
export const SYS_STATUS_MAX_LENGTH = 31;

export function serializeSysStatus(msg: SysStatus): Uint8Array {
  const buffer = new Uint8Array(31);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.onboardControlSensorsPresent, true);
  view.setUint32(4, msg.onboardControlSensorsEnabled, true);
  view.setUint32(8, msg.onboardControlSensorsHealth, true);
  view.setUint16(12, msg.load, true);
  view.setUint16(14, msg.voltageBattery, true);
  view.setInt16(16, msg.currentBattery, true);
  view.setUint16(18, msg.dropRateComm, true);
  view.setUint16(20, msg.errorsComm, true);
  view.setUint16(22, msg.errorsCount1, true);
  view.setUint16(24, msg.errorsCount2, true);
  view.setUint16(26, msg.errorsCount3, true);
  view.setUint16(28, msg.errorsCount4, true);
  view.setInt8(30, msg.batteryRemaining);

  return buffer;
}

export function deserializeSysStatus(payload: Uint8Array): SysStatus {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    onboardControlSensorsPresent: view.getUint32(0, true),
    onboardControlSensorsEnabled: view.getUint32(4, true),
    onboardControlSensorsHealth: view.getUint32(8, true),
    load: view.getUint16(12, true),
    voltageBattery: view.getUint16(14, true),
    currentBattery: view.getInt16(16, true),
    dropRateComm: view.getUint16(18, true),
    errorsComm: view.getUint16(20, true),
    errorsCount1: view.getUint16(22, true),
    errorsCount2: view.getUint16(24, true),
    errorsCount3: view.getUint16(26, true),
    errorsCount4: view.getUint16(28, true),
    batteryRemaining: view.getInt8(30),
  };
}