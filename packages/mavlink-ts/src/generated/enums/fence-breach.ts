export enum FenceBreach {
  /** No last fence breach */
  FENCE_BREACH_NONE = 0,
  /** Breached minimum altitude */
  FENCE_BREACH_MINALT = 1,
  /** Breached maximum altitude */
  FENCE_BREACH_MAXALT = 2,
  /** Breached fence boundary */
  FENCE_BREACH_BOUNDARY = 3,
}

/** @deprecated Use FenceBreach instead */
export const FENCE_BREACH = FenceBreach;