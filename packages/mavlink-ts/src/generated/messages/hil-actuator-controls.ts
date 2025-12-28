/**
 * Sent from autopilot to simulation. Hardware in the loop control outputs (replacement for HIL_CONTROLS)
 * Message ID: 93
 * CRC Extra: 47
 */
export interface HilActuatorControls {
  /** Timestamp (UNIX Epoch time or time since system boot). The receiving end can infer timestamp format (since 1.1.1970 or since system boot) by checking for the magnitude of the number. (us) */
  timeUsec: bigint;
  /** Control outputs -1 .. 1. Channel assignment depends on the simulated hardware. */
  controls: number[];
  /** System mode. Includes arming state. */
  mode: number;
  /** Flags as bitfield, 1: indicate simulation using lockstep. */
  flags: bigint;
}

export const HIL_ACTUATOR_CONTROLS_ID = 93;
export const HIL_ACTUATOR_CONTROLS_CRC_EXTRA = 47;
export const HIL_ACTUATOR_CONTROLS_MIN_LENGTH = 81;
export const HIL_ACTUATOR_CONTROLS_MAX_LENGTH = 81;

export function serializeHilActuatorControls(msg: HilActuatorControls): Uint8Array {
  const buffer = new Uint8Array(81);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.timeUsec), true);
  view.setBigUint64(8, BigInt(msg.flags), true);
  // Array: controls
  for (let i = 0; i < 16; i++) {
    view.setFloat32(16 + i * 4, msg.controls[i] ?? 0, true);
  }
  buffer[80] = msg.mode & 0xff;

  return buffer;
}

export function deserializeHilActuatorControls(payload: Uint8Array): HilActuatorControls {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeUsec: view.getBigUint64(0, true),
    flags: view.getBigUint64(8, true),
    controls: Array.from({ length: 16 }, (_, i) => view.getFloat32(16 + i * 4, true)),
    mode: payload[80],
  };
}