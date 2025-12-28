/**
 * This message provides an API for manually controlling the vehicle using standard joystick axes nomenclature, along with a joystick-like input device. Unused axes can be disabled and buttons states are transmitted as individual on/off bits of a bitmask
 * Message ID: 69
 * CRC Extra: 14
 */
export interface ManualControl {
  /** The system to be controlled. */
  target: number;
  /** X-axis, normalized to the range [-1000,1000]. A value of INT16_MAX indicates that this axis is invalid. Generally corresponds to forward(1000)-backward(-1000) movement on a joystick and the pitch of a vehicle. */
  x: number;
  /** Y-axis, normalized to the range [-1000,1000]. A value of INT16_MAX indicates that this axis is invalid. Generally corresponds to left(-1000)-right(1000) movement on a joystick and the roll of a vehicle. */
  y: number;
  /** Z-axis, normalized to the range [-1000,1000]. A value of INT16_MAX indicates that this axis is invalid. Generally corresponds to a separate slider movement with maximum being 1000 and minimum being -1000 on a joystick and the thrust of a vehicle. Positive values are positive thrust, negative values are negative thrust. */
  z: number;
  /** R-axis, normalized to the range [-1000,1000]. A value of INT16_MAX indicates that this axis is invalid. Generally corresponds to a twisting of the joystick, with counter-clockwise being 1000 and clockwise being -1000, and the yaw of a vehicle. */
  r: number;
  /** A bitfield corresponding to the joystick buttons' current state, 1 for pressed, 0 for released. The lowest bit corresponds to Button 1. */
  buttons: number;
  /** A bitfield corresponding to the joystick buttons' 16-31 current state, 1 for pressed, 0 for released. The lowest bit corresponds to Button 16. */
  buttons2: number;
  /** Set bits to 1 to indicate which of the following extension fields contain valid data: bit 0: pitch, bit 1: roll, bit 2: aux1, bit 3: aux2, bit 4: aux3, bit 5: aux4, bit 6: aux5, bit 7: aux6 */
  enabledExtensions: number;
  /** Pitch-only-axis, normalized to the range [-1000,1000]. Generally corresponds to pitch on vehicles with additional degrees of freedom. Valid if bit 0 of enabled_extensions field is set. Set to 0 if invalid. */
  s: number;
  /** Roll-only-axis, normalized to the range [-1000,1000]. Generally corresponds to roll on vehicles with additional degrees of freedom. Valid if bit 1 of enabled_extensions field is set. Set to 0 if invalid. */
  t: number;
  /** Aux continuous input field 1. Normalized in the range [-1000,1000]. Purpose defined by recipient. Valid data if bit 2 of enabled_extensions field is set. 0 if bit 2 is unset. */
  aux1: number;
  /** Aux continuous input field 2. Normalized in the range [-1000,1000]. Purpose defined by recipient. Valid data if bit 3 of enabled_extensions field is set. 0 if bit 3 is unset. */
  aux2: number;
  /** Aux continuous input field 3. Normalized in the range [-1000,1000]. Purpose defined by recipient. Valid data if bit 4 of enabled_extensions field is set. 0 if bit 4 is unset. */
  aux3: number;
  /** Aux continuous input field 4. Normalized in the range [-1000,1000]. Purpose defined by recipient. Valid data if bit 5 of enabled_extensions field is set. 0 if bit 5 is unset. */
  aux4: number;
  /** Aux continuous input field 5. Normalized in the range [-1000,1000]. Purpose defined by recipient. Valid data if bit 6 of enabled_extensions field is set. 0 if bit 6 is unset. */
  aux5: number;
  /** Aux continuous input field 6. Normalized in the range [-1000,1000]. Purpose defined by recipient. Valid data if bit 7 of enabled_extensions field is set. 0 if bit 7 is unset. */
  aux6: number;
}

export const MANUAL_CONTROL_ID = 69;
export const MANUAL_CONTROL_CRC_EXTRA = 14;
export const MANUAL_CONTROL_MIN_LENGTH = 30;
export const MANUAL_CONTROL_MAX_LENGTH = 30;

export function serializeManualControl(msg: ManualControl): Uint8Array {
  const buffer = new Uint8Array(30);
  const view = new DataView(buffer.buffer);

  view.setInt16(0, msg.x, true);
  view.setInt16(2, msg.y, true);
  view.setInt16(4, msg.z, true);
  view.setInt16(6, msg.r, true);
  view.setUint16(8, msg.buttons, true);
  view.setUint16(10, msg.buttons2, true);
  view.setInt16(12, msg.s, true);
  view.setInt16(14, msg.t, true);
  view.setInt16(16, msg.aux1, true);
  view.setInt16(18, msg.aux2, true);
  view.setInt16(20, msg.aux3, true);
  view.setInt16(22, msg.aux4, true);
  view.setInt16(24, msg.aux5, true);
  view.setInt16(26, msg.aux6, true);
  buffer[28] = msg.target & 0xff;
  buffer[29] = msg.enabledExtensions & 0xff;

  return buffer;
}

export function deserializeManualControl(payload: Uint8Array): ManualControl {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    x: view.getInt16(0, true),
    y: view.getInt16(2, true),
    z: view.getInt16(4, true),
    r: view.getInt16(6, true),
    buttons: view.getUint16(8, true),
    buttons2: view.getUint16(10, true),
    s: view.getInt16(12, true),
    t: view.getInt16(14, true),
    aux1: view.getInt16(16, true),
    aux2: view.getInt16(18, true),
    aux3: view.getInt16(20, true),
    aux4: view.getInt16(22, true),
    aux5: view.getInt16(24, true),
    aux6: view.getInt16(26, true),
    target: payload[28],
    enabledExtensions: payload[29],
  };
}