/**
 * Status of geo-fencing. Sent in extended status stream when fencing enabled.
 * Message ID: 162
 * CRC Extra: 178
 */
export interface FenceStatus {
  /** Breach status (0 if currently inside fence, 1 if outside). */
  breachStatus: number;
  /** Number of fence breaches. */
  breachCount: number;
  /** Last breach type. */
  breachType: number;
  /** Time (since boot) of last breach. (ms) */
  breachTime: number;
  /** Active action to prevent fence breach */
  breachMitigation: number;
}

export const FENCE_STATUS_ID = 162;
export const FENCE_STATUS_CRC_EXTRA = 178;
export const FENCE_STATUS_MIN_LENGTH = 9;
export const FENCE_STATUS_MAX_LENGTH = 9;

export function serializeFenceStatus(msg: FenceStatus): Uint8Array {
  const buffer = new Uint8Array(9);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.breachTime, true);
  view.setUint16(4, msg.breachCount, true);
  buffer[6] = msg.breachStatus & 0xff;
  buffer[7] = msg.breachType & 0xff;
  buffer[8] = msg.breachMitigation & 0xff;

  return buffer;
}

export function deserializeFenceStatus(payload: Uint8Array): FenceStatus {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    breachTime: view.getUint32(0, true),
    breachCount: view.getUint16(4, true),
    breachStatus: payload[6],
    breachType: payload[7],
    breachMitigation: payload[8],
  };
}