/**
 * Enumeration of the ADSB altimeter types
 */
export enum AdsbAltitudeType {
  /** Altitude reported from a Baro source using QNH reference */
  ADSB_ALTITUDE_TYPE_PRESSURE_QNH = 0,
  /** Altitude reported from a GNSS source */
  ADSB_ALTITUDE_TYPE_GEOMETRIC = 1,
}

/** @deprecated Use AdsbAltitudeType instead */
export const ADSB_ALTITUDE_TYPE = AdsbAltitudeType;