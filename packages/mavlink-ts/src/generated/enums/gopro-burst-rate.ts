export enum GoproBurstRate {
  /** 3 Shots / 1 Second. */
  GOPRO_BURST_RATE_3_IN_1_SECOND = 0,
  /** 5 Shots / 1 Second. */
  GOPRO_BURST_RATE_5_IN_1_SECOND = 1,
  /** 10 Shots / 1 Second. */
  GOPRO_BURST_RATE_10_IN_1_SECOND = 2,
  /** 10 Shots / 2 Second. */
  GOPRO_BURST_RATE_10_IN_2_SECOND = 3,
  /** 10 Shots / 3 Second (Hero 4 Only). */
  GOPRO_BURST_RATE_10_IN_3_SECOND = 4,
  /** 30 Shots / 1 Second. */
  GOPRO_BURST_RATE_30_IN_1_SECOND = 5,
  /** 30 Shots / 2 Second. */
  GOPRO_BURST_RATE_30_IN_2_SECOND = 6,
  /** 30 Shots / 3 Second. */
  GOPRO_BURST_RATE_30_IN_3_SECOND = 7,
  /** 30 Shots / 6 Second. */
  GOPRO_BURST_RATE_30_IN_6_SECOND = 8,
}

/** @deprecated Use GoproBurstRate instead */
export const GOPRO_BURST_RATE = GoproBurstRate;