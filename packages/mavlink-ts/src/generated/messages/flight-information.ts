/**
 * Information about flight since last arming.
 * Message ID: 264
 * CRC Extra: 49
 */
export interface FlightInformation {
  /** Timestamp (time since system boot). (ms) */
  timeBootMs: number;
  /** Timestamp at arming (time since UNIX epoch) in UTC, 0 for unknown (us) */
  armingTimeUtc: bigint;
  /** Timestamp at takeoff (time since UNIX epoch) in UTC, 0 for unknown (us) */
  takeoffTimeUtc: bigint;
  /** Universally unique identifier (UUID) of flight, should correspond to name of log files */
  flightUuid: bigint;
}

export const FLIGHT_INFORMATION_ID = 264;
export const FLIGHT_INFORMATION_CRC_EXTRA = 49;
export const FLIGHT_INFORMATION_MIN_LENGTH = 28;
export const FLIGHT_INFORMATION_MAX_LENGTH = 28;

export function serializeFlightInformation(msg: FlightInformation): Uint8Array {
  const buffer = new Uint8Array(28);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.armingTimeUtc), true);
  view.setBigUint64(8, BigInt(msg.takeoffTimeUtc), true);
  view.setBigUint64(16, BigInt(msg.flightUuid), true);
  view.setUint32(24, msg.timeBootMs, true);

  return buffer;
}

export function deserializeFlightInformation(payload: Uint8Array): FlightInformation {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    armingTimeUtc: view.getBigUint64(0, true),
    takeoffTimeUtc: view.getBigUint64(8, true),
    flightUuid: view.getBigUint64(16, true),
    timeBootMs: view.getUint32(24, true),
  };
}