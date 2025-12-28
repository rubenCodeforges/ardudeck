/**
 * State flags for ADS-B transponder fault report
 * @bitmask
 */
export enum UavionixAdsbOutStatusFault {
  UAVIONIX_ADSB_OUT_STATUS_FAULT_STATUS_MESSAGE_UNAVAIL = 8,
  UAVIONIX_ADSB_OUT_STATUS_FAULT_GPS_NO_POS = 16,
  UAVIONIX_ADSB_OUT_STATUS_FAULT_GPS_UNAVAIL = 32,
  UAVIONIX_ADSB_OUT_STATUS_FAULT_TX_SYSTEM_FAIL = 64,
  UAVIONIX_ADSB_OUT_STATUS_FAULT_MAINT_REQ = 128,
}

/** @deprecated Use UavionixAdsbOutStatusFault instead */
export const UAVIONIX_ADSB_OUT_STATUS_FAULT = UavionixAdsbOutStatusFault;