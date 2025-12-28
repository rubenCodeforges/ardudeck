/**
 * Metrics typically displayed on a HUD for fixed wing aircraft.
 * Message ID: 74
 * CRC Extra: 20
 */
export interface VfrHud {
  /** Vehicle speed in form appropriate for vehicle type. For standard aircraft this is typically calibrated airspeed (CAS) or indicated airspeed (IAS) - either of which can be used by a pilot to estimate stall speed. (m/s) */
  airspeed: number;
  /** Current ground speed. (m/s) */
  groundspeed: number;
  /** Current heading in compass units (0-360, 0=north). (deg) */
  heading: number;
  /** Current throttle setting (0 to 100). (%) */
  throttle: number;
  /** Current altitude (MSL). (m) */
  alt: number;
  /** Current climb rate. (m/s) */
  climb: number;
}

export const VFR_HUD_ID = 74;
export const VFR_HUD_CRC_EXTRA = 20;
export const VFR_HUD_MIN_LENGTH = 20;
export const VFR_HUD_MAX_LENGTH = 20;

export function serializeVfrHud(msg: VfrHud): Uint8Array {
  const buffer = new Uint8Array(20);
  const view = new DataView(buffer.buffer);

  view.setFloat32(0, msg.airspeed, true);
  view.setFloat32(4, msg.groundspeed, true);
  view.setFloat32(8, msg.alt, true);
  view.setFloat32(12, msg.climb, true);
  view.setInt16(16, msg.heading, true);
  view.setUint16(18, msg.throttle, true);

  return buffer;
}

export function deserializeVfrHud(payload: Uint8Array): VfrHud {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    airspeed: view.getFloat32(0, true),
    groundspeed: view.getFloat32(4, true),
    alt: view.getFloat32(8, true),
    climb: view.getFloat32(12, true),
    heading: view.getInt16(16, true),
    throttle: view.getUint16(18, true),
  };
}