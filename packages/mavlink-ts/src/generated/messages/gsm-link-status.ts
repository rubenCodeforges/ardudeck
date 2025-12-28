/**
 * Status of GSM modem (connected to onboard computer)
 * Message ID: 8014
 * CRC Extra: 200
 */
export interface GsmLinkStatus {
  /** Timestamp (of OBC) (us) */
  timestamp: bigint;
  /** GSM modem used */
  gsmModemType: number;
  /** GSM link type */
  gsmLinkType: number;
  /** RSSI as reported by modem (unconverted) */
  rssi: number;
  /** RSRP (LTE) or RSCP (WCDMA) as reported by modem (unconverted) */
  rsrpRscp: number;
  /** SINR (LTE) or ECIO (WCDMA) as reported by modem (unconverted) */
  sinrEcio: number;
  /** RSRQ (LTE only) as reported by modem (unconverted) */
  rsrq: number;
}

export const GSM_LINK_STATUS_ID = 8014;
export const GSM_LINK_STATUS_CRC_EXTRA = 200;
export const GSM_LINK_STATUS_MIN_LENGTH = 14;
export const GSM_LINK_STATUS_MAX_LENGTH = 14;

export function serializeGsmLinkStatus(msg: GsmLinkStatus): Uint8Array {
  const buffer = new Uint8Array(14);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.timestamp), true);
  buffer[8] = msg.gsmModemType & 0xff;
  buffer[9] = msg.gsmLinkType & 0xff;
  buffer[10] = msg.rssi & 0xff;
  buffer[11] = msg.rsrpRscp & 0xff;
  buffer[12] = msg.sinrEcio & 0xff;
  buffer[13] = msg.rsrq & 0xff;

  return buffer;
}

export function deserializeGsmLinkStatus(payload: Uint8Array): GsmLinkStatus {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timestamp: view.getBigUint64(0, true),
    gsmModemType: payload[8],
    gsmLinkType: payload[9],
    rssi: payload[10],
    rsrpRscp: payload[11],
    sinrEcio: payload[12],
    rsrq: payload[13],
  };
}