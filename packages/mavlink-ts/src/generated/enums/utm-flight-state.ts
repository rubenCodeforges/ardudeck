/**
 * Airborne status of UAS.
 */
export enum UtmFlightState {
  /** The flight state can't be determined. */
  UTM_FLIGHT_STATE_UNKNOWN = 1,
  /** UAS on ground. */
  UTM_FLIGHT_STATE_GROUND = 2,
  /** UAS airborne. */
  UTM_FLIGHT_STATE_AIRBORNE = 3,
  /** UAS is in an emergency flight state. */
  UTM_FLIGHT_STATE_EMERGENCY = 16,
  /** UAS has no active controls. */
  UTM_FLIGHT_STATE_NOCTRL = 32,
}

/** @deprecated Use UtmFlightState instead */
export const UTM_FLIGHT_STATE = UtmFlightState;