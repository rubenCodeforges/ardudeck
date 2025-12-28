/**
 * The state of the navigation and position controller.
 * Message ID: 62
 * CRC Extra: 183
 */
export interface NavControllerOutput {
  /** Current desired roll (deg) */
  navRoll: number;
  /** Current desired pitch (deg) */
  navPitch: number;
  /** Current desired heading (deg) */
  navBearing: number;
  /** Bearing to current waypoint/target (deg) */
  targetBearing: number;
  /** Distance to active waypoint (m) */
  wpDist: number;
  /** Current altitude error (m) */
  altError: number;
  /** Current airspeed error (m/s) */
  aspdError: number;
  /** Current crosstrack error on x-y plane (m) */
  xtrackError: number;
}

export const NAV_CONTROLLER_OUTPUT_ID = 62;
export const NAV_CONTROLLER_OUTPUT_CRC_EXTRA = 183;
export const NAV_CONTROLLER_OUTPUT_MIN_LENGTH = 26;
export const NAV_CONTROLLER_OUTPUT_MAX_LENGTH = 26;

export function serializeNavControllerOutput(msg: NavControllerOutput): Uint8Array {
  const buffer = new Uint8Array(26);
  const view = new DataView(buffer.buffer);

  view.setFloat32(0, msg.navRoll, true);
  view.setFloat32(4, msg.navPitch, true);
  view.setFloat32(8, msg.altError, true);
  view.setFloat32(12, msg.aspdError, true);
  view.setFloat32(16, msg.xtrackError, true);
  view.setInt16(20, msg.navBearing, true);
  view.setInt16(22, msg.targetBearing, true);
  view.setUint16(24, msg.wpDist, true);

  return buffer;
}

export function deserializeNavControllerOutput(payload: Uint8Array): NavControllerOutput {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    navRoll: view.getFloat32(0, true),
    navPitch: view.getFloat32(4, true),
    altError: view.getFloat32(8, true),
    aspdError: view.getFloat32(12, true),
    xtrackError: view.getFloat32(16, true),
    navBearing: view.getInt16(20, true),
    targetBearing: view.getInt16(22, true),
    wpDist: view.getUint16(24, true),
  };
}