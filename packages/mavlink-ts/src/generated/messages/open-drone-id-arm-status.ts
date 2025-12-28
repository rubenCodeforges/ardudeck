/**
 * Status from the transmitter telling the flight controller if the remote ID system is ready for arming.
 * Message ID: 12918
 * CRC Extra: 139
 */
export interface OpenDroneIdArmStatus {
  /** Status level indicating if arming is allowed. */
  status: number;
  /** Text error message, should be empty if status is good to arm. Fill with nulls in unused portion. */
  error: string;
}

export const OPEN_DRONE_ID_ARM_STATUS_ID = 12918;
export const OPEN_DRONE_ID_ARM_STATUS_CRC_EXTRA = 139;
export const OPEN_DRONE_ID_ARM_STATUS_MIN_LENGTH = 51;
export const OPEN_DRONE_ID_ARM_STATUS_MAX_LENGTH = 51;

export function serializeOpenDroneIdArmStatus(msg: OpenDroneIdArmStatus): Uint8Array {
  const buffer = new Uint8Array(51);
  const view = new DataView(buffer.buffer);

  buffer[0] = msg.status & 0xff;
  // String: error
  const errorBytes = new TextEncoder().encode(msg.error || '');
  buffer.set(errorBytes.slice(0, 50), 1);

  return buffer;
}

export function deserializeOpenDroneIdArmStatus(payload: Uint8Array): OpenDroneIdArmStatus {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    status: payload[0],
    error: new TextDecoder().decode(payload.slice(1, 51)).replace(/\0.*$/, ''),
  };
}