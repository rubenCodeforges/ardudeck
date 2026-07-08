export type OverlayId = 'radar' | 'openaip' | 'airspace' | 'dipul' | 'wind' | 'traffic' | 'gliders' | 'remoteid' | 'camera' | 'waypointdots';

/** A single geocoder hit for the "Go to location" search. */
export interface GeocodeResult {
  label: string;
  lat: number;
  lon: number;
}

// ─── RainViewer ──────────────────────────────────────────────────────────────

export interface RainViewerMeta {
  /** Tile URL path returned by the API, e.g. /v2/radar/8f4387a21ffe — last segment is an opaque id, not the timestamp. */
  path: string;
  /** Timestamp of the radar snapshot */
  time: number;
}

// ─── OpenAIP Airspace ────────────────────────────────────────────────────────

export type AirspaceType = 'restricted' | 'prohibited' | 'danger' | 'ctr' | 'tma' | 'other';

export interface AirspaceData {
  name: string;
  type: AirspaceType;
  /** [lat, lng] coordinate pairs forming the polygon */
  points: Array<[number, number]>;
  lowerLimitFt: number;
  upperLimitFt: number;
}

// ─── OpenAIP Airports ────────────────────────────────────────────────────────

export interface AirportFrequency {
  name: string;
  valueMhz: number;
  type: number;
}

export interface AirportData {
  name: string;
  icaoCode: string;
  lat: number;
  lon: number;
  elevationM: number;
  type: number;
  frequencies: AirportFrequency[];
}

// ─── IPC payloads ────────────────────────────────────────────────────────────

export interface OverlayFetchParams {
  lat: number;
  lon: number;
  zoom: number;
}

// ─── DIPUL (German UAS geozones, WMS) ────────────────────────────────────────

/** Axis-aligned bounding box covering Germany (lat/lon). */
export const GERMANY_BBOX = {
  south: 47.27,
  north: 55.1,
  west: 5.87,
  east: 15.04,
} as const;
