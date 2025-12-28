/**
 * Navigational status of AIS vessel, enum duplicated from AIS standard, https://gpsd.gitlab.io/gpsd/AIVDM.html
 */
export enum AisNavStatus {
  /** Under way using engine. */
  UNDER_WAY = 0,
  AIS_NAV_ANCHORED = 1,
  AIS_NAV_UN_COMMANDED = 2,
  AIS_NAV_RESTRICTED_MANOEUVERABILITY = 3,
  AIS_NAV_DRAUGHT_CONSTRAINED = 4,
  AIS_NAV_MOORED = 5,
  AIS_NAV_AGROUND = 6,
  AIS_NAV_FISHING = 7,
  AIS_NAV_SAILING = 8,
  AIS_NAV_RESERVED_HSC = 9,
  AIS_NAV_RESERVED_WIG = 10,
  AIS_NAV_RESERVED_1 = 11,
  AIS_NAV_RESERVED_2 = 12,
  AIS_NAV_RESERVED_3 = 13,
  /** Search And Rescue Transponder. */
  AIS_NAV_AIS_SART = 14,
  /** Not available (default). */
  AIS_NAV_UNKNOWN = 15,
}

/** @deprecated Use AisNavStatus instead */
export const AIS_NAV_STATUS = AisNavStatus;