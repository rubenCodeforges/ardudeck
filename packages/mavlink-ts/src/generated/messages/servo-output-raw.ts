/**
 * Superseded by ACTUATOR_OUTPUT_STATUS. The RAW values of the servo outputs (for RC input from the remote, use the RC_CHANNELS messages). The standard PPM modulation is as follows: 1000 microseconds: 0%, 2000 microseconds: 100%.
 * Message ID: 36
 * CRC Extra: 175
 */
export interface ServoOutputRaw {
  /** Timestamp (UNIX Epoch time or time since system boot). The receiving end can infer timestamp format (since 1.1.1970 or since system boot) by checking for the magnitude of the number. (us) */
  timeUsec: number;
  /** Servo output port (set of 8 outputs = 1 port). Flight stacks running on Pixhawk should use: 0 = MAIN, 1 = AUX. */
  port: number;
  /** Servo output 1 value (us) */
  servo1Raw: number;
  /** Servo output 2 value (us) */
  servo2Raw: number;
  /** Servo output 3 value (us) */
  servo3Raw: number;
  /** Servo output 4 value (us) */
  servo4Raw: number;
  /** Servo output 5 value (us) */
  servo5Raw: number;
  /** Servo output 6 value (us) */
  servo6Raw: number;
  /** Servo output 7 value (us) */
  servo7Raw: number;
  /** Servo output 8 value (us) */
  servo8Raw: number;
  /** Servo output 9 value (us) */
  servo9Raw: number;
  /** Servo output 10 value (us) */
  servo10Raw: number;
  /** Servo output 11 value (us) */
  servo11Raw: number;
  /** Servo output 12 value (us) */
  servo12Raw: number;
  /** Servo output 13 value (us) */
  servo13Raw: number;
  /** Servo output 14 value (us) */
  servo14Raw: number;
  /** Servo output 15 value (us) */
  servo15Raw: number;
  /** Servo output 16 value (us) */
  servo16Raw: number;
}

export const SERVO_OUTPUT_RAW_ID = 36;
export const SERVO_OUTPUT_RAW_CRC_EXTRA = 175;
export const SERVO_OUTPUT_RAW_MIN_LENGTH = 37;
export const SERVO_OUTPUT_RAW_MAX_LENGTH = 37;

export function serializeServoOutputRaw(msg: ServoOutputRaw): Uint8Array {
  const buffer = new Uint8Array(37);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.timeUsec, true);
  view.setUint16(4, msg.servo1Raw, true);
  view.setUint16(6, msg.servo2Raw, true);
  view.setUint16(8, msg.servo3Raw, true);
  view.setUint16(10, msg.servo4Raw, true);
  view.setUint16(12, msg.servo5Raw, true);
  view.setUint16(14, msg.servo6Raw, true);
  view.setUint16(16, msg.servo7Raw, true);
  view.setUint16(18, msg.servo8Raw, true);
  view.setUint16(20, msg.servo9Raw, true);
  view.setUint16(22, msg.servo10Raw, true);
  view.setUint16(24, msg.servo11Raw, true);
  view.setUint16(26, msg.servo12Raw, true);
  view.setUint16(28, msg.servo13Raw, true);
  view.setUint16(30, msg.servo14Raw, true);
  view.setUint16(32, msg.servo15Raw, true);
  view.setUint16(34, msg.servo16Raw, true);
  buffer[36] = msg.port & 0xff;

  return buffer;
}

export function deserializeServoOutputRaw(payload: Uint8Array): ServoOutputRaw {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeUsec: view.getUint32(0, true),
    servo1Raw: view.getUint16(4, true),
    servo2Raw: view.getUint16(6, true),
    servo3Raw: view.getUint16(8, true),
    servo4Raw: view.getUint16(10, true),
    servo5Raw: view.getUint16(12, true),
    servo6Raw: view.getUint16(14, true),
    servo7Raw: view.getUint16(16, true),
    servo8Raw: view.getUint16(18, true),
    servo9Raw: view.getUint16(20, true),
    servo10Raw: view.getUint16(22, true),
    servo11Raw: view.getUint16(24, true),
    servo12Raw: view.getUint16(26, true),
    servo13Raw: view.getUint16(28, true),
    servo14Raw: view.getUint16(30, true),
    servo15Raw: view.getUint16(32, true),
    servo16Raw: view.getUint16(34, true),
    port: payload[36],
  };
}