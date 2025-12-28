export enum MavOdidAuthType {
  /** No authentication type is specified. */
  MAV_ODID_AUTH_TYPE_NONE = 0,
  /** Signature for the UAS (Unmanned Aircraft System) ID. */
  MAV_ODID_AUTH_TYPE_UAS_ID_SIGNATURE = 1,
  /** Signature for the Operator ID. */
  MAV_ODID_AUTH_TYPE_OPERATOR_ID_SIGNATURE = 2,
  /** Signature for the entire message set. */
  MAV_ODID_AUTH_TYPE_MESSAGE_SET_SIGNATURE = 3,
  /** Authentication is provided by Network Remote ID. */
  MAV_ODID_AUTH_TYPE_NETWORK_REMOTE_ID = 4,
  /** The exact authentication type is indicated by the first byte of authentication_data and these type values are managed by ICAO. */
  MAV_ODID_AUTH_TYPE_SPECIFIC_AUTHENTICATION = 5,
}

/** @deprecated Use MavOdidAuthType instead */
export const MAV_ODID_AUTH_TYPE = MavOdidAuthType;