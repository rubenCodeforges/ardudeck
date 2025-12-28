/**
 * Micro air vehicle / autopilot classes. This identifies the individual model.
 */
export enum MavAutopilot {
  /** Generic autopilot, full support for everything */
  MAV_AUTOPILOT_GENERIC = 0,
  /** Reserved for future use. */
  MAV_AUTOPILOT_RESERVED = 1,
  /** SLUGS autopilot, http://slugsuav.soe.ucsc.edu */
  MAV_AUTOPILOT_SLUGS = 2,
  /** ArduPilot - Plane/Copter/Rover/Sub/Tracker, https://ardupilot.org */
  MAV_AUTOPILOT_ARDUPILOTMEGA = 3,
  /** OpenPilot, http://openpilot.org */
  MAV_AUTOPILOT_OPENPILOT = 4,
  /** Generic autopilot only supporting simple waypoints */
  MAV_AUTOPILOT_GENERIC_WAYPOINTS_ONLY = 5,
  /** Generic autopilot supporting waypoints and other simple navigation commands */
  MAV_AUTOPILOT_GENERIC_WAYPOINTS_AND_SIMPLE_NAVIGATION_ONLY = 6,
  /** Generic autopilot supporting the full mission command set */
  MAV_AUTOPILOT_GENERIC_MISSION_FULL = 7,
  /** No valid autopilot, e.g. a GCS or other MAVLink component */
  MAV_AUTOPILOT_INVALID = 8,
  /** PPZ UAV - http://nongnu.org/paparazzi */
  MAV_AUTOPILOT_PPZ = 9,
  /** UAV Dev Board */
  MAV_AUTOPILOT_UDB = 10,
  /** FlexiPilot */
  MAV_AUTOPILOT_FP = 11,
  /** PX4 Autopilot - http://px4.io/ */
  MAV_AUTOPILOT_PX4 = 12,
  /** SMACCMPilot - http://smaccmpilot.org */
  MAV_AUTOPILOT_SMACCMPILOT = 13,
  /** AutoQuad -- http://autoquad.org */
  MAV_AUTOPILOT_AUTOQUAD = 14,
  /** Armazila -- http://armazila.com */
  MAV_AUTOPILOT_ARMAZILA = 15,
  /** Aerob -- http://aerob.ru */
  MAV_AUTOPILOT_AEROB = 16,
  /** ASLUAV autopilot -- http://www.asl.ethz.ch */
  MAV_AUTOPILOT_ASLUAV = 17,
  /** SmartAP Autopilot - http://sky-drones.com */
  MAV_AUTOPILOT_SMARTAP = 18,
  /** AirRails - http://uaventure.com */
  MAV_AUTOPILOT_AIRRAILS = 19,
  /** Fusion Reflex - https://fusion.engineering */
  MAV_AUTOPILOT_REFLEX = 20,
}

/** @deprecated Use MavAutopilot instead */
export const MAV_AUTOPILOT = MavAutopilot;