export enum GoproProtuneGain {
  /** ISO 400. */
  GOPRO_PROTUNE_GAIN_400 = 0,
  /** ISO 800 (Only Hero 4). */
  GOPRO_PROTUNE_GAIN_800 = 1,
  /** ISO 1600. */
  GOPRO_PROTUNE_GAIN_1600 = 2,
  /** ISO 3200 (Only Hero 4). */
  GOPRO_PROTUNE_GAIN_3200 = 3,
  /** ISO 6400. */
  GOPRO_PROTUNE_GAIN_6400 = 4,
}

/** @deprecated Use GoproProtuneGain instead */
export const GOPRO_PROTUNE_GAIN = GoproProtuneGain;