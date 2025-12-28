/**
 * The heartbeat message shows that a system or component is present and responding. The type and autopilot fields (along with the message component id), allow the receiving system to treat further messages from this system appropriately (e.g. by laying out the user interface based on the autopilot). This microservice is documented at https://mavlink.io/en/services/heartbeat.html
 * Message ID: 0
 * CRC Extra: 239
 */
export interface Heartbeat {
  /** Vehicle or component type. For a flight controller component the vehicle type (quadrotor, helicopter, etc.). For other components the component type (e.g. camera, gimbal, etc.). This should be used in preference to component id for identifying the component type. */
  type: number;
  /** Autopilot type / class. Use MAV_AUTOPILOT_INVALID for components that are not flight controllers. */
  autopilot: number;
  /** System mode bitmap. */
  baseMode: number;
  /** A bitfield for use for autopilot-specific flags */
  customMode: number;
  /** System status flag. */
  systemStatus: number;
  /** MAVLink version, not writable by user, gets added by protocol because of magic data type: uint8_t_mavlink_version */
  mavlinkVersion: number;
}

export const HEARTBEAT_ID = 0;
export const HEARTBEAT_CRC_EXTRA = 239;
export const HEARTBEAT_MIN_LENGTH = 9;
export const HEARTBEAT_MAX_LENGTH = 9;

export function serializeHeartbeat(msg: Heartbeat): Uint8Array {
  const buffer = new Uint8Array(9);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.customMode, true);
  buffer[4] = msg.type & 0xff;
  buffer[5] = msg.autopilot & 0xff;
  buffer[6] = msg.baseMode & 0xff;
  buffer[7] = msg.systemStatus & 0xff;
  buffer[8] = msg.mavlinkVersion & 0xff;

  return buffer;
}

export function deserializeHeartbeat(payload: Uint8Array): Heartbeat {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    customMode: view.getUint32(0, true),
    type: payload[4],
    autopilot: payload[5],
    baseMode: payload[6],
    systemStatus: payload[7],
    mavlinkVersion: payload[8],
  };
}