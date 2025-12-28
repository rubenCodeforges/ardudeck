/**
 * Information about the shot operation.
 * Message ID: 60020
 * CRC Extra: 202
 */
export interface QshotStatus {
  /** Current shot mode. */
  mode: number;
  /** Current state in the shot. States are specific to the selected shot mode. */
  shotState: number;
}

export const QSHOT_STATUS_ID = 60020;
export const QSHOT_STATUS_CRC_EXTRA = 202;
export const QSHOT_STATUS_MIN_LENGTH = 4;
export const QSHOT_STATUS_MAX_LENGTH = 4;

export function serializeQshotStatus(msg: QshotStatus): Uint8Array {
  const buffer = new Uint8Array(4);
  const view = new DataView(buffer.buffer);

  view.setUint16(0, msg.mode, true);
  view.setUint16(2, msg.shotState, true);

  return buffer;
}

export function deserializeQshotStatus(payload: Uint8Array): QshotStatus {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    mode: view.getUint16(0, true),
    shotState: view.getUint16(2, true),
  };
}