/**
 * The interval between messages for a particular MAVLink message ID.
        This message is sent in response to the MAV_CMD_REQUEST_MESSAGE command with param1=244 (this message) and param2=message_id (the id of the message for which the interval is required).
	It may also be sent in response to MAV_CMD_GET_MESSAGE_INTERVAL.
	This interface replaces DATA_STREAM.
 * Message ID: 244
 * CRC Extra: 95
 */
export interface MessageInterval {
  /** The ID of the requested MAVLink message. v1.0 is limited to 254 messages. */
  messageId: number;
  /** The interval between two messages. A value of -1 indicates this stream is disabled, 0 indicates it is not available, > 0 indicates the interval at which it is sent. (us) */
  intervalUs: number;
}

export const MESSAGE_INTERVAL_ID = 244;
export const MESSAGE_INTERVAL_CRC_EXTRA = 95;
export const MESSAGE_INTERVAL_MIN_LENGTH = 6;
export const MESSAGE_INTERVAL_MAX_LENGTH = 6;

export function serializeMessageInterval(msg: MessageInterval): Uint8Array {
  const buffer = new Uint8Array(6);
  const view = new DataView(buffer.buffer);

  view.setInt32(0, msg.intervalUs, true);
  view.setUint16(4, msg.messageId, true);

  return buffer;
}

export function deserializeMessageInterval(payload: Uint8Array): MessageInterval {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    intervalUs: view.getInt32(0, true),
    messageId: view.getUint16(4, true),
  };
}