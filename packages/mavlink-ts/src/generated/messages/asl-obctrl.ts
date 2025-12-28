/**
 * Off-board controls/commands for ASLUAVs
 * Message ID: 8008
 * CRC Extra: 234
 */
export interface AslObctrl {
  /** Time since system start (us) */
  timestamp: bigint;
  /** Elevator command [~] */
  uelev: number;
  /** Throttle command [~] */
  uthrot: number;
  /** Throttle 2 command [~] */
  uthrot2: number;
  /** Left aileron command [~] */
  uaill: number;
  /** Right aileron command [~] */
  uailr: number;
  /** Rudder command [~] */
  urud: number;
  /** Off-board computer status */
  obctrlStatus: number;
}

export const ASL_OBCTRL_ID = 8008;
export const ASL_OBCTRL_CRC_EXTRA = 234;
export const ASL_OBCTRL_MIN_LENGTH = 33;
export const ASL_OBCTRL_MAX_LENGTH = 33;

export function serializeAslObctrl(msg: AslObctrl): Uint8Array {
  const buffer = new Uint8Array(33);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.timestamp), true);
  view.setFloat32(8, msg.uelev, true);
  view.setFloat32(12, msg.uthrot, true);
  view.setFloat32(16, msg.uthrot2, true);
  view.setFloat32(20, msg.uaill, true);
  view.setFloat32(24, msg.uailr, true);
  view.setFloat32(28, msg.urud, true);
  buffer[32] = msg.obctrlStatus & 0xff;

  return buffer;
}

export function deserializeAslObctrl(payload: Uint8Array): AslObctrl {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timestamp: view.getBigUint64(0, true),
    uelev: view.getFloat32(8, true),
    uthrot: view.getFloat32(12, true),
    uthrot2: view.getFloat32(16, true),
    uaill: view.getFloat32(20, true),
    uailr: view.getFloat32(24, true),
    urud: view.getFloat32(28, true),
    obctrlStatus: payload[32],
  };
}