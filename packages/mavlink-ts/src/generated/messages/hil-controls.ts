/**
 * Sent from autopilot to simulation. Hardware in the loop control outputs
 * Message ID: 91
 * CRC Extra: 63
 */
export interface HilControls {
  /** Timestamp (UNIX Epoch time or time since system boot). The receiving end can infer timestamp format (since 1.1.1970 or since system boot) by checking for the magnitude of the number. (us) */
  timeUsec: bigint;
  /** Control output -1 .. 1 */
  rollAilerons: number;
  /** Control output -1 .. 1 */
  pitchElevator: number;
  /** Control output -1 .. 1 */
  yawRudder: number;
  /** Throttle 0 .. 1 */
  throttle: number;
  /** Aux 1, -1 .. 1 */
  aux1: number;
  /** Aux 2, -1 .. 1 */
  aux2: number;
  /** Aux 3, -1 .. 1 */
  aux3: number;
  /** Aux 4, -1 .. 1 */
  aux4: number;
  /** System mode. */
  mode: number;
  /** Navigation mode (MAV_NAV_MODE) */
  navMode: number;
}

export const HIL_CONTROLS_ID = 91;
export const HIL_CONTROLS_CRC_EXTRA = 63;
export const HIL_CONTROLS_MIN_LENGTH = 42;
export const HIL_CONTROLS_MAX_LENGTH = 42;

export function serializeHilControls(msg: HilControls): Uint8Array {
  const buffer = new Uint8Array(42);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.timeUsec), true);
  view.setFloat32(8, msg.rollAilerons, true);
  view.setFloat32(12, msg.pitchElevator, true);
  view.setFloat32(16, msg.yawRudder, true);
  view.setFloat32(20, msg.throttle, true);
  view.setFloat32(24, msg.aux1, true);
  view.setFloat32(28, msg.aux2, true);
  view.setFloat32(32, msg.aux3, true);
  view.setFloat32(36, msg.aux4, true);
  buffer[40] = msg.mode & 0xff;
  buffer[41] = msg.navMode & 0xff;

  return buffer;
}

export function deserializeHilControls(payload: Uint8Array): HilControls {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeUsec: view.getBigUint64(0, true),
    rollAilerons: view.getFloat32(8, true),
    pitchElevator: view.getFloat32(12, true),
    yawRudder: view.getFloat32(16, true),
    throttle: view.getFloat32(20, true),
    aux1: view.getFloat32(24, true),
    aux2: view.getFloat32(28, true),
    aux3: view.getFloat32(32, true),
    aux4: view.getFloat32(36, true),
    mode: payload[40],
    navMode: payload[41],
  };
}