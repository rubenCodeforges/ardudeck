/**
 * contact-style — shared visual vocabulary for traffic contacts, used by both the
 * Leaflet overlay and the MapLibre layer so ADS-B/glider contacts look identical
 * across map surfaces. Pure (no DOM / no Leaflet) so it can be unit-tested and
 * reused.
 */

import type { TrafficCategory, TrafficContact } from '../../../../shared/traffic-types';
import type { ProximityTier } from './proximity';

export const SOURCE_COLOR = {
  adsb: '#38bdf8', // sky-400
  ogn: '#fbbf24', // amber-400
} as const;

export const GROUND_COLOR = '#9ca3af'; // gray-400
export const TIER_COLOR: Record<Exclude<ProximityTier, 'none'>, string> = {
  caution: '#facc15', // yellow-400
  warning: '#f87171', // red-400
};

/** Where a contact sits relative to the operator's altitude band — drives colour
 *  so height is readable at a glance: amber below you, green at your level, blue
 *  just above, indigo way up high (airliners). */
export type AltState = 'ground' | 'below' | 'inband' | 'above' | 'high' | 'unknown';

/** Margin above the ceiling that still counts as "just above" before "high". */
const HIGH_MARGIN_M = 3000;

export function altitudeColorState(c: TrafficContact, band: AltitudeBand): AltState {
  if (c.onGround) return 'ground';
  if (c.altMeters == null) return 'unknown';
  if (c.altMeters < band.floorMeters) return 'below';
  if (c.altMeters <= band.ceilingMeters) return 'inband';
  if (c.altMeters <= band.ceilingMeters + HIGH_MARGIN_M) return 'above';
  return 'high';
}

export const ALT_STATE_COLOR: Record<AltState, string> = {
  ground: '#9ca3af', // gray
  below: '#f59e0b', // amber — lower than you
  inband: '#34d399', // emerald — your operating band
  above: '#38bdf8', // sky — just above
  high: '#818cf8', // indigo — high airliners
  unknown: '#9ca3af',
};

/** The colour a contact's icon should be drawn in: proximity tier wins (safety),
 *  otherwise colour encodes altitude relative to the operator's band. */
export function contactColor(c: TrafficContact, tier: ProximityTier, band: AltitudeBand): string {
  if (tier !== 'none') return TIER_COLOR[tier];
  return ALT_STATE_COLOR[altitudeColorState(c, band)];
}

/** Plain-language category names: shown in the contact popup so an operator
 *  does not have to decode ICAO type designators (B412, C172, ...). */
export const CATEGORY_LABEL_KEY: Record<TrafficCategory, string> = {
  powered: 'map:trafficCategory.powered',
  jet: 'map:trafficCategory.jet',
  helicopter: 'map:trafficCategory.helicopter',
  glider: 'map:trafficCategory.glider',
  balloon: 'map:trafficCategory.balloon',
  uav: 'map:trafficCategory.uav',
  ground: 'map:trafficCategory.ground',
  unknown: 'map:trafficCategory.unknown',
};

/** SVG inner markup for a 20x20 viewBox, pointing "up" (north) before rotation. */
export function glyphSvg(category: TrafficCategory, color: string): string {
  switch (category) {
    case 'glider':
      // long thin wings
      return `<path d="M10 3 L11 12 L18 13 L11 14 L10 17 L9 14 L2 13 L9 12 Z" fill="${color}"/>`;
    case 'helicopter':
      // Top-down heli: rotor X across the disc, fuselage, tail boom with tail
      // rotor. The old circle + side bars read as a satellite once rotated.
      return `<path d="M4.5 3.5 L15.5 14.5 M15.5 3.5 L4.5 14.5" stroke="${color}" stroke-width="1.6" stroke-linecap="round"/>`
        + `<ellipse cx="10" cy="8.5" rx="2.6" ry="3.4" fill="${color}"/>`
        + `<path d="M9.3 11.5 H10.7 L10.4 17 H9.6 Z" fill="${color}"/>`
        + `<path d="M8 16.4 H12" stroke="${color}" stroke-width="1.3" stroke-linecap="round"/>`;
    case 'balloon':
      return `<circle cx="10" cy="8" r="5" fill="${color}"/><path d="M8 13 H12 L11 16 H9 Z" fill="${color}"/>`;
    case 'ground':
      return `<rect x="6" y="6" width="8" height="8" rx="1.5" fill="${color}"/>`;
    case 'jet':
      return `<path d="M10 2 L12 9 L18 13 L12 12 L11 18 L10 16 L9 18 L8 12 L2 13 L8 9 Z" fill="${color}"/>`;
    case 'powered':
    default:
      // generic aircraft: fuselage + swept wings + tail
      return `<path d="M10 2 L11.4 11 L17 14 L11.4 13 L11 16 L13 17.5 L10 17 L7 17.5 L9 16 L8.6 13 L3 14 L8.6 11 Z" fill="${color}"/>`;
  }
}

export interface AltitudeBand {
  floorMeters: number;
  ceilingMeters: number;
  /** When set, traffic above the ceiling is hidden outright rather than faded. */
  hardCeiling?: boolean;
}

/** Distance over which an out-of-band contact fades to minimum relevance. */
const RELEVANCE_FALLOFF_M = 4000;
const MIN_RELEVANCE = 0.25;

/**
 * How relevant a contact is to the operator's altitude band, 0..1. Inside the
 * band → 1 (full prominence). Above or below → falls off with vertical distance,
 * so a jet at FL400 over a 0–1500 m band reads tiny. Unknown altitude is treated
 * as relevant (fail safe — better to show it).
 */
export function altitudeRelevance(altMeters: number | undefined, band: AltitudeBand): number {
  if (altMeters == null) return 1;
  if (altMeters >= band.floorMeters && altMeters <= band.ceilingMeters) return 1;
  const dist = altMeters > band.ceilingMeters ? altMeters - band.ceilingMeters : band.floorMeters - altMeters;
  return Math.max(MIN_RELEVANCE, 1 - dist / RELEVANCE_FALLOFF_M);
}

/** Whether a contact should be drawn at all given the operator's band, so the
 *  on-map altitude control is determinative, not merely cosmetic.
 *
 *  The floor is a hard cutoff: surface traffic and anything below the floor is
 *  excluded outright (a positive floor means the operator has chosen to hide low
 *  clutter — ground vehicles, taxiing aircraft). Above the ceiling: a soft falloff
 *  by default so high traffic shrinks and fades before disappearing (airliners),
 *  or a hard cutoff when `band.hardCeiling` is set. Unknown altitude always passes
 *  (fail safe). */
export function isAltitudeRelevant(c: TrafficContact, band: AltitudeBand): boolean {
  if (c.onGround) return band.floorMeters <= 0;
  if (c.altMeters == null) return true;
  if (c.altMeters < band.floorMeters) return false;
  if (band.hardCeiling && c.altMeters > band.ceilingMeters) return false;
  return altitudeRelevance(c.altMeters, band) > MIN_RELEVANCE;
}

/** Icon scale + opacity derived from relevance, shared across map surfaces so a
 *  contact looks identical on Leaflet and MapLibre. */
export function relevanceStyle(rel: number): { scale: number; opacity: number } {
  // Wide spread so a co-altitude contact reads ~31px and a high airliner ~17px.
  return { scale: 0.65 + 0.9 * rel, opacity: 0.45 + 0.55 * rel };
}

/** Short label under the glyph: callsign/registration + altitude in feet. */
export function contactLabel(c: TrafficContact): string {
  const name = c.callsign || c.registration || c.id;
  if (c.onGround) return `${name} • GND`;
  if (c.altMeters == null) return name;
  const ft = Math.round((c.altMeters / 0.3048) / 25) * 25;
  return `${name} • ${ft.toLocaleString()}ft`;
}
