/**
 * Modify the filter of what CAN messages to forward over the mavlink. This can be used to make CAN forwarding work well on low bandwidth links. The filtering is applied on bits 8 to 24 of the CAN id (2nd and 3rd bytes) which corresponds to the DroneCAN message ID for DroneCAN. Filters with more than 16 IDs can be constructed by sending multiple CAN_FILTER_MODIFY messages.
 * Message ID: 388
 * CRC Extra: 8
 */
export interface CanFilterModify {
  /** System ID. */
  targetSystem: number;
  /** Component ID. */
  targetComponent: number;
  /** bus number */
  bus: number;
  /** what operation to perform on the filter list. See CAN_FILTER_OP enum. */
  operation: number;
  /** number of IDs in filter list */
  numIds: number;
  /** filter IDs, length num_ids */
  ids: number[];
}

export const CAN_FILTER_MODIFY_ID = 388;
export const CAN_FILTER_MODIFY_CRC_EXTRA = 8;
export const CAN_FILTER_MODIFY_MIN_LENGTH = 37;
export const CAN_FILTER_MODIFY_MAX_LENGTH = 37;

export function serializeCanFilterModify(msg: CanFilterModify): Uint8Array {
  const buffer = new Uint8Array(37);
  const view = new DataView(buffer.buffer);

  // Array: ids
  for (let i = 0; i < 16; i++) {
    view.setUint16(0 + i * 2, msg.ids[i] ?? 0, true);
  }
  buffer[32] = msg.targetSystem & 0xff;
  buffer[33] = msg.targetComponent & 0xff;
  buffer[34] = msg.bus & 0xff;
  buffer[35] = msg.operation & 0xff;
  buffer[36] = msg.numIds & 0xff;

  return buffer;
}

export function deserializeCanFilterModify(payload: Uint8Array): CanFilterModify {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    ids: Array.from({ length: 16 }, (_, i) => view.getUint16(0 + i * 2, true)),
    targetSystem: payload[32],
    targetComponent: payload[33],
    bus: payload[34],
    operation: payload[35],
    numIds: payload[36],
  };
}