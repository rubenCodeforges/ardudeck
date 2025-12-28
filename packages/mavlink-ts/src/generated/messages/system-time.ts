/**
 * The system time is the time of the master clock, typically the computer clock of the main onboard computer.
 * Message ID: 2
 * CRC Extra: 137
 */
export interface SystemTime {
  /** Timestamp (UNIX epoch time). (us) */
  timeUnixUsec: bigint;
  /** Timestamp (time since system boot). (ms) */
  timeBootMs: number;
}

export const SYSTEM_TIME_ID = 2;
export const SYSTEM_TIME_CRC_EXTRA = 137;
export const SYSTEM_TIME_MIN_LENGTH = 12;
export const SYSTEM_TIME_MAX_LENGTH = 12;

export function serializeSystemTime(msg: SystemTime): Uint8Array {
  const buffer = new Uint8Array(12);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.timeUnixUsec), true);
  view.setUint32(8, msg.timeBootMs, true);

  return buffer;
}

export function deserializeSystemTime(payload: Uint8Array): SystemTime {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeUnixUsec: view.getBigUint64(0, true),
    timeBootMs: view.getUint32(8, true),
  };
}