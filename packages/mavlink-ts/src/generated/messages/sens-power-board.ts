/**
 * Monitoring of power board status
 * Message ID: 8013
 * CRC Extra: 222
 */
export interface SensPowerBoard {
  /** Timestamp (us) */
  timestamp: bigint;
  /** Power board status register */
  pwrBrdStatus: number;
  /** Power board leds status */
  pwrBrdLedStatus: number;
  /** Power board system voltage (V) */
  pwrBrdSystemVolt: number;
  /** Power board servo voltage (V) */
  pwrBrdServoVolt: number;
  /** Power board digital voltage (V) */
  pwrBrdDigitalVolt: number;
  /** Power board left motor current sensor (A) */
  pwrBrdMotLAmp: number;
  /** Power board right motor current sensor (A) */
  pwrBrdMotRAmp: number;
  /** Power board analog current sensor (A) */
  pwrBrdAnalogAmp: number;
  /** Power board digital current sensor (A) */
  pwrBrdDigitalAmp: number;
  /** Power board extension current sensor (A) */
  pwrBrdExtAmp: number;
  /** Power board aux current sensor (A) */
  pwrBrdAuxAmp: number;
}

export const SENS_POWER_BOARD_ID = 8013;
export const SENS_POWER_BOARD_CRC_EXTRA = 222;
export const SENS_POWER_BOARD_MIN_LENGTH = 46;
export const SENS_POWER_BOARD_MAX_LENGTH = 46;

export function serializeSensPowerBoard(msg: SensPowerBoard): Uint8Array {
  const buffer = new Uint8Array(46);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.timestamp), true);
  view.setFloat32(8, msg.pwrBrdSystemVolt, true);
  view.setFloat32(12, msg.pwrBrdServoVolt, true);
  view.setFloat32(16, msg.pwrBrdDigitalVolt, true);
  view.setFloat32(20, msg.pwrBrdMotLAmp, true);
  view.setFloat32(24, msg.pwrBrdMotRAmp, true);
  view.setFloat32(28, msg.pwrBrdAnalogAmp, true);
  view.setFloat32(32, msg.pwrBrdDigitalAmp, true);
  view.setFloat32(36, msg.pwrBrdExtAmp, true);
  view.setFloat32(40, msg.pwrBrdAuxAmp, true);
  buffer[44] = msg.pwrBrdStatus & 0xff;
  buffer[45] = msg.pwrBrdLedStatus & 0xff;

  return buffer;
}

export function deserializeSensPowerBoard(payload: Uint8Array): SensPowerBoard {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timestamp: view.getBigUint64(0, true),
    pwrBrdSystemVolt: view.getFloat32(8, true),
    pwrBrdServoVolt: view.getFloat32(12, true),
    pwrBrdDigitalVolt: view.getFloat32(16, true),
    pwrBrdMotLAmp: view.getFloat32(20, true),
    pwrBrdMotRAmp: view.getFloat32(24, true),
    pwrBrdAnalogAmp: view.getFloat32(28, true),
    pwrBrdDigitalAmp: view.getFloat32(32, true),
    pwrBrdExtAmp: view.getFloat32(36, true),
    pwrBrdAuxAmp: view.getFloat32(40, true),
    pwrBrdStatus: payload[44],
    pwrBrdLedStatus: payload[45],
  };
}