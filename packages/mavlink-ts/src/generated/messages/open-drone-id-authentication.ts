/**
 * Data for filling the OpenDroneID Authentication message. The Authentication Message defines a field that can provide a means of authenticity for the identity of the UAS (Unmanned Aircraft System). The Authentication message can have two different formats. For data page 0, the fields PageCount, Length and TimeStamp are present and AuthData is only 17 bytes. For data page 1 through 15, PageCount, Length and TimeStamp are not present and the size of AuthData is 23 bytes.
 * Message ID: 12902
 * CRC Extra: 140
 */
export interface OpenDroneIdAuthentication {
  /** System ID (0 for broadcast). */
  targetSystem: number;
  /** Component ID (0 for broadcast). */
  targetComponent: number;
  /** Only used for drone ID data received from other UAs. See detailed description at https://mavlink.io/en/services/opendroneid.html. */
  idOrMac: number[];
  /** Indicates the type of authentication. */
  authenticationType: number;
  /** Allowed range is 0 - 15. */
  dataPage: number;
  /** This field is only present for page 0. Allowed range is 0 - 15. See the description of struct ODID_Auth_data at https://github.com/opendroneid/opendroneid-core-c/blob/master/libopendroneid/opendroneid.h. */
  lastPageIndex: number;
  /** This field is only present for page 0. Total bytes of authentication_data from all data pages. See the description of struct ODID_Auth_data at https://github.com/opendroneid/opendroneid-core-c/blob/master/libopendroneid/opendroneid.h. (bytes) */
  length: number;
  /** This field is only present for page 0. 32 bit Unix Timestamp in seconds since 00:00:00 01/01/2019. (s) */
  timestamp: number;
  /** Opaque authentication data. For page 0, the size is only 17 bytes. For other pages, the size is 23 bytes. Shall be filled with nulls in the unused portion of the field. */
  authenticationData: number[];
}

export const OPEN_DRONE_ID_AUTHENTICATION_ID = 12902;
export const OPEN_DRONE_ID_AUTHENTICATION_CRC_EXTRA = 140;
export const OPEN_DRONE_ID_AUTHENTICATION_MIN_LENGTH = 53;
export const OPEN_DRONE_ID_AUTHENTICATION_MAX_LENGTH = 53;

export function serializeOpenDroneIdAuthentication(msg: OpenDroneIdAuthentication): Uint8Array {
  const buffer = new Uint8Array(53);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.timestamp, true);
  buffer[4] = msg.targetSystem & 0xff;
  buffer[5] = msg.targetComponent & 0xff;
  // Array: id_or_mac
  for (let i = 0; i < 20; i++) {
    buffer[6 + i * 1] = msg.idOrMac[i] ?? 0 & 0xff;
  }
  buffer[26] = msg.authenticationType & 0xff;
  buffer[27] = msg.dataPage & 0xff;
  buffer[28] = msg.lastPageIndex & 0xff;
  buffer[29] = msg.length & 0xff;
  // Array: authentication_data
  for (let i = 0; i < 23; i++) {
    buffer[30 + i * 1] = msg.authenticationData[i] ?? 0 & 0xff;
  }

  return buffer;
}

export function deserializeOpenDroneIdAuthentication(payload: Uint8Array): OpenDroneIdAuthentication {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timestamp: view.getUint32(0, true),
    targetSystem: payload[4],
    targetComponent: payload[5],
    idOrMac: Array.from({ length: 20 }, (_, i) => payload[6 + i * 1]),
    authenticationType: payload[26],
    dataPage: payload[27],
    lastPageIndex: payload[28],
    length: payload[29],
    authenticationData: Array.from({ length: 23 }, (_, i) => payload[30 + i * 1]),
  };
}