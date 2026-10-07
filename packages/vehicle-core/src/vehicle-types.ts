/**
 * MAV_TYPE knowledge shared by the ArduDeck app and ArduDeck OS: which
 * heartbeats represent a controllable vehicle.
 */

// Vehicle type names (from MAV_TYPE enum)
export const VEHICLE_NAMES: Record<number, string> = {
  0: 'Generic',
  1: 'Fixed Wing',
  2: 'Quadrotor',
  3: 'Coaxial',
  4: 'Helicopter',
  5: 'Antenna Tracker',
  6: 'GCS',
  7: 'Airship',
  8: 'Free Balloon',
  9: 'Rocket',
  10: 'Ground Rover',
  11: 'Surface Boat',
  12: 'Submarine',
  13: 'Hexarotor',
  14: 'Octorotor',
  15: 'Tricopter',
  16: 'Flapping Wing',
  17: 'Kite',
  18: 'Onboard Companion',
  19: 'VTOL Tailsitter Duo',
  20: 'VTOL Tailsitter Quad',
  21: 'VTOL Tiltrotor',
  22: 'VTOL Fixed-rotor',
  23: 'VTOL Tailsitter',
  24: 'VTOL Tiltwing',
  25: 'VTOL Reserved5',
  26: 'Gimbal',
  27: 'ADSB',
  28: 'Parafoil',
  29: 'Dodecarotor',
  30: 'Camera',
  31: 'Charging Station',
  32: 'FLARM',
  33: 'Servo',
  34: 'ODID',
  35: 'Decarotor',
  36: 'Battery',
  37: 'Parachute',
  38: 'Log',
  39: 'OSD',
  40: 'IMU',
  41: 'GPS',
  42: 'Winch',
};

// Non-vehicle MAV_TYPE values that should be ignored for heartbeat/telemetry
// These are peripheral components (companion computers, cameras, gimbals, etc.)
// that send their own heartbeats but don't represent the actual vehicle
export const NON_VEHICLE_TYPES = new Set([
  5,  // Antenna Tracker
  6,  // GCS
  18, // Onboard Companion
  26, // Gimbal
  27, // ADSB
  30, // Camera
  31, // Charging Station
  32, // FLARM
  33, // Servo
  34, // ODID
  36, // Battery
  37, // Parachute
  38, // Log
  39, // OSD
  40, // IMU
  41, // GPS
  42, // Winch
]);

// A heartbeat only identifies a controllable vehicle when its MAV_TYPE is one
// we know, its autopilot field is a real flight stack (radios, gimbals and GCS
// software mark themselves MAV_AUTOPILOT_INVALID), and it doesn't come from
// the telemetry-radio component id that SiK/mLRS/ELRS radios use. Unknown
// MAV_TYPEs are rejected because ghost heartbeats from stream misalignment
// carry arbitrary type bytes (seen live: a phantom "type 193" vehicle from an
// ELRS link that hijacked the primary connection and the fleet list).
const MAV_AUTOPILOT_INVALID = 8;
const MAV_COMP_ID_TELEMETRY_RADIO = 68;
export function isVehicleHeartbeat(vehicleType: number, autopilot: number, compid: number): boolean {
  return (
    !NON_VEHICLE_TYPES.has(vehicleType) &&
    VEHICLE_NAMES[vehicleType] !== undefined &&
    autopilot !== MAV_AUTOPILOT_INVALID &&
    compid !== MAV_COMP_ID_TELEMETRY_RADIO
  );
}
