/**
 * The current system altitude.
 * Message ID: 141
 * CRC Extra: 47
 */
export interface Altitude {
  /** Timestamp (UNIX Epoch time or time since system boot). The receiving end can infer timestamp format (since 1.1.1970 or since system boot) by checking for the magnitude of the number. (us) */
  timeUsec: bigint;
  /** This altitude measure is initialized on system boot and monotonic (it is never reset, but represents the local altitude change). The only guarantee on this field is that it will never be reset and is consistent within a flight. The recommended value for this field is the uncorrected barometric altitude at boot time. This altitude will also drift and vary between flights. (m) */
  altitudeMonotonic: number;
  /** This altitude measure is strictly above mean sea level and might be non-monotonic (it might reset on events like GPS lock or when a new QNH value is set). It should be the altitude to which global altitude waypoints are compared to. Note that it is *not* the GPS altitude, however, most GPS modules already output MSL by default and not the WGS84 altitude. (m) */
  altitudeAmsl: number;
  /** This is the local altitude in the local coordinate frame. It is not the altitude above home, but in reference to the coordinate origin (0, 0, 0). It is up-positive. (m) */
  altitudeLocal: number;
  /** This is the altitude above the home position. It resets on each change of the current home position. (m) */
  altitudeRelative: number;
  /** This is the altitude above terrain. It might be fed by a terrain database or an altimeter. Values smaller than -1000 should be interpreted as unknown. (m) */
  altitudeTerrain: number;
  /** This is not the altitude, but the clear space below the system according to the fused clearance estimate. It generally should max out at the maximum range of e.g. the laser altimeter. It is generally a moving target. A negative value indicates no measurement available. (m) */
  bottomClearance: number;
}

export const ALTITUDE_ID = 141;
export const ALTITUDE_CRC_EXTRA = 47;
export const ALTITUDE_MIN_LENGTH = 32;
export const ALTITUDE_MAX_LENGTH = 32;

export function serializeAltitude(msg: Altitude): Uint8Array {
  const buffer = new Uint8Array(32);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.timeUsec), true);
  view.setFloat32(8, msg.altitudeMonotonic, true);
  view.setFloat32(12, msg.altitudeAmsl, true);
  view.setFloat32(16, msg.altitudeLocal, true);
  view.setFloat32(20, msg.altitudeRelative, true);
  view.setFloat32(24, msg.altitudeTerrain, true);
  view.setFloat32(28, msg.bottomClearance, true);

  return buffer;
}

export function deserializeAltitude(payload: Uint8Array): Altitude {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeUsec: view.getBigUint64(0, true),
    altitudeMonotonic: view.getFloat32(8, true),
    altitudeAmsl: view.getFloat32(12, true),
    altitudeLocal: view.getFloat32(16, true),
    altitudeRelative: view.getFloat32(20, true),
    altitudeTerrain: view.getFloat32(24, true),
    bottomClearance: view.getFloat32(28, true),
  };
}