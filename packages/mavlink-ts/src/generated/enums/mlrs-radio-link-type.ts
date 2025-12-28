/**
 * RADIO_LINK_TYPE enum.
 */
export enum MlrsRadioLinkType {
  /** Unknown radio link type. */
  MLRS_RADIO_LINK_TYPE_GENERIC = 0,
  /** Radio link is HereLink. */
  MLRS_RADIO_LINK_TYPE_HERELINK = 1,
  /** Radio link is Dragon Link. */
  MLRS_RADIO_LINK_TYPE_DRAGONLINK = 2,
  /** Radio link is RFD900. */
  MLRS_RADIO_LINK_TYPE_RFD900 = 3,
  /** Radio link is Crossfire. */
  MLRS_RADIO_LINK_TYPE_CROSSFIRE = 4,
  /** Radio link is ExpressLRS. */
  MLRS_RADIO_LINK_TYPE_EXPRESSLRS = 5,
  /** Radio link is mLRS. */
  MLRS_RADIO_LINK_TYPE_MLRS = 6,
}

/** @deprecated Use MlrsRadioLinkType instead */
export const MLRS_RADIO_LINK_TYPE = MlrsRadioLinkType;