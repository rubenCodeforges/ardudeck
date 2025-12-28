/**
 * The autopilot is requesting a resource (file, binary, other type of data)
 * Message ID: 142
 * CRC Extra: 72
 */
export interface ResourceRequest {
  /** Request ID. This ID should be reused when sending back URI contents */
  requestId: number;
  /** The type of requested URI. 0 = a file via URL. 1 = a UAVCAN binary */
  uriType: number;
  /** The requested unique resource identifier (URI). It is not necessarily a straight domain name (depends on the URI type enum) */
  uri: number[];
  /** The way the autopilot wants to receive the URI. 0 = MAVLink FTP. 1 = binary stream. */
  transferType: number;
  /** The storage path the autopilot wants the URI to be stored in. Will only be valid if the transfer_type has a storage associated (e.g. MAVLink FTP). */
  storage: number[];
}

export const RESOURCE_REQUEST_ID = 142;
export const RESOURCE_REQUEST_CRC_EXTRA = 72;
export const RESOURCE_REQUEST_MIN_LENGTH = 243;
export const RESOURCE_REQUEST_MAX_LENGTH = 243;

export function serializeResourceRequest(msg: ResourceRequest): Uint8Array {
  const buffer = new Uint8Array(243);
  const view = new DataView(buffer.buffer);

  buffer[0] = msg.requestId & 0xff;
  buffer[1] = msg.uriType & 0xff;
  // Array: uri
  for (let i = 0; i < 120; i++) {
    buffer[2 + i * 1] = msg.uri[i] ?? 0 & 0xff;
  }
  buffer[122] = msg.transferType & 0xff;
  // Array: storage
  for (let i = 0; i < 120; i++) {
    buffer[123 + i * 1] = msg.storage[i] ?? 0 & 0xff;
  }

  return buffer;
}

export function deserializeResourceRequest(payload: Uint8Array): ResourceRequest {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    requestId: payload[0],
    uriType: payload[1],
    uri: Array.from({ length: 120 }, (_, i) => payload[2 + i * 1]),
    transferType: payload[122],
    storage: Array.from({ length: 120 }, (_, i) => payload[123 + i * 1]),
  };
}