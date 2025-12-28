/**
 * Data for filling the OpenDroneID Operator ID message, which contains the CAA (Civil Aviation Authority) issued operator ID.
 * Message ID: 12905
 * CRC Extra: 49
 */
export interface OpenDroneIdOperatorId {
  /** System ID (0 for broadcast). */
  targetSystem: number;
  /** Component ID (0 for broadcast). */
  targetComponent: number;
  /** Only used for drone ID data received from other UAs. See detailed description at https://mavlink.io/en/services/opendroneid.html. */
  idOrMac: number[];
  /** Indicates the type of the operator_id field. */
  operatorIdType: number;
  /** Text description or numeric value expressed as ASCII characters. Shall be filled with nulls in the unused portion of the field. */
  operatorId: string;
}

export const OPEN_DRONE_ID_OPERATOR_ID_ID = 12905;
export const OPEN_DRONE_ID_OPERATOR_ID_CRC_EXTRA = 49;
export const OPEN_DRONE_ID_OPERATOR_ID_MIN_LENGTH = 43;
export const OPEN_DRONE_ID_OPERATOR_ID_MAX_LENGTH = 43;

export function serializeOpenDroneIdOperatorId(msg: OpenDroneIdOperatorId): Uint8Array {
  const buffer = new Uint8Array(43);
  const view = new DataView(buffer.buffer);

  buffer[0] = msg.targetSystem & 0xff;
  buffer[1] = msg.targetComponent & 0xff;
  // Array: id_or_mac
  for (let i = 0; i < 20; i++) {
    buffer[2 + i * 1] = msg.idOrMac[i] ?? 0 & 0xff;
  }
  buffer[22] = msg.operatorIdType & 0xff;
  // String: operator_id
  const operatorIdBytes = new TextEncoder().encode(msg.operatorId || '');
  buffer.set(operatorIdBytes.slice(0, 20), 23);

  return buffer;
}

export function deserializeOpenDroneIdOperatorId(payload: Uint8Array): OpenDroneIdOperatorId {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    targetSystem: payload[0],
    targetComponent: payload[1],
    idOrMac: Array.from({ length: 20 }, (_, i) => payload[2 + i * 1]),
    operatorIdType: payload[22],
    operatorId: new TextDecoder().decode(payload.slice(23, 43)).replace(/\0.*$/, ''),
  };
}