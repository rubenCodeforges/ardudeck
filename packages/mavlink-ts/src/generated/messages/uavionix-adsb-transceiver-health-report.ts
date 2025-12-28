/**
 * Transceiver heartbeat with health report (updated every 10s)
 * Message ID: 10003
 * CRC Extra: 4
 */
export interface UavionixAdsbTransceiverHealthReport {
  /** ADS-B transponder messages */
  rfhealth: number;
}

export const UAVIONIX_ADSB_TRANSCEIVER_HEALTH_REPORT_ID = 10003;
export const UAVIONIX_ADSB_TRANSCEIVER_HEALTH_REPORT_CRC_EXTRA = 4;
export const UAVIONIX_ADSB_TRANSCEIVER_HEALTH_REPORT_MIN_LENGTH = 1;
export const UAVIONIX_ADSB_TRANSCEIVER_HEALTH_REPORT_MAX_LENGTH = 1;

export function serializeUavionixAdsbTransceiverHealthReport(msg: UavionixAdsbTransceiverHealthReport): Uint8Array {
  const buffer = new Uint8Array(1);
  const view = new DataView(buffer.buffer);

  buffer[0] = msg.rfhealth & 0xff;

  return buffer;
}

export function deserializeUavionixAdsbTransceiverHealthReport(payload: Uint8Array): UavionixAdsbTransceiverHealthReport {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    rfhealth: payload[0],
  };
}