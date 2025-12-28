export enum GoproProtuneWhiteBalance {
  /** Auto. */
  GOPRO_PROTUNE_WHITE_BALANCE_AUTO = 0,
  /** 3000K. */
  GOPRO_PROTUNE_WHITE_BALANCE_3000K = 1,
  /** 5500K. */
  GOPRO_PROTUNE_WHITE_BALANCE_5500K = 2,
  /** 6500K. */
  GOPRO_PROTUNE_WHITE_BALANCE_6500K = 3,
  /** Camera Raw. */
  GOPRO_PROTUNE_WHITE_BALANCE_RAW = 4,
}

/** @deprecated Use GoproProtuneWhiteBalance instead */
export const GOPRO_PROTUNE_WHITE_BALANCE = GoproProtuneWhiteBalance;