/**
 * Status text message. These messages are printed in yellow in the COMM console of QGroundControl. WARNING: They consume quite some bandwidth, so use only for important status and error messages. If implemented wisely, these messages are buffered on the MCU and sent only at a limited rate (e.g. 10 Hz).
 * Message ID: 253
 * CRC Extra: 66
 */
export interface Statustext {
  /** Severity of status. Relies on the definitions within RFC-5424. */
  severity: number;
  /** Status text message, without null termination character */
  text: string;
  /** Unique (opaque) identifier for this statustext message.  May be used to reassemble a logical long-statustext message from a sequence of chunks.  A value of zero indicates this is the only chunk in the sequence and the message can be emitted immediately. */
  id: number;
  /** This chunk's sequence number; indexing is from zero.  Any null character in the text field is taken to mean this was the last chunk. */
  chunkSeq: number;
}

export const STATUSTEXT_ID = 253;
export const STATUSTEXT_CRC_EXTRA = 66;
export const STATUSTEXT_MIN_LENGTH = 54;
export const STATUSTEXT_MAX_LENGTH = 54;

export function serializeStatustext(msg: Statustext): Uint8Array {
  const buffer = new Uint8Array(54);
  const view = new DataView(buffer.buffer);

  view.setUint16(0, msg.id, true);
  buffer[2] = msg.severity & 0xff;
  // String: text
  const textBytes = new TextEncoder().encode(msg.text || '');
  buffer.set(textBytes.slice(0, 50), 3);
  buffer[53] = msg.chunkSeq & 0xff;

  return buffer;
}

export function deserializeStatustext(payload: Uint8Array): Statustext {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    id: view.getUint16(0, true),
    severity: payload[2],
    text: new TextDecoder().decode(payload.slice(3, 53)).replace(/\0.*$/, ''),
    chunkSeq: payload[53],
  };
}