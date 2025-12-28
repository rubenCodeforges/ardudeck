/**
 * MAVLINK component type reported in HEARTBEAT message. Flight controllers must report the type of the vehicle on which they are mounted (e.g. MAV_TYPE_OCTOROTOR). All other components must report a value appropriate for their type (e.g. a camera must use MAV_TYPE_CAMERA).
 */
export enum MavType {
  /** Generic micro air vehicle */
  MAV_TYPE_GENERIC = 0,
  /** Fixed wing aircraft. */
  MAV_TYPE_FIXED_WING = 1,
  /** Quadrotor */
  MAV_TYPE_QUADROTOR = 2,
  /** Coaxial helicopter */
  MAV_TYPE_COAXIAL = 3,
  /** Normal helicopter with tail rotor. */
  MAV_TYPE_HELICOPTER = 4,
  /** Ground installation */
  MAV_TYPE_ANTENNA_TRACKER = 5,
  /** Operator control unit / ground control station */
  MAV_TYPE_GCS = 6,
  /** Airship, controlled */
  MAV_TYPE_AIRSHIP = 7,
  /** Free balloon, uncontrolled */
  MAV_TYPE_FREE_BALLOON = 8,
  /** Rocket */
  MAV_TYPE_ROCKET = 9,
  /** Ground rover */
  MAV_TYPE_GROUND_ROVER = 10,
  /** Surface vessel, boat, ship */
  MAV_TYPE_SURFACE_BOAT = 11,
  /** Submarine */
  MAV_TYPE_SUBMARINE = 12,
  /** Hexarotor */
  MAV_TYPE_HEXAROTOR = 13,
  /** Octorotor */
  MAV_TYPE_OCTOROTOR = 14,
  /** Tricopter */
  MAV_TYPE_TRICOPTER = 15,
  /** Flapping wing */
  MAV_TYPE_FLAPPING_WING = 16,
  /** Kite */
  MAV_TYPE_KITE = 17,
  /** Onboard companion controller */
  MAV_TYPE_ONBOARD_CONTROLLER = 18,
  /** Two-rotor VTOL using control surfaces in vertical operation in addition. Tailsitter. */
  MAV_TYPE_VTOL_DUOROTOR = 19,
  /** Quad-rotor VTOL using a V-shaped quad config in vertical operation. Tailsitter. */
  MAV_TYPE_VTOL_QUADROTOR = 20,
  /** Tiltrotor VTOL */
  MAV_TYPE_VTOL_TILTROTOR = 21,
  /** VTOL reserved 2 */
  MAV_TYPE_VTOL_RESERVED2 = 22,
  /** VTOL reserved 3 */
  MAV_TYPE_VTOL_RESERVED3 = 23,
  /** VTOL reserved 4 */
  MAV_TYPE_VTOL_RESERVED4 = 24,
  /** VTOL reserved 5 */
  MAV_TYPE_VTOL_RESERVED5 = 25,
  /** Gimbal */
  MAV_TYPE_GIMBAL = 26,
  /** ADSB system */
  MAV_TYPE_ADSB = 27,
  /** Steerable, nonrigid airfoil */
  MAV_TYPE_PARAFOIL = 28,
  /** Dodecarotor */
  MAV_TYPE_DODECAROTOR = 29,
  /** Camera */
  MAV_TYPE_CAMERA = 30,
  /** Charging station */
  MAV_TYPE_CHARGING_STATION = 31,
  /** FLARM collision avoidance system */
  MAV_TYPE_FLARM = 32,
  /** Servo */
  MAV_TYPE_SERVO = 33,
  /** Open Drone ID. See https://mavlink.io/en/services/opendroneid.html. */
  MAV_TYPE_ODID = 34,
  /** Decarotor */
  MAV_TYPE_DECAROTOR = 35,
  /** Battery */
  MAV_TYPE_BATTERY = 36,
  /** Parachute */
  MAV_TYPE_PARACHUTE = 37,
  /** Log */
  MAV_TYPE_LOG = 38,
  /** OSD */
  MAV_TYPE_OSD = 39,
  /** IMU */
  MAV_TYPE_IMU = 40,
  /** GPS */
  MAV_TYPE_GPS = 41,
  /** Winch */
  MAV_TYPE_WINCH = 42,
  /** Generic multirotor that does not fit into a specific type or whose type is unknown */
  MAV_TYPE_GENERIC_MULTIROTOR = 43,
  /** Illuminator. An illuminator is a light source that is used for lighting up dark areas external to the system: e.g. a torch or searchlight (as opposed to a light source for illuminating the system itself, e.g. an indicator light). */
  MAV_TYPE_ILLUMINATOR = 44,
  /** Orbiter spacecraft. Includes satellites orbiting terrestrial and extra-terrestrial bodies. Follows NASA Spacecraft Classification. */
  MAV_TYPE_SPACECRAFT_ORBITER = 45,
  /** A generic four-legged ground vehicle (e.g., a robot dog). */
  MAV_TYPE_GROUND_QUADRUPED = 46,
  /** VTOL hybrid of helicopter and autogyro. It has a main rotor for lift and separate propellers for forward flight. The rotor must be powered for hover but can autorotate in cruise flight. See: https://en.wikipedia.org/wiki/Gyrodyne */
  MAV_TYPE_VTOL_GYRODYNE = 47,
  /** Gripper */
  MAV_TYPE_GRIPPER = 48,
}

/** @deprecated Use MavType instead */
export const MAV_TYPE = MavType;