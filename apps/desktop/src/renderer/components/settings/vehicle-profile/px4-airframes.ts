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
  descriptionKey: string;
}

export const PX4_AIRFRAME_CATEGORIES: Array<{ id: Px4AirframeCategory; labelKey: string }> = [
  { id: 'multirotor', labelKey: 'common:multirotor' },
  { id: 'fixed-wing', labelKey: 'common:fixedWing' },
  { id: 'vtol', labelKey: 'settings:px4Airframes.vtol' },
  { id: 'rover', labelKey: 'common:rover' },
];

export const PX4_AIRFRAMES: Px4Airframe[] = [
  // Multirotor (well-known generic ids)
  { id: 4001, name: 'Generic Quadcopter (X)', category: 'multirotor', descriptionKey: 'settings:px4Airframes.description.4001' }, // i18n-exempt: PX4 airframe name
  { id: 4002, name: 'Generic Quadcopter (+)', category: 'multirotor', descriptionKey: 'settings:px4Airframes.description.4002' }, // i18n-exempt: PX4 airframe name
  { id: 4008, name: 'Generic Quadcopter (Wide)', category: 'multirotor', descriptionKey: 'settings:px4Airframes.description.4008' }, // i18n-exempt: PX4 airframe name
  { id: 6001, name: 'Generic Hexarotor (X)', category: 'multirotor', descriptionKey: 'settings:px4Airframes.description.6001' }, // i18n-exempt: PX4 airframe name
  { id: 6002, name: 'Generic Hexarotor (+)', category: 'multirotor', descriptionKey: 'settings:px4Airframes.description.6002' }, // i18n-exempt: PX4 airframe name
  { id: 8001, name: 'Generic Octorotor (X)', category: 'multirotor', descriptionKey: 'settings:px4Airframes.description.8001' }, // i18n-exempt: PX4 airframe name
  { id: 8002, name: 'Generic Octorotor (+)', category: 'multirotor', descriptionKey: 'settings:px4Airframes.description.8002' }, // i18n-exempt: PX4 airframe name

  // Fixed wing
  { id: 2100, name: 'Generic Standard Plane', category: 'fixed-wing', descriptionKey: 'settings:px4Airframes.description.2100' }, // i18n-exempt: PX4 airframe name
  { id: 3000, name: 'Generic Flying Wing', category: 'fixed-wing', descriptionKey: 'settings:px4Airframes.description.3000' }, // i18n-exempt: PX4 airframe name

  // VTOL (use generic ids; confirm against the PX4 reference)
  { id: 13000, name: 'Generic Standard VTOL', category: 'vtol', descriptionKey: 'settings:px4Airframes.description.13000' }, // i18n-exempt: PX4 airframe name
  { id: 13200, name: 'Generic Quad Tailsitter VTOL', category: 'vtol', descriptionKey: 'settings:px4Airframes.description.13200' }, // i18n-exempt: PX4 airframe name
  { id: 14001, name: 'Generic Tiltrotor VTOL', category: 'vtol', descriptionKey: 'settings:px4Airframes.description.14001' }, // i18n-exempt: PX4 airframe name

  // Rover
  { id: 50000, name: 'Generic Ground Vehicle', category: 'rover', descriptionKey: 'settings:px4Airframes.description.50000' }, // i18n-exempt: PX4 airframe name
];
