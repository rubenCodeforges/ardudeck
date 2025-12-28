/**
 * Reply to LOG_REQUEST_LIST
 * Message ID: 118
 * CRC Extra: 56
 */
export interface LogEntry {
  /** Log id */
  id: number;
  /** Total number of logs */
  numLogs: number;
  /** High log number */
  lastLogNum: number;
  /** UTC timestamp of log since 1970, or 0 if not available (s) */
  timeUtc: number;
  /** Size of the log (may be approximate) (bytes) */
  size: number;
}

export const LOG_ENTRY_ID = 118;
export const LOG_ENTRY_CRC_EXTRA = 56;
export const LOG_ENTRY_MIN_LENGTH = 14;
export const LOG_ENTRY_MAX_LENGTH = 14;

export function serializeLogEntry(msg: LogEntry): Uint8Array {
  const buffer = new Uint8Array(14);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.timeUtc, true);
  view.setUint32(4, msg.size, true);
  view.setUint16(8, msg.id, true);
  view.setUint16(10, msg.numLogs, true);
  view.setUint16(12, msg.lastLogNum, true);

  return buffer;
}

export function deserializeLogEntry(payload: Uint8Array): LogEntry {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeUtc: view.getUint32(0, true),
    size: view.getUint32(4, true),
    id: view.getUint16(8, true),
    numLogs: view.getUint16(10, true),
    lastLogNum: view.getUint16(12, true),
  };
}