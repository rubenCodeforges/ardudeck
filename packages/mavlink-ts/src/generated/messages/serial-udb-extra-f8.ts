/**
 * Backwards compatible version of SERIAL_UDB_EXTRA F8: format
 * Message ID: 176
 * CRC Extra: 142
 */
export interface SerialUdbExtraF8 {
  /** Serial UDB Extra HEIGHT_TARGET_MAX */
  sueHeightTargetMax: number;
  /** Serial UDB Extra HEIGHT_TARGET_MIN */
  sueHeightTargetMin: number;
  /** Serial UDB Extra ALT_HOLD_THROTTLE_MIN */
  sueAltHoldThrottleMin: number;
  /** Serial UDB Extra ALT_HOLD_THROTTLE_MAX */
  sueAltHoldThrottleMax: number;
  /** Serial UDB Extra ALT_HOLD_PITCH_MIN */
  sueAltHoldPitchMin: number;
  /** Serial UDB Extra ALT_HOLD_PITCH_MAX */
  sueAltHoldPitchMax: number;
  /** Serial UDB Extra ALT_HOLD_PITCH_HIGH */
  sueAltHoldPitchHigh: number;
}

export const SERIAL_UDB_EXTRA_F8_ID = 176;
export const SERIAL_UDB_EXTRA_F8_CRC_EXTRA = 142;
export const SERIAL_UDB_EXTRA_F8_MIN_LENGTH = 28;
export const SERIAL_UDB_EXTRA_F8_MAX_LENGTH = 28;

export function serializeSerialUdbExtraF8(msg: SerialUdbExtraF8): Uint8Array {
  const buffer = new Uint8Array(28);
  const view = new DataView(buffer.buffer);

  view.setFloat32(0, msg.sueHeightTargetMax, true);
  view.setFloat32(4, msg.sueHeightTargetMin, true);
  view.setFloat32(8, msg.sueAltHoldThrottleMin, true);
  view.setFloat32(12, msg.sueAltHoldThrottleMax, true);
  view.setFloat32(16, msg.sueAltHoldPitchMin, true);
  view.setFloat32(20, msg.sueAltHoldPitchMax, true);
  view.setFloat32(24, msg.sueAltHoldPitchHigh, true);

  return buffer;
}

export function deserializeSerialUdbExtraF8(payload: Uint8Array): SerialUdbExtraF8 {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    sueHeightTargetMax: view.getFloat32(0, true),
    sueHeightTargetMin: view.getFloat32(4, true),
    sueAltHoldThrottleMin: view.getFloat32(8, true),
    sueAltHoldThrottleMax: view.getFloat32(12, true),
    sueAltHoldPitchMin: view.getFloat32(16, true),
    sueAltHoldPitchMax: view.getFloat32(20, true),
    sueAltHoldPitchHigh: view.getFloat32(24, true),
  };
}