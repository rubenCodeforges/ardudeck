export enum MavOdidUaType {
  /** No UA (Unmanned Aircraft) type defined. */
  MAV_ODID_UA_TYPE_NONE = 0,
  /** Aeroplane/Airplane. Fixed wing. */
  MAV_ODID_UA_TYPE_AEROPLANE = 1,
  /** Helicopter or multirotor. */
  MAV_ODID_UA_TYPE_HELICOPTER_OR_MULTIROTOR = 2,
  /** Gyroplane. */
  MAV_ODID_UA_TYPE_GYROPLANE = 3,
  /** VTOL (Vertical Take-Off and Landing). Fixed wing aircraft that can take off vertically. */
  MAV_ODID_UA_TYPE_HYBRID_LIFT = 4,
  /** Ornithopter. */
  MAV_ODID_UA_TYPE_ORNITHOPTER = 5,
  /** Glider. */
  MAV_ODID_UA_TYPE_GLIDER = 6,
  /** Kite. */
  MAV_ODID_UA_TYPE_KITE = 7,
  /** Free Balloon. */
  MAV_ODID_UA_TYPE_FREE_BALLOON = 8,
  /** Captive Balloon. */
  MAV_ODID_UA_TYPE_CAPTIVE_BALLOON = 9,
  /** Airship. E.g. a blimp. */
  MAV_ODID_UA_TYPE_AIRSHIP = 10,
  /** Free Fall/Parachute (unpowered). */
  MAV_ODID_UA_TYPE_FREE_FALL_PARACHUTE = 11,
  /** Rocket. */
  MAV_ODID_UA_TYPE_ROCKET = 12,
  /** Tethered powered aircraft. */
  MAV_ODID_UA_TYPE_TETHERED_POWERED_AIRCRAFT = 13,
  /** Ground Obstacle. */
  MAV_ODID_UA_TYPE_GROUND_OBSTACLE = 14,
  /** Other type of aircraft not listed earlier. */
  MAV_ODID_UA_TYPE_OTHER = 15,
}

/** @deprecated Use MavOdidUaType instead */
export const MAV_ODID_UA_TYPE = MavOdidUaType;