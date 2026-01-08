/**
 * OSD Element Size Definitions
 *
 * Defines the width and height (in characters) for each OSD element.
 * Used by the configurator to draw overlay boxes and check bounds.
 */

import type { OsdElementId } from '../../stores/osd-store';

export interface ElementSize {
  width: number; // characters wide
  height: number; // characters tall
}

/**
 * Size of each OSD element in character units
 */
export const OSD_ELEMENT_SIZES: Record<OsdElementId, ElementSize> = {
  // Standard telemetry elements
  altitude: { width: 6, height: 1 }, // "↕ 120m"
  speed: { width: 4, height: 1 }, // "54⏱"
  heading: { width: 5, height: 1 }, // "⌘270°"
  battery_voltage: { width: 6, height: 1 }, // "🔋11.8V"
  battery_percent: { width: 5, height: 1 }, // "🔋 75%"
  gps_sats: { width: 4, height: 1 }, // "📡12"
  rssi: { width: 4, height: 1 }, // "📶85"
  throttle: { width: 5, height: 1 }, // "⚡ 45%"
  flight_time: { width: 6, height: 1 }, // "⏱03:05"
  distance: { width: 6, height: 1 }, // "🏠 350m"
  pitch: { width: 5, height: 1 }, // "↑  5°"
  roll: { width: 5, height: 1 }, // "↺ -3°"

  // Multi-row elements
  coordinates: { width: 11, height: 2 }, // Lat + Lon on 2 rows

  // Center screen elements
  crosshairs: { width: 3, height: 1 }, // "─╋─"
  artificial_horizon: { width: 9, height: 1 }, // 9-char horizon bar

  // Custom elements
  ccrp_indicator: { width: 5, height: 9 }, // Tall vertical gauge
};

/**
 * Get element size with fallback
 */
export function getElementSize(id: OsdElementId): ElementSize {
  return OSD_ELEMENT_SIZES[id] ?? { width: 4, height: 1 };
}
