/**
 * Kinematic multi bands (track) output from Daidalus
 * Message ID: 42001
 * CRC Extra: 239
 */
export interface IcarousKinematicBands {
  /** Number of track bands */
  numbands: number;
  /** See the TRACK_BAND_TYPES enum. */
  type1: number;
  /** min angle (degrees) (deg) */
  min1: number;
  /** max angle (degrees) (deg) */
  max1: number;
  /** See the TRACK_BAND_TYPES enum. */
  type2: number;
  /** min angle (degrees) (deg) */
  min2: number;
  /** max angle (degrees) (deg) */
  max2: number;
  /** See the TRACK_BAND_TYPES enum. */
  type3: number;
  /** min angle (degrees) (deg) */
  min3: number;
  /** max angle (degrees) (deg) */
  max3: number;
  /** See the TRACK_BAND_TYPES enum. */
  type4: number;
  /** min angle (degrees) (deg) */
  min4: number;
  /** max angle (degrees) (deg) */
  max4: number;
  /** See the TRACK_BAND_TYPES enum. */
  type5: number;
  /** min angle (degrees) (deg) */
  min5: number;
  /** max angle (degrees) (deg) */
  max5: number;
}

export const ICAROUS_KINEMATIC_BANDS_ID = 42001;
export const ICAROUS_KINEMATIC_BANDS_CRC_EXTRA = 239;
export const ICAROUS_KINEMATIC_BANDS_MIN_LENGTH = 46;
export const ICAROUS_KINEMATIC_BANDS_MAX_LENGTH = 46;

export function serializeIcarousKinematicBands(msg: IcarousKinematicBands): Uint8Array {
  const buffer = new Uint8Array(46);
  const view = new DataView(buffer.buffer);

  view.setFloat32(0, msg.min1, true);
  view.setFloat32(4, msg.max1, true);
  view.setFloat32(8, msg.min2, true);
  view.setFloat32(12, msg.max2, true);
  view.setFloat32(16, msg.min3, true);
  view.setFloat32(20, msg.max3, true);
  view.setFloat32(24, msg.min4, true);
  view.setFloat32(28, msg.max4, true);
  view.setFloat32(32, msg.min5, true);
  view.setFloat32(36, msg.max5, true);
  view.setInt8(40, msg.numbands);
  buffer[41] = msg.type1 & 0xff;
  buffer[42] = msg.type2 & 0xff;
  buffer[43] = msg.type3 & 0xff;
  buffer[44] = msg.type4 & 0xff;
  buffer[45] = msg.type5 & 0xff;

  return buffer;
}

export function deserializeIcarousKinematicBands(payload: Uint8Array): IcarousKinematicBands {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    min1: view.getFloat32(0, true),
    max1: view.getFloat32(4, true),
    min2: view.getFloat32(8, true),
    max2: view.getFloat32(12, true),
    min3: view.getFloat32(16, true),
    max3: view.getFloat32(20, true),
    min4: view.getFloat32(24, true),
    max4: view.getFloat32(28, true),
    min5: view.getFloat32(32, true),
    max5: view.getFloat32(36, true),
    numbands: view.getInt8(40),
    type1: payload[41],
    type2: payload[42],
    type3: payload[43],
    type4: payload[44],
    type5: payload[45],
  };
}