/**
 * Status of the Iridium SBD link.
 * Message ID: 335
 * CRC Extra: 225
 */
export interface IsbdLinkStatus {
  /** Timestamp (UNIX Epoch time or time since system boot). The receiving end can infer timestamp format (since 1.1.1970 or since system boot) by checking for the magnitude of the number. (us) */
  timestamp: bigint;
  /** Timestamp of the last successful sbd session. The receiving end can infer timestamp format (since 1.1.1970 or since system boot) by checking for the magnitude of the number. (us) */
  lastHeartbeat: bigint;
  /** Number of failed SBD sessions. */
  failedSessions: number;
  /** Number of successful SBD sessions. */
  successfulSessions: number;
  /** Signal quality equal to the number of bars displayed on the ISU signal strength indicator. Range is 0 to 5, where 0 indicates no signal and 5 indicates maximum signal strength. */
  signalQuality: number;
  /** 1: Ring call pending, 0: No call pending. */
  ringPending: number;
  /** 1: Transmission session pending, 0: No transmission session pending. */
  txSessionPending: number;
  /** 1: Receiving session pending, 0: No receiving session pending. */
  rxSessionPending: number;
}

export const ISBD_LINK_STATUS_ID = 335;
export const ISBD_LINK_STATUS_CRC_EXTRA = 225;
export const ISBD_LINK_STATUS_MIN_LENGTH = 24;
export const ISBD_LINK_STATUS_MAX_LENGTH = 24;

export function serializeIsbdLinkStatus(msg: IsbdLinkStatus): Uint8Array {
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

export function deserializeIsbdLinkStatus(payload: Uint8Array): IsbdLinkStatus {
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