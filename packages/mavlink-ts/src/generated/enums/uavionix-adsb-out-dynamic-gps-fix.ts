/**
 * Status for ADS-B transponder dynamic input
 */
export enum UavionixAdsbOutDynamicGpsFix {
  UAVIONIX_ADSB_OUT_DYNAMIC_GPS_FIX_NONE_0 = 0,
  UAVIONIX_ADSB_OUT_DYNAMIC_GPS_FIX_NONE_1 = 1,
  UAVIONIX_ADSB_OUT_DYNAMIC_GPS_FIX_2D = 2,
  UAVIONIX_ADSB_OUT_DYNAMIC_GPS_FIX_3D = 3,
  UAVIONIX_ADSB_OUT_DYNAMIC_GPS_FIX_DGPS = 4,
  UAVIONIX_ADSB_OUT_DYNAMIC_GPS_FIX_RTK = 5,
}

/** @deprecated Use UavionixAdsbOutDynamicGpsFix instead */
export const UAVIONIX_ADSB_OUT_DYNAMIC_GPS_FIX = UavionixAdsbOutDynamicGpsFix;