/**
 * Status of the SatCom link
 * Message ID: 8015
 * CRC Extra: 23
 */
export interface SatcomLinkStatus {
  /** Timestamp (us) */
  timestamp: bigint;
  /** Timestamp of the last successful sbd session (us) */
  lastHeartbeat: bigint;
  /** Number of failed sessions */
  failedSessions: number;
  /** Number of successful sessions */
  successfulSessions: number;
  /** Signal quality */
  signalQuality: number;
  /** Ring call pending */
  ringPending: number;
  /** Transmission session pending */
  txSessionPending: number;
  /** Receiving session pending */
  rxSessionPending: number;
}

export const SATCOM_LINK_STATUS_ID = 8015;
export const SATCOM_LINK_STATUS_CRC_EXTRA = 23;
export const SATCOM_LINK_STATUS_MIN_LENGTH = 24;
export const SATCOM_LINK_STATUS_MAX_LENGTH = 24;

export function serializeSatcomLinkStatus(msg: SatcomLinkStatus): Uint8Array {
  const buffer = new Uint8Array(24);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.timestamp), true);
  view.setBigUint64(8, BigInt(msg.lastHeartbeat), true);
  view.setUint16(16, msg.failedSessions, true);
  view.setUint16(18, msg.successfulSessions, true);
  buffer[20] = msg.signalQuality & 0xff;
  buffer[21] = msg.ringPending & 0xff;
  buffer[22] = msg.txSessionPending & 0xff;
  buffer[23] = msg.rxSessionPending & 0xff;

  return buffer;
}

export function deserializeSatcomLinkStatus(payload: Uint8Array): SatcomLinkStatus {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timestamp: view.getBigUint64(0, true),
    lastHeartbeat: view.getBigUint64(8, true),
    failedSessions: view.getUint16(16, true),
    successfulSessions: view.getUint16(18, true),
    signalQuality: payload[20],
    ringPending: payload[21],
    txSessionPending: payload[22],
    rxSessionPending: payload[23],
  };
}