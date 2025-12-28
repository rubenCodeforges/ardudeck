/**
 * Handshake message to initiate, control and stop image streaming when using the Image Transmission Protocol: https://mavlink.io/en/services/image_transmission.html.
 * Message ID: 130
 * CRC Extra: 29
 */
export interface DataTransmissionHandshake {
  /** Type of requested/acknowledged data. */
  type: number;
  /** total data size (set on ACK only). (bytes) */
  size: number;
  /** Width of a matrix or image. */
  width: number;
  /** Height of a matrix or image. */
  height: number;
  /** Number of packets being sent (set on ACK only). */
  packets: number;
  /** Payload size per packet (normally 253 byte, see DATA field size in message ENCAPSULATED_DATA) (set on ACK only). (bytes) */
  payload: number;
  /** JPEG quality. Values: [1-100]. (%) */
  jpgQuality: number;
}

export const DATA_TRANSMISSION_HANDSHAKE_ID = 130;
export const DATA_TRANSMISSION_HANDSHAKE_CRC_EXTRA = 29;
export const DATA_TRANSMISSION_HANDSHAKE_MIN_LENGTH = 13;
export const DATA_TRANSMISSION_HANDSHAKE_MAX_LENGTH = 13;

export function serializeDataTransmissionHandshake(msg: DataTransmissionHandshake): Uint8Array {
  const buffer = new Uint8Array(13);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.size, true);
  view.setUint16(4, msg.width, true);
  view.setUint16(6, msg.height, true);
  view.setUint16(8, msg.packets, true);
  buffer[10] = msg.type & 0xff;
  buffer[11] = msg.payload & 0xff;
  buffer[12] = msg.jpgQuality & 0xff;

  return buffer;
}

export function deserializeDataTransmissionHandshake(payload: Uint8Array): DataTransmissionHandshake {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    size: view.getUint32(0, true),
    width: view.getUint16(4, true),
    height: view.getUint16(6, true),
    packets: view.getUint16(8, true),
    type: payload[10],
    payload: payload[11],
    jpgQuality: payload[12],
  };
}