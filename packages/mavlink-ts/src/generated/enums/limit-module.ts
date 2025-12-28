export enum LimitModule {
  /** Pre-initialization. */
  LIMIT_GPSLOCK = 1,
  /** Disabled. */
  LIMIT_GEOFENCE = 2,
  /** Checking limits. */
  LIMIT_ALTITUDE = 4,
}

/** @deprecated Use LimitModule instead */
export const LIMIT_MODULE = LimitModule;