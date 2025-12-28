/**
 * Transceiver RF control flags for ADS-B transponder dynamic reports
 * @bitmask
 */
export enum UavionixAdsbOutRfSelect {
  UAVIONIX_ADSB_OUT_RF_SELECT_RX_ENABLED = 1,
  UAVIONIX_ADSB_OUT_RF_SELECT_TX_ENABLED = 2,
}

/** @deprecated Use UavionixAdsbOutRfSelect instead */
export const UAVIONIX_ADSB_OUT_RF_SELECT = UavionixAdsbOutRfSelect;