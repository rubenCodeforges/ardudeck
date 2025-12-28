/**
 * Message implementing parts of the V2 payload specs in V1 frames for transitional support.
 * Message ID: 248
 * CRC Extra: 8
 */
export interface V2Extension {
  /** Network ID (0 for broadcast) */
  targetNetwork: number;
  /** System ID (0 for broadcast) */
  targetSystem: number;
  /** Component ID (0 for broadcast) */
  targetComponent: number;
  /** A code that identifies the software component that understands this message (analogous to USB device classes or mime type strings). If this code is less than 32768, it is considered a 'registered' protocol extension and the corresponding entry should be added to https://github.com/mavlink/mavlink/definition_files/extension_message_ids.xml. Software creators can register blocks of message IDs as needed (useful for GCS specific metadata, etc...). Message_types greater than 32767 are considered local experiments and should not be checked in to any widely distributed codebase. */
  messageType: number;
  /** Variable length payload. The length must be encoded in the payload as part of the message_type protocol, e.g. by including the length as payload data, or by terminating the payload data with a non-zero marker. This is required in order to reconstruct zero-terminated payloads that are (or otherwise would be) trimmed by MAVLink 2 empty-byte truncation. The entire content of the payload block is opaque unless you understand the encoding message_type. The particular encoding used can be extension specific and might not always be documented as part of the MAVLink specification. */
  payload: number[];
}

export const V2_EXTENSION_ID = 248;
export const V2_EXTENSION_CRC_EXTRA = 8;
export const V2_EXTENSION_MIN_LENGTH = 254;
export const V2_EXTENSION_MAX_LENGTH = 254;

export function serializeV2Extension(msg: V2Extension): Uint8Array {
  const buffer = new Uint8Array(254);
  const view = new DataView(buffer.buffer);

  view.setUint16(0, msg.messageType, true);
  buffer[2] = msg.targetNetwork & 0xff;
  buffer[3] = msg.targetSystem & 0xff;
  buffer[4] = msg.targetComponent & 0xff;
  // Array: payload
  for (let i = 0; i < 249; i++) {
    buffer[5 + i * 1] = msg.payload[i] ?? 0 & 0xff;
  }

  return buffer;
}

export function deserializeV2Extension(payload: Uint8Array): V2Extension {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    messageType: view.getUint16(0, true),
    targetNetwork: payload[2],
    targetSystem: payload[3],
    targetComponent: payload[4],
    payload: Array.from({ length: 249 }, (_, i) => payload[5 + i * 1]),
  };
}