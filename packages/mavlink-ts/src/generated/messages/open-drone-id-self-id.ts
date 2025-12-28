/**
 * Data for filling the OpenDroneID Self ID message. The Self ID Message is an opportunity for the operator to (optionally) declare their identity and purpose of the flight. This message can provide additional information that could reduce the threat profile of a UA (Unmanned Aircraft) flying in a particular area or manner. This message can also be used to provide optional additional clarification in an emergency/remote ID system failure situation.
 * Message ID: 12903
 * CRC Extra: 249
 */
export interface OpenDroneIdSelfId {
  /** System ID (0 for broadcast). */
  targetSystem: number;
  /** Component ID (0 for broadcast). */
  targetComponent: number;
  /** Only used for drone ID data received from other UAs. See detailed description at https://mavlink.io/en/services/opendroneid.html. */
  idOrMac: number[];
  /** Indicates the type of the description field. */
  descriptionType: number;
  /** Text description or numeric value expressed as ASCII characters. Shall be filled with nulls in the unused portion of the field. */
  description: string;
}

export const OPEN_DRONE_ID_SELF_ID_ID = 12903;
export const OPEN_DRONE_ID_SELF_ID_CRC_EXTRA = 249;
export const OPEN_DRONE_ID_SELF_ID_MIN_LENGTH = 46;
export const OPEN_DRONE_ID_SELF_ID_MAX_LENGTH = 46;

export function serializeOpenDroneIdSelfId(msg: OpenDroneIdSelfId): Uint8Array {
  const buffer = new Uint8Array(46);
  const view = new DataView(buffer.buffer);

  buffer[0] = msg.targetSystem & 0xff;
  buffer[1] = msg.targetComponent & 0xff;
  // Array: id_or_mac
  for (let i = 0; i < 20; i++) {
    buffer[2 + i * 1] = msg.idOrMac[i] ?? 0 & 0xff;
  }
  buffer[22] = msg.descriptionType & 0xff;
  // String: description
  const descriptionBytes = new TextEncoder().encode(msg.description || '');
  buffer.set(descriptionBytes.slice(0, 23), 23);

  return buffer;
}

export function deserializeOpenDroneIdSelfId(payload: Uint8Array): OpenDroneIdSelfId {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    targetSystem: payload[0],
    targetComponent: payload[1],
    idOrMac: Array.from({ length: 20 }, (_, i) => payload[2 + i * 1]),
    descriptionType: payload[22],
    description: new TextDecoder().decode(payload.slice(23, 46)).replace(/\0.*$/, ''),
  };
}