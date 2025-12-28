/**
 * An OpenDroneID message pack is a container for multiple encoded OpenDroneID messages (i.e. not in the format given for the above message descriptions but after encoding into the compressed OpenDroneID byte format). Used e.g. when transmitting on Bluetooth 5.0 Long Range/Extended Advertising or on WiFi Neighbor Aware Networking or on WiFi Beacon.
 * Message ID: 12915
 * CRC Extra: 94
 */
export interface OpenDroneIdMessagePack {
  /** System ID (0 for broadcast). */
  targetSystem: number;
  /** Component ID (0 for broadcast). */
  targetComponent: number;
  /** Only used for drone ID data received from other UAs. See detailed description at https://mavlink.io/en/services/opendroneid.html. */
  idOrMac: number[];
  /** This field must currently always be equal to 25 (bytes), since all encoded OpenDroneID messages are specified to have this length. (bytes) */
  singleMessageSize: number;
  /** Number of encoded messages in the pack (not the number of bytes). Allowed range is 1 - 9. */
  msgPackSize: number;
  /** Concatenation of encoded OpenDroneID messages. Shall be filled with nulls in the unused portion of the field. */
  messages: number[];
}

export const OPEN_DRONE_ID_MESSAGE_PACK_ID = 12915;
export const OPEN_DRONE_ID_MESSAGE_PACK_CRC_EXTRA = 94;
export const OPEN_DRONE_ID_MESSAGE_PACK_MIN_LENGTH = 249;
export const OPEN_DRONE_ID_MESSAGE_PACK_MAX_LENGTH = 249;

export function serializeOpenDroneIdMessagePack(msg: OpenDroneIdMessagePack): Uint8Array {
  const buffer = new Uint8Array(249);
  const view = new DataView(buffer.buffer);

  buffer[0] = msg.targetSystem & 0xff;
  buffer[1] = msg.targetComponent & 0xff;
  // Array: id_or_mac
  for (let i = 0; i < 20; i++) {
    buffer[2 + i * 1] = msg.idOrMac[i] ?? 0 & 0xff;
  }
  buffer[22] = msg.singleMessageSize & 0xff;
  buffer[23] = msg.msgPackSize & 0xff;
  // Array: messages
  for (let i = 0; i < 225; i++) {
    buffer[24 + i * 1] = msg.messages[i] ?? 0 & 0xff;
  }

  return buffer;
}

export function deserializeOpenDroneIdMessagePack(payload: Uint8Array): OpenDroneIdMessagePack {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    targetSystem: payload[0],
    targetComponent: payload[1],
    idOrMac: Array.from({ length: 20 }, (_, i) => payload[2 + i * 1]),
    singleMessageSize: payload[22],
    msgPackSize: payload[23],
    messages: Array.from({ length: 225 }, (_, i) => payload[24 + i * 1]),
  };
}