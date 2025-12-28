/**
 * Backwards compatible version of SERIAL_UDB_EXTRA F19 format
 * Message ID: 185
 * CRC Extra: 87
 */
export interface SerialUdbExtraF19 {
  /** SUE aileron output channel */
  sueAileronOutputChannel: number;
  /** SUE aileron reversed */
  sueAileronReversed: number;
  /** SUE elevator output channel */
  sueElevatorOutputChannel: number;
  /** SUE elevator reversed */
  sueElevatorReversed: number;
  /** SUE throttle output channel */
  sueThrottleOutputChannel: number;
  /** SUE throttle reversed */
  sueThrottleReversed: number;
  /** SUE rudder output channel */
  sueRudderOutputChannel: number;
  /** SUE rudder reversed */
  sueRudderReversed: number;
}

export const SERIAL_UDB_EXTRA_F19_ID = 185;
export const SERIAL_UDB_EXTRA_F19_CRC_EXTRA = 87;
export const SERIAL_UDB_EXTRA_F19_MIN_LENGTH = 8;
export const SERIAL_UDB_EXTRA_F19_MAX_LENGTH = 8;

export function serializeSerialUdbExtraF19(msg: SerialUdbExtraF19): Uint8Array {
  const buffer = new Uint8Array(8);
  const view = new DataView(buffer.buffer);

  buffer[0] = msg.sueAileronOutputChannel & 0xff;
  buffer[1] = msg.sueAileronReversed & 0xff;
  buffer[2] = msg.sueElevatorOutputChannel & 0xff;
  buffer[3] = msg.sueElevatorReversed & 0xff;
  buffer[4] = msg.sueThrottleOutputChannel & 0xff;
  buffer[5] = msg.sueThrottleReversed & 0xff;
  buffer[6] = msg.sueRudderOutputChannel & 0xff;
  buffer[7] = msg.sueRudderReversed & 0xff;

  return buffer;
}

export function deserializeSerialUdbExtraF19(payload: Uint8Array): SerialUdbExtraF19 {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    sueAileronOutputChannel: payload[0],
    sueAileronReversed: payload[1],
    sueElevatorOutputChannel: payload[2],
    sueElevatorReversed: payload[3],
    sueThrottleOutputChannel: payload[4],
    sueThrottleReversed: payload[5],
    sueRudderOutputChannel: payload[6],
    sueRudderReversed: payload[7],
  };
}