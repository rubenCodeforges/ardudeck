export enum GsmLinkType {
  /** no service */
  GSM_LINK_TYPE_NONE = 0,
  /** link type unknown */
  GSM_LINK_TYPE_UNKNOWN = 1,
  /** 2G (GSM/GRPS/EDGE) link */
  GSM_LINK_TYPE_2G = 2,
  /** 3G link (WCDMA/HSDPA/HSPA) */
  GSM_LINK_TYPE_3G = 3,
  /** 4G link (LTE) */
  GSM_LINK_TYPE_4G = 4,
}

/** @deprecated Use GsmLinkType instead */
export const GSM_LINK_TYPE = GsmLinkType;