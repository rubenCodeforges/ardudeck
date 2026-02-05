/**
 * OSD Element Categories
 *
 * Defines the category groupings for OSD elements.
 * Used by the element browser for accordion organization.
 */

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
  { id: 'general', name: 'General', description: 'Flight mode, warnings, craft info' },
  { id: 'battery', name: 'Battery & Power', description: 'Voltage, current, capacity, efficiency' },
  { id: 'altitude', name: 'Altitude & Vario', description: 'Altitude, MSL, variometer' },
  { id: 'speed', name: 'Speed & Distance', description: 'Ground speed, airspeed, distance' },
  { id: 'gps', name: 'GPS', description: 'Satellites, HDOP, coordinates' },
  { id: 'attitude', name: 'Attitude', description: 'Crosshairs, horizon, pitch, roll, heading' },
  { id: 'timers', name: 'Timers', description: 'Flight time, on time, remaining' },
  { id: 'radio', name: 'Radio & Control', description: 'RSSI, throttle position' },
  { id: 'sensors', name: 'Sensors', description: 'Temperature, G-force, ESC data' },
  { id: 'mission', name: 'Mission', description: 'CCRP, VTX, wind indicators' },
];

export const CATEGORY_MAP = new Map<OsdElementCategory, CategoryDefinition>(
  ELEMENT_CATEGORIES.map((c) => [c.id, c])
);
