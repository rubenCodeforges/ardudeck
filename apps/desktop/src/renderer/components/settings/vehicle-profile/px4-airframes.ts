/**
 * Curated catalog of common PX4 airframes for the airframe picker.
 *
 * PX4 selects an airframe with a single integer parameter, SYS_AUTOSTART (the
 * "auto-start script index"), then requires a reboot. PX4's full airframe DB is
 * large and version-dependent; this is a deliberately small, hand-checked
 * subset of well-known generic ids rather than an import of the whole DB.
 *
 * The ids below are the standard PX4 generic SYS_AUTOSTART values. They should
 * be confirmed against the PX4 airframe reference for a given firmware version:
 * https://docs.px4.io/main/en/airframes/airframe_reference.html
 */

export type Px4AirframeCategory = 'multirotor' | 'fixed-wing' | 'vtol' | 'rover';

export interface Px4Airframe {
  /** SYS_AUTOSTART id. */
  id: number;
  name: string;
  category: Px4AirframeCategory;
  description: string;
}

export const PX4_AIRFRAME_CATEGORIES: Array<{ id: Px4AirframeCategory; label: string }> = [
  { id: 'multirotor', label: 'Multirotor' },
  { id: 'fixed-wing', label: 'Fixed Wing' },
  { id: 'vtol', label: 'VTOL' },
  { id: 'rover', label: 'Rover' },
];

export const PX4_AIRFRAMES: Px4Airframe[] = [
  // Multirotor (well-known generic ids)
  { id: 4001, name: 'Generic Quadcopter (X)', category: 'multirotor', description: 'Standard quad in X layout.' },
  { id: 4002, name: 'Generic Quadcopter (+)', category: 'multirotor', description: 'Standard quad in + layout.' },
  { id: 4008, name: 'Generic Quadcopter (Wide)', category: 'multirotor', description: 'Quad X with widened arm geometry.' },
  { id: 6001, name: 'Generic Hexarotor (X)', category: 'multirotor', description: 'Standard hexa in X layout.' },
  { id: 6002, name: 'Generic Hexarotor (+)', category: 'multirotor', description: 'Standard hexa in + layout.' },
  { id: 8001, name: 'Generic Octorotor (X)', category: 'multirotor', description: 'Standard octo in X layout.' },
  { id: 8002, name: 'Generic Octorotor (+)', category: 'multirotor', description: 'Standard octo in + layout.' },

  // Fixed wing
  { id: 2100, name: 'Generic Standard Plane', category: 'fixed-wing', description: 'Conventional fixed-wing aircraft.' },
  { id: 3000, name: 'Generic Flying Wing', category: 'fixed-wing', description: 'Tailless flying wing / delta.' },

  // VTOL (use generic ids; confirm against the PX4 reference)
  { id: 13000, name: 'Generic Standard VTOL', category: 'vtol', description: 'Quad + pusher standard VTOL.' },
  { id: 13200, name: 'Generic Quad Tailsitter VTOL', category: 'vtol', description: 'Quad-motor tailsitter VTOL.' },
  { id: 14001, name: 'Generic Tiltrotor VTOL', category: 'vtol', description: 'Tiltrotor VTOL.' },

  // Rover
  { id: 50000, name: 'Generic Ground Vehicle', category: 'rover', description: 'Differential / Ackermann ground rover.' },
];
