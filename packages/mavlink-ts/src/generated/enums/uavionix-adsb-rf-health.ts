/**
 * Status flags for ADS-B transponder dynamic output
 * @bitmask
 */
export enum UavionixAdsbRfHealth {
  UAVIONIX_ADSB_RF_HEALTH_OK = 1,
  UAVIONIX_ADSB_RF_HEALTH_FAIL_TX = 2,
  UAVIONIX_ADSB_RF_HEALTH_FAIL_RX = 16,
}

/** @deprecated Use UavionixAdsbRfHealth instead */
export const UAVIONIX_ADSB_RF_HEALTH = UavionixAdsbRfHealth;