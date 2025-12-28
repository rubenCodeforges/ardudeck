/**
 * ASL-fixed-wing controller data
 * Message ID: 8004
 * CRC Extra: 172
 */
export interface AslctrlData {
  /** Timestamp (us) */
  timestamp: bigint;
  /** ASLCTRL control-mode (manual, stabilized, auto, etc...) */
  aslctrlMode: number;
  /** See sourcecode for a description of these values... */
  h: number;
  href: number;
  hrefT: number;
  /** Pitch angle (deg) */
  pitchangle: number;
  /** Pitch angle reference (deg) */
  pitchangleref: number;
  q: number;
  qref: number;
  uelev: number;
  uthrot: number;
  uthrot2: number;
  nz: number;
  /** Airspeed reference (m/s) */
  airspeedref: number;
  spoilersengaged: number;
  /** Yaw angle (deg) */
  yawangle: number;
  /** Yaw angle reference (deg) */
  yawangleref: number;
  /** Roll angle (deg) */
  rollangle: number;
  /** Roll angle reference (deg) */
  rollangleref: number;
  p: number;
  pref: number;
  r: number;
  rref: number;
  uail: number;
  urud: number;
}

export const ASLCTRL_DATA_ID = 8004;
export const ASLCTRL_DATA_CRC_EXTRA = 172;
export const ASLCTRL_DATA_MIN_LENGTH = 98;
export const ASLCTRL_DATA_MAX_LENGTH = 98;

export function serializeAslctrlData(msg: AslctrlData): Uint8Array {
  const buffer = new Uint8Array(98);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.timestamp), true);
  view.setFloat32(8, msg.h, true);
  view.setFloat32(12, msg.href, true);
  view.setFloat32(16, msg.hrefT, true);
  view.setFloat32(20, msg.pitchangle, true);
  view.setFloat32(24, msg.pitchangleref, true);
  view.setFloat32(28, msg.q, true);
  view.setFloat32(32, msg.qref, true);
  view.setFloat32(36, msg.uelev, true);
  view.setFloat32(40, msg.uthrot, true);
  view.setFloat32(44, msg.uthrot2, true);
  view.setFloat32(48, msg.nz, true);
  view.setFloat32(52, msg.airspeedref, true);
  view.setFloat32(56, msg.yawangle, true);
  view.setFloat32(60, msg.yawangleref, true);
  view.setFloat32(64, msg.rollangle, true);
  view.setFloat32(68, msg.rollangleref, true);
  view.setFloat32(72, msg.p, true);
  view.setFloat32(76, msg.pref, true);
  view.setFloat32(80, msg.r, true);
  view.setFloat32(84, msg.rref, true);
  view.setFloat32(88, msg.uail, true);
  view.setFloat32(92, msg.urud, true);
  buffer[96] = msg.aslctrlMode & 0xff;
  buffer[97] = msg.spoilersengaged & 0xff;

  return buffer;
}

export function deserializeAslctrlData(payload: Uint8Array): AslctrlData {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timestamp: view.getBigUint64(0, true),
    h: view.getFloat32(8, true),
    href: view.getFloat32(12, true),
    hrefT: view.getFloat32(16, true),
    pitchangle: view.getFloat32(20, true),
    pitchangleref: view.getFloat32(24, true),
    q: view.getFloat32(28, true),
    qref: view.getFloat32(32, true),
    uelev: view.getFloat32(36, true),
    uthrot: view.getFloat32(40, true),
    uthrot2: view.getFloat32(44, true),
    nz: view.getFloat32(48, true),
    airspeedref: view.getFloat32(52, true),
    yawangle: view.getFloat32(56, true),
    yawangleref: view.getFloat32(60, true),
    rollangle: view.getFloat32(64, true),
    rollangleref: view.getFloat32(68, true),
    p: view.getFloat32(72, true),
    pref: view.getFloat32(76, true),
    r: view.getFloat32(80, true),
    rref: view.getFloat32(84, true),
    uail: view.getFloat32(88, true),
    urud: view.getFloat32(92, true),
    aslctrlMode: payload[96],
    spoilersengaged: payload[97],
  };
}