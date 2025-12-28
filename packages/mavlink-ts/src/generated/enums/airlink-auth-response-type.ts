export enum AirlinkAuthResponseType {
  /** Login or password error */
  AIRLINK_ERROR_LOGIN_OR_PASS = 0,
  /** Auth successful */
  AIRLINK_AUTH_OK = 1,
}

/** @deprecated Use AirlinkAuthResponseType instead */
export const AIRLINK_AUTH_RESPONSE_TYPE = AirlinkAuthResponseType;