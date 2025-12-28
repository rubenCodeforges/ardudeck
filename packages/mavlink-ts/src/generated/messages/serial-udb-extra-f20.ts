/**
 * Backwards compatible version of SERIAL_UDB_EXTRA F20 format
 * Message ID: 186
 * CRC Extra: 144
 */
export interface SerialUdbExtraF20 {
  /** SUE Number of Input Channels */
  sueNumberOfInputs: number;
  /** SUE UDB PWM Trim Value on Input 1 */
  sueTrimValueInput_1: number;
  /** SUE UDB PWM Trim Value on Input 2 */
  sueTrimValueInput_2: number;
  /** SUE UDB PWM Trim Value on Input 3 */
  sueTrimValueInput_3: number;
  /** SUE UDB PWM Trim Value on Input 4 */
  sueTrimValueInput_4: number;
  /** SUE UDB PWM Trim Value on Input 5 */
  sueTrimValueInput_5: number;
  /** SUE UDB PWM Trim Value on Input 6 */
  sueTrimValueInput_6: number;
  /** SUE UDB PWM Trim Value on Input 7 */
  sueTrimValueInput_7: number;
  /** SUE UDB PWM Trim Value on Input 8 */
  sueTrimValueInput_8: number;
  /** SUE UDB PWM Trim Value on Input 9 */
  sueTrimValueInput_9: number;
  /** SUE UDB PWM Trim Value on Input 10 */
  sueTrimValueInput_10: number;
  /** SUE UDB PWM Trim Value on Input 11 */
  sueTrimValueInput_11: number;
  /** SUE UDB PWM Trim Value on Input 12 */
  sueTrimValueInput_12: number;
}

export const SERIAL_UDB_EXTRA_F20_ID = 186;
export const SERIAL_UDB_EXTRA_F20_CRC_EXTRA = 144;
export const SERIAL_UDB_EXTRA_F20_MIN_LENGTH = 25;
export const SERIAL_UDB_EXTRA_F20_MAX_LENGTH = 25;

export function serializeSerialUdbExtraF20(msg: SerialUdbExtraF20): Uint8Array {
  const buffer = new Uint8Array(25);
  const view = new DataView(buffer.buffer);

  view.setInt16(0, msg.sueTrimValueInput_1, true);
  view.setInt16(2, msg.sueTrimValueInput_2, true);
  view.setInt16(4, msg.sueTrimValueInput_3, true);
  view.setInt16(6, msg.sueTrimValueInput_4, true);
  view.setInt16(8, msg.sueTrimValueInput_5, true);
  view.setInt16(10, msg.sueTrimValueInput_6, true);
  view.setInt16(12, msg.sueTrimValueInput_7, true);
  view.setInt16(14, msg.sueTrimValueInput_8, true);
  view.setInt16(16, msg.sueTrimValueInput_9, true);
  view.setInt16(18, msg.sueTrimValueInput_10, true);
  view.setInt16(20, msg.sueTrimValueInput_11, true);
  view.setInt16(22, msg.sueTrimValueInput_12, true);
  buffer[24] = msg.sueNumberOfInputs & 0xff;

  return buffer;
}

export function deserializeSerialUdbExtraF20(payload: Uint8Array): SerialUdbExtraF20 {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    sueTrimValueInput_1: view.getInt16(0, true),
    sueTrimValueInput_2: view.getInt16(2, true),
    sueTrimValueInput_3: view.getInt16(4, true),
    sueTrimValueInput_4: view.getInt16(6, true),
    sueTrimValueInput_5: view.getInt16(8, true),
    sueTrimValueInput_6: view.getInt16(10, true),
    sueTrimValueInput_7: view.getInt16(12, true),
    sueTrimValueInput_8: view.getInt16(14, true),
    sueTrimValueInput_9: view.getInt16(16, true),
    sueTrimValueInput_10: view.getInt16(18, true),
    sueTrimValueInput_11: view.getInt16(20, true),
    sueTrimValueInput_12: view.getInt16(22, true),
    sueNumberOfInputs: payload[24],
  };
}