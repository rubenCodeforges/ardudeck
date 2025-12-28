/**
 * RC type
 */
export enum RcType {
  /** Spektrum DSM2 */
  RC_TYPE_SPEKTRUM_DSM2 = 0,
  /** Spektrum DSMX */
  RC_TYPE_SPEKTRUM_DSMX = 1,
}

/** @deprecated Use RcType instead */
export const RC_TYPE = RcType;