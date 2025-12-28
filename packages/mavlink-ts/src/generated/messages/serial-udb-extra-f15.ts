/**
 * Backwards compatible version of SERIAL_UDB_EXTRA F15 format
 * Message ID: 179
 * CRC Extra: 7
 */
export interface SerialUdbExtraF15 {
  /** Serial UDB Extra Model Name Of Vehicle */
  sueIdVehicleModelName: number[];
  /** Serial UDB Extra Registraton Number of Vehicle */
  sueIdVehicleRegistration: number[];
}

export const SERIAL_UDB_EXTRA_F15_ID = 179;
export const SERIAL_UDB_EXTRA_F15_CRC_EXTRA = 7;
export const SERIAL_UDB_EXTRA_F15_MIN_LENGTH = 60;
export const SERIAL_UDB_EXTRA_F15_MAX_LENGTH = 60;

export function serializeSerialUdbExtraF15(msg: SerialUdbExtraF15): Uint8Array {
  const buffer = new Uint8Array(60);
  const view = new DataView(buffer.buffer);

  // Array: sue_ID_VEHICLE_MODEL_NAME
  for (let i = 0; i < 40; i++) {
    buffer[0 + i * 1] = msg.sueIdVehicleModelName[i] ?? 0 & 0xff;
  }
  // Array: sue_ID_VEHICLE_REGISTRATION
  for (let i = 0; i < 20; i++) {
    buffer[40 + i * 1] = msg.sueIdVehicleRegistration[i] ?? 0 & 0xff;
  }

  return buffer;
}

export function deserializeSerialUdbExtraF15(payload: Uint8Array): SerialUdbExtraF15 {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    sueIdVehicleModelName: Array.from({ length: 40 }, (_, i) => payload[0 + i * 1]),
    sueIdVehicleRegistration: Array.from({ length: 20 }, (_, i) => payload[40 + i * 1]),
  };
}