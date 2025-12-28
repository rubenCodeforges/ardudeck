/**
 * GPS longitudinal offset encoding
 */
export enum UavionixAdsbOutCfgGpsOffsetLon {
  UAVIONIX_ADSB_OUT_CFG_GPS_OFFSET_LON_NO_DATA = 0,
  UAVIONIX_ADSB_OUT_CFG_GPS_OFFSET_LON_APPLIED_BY_SENSOR = 1,
}

/** @deprecated Use UavionixAdsbOutCfgGpsOffsetLon instead */
export const UAVIONIX_ADSB_OUT_CFG_GPS_OFFSET_LON = UavionixAdsbOutCfgGpsOffsetLon;