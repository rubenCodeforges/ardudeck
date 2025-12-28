/**
 * Herelink Telemetry
 * Message ID: 50003
 * CRC Extra: 62
 */
export interface HerelinkTelem {
  rssi: number;
  snr: number;
  rfFreq: number;
  linkBw: number;
  linkRate: number;
  cpuTemp: number;
  boardTemp: number;
}

export const HERELINK_TELEM_ID = 50003;
export const HERELINK_TELEM_CRC_EXTRA = 62;
export const HERELINK_TELEM_MIN_LENGTH = 19;
export const HERELINK_TELEM_MAX_LENGTH = 19;

export function serializeHerelinkTelem(msg: HerelinkTelem): Uint8Array {
  const buffer = new Uint8Array(19);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.rfFreq, true);
  view.setUint32(4, msg.linkBw, true);
  view.setUint32(8, msg.linkRate, true);
  view.setInt16(12, msg.snr, true);
  view.setInt16(14, msg.cpuTemp, true);
  view.setInt16(16, msg.boardTemp, true);
  buffer[18] = msg.rssi & 0xff;

  return buffer;
}

export function deserializeHerelinkTelem(payload: Uint8Array): HerelinkTelem {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    rfFreq: view.getUint32(0, true),
    linkBw: view.getUint32(4, true),
    linkRate: view.getUint32(8, true),
    snr: view.getInt16(12, true),
    cpuTemp: view.getInt16(14, true),
    boardTemp: view.getInt16(16, true),
    rssi: payload[18],
  };
}