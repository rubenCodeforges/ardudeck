/**
 * AVSS PRS system status.
 * Message ID: 60050
 * CRC Extra: 220
 */
export interface AvssPrsSysStatus {
  /** Timestamp (time since PRS boot). (ms) */
  timeBootMs: number;
  /** PRS error statuses */
  errorStatus: number;
  /** Estimated battery run-time without a remote connection and PRS battery voltage */
  batteryStatus: number;
  /** PRS arm statuses */
  armStatus: number;
  /** PRS battery charge statuses */
  chargeStatus: number;
}

export const AVSS_PRS_SYS_STATUS_ID = 60050;
export const AVSS_PRS_SYS_STATUS_CRC_EXTRA = 220;
export const AVSS_PRS_SYS_STATUS_MIN_LENGTH = 14;
export const AVSS_PRS_SYS_STATUS_MAX_LENGTH = 14;

export function serializeAvssPrsSysStatus(msg: AvssPrsSysStatus): Uint8Array {
  const buffer = new Uint8Array(14);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.timeBootMs, true);
  view.setUint32(4, msg.errorStatus, true);
  view.setUint32(8, msg.batteryStatus, true);
  buffer[12] = msg.armStatus & 0xff;
  buffer[13] = msg.chargeStatus & 0xff;

  return buffer;
}

export function deserializeAvssPrsSysStatus(payload: Uint8Array): AvssPrsSysStatus {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeBootMs: view.getUint32(0, true),
    errorStatus: view.getUint32(4, true),
    batteryStatus: view.getUint32(8, true),
    armStatus: payload[12],
    chargeStatus: payload[13],
  };
}