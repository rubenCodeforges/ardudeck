/**
 * What the aircraft can do, translated into how a survey is flown.
 *
 * The planner needs two answers the map cannot give it, and planning usually
 * happens at a desk with nothing connected, so neither can be left to
 * detection alone:
 *
 *  - how it turns. A copter turns on the spot; a plane needs room. Plan a
 *    copter as a plane and it collects racetrack loops and end overshoots it
 *    never needed; plan a plane as a copter and it is handed corners it cannot
 *    fly, so it cuts them and the strip ends are missed.
 *  - how it leaves the ground and comes back, which is the one part of a VTOL
 *    flight that actually uses the lift motors.
 *
 * Both are stored on the survey and default to following whatever is
 * connected, so a planner at the desk can set them and a planner at the field
 * can ignore them.
 */

import type { ArduPilotVehicleClass } from '../../../shared/telemetry-types';
import { MAV_CMD } from '../../../shared/mission-types';
import type { CorridorMode } from './survey-types';

/** Airframe the survey is planned for; 'auto' follows the connected vehicle. */
export type SurveyAirframe = 'auto' | 'plane' | 'vtol' | 'copter';

/** How the mission starts and ends; 'auto' follows the airframe. */
export type SurveyLaunch = 'auto' | 'vertical' | 'runway';

export const AIRFRAME_OPTIONS: Array<{ id: SurveyAirframe; label: string; description: string }> = [
  { id: 'auto', label: 'Auto', description: 'Follow whatever vehicle is connected' },
  { id: 'plane', label: 'Fixed wing', description: 'Needs room to turn: overshoot and racetracks' },
  { id: 'vtol', label: 'VTOL', description: 'Surveys as a fixed wing; lift motors for takeoff and landing' },
  { id: 'copter', label: 'Multirotor', description: 'Turns on the spot: no overshoot' },
];

export const LAUNCH_OPTIONS: Array<{ id: SurveyLaunch; label: string; description: string }> = [
  { id: 'auto', label: 'Auto', description: 'Vertical for a VTOL, otherwise a normal takeoff and RTL' },
  { id: 'vertical', label: 'Vertical', description: 'VTOL takeoff, VTOL land at home' },
  { id: 'runway', label: 'Runway', description: 'Normal takeoff and return to launch' },
];

/** The airframe actually planned for, resolving 'auto' against the vehicle. */
export function resolveAirframe(
  airframe: SurveyAirframe | undefined,
  detected: ArduPilotVehicleClass | undefined,
): ArduPilotVehicleClass | undefined {
  if (airframe && airframe !== 'auto') return airframe;
  return detected;
}

/**
 * A VTOL plans as a plane. Operationally the lift motors are used for takeoff
 * and landing only, so every turn in the survey itself is a fixed-wing turn
 * and needs the same room.
 */
export function surveyModeForVehicle(vehicleClass: ArduPilotVehicleClass | undefined): CorridorMode {
  return vehicleClass === 'plane' || vehicleClass === 'vtol' ? 'plane' : 'copter';
}

/** Takeoff and return commands for the resolved airframe and launch choice. */
export function launchCommands(
  launch: SurveyLaunch | undefined,
  vehicleClass: ArduPilotVehicleClass | undefined,
): { takeoff: number; land: number } {
  const vertical = launch === 'vertical' || (launch !== 'runway' && vehicleClass === 'vtol');
  return vertical
    ? { takeoff: MAV_CMD.NAV_VTOL_TAKEOFF, land: MAV_CMD.NAV_VTOL_LAND }
    : { takeoff: MAV_CMD.NAV_TAKEOFF, land: MAV_CMD.NAV_RETURN_TO_LAUNCH };
}

/** Whether the mission opens with a takeoff, and whether it closes itself. */
export type SurveyStart = 'takeoff' | 'none';
export type SurveyFinish = 'rtl' | 'land' | 'none';

export const START_OPTIONS: Array<{ id: SurveyStart; label: string; description: string }> = [
  { id: 'takeoff', label: 'Takeoff', description: 'Mission opens with a takeoff to the survey altitude' },
  { id: 'none', label: 'None', description: 'Launch manually, then switch to Auto. Also what a follow-on survey needs' },
];

export const FINISH_OPTIONS: Array<{ id: SurveyFinish; label: string; description: string }> = [
  { id: 'rtl', label: 'RTL', description: 'Return to launch after the last line' },
  { id: 'land', label: 'Land', description: 'Land where the survey ends' },
  { id: 'none', label: 'None', description: 'Stop at the last line, so another survey or waypoint can follow' },
];

/** The command that opens the mission, or null when the pilot launches it. */
export function startCommand(
  start: SurveyStart | undefined,
  launch: SurveyLaunch | undefined,
  vehicleClass: ArduPilotVehicleClass | undefined,
): number | null {
  if (start === 'none') return null;
  return launchCommands(launch, vehicleClass).takeoff;
}

/**
 * The command that closes the mission, or null to end on the last line.
 *
 * RTL is one item whatever the airframe (a VTOL lands vertically on Q_RTL);
 * only an explicit Land has to pick between the two landing commands.
 */
export function finishCommand(
  finish: SurveyFinish | undefined,
  launch: SurveyLaunch | undefined,
  vehicleClass: ArduPilotVehicleClass | undefined,
): number | null {
  if (finish === 'none') return null;
  if (finish === 'land') {
    return launchCommands(launch, vehicleClass).takeoff === MAV_CMD.NAV_VTOL_TAKEOFF
      ? MAV_CMD.NAV_VTOL_LAND
      : MAV_CMD.NAV_LAND;
  }
  return MAV_CMD.NAV_RETURN_TO_LAUNCH;
}

/** How the detected aircraft is named in the planner. */
export function vehicleClassLabel(vehicleClass: ArduPilotVehicleClass | undefined): string {
  switch (vehicleClass) {
    case 'plane': return 'Fixed wing';
    case 'vtol': return 'VTOL';
    case 'copter': return 'Multirotor';
    case 'rover': return 'Ground vehicle';
    case 'sub': return 'Submarine';
    default: return 'Unknown';
  }
}

/** One line saying what the survey is planned for and what follows from it. */
export function vehiclePlanningNote(
  vehicleClass: ArduPilotVehicleClass | undefined,
  launch?: SurveyLaunch,
): string {
  if (vehicleClass === undefined) return 'No vehicle connected - pick an airframe to plan for';
  const turns = surveyModeForVehicle(vehicleClass) === 'plane'
    ? 'overshoot and racetracks at hairpins'
    : 'turns on the spot, no overshoot';
  const start = launchCommands(launch, vehicleClass).takeoff === MAV_CMD.NAV_VTOL_TAKEOFF
    ? 'vertical takeoff and landing'
    : 'normal takeoff, RTL home';
  return `${vehicleClassLabel(vehicleClass)}: ${turns} · ${start}`;
}
