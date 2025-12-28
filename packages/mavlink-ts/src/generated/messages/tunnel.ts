/**
 * Message for transporting "arbitrary" variable-length data from one component to another (broadcast is not forbidden, but discouraged). The encoding of the data is usually extension specific, i.e. determined by the source, and is usually not documented as part of the MAVLink specification.
 * Message ID: 385
 * CRC Extra: 147
 */
export interface Tunnel {
  /** System ID (can be 0 for broadcast, but this is discouraged) */
  targetSystem: number;
  /** Component ID (can be 0 for broadcast, but this is discouraged) */
  targetComponent: number;
  /** A code that identifies the content of the payload (0 for unknown, which is the default). If this code is less than 32768, it is a 'registered' payload type and the corresponding code should be added to the MAV_TUNNEL_PAYLOAD_TYPE enum. Software creators can register blocks of types as needed. Codes greater than 32767 are considered local experiments and should not be checked in to any widely distributed codebase. */
  payloadType: number;
  /** Length of the data transported in payload */
  payloadLength: number;
  /** Variable length payload. The payload length is defined by payload_length. The entire content of this block is opaque unless you understand the encoding specified by payload_type. */
  payload: number[];
}

export const TUNNEL_ID = 385;
export const TUNNEL_CRC_EXTRA = 147;
export const TUNNEL_MIN_LENGTH = 133;
export const TUNNEL_MAX_LENGTH = 133;

export function serializeTunnel(msg: Tunnel): Uint8Array {
  const buffer = new Uint8Array(133);
  const view = new DataView(buffer.buffer);

  view.setUint16(0, msg.payloadType, true);
  buffer[2] = msg.targetSystem & 0xff;
  buffer[3] = msg.targetComponent & 0xff;
  buffer[4] = msg.payloadLength & 0xff;
  // Array: payload
  for (let i = 0; i < 128; i++) {
    buffer[5 + i * 1] = msg.payload[i] ?? 0 & 0xff;
  }

  return buffer;
}

export function deserializeTunnel(payload: Uint8Array): Tunnel {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    payloadType: view.getUint16(0, true),
    targetSystem: payload[2],
    targetComponent: payload[3],
    payloadLength: payload[4],
    payload: Array.from({ length: 128 }, (_, i) => payload[5 + i * 1]),
  };
}