/**
 * State flags for ADS-B transponder dynamic report
 * @bitmask
 */
export enum UavionixAdsbOutDynamicState {
  UAVIONIX_ADSB_OUT_DYNAMIC_STATE_INTENT_CHANGE = 1,
  UAVIONIX_ADSB_OUT_DYNAMIC_STATE_AUTOPILOT_ENABLED = 2,
  UAVIONIX_ADSB_OUT_DYNAMIC_STATE_NICBARO_CROSSCHECKED = 4,
  UAVIONIX_ADSB_OUT_DYNAMIC_STATE_ON_GROUND = 8,
  UAVIONIX_ADSB_OUT_DYNAMIC_STATE_IDENT = 16,
}

/** @deprecated Use UavionixAdsbOutDynamicState instead */
export const UAVIONIX_ADSB_OUT_DYNAMIC_STATE = UavionixAdsbOutDynamicState;