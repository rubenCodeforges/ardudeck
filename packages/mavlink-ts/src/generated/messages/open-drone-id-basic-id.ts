/**
 * Data for filling the OpenDroneID Basic ID message. This and the below messages are primarily meant for feeding data to/from an OpenDroneID implementation. E.g. https://github.com/opendroneid/opendroneid-core-c. These messages are compatible with the ASTM F3411 Remote ID standard and the ASD-STAN prEN 4709-002 Direct Remote ID standard. Additional information and usage of these messages is documented at https://mavlink.io/en/services/opendroneid.html.
 * Message ID: 12900
 * CRC Extra: 114
 */
export interface OpenDroneIdBasicId {
  /** System ID (0 for broadcast). */
  targetSystem: number;
  /** Component ID (0 for broadcast). */
  targetComponent: number;
  /** Only used for drone ID data received from other UAs. See detailed description at https://mavlink.io/en/services/opendroneid.html. */
  idOrMac: number[];
  /** Indicates the format for the uas_id field of this message. */
  idType: number;
  /** Indicates the type of UA (Unmanned Aircraft). */
  uaType: number;
  /** UAS (Unmanned Aircraft System) ID following the format specified by id_type. Shall be filled with nulls in the unused portion of the field. */
  uasId: number[];
}

export const OPEN_DRONE_ID_BASIC_ID_ID = 12900;
export const OPEN_DRONE_ID_BASIC_ID_CRC_EXTRA = 114;
export const OPEN_DRONE_ID_BASIC_ID_MIN_LENGTH = 44;
export const OPEN_DRONE_ID_BASIC_ID_MAX_LENGTH = 44;

export function serializeOpenDroneIdBasicId(msg: OpenDroneIdBasicId): Uint8Array {
  const buffer = new Uint8Array(44);
  const view = new DataView(buffer.buffer);

  buffer[0] = msg.targetSystem & 0xff;
  buffer[1] = msg.targetComponent & 0xff;
  // Array: id_or_mac
  for (let i = 0; i < 20; i++) {
    buffer[2 + i * 1] = msg.idOrMac[i] ?? 0 & 0xff;
  }
  buffer[22] = msg.idType & 0xff;
  buffer[23] = msg.uaType & 0xff;
  // Array: uas_id
  for (let i = 0; i < 20; i++) {
    buffer[24 + i * 1] = msg.uasId[i] ?? 0 & 0xff;
  }

  return buffer;
}

export function deserializeOpenDroneIdBasicId(payload: Uint8Array): OpenDroneIdBasicId {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    targetSystem: payload[0],
    targetComponent: payload[1],
    idOrMac: Array.from({ length: 20 }, (_, i) => payload[2 + i * 1]),
    idType: payload[22],
    uaType: payload[23],
    uasId: Array.from({ length: 20 }, (_, i) => payload[24 + i * 1]),
  };
}