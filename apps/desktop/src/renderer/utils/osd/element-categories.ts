/**
 * OSD Element Categories
 *
 * Defines the category groupings for OSD elements.
 * Used by the element browser for accordion organization.
 */

import { t } from '../../../shared/i18n/index.js';

export type OsdElementCategory =
  | 'general'
  | 'battery'
  | 'altitude'
  | 'speed'
  | 'gps'
  | 'attitude'
  | 'timers'
  | 'radio'
  | 'sensors'
  | 'mission';

export interface CategoryDefinition {
  id: OsdElementCategory;
  name: string;
  description: string;
}

export const ELEMENT_CATEGORIES: CategoryDefinition[] = [
  { id: 'general', name: 'General', description: 'Flight mode, warnings, craft info' }, // i18n-exempt
  { id: 'battery', name: 'Battery & Power', description: 'Voltage, current, capacity, efficiency' }, // i18n-exempt
  { id: 'altitude', name: 'Altitude & Vario', description: 'Altitude, MSL, variometer' }, // i18n-exempt
  { id: 'speed', name: 'Speed & Distance', description: 'Ground speed, airspeed, distance' }, // i18n-exempt
  { id: 'gps', name: 'GPS', description: 'Satellites, HDOP, coordinates' }, // i18n-exempt
  { id: 'attitude', name: 'Attitude', description: 'Crosshairs, horizon, pitch, roll, heading' }, // i18n-exempt
  { id: 'timers', name: 'Timers', description: 'Flight time, on time, remaining' }, // i18n-exempt
  { id: 'radio', name: 'Radio & Control', description: 'RSSI, throttle position' }, // i18n-exempt
  { id: 'sensors', name: 'Sensors', description: 'Temperature, G-force, ESC data' }, // i18n-exempt
  { id: 'mission', name: 'Mission', description: 'VTX, wind indicators' }, // i18n-exempt
];

export const CATEGORY_MAP = new Map<OsdElementCategory, CategoryDefinition>(
  ELEMENT_CATEGORIES.map((c) => [c.id, c])
);

export function osdCategoryName(category: Pick<CategoryDefinition, 'id' | 'name'>): string {
  return CATEGORY_MAP.has(category.id) ? t(`utils:osdCategories.${category.id}.name`) : category.name;
}

export function osdCategoryDescription(category: Pick<CategoryDefinition, 'id' | 'description'>): string {
  return CATEGORY_MAP.has(category.id) ? t(`utils:osdCategories.${category.id}.description`) : category.description;
}
