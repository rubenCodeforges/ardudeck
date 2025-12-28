/**
 * Request a list of available logs. On some systems calling this may stop on-board logging until LOG_REQUEST_END is called. If there are no log files available this request shall be answered with one LOG_ENTRY message with id = 0 and num_logs = 0.
 * Message ID: 117
 * CRC Extra: 128
 */
export interface LogRequestList {
  /** System ID */
  targetSystem: number;
  /** Component ID */
  targetComponent: number;
  /** First log id (0 for first available) */
  start: number;
  /** Last log id (0xffff for last available) */
  end: number;
}

export const LOG_REQUEST_LIST_ID = 117;
export const LOG_REQUEST_LIST_CRC_EXTRA = 128;
export const LOG_REQUEST_LIST_MIN_LENGTH = 6;
export const LOG_REQUEST_LIST_MAX_LENGTH = 6;

export function serializeLogRequestList(msg: LogRequestList): Uint8Array {
  const buffer = new Uint8Array(6);
  const view = new DataView(buffer.buffer);

  view.setUint16(0, msg.start, true);
  view.setUint16(2, msg.end, true);
  buffer[4] = msg.targetSystem & 0xff;
  buffer[5] = msg.targetComponent & 0xff;

  return buffer;
}

export function deserializeLogRequestList(payload: Uint8Array): LogRequestList {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    start: view.getUint16(0, true),
    end: view.getUint16(2, true),
    targetSystem: payload[4],
    targetComponent: payload[5],
  };
}