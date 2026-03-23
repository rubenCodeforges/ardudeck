export type OverlayId = 'radar' | 'openaip' | 'airspace';

// ─── RainViewer ──────────────────────────────────────────────────────────────

export interface RainViewerMeta {
  /** Tile URL path (e.g. /v2/radar/1609402200) */
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
