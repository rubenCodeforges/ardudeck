/**
 * Maximum Power Point Tracker (MPPT) sensor data for solar module power performance tracking
 * Message ID: 8003
 * CRC Extra: 231
 */
export interface SensMppt {
  /** MPPT last timestamp (us) */
  mpptTimestamp: bigint;
  /** MPPT1 voltage (V) */
  mppt1Volt: number;
  /** MPPT1 current (A) */
  mppt1Amp: number;
  /** MPPT1 pwm (us) */
  mppt1Pwm: number;
  /** MPPT1 status */
  mppt1Status: number;
  /** MPPT2 voltage (V) */
  mppt2Volt: number;
  /** MPPT2 current (A) */
  mppt2Amp: number;
  /** MPPT2 pwm (us) */
  mppt2Pwm: number;
  /** MPPT2 status */
  mppt2Status: number;
  /** MPPT3 voltage (V) */
  mppt3Volt: number;
  /** MPPT3 current (A) */
  mppt3Amp: number;
  /** MPPT3 pwm (us) */
  mppt3Pwm: number;
  /** MPPT3 status */
  mppt3Status: number;
}

export const SENS_MPPT_ID = 8003;
export const SENS_MPPT_CRC_EXTRA = 231;
export const SENS_MPPT_MIN_LENGTH = 41;
export const SENS_MPPT_MAX_LENGTH = 41;

export function serializeSensMppt(msg: SensMppt): Uint8Array {
  const buffer = new Uint8Array(41);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.mpptTimestamp), true);
  view.setFloat32(8, msg.mppt1Volt, true);
  view.setFloat32(12, msg.mppt1Amp, true);
  view.setFloat32(16, msg.mppt2Volt, true);
  view.setFloat32(20, msg.mppt2Amp, true);
  view.setFloat32(24, msg.mppt3Volt, true);
  view.setFloat32(28, msg.mppt3Amp, true);
  view.setUint16(32, msg.mppt1Pwm, true);
  view.setUint16(34, msg.mppt2Pwm, true);
  view.setUint16(36, msg.mppt3Pwm, true);
  buffer[38] = msg.mppt1Status & 0xff;
  buffer[39] = msg.mppt2Status & 0xff;
  buffer[40] = msg.mppt3Status & 0xff;

  return buffer;
}

export function deserializeSensMppt(payload: Uint8Array): SensMppt {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    mpptTimestamp: view.getBigUint64(0, true),
    mppt1Volt: view.getFloat32(8, true),
    mppt1Amp: view.getFloat32(12, true),
    mppt2Volt: view.getFloat32(16, true),
    mppt2Amp: view.getFloat32(20, true),
    mppt3Volt: view.getFloat32(24, true),
    mppt3Amp: view.getFloat32(28, true),
    mppt1Pwm: view.getUint16(32, true),
    mppt2Pwm: view.getUint16(34, true),
    mppt3Pwm: view.getUint16(36, true),
    mppt1Status: payload[38],
    mppt2Status: payload[39],
    mppt3Status: payload[40],
  };
}