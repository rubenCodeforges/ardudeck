/**
 * A change to the sequence number indicates that the set of AVAILABLE_MODES has changed.
        A receiver must re-request all available modes whenever the sequence number changes.
        This is only emitted after the first change and should then be broadcast at low rate (nominally 0.3 Hz) and on change.
 * Message ID: 437
 * CRC Extra: 30
 */
export interface AvailableModesMonitor {
  /** Sequence number. The value iterates sequentially whenever AVAILABLE_MODES changes (e.g. support for a new mode is added/removed dynamically). */
  seq: number;
}

export const AVAILABLE_MODES_MONITOR_ID = 437;
export const AVAILABLE_MODES_MONITOR_CRC_EXTRA = 30;
export const AVAILABLE_MODES_MONITOR_MIN_LENGTH = 1;
export const AVAILABLE_MODES_MONITOR_MAX_LENGTH = 1;

export function serializeAvailableModesMonitor(msg: AvailableModesMonitor): Uint8Array {
  const buffer = new Uint8Array(1);
  const view = new DataView(buffer.buffer);

  buffer[0] = msg.seq & 0xff;

  return buffer;
}

export function deserializeAvailableModesMonitor(payload: Uint8Array): AvailableModesMonitor {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    seq: payload[0],
  };
}