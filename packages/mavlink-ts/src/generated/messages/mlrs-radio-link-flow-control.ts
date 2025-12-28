/**
 * Injected by a radio link endpoint into the MAVLink stream for purposes of flow control. Should be emitted only by components with component id MAV_COMP_ID_TELEMETRY_RADIO.
 * Message ID: 60047
 * CRC Extra: 55
 */
export interface MlrsRadioLinkFlowControl {
  /** Transmitted bytes per second, UINT16_MAX: invalid/unknown. (bytes/s) */
  txSerRate: number;
  /** Received bytes per second, UINT16_MAX: invalid/unknown. (bytes/s) */
  rxSerRate: number;
  /** Transmit bandwidth consumption. Values: 0..100, UINT8_MAX: invalid/unknown. (c%) */
  txUsedSerBandwidth: number;
  /** Receive bandwidth consumption. Values: 0..100, UINT8_MAX: invalid/unknown. (c%) */
  rxUsedSerBandwidth: number;
  /** For compatibility with legacy method. UINT8_MAX: unknown. (c%) */
  txbuf: number;
}

export const MLRS_RADIO_LINK_FLOW_CONTROL_ID = 60047;
export const MLRS_RADIO_LINK_FLOW_CONTROL_CRC_EXTRA = 55;
export const MLRS_RADIO_LINK_FLOW_CONTROL_MIN_LENGTH = 7;
export const MLRS_RADIO_LINK_FLOW_CONTROL_MAX_LENGTH = 7;

export function serializeMlrsRadioLinkFlowControl(msg: MlrsRadioLinkFlowControl): Uint8Array {
  const buffer = new Uint8Array(7);
  const view = new DataView(buffer.buffer);

  view.setUint16(0, msg.txSerRate, true);
  view.setUint16(2, msg.rxSerRate, true);
  buffer[4] = msg.txUsedSerBandwidth & 0xff;
  buffer[5] = msg.rxUsedSerBandwidth & 0xff;
  buffer[6] = msg.txbuf & 0xff;

  return buffer;
}

export function deserializeMlrsRadioLinkFlowControl(payload: Uint8Array): MlrsRadioLinkFlowControl {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    txSerRate: view.getUint16(0, true),
    rxSerRate: view.getUint16(2, true),
    txUsedSerBandwidth: payload[4],
    rxUsedSerBandwidth: payload[5],
    txbuf: payload[6],
  };
}