/**
 * Get information about a particular flight modes.
        The message can be enumerated or requested for a particular mode using MAV_CMD_REQUEST_MESSAGE.
        Specify 0 in param2 to request that the message is emitted for all available modes or the specific index for just one mode.
        The modes must be available/settable for the current vehicle/frame type.
        Each modes should only be emitted once (even if it is both standard and custom).
 * Message ID: 435
 * CRC Extra: 134
 */
export interface AvailableModes {
  /** The total number of available modes for the current vehicle type. */
  numberModes: number;
  /** The current mode index within number_modes, indexed from 1. */
  modeIndex: number;
  /** Standard mode. */
  standardMode: number;
  /** A bitfield for use for autopilot-specific flags */
  customMode: number;
  /** Mode properties. */
  properties: number;
  /** Name of custom mode, with null termination character. Should be omitted for standard modes. */
  modeName: string;
}

export const AVAILABLE_MODES_ID = 435;
export const AVAILABLE_MODES_CRC_EXTRA = 134;
export const AVAILABLE_MODES_MIN_LENGTH = 46;
export const AVAILABLE_MODES_MAX_LENGTH = 46;

export function serializeAvailableModes(msg: AvailableModes): Uint8Array {
  const buffer = new Uint8Array(46);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.customMode, true);
  view.setUint32(4, msg.properties, true);
  buffer[8] = msg.numberModes & 0xff;
  buffer[9] = msg.modeIndex & 0xff;
  buffer[10] = msg.standardMode & 0xff;
  // String: mode_name
  const modeNameBytes = new TextEncoder().encode(msg.modeName || '');
  buffer.set(modeNameBytes.slice(0, 35), 11);

  return buffer;
}

export function deserializeAvailableModes(payload: Uint8Array): AvailableModes {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    customMode: view.getUint32(0, true),
    properties: view.getUint32(4, true),
    numberModes: payload[8],
    modeIndex: payload[9],
    standardMode: payload[10],
    modeName: new TextDecoder().decode(payload.slice(11, 46)).replace(/\0.*$/, ''),
  };
}