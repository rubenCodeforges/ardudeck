import { t } from './i18n/index.js';

/**
 * traffic-types — shared model for the ADS-B + glider (OGN) traffic overlays.
 *
 * One unified contact model feeds every map surface (Leaflet telemetry/mission +
 * MapLibre Area Editor); `source` distinguishes ADS-B from OGN and drives the two
 * independent overlay toggles, icon glyphs and colours. The main process owns all
 * providers and pushes TrafficBatch snapshots to the renderer; the renderer never
 * talks to a traffic source directly.
 */

export type TrafficSource = 'adsb' | 'ogn' | 'remoteid';

/** Coarse class used to pick an icon. Mapped from each provider's own categories. */
export type TrafficCategory =
  | 'powered' // default fixed/rotary powered aircraft
  | 'jet'
  | 'helicopter'
  | 'glider'
  | 'balloon'
  | 'uav'
  | 'ground' // ground vehicle / static station
  | 'unknown';

/** A single air contact, normalised across all providers. */
export interface TrafficContact {
  /** Dedupe key: icao24 hex (ADS-B) or FLARM/OGN device id (glider). */
  id: string;
  source: TrafficSource;
  callsign?: string;
  registration?: string;
  model?: string;
  category: TrafficCategory;
  lat: number;
  lon: number;
  /** Altitude MSL in metres (geometric or baro depending on source). */
  altMeters?: number;
  onGround?: boolean;
  groundSpeedMps?: number;
  /** Course over ground, degrees true — rotates the icon. */
  trackDeg?: number;
  verticalRateMps?: number;
  squawk?: string;
  /** Remote ID only: the broadcast UAS serial / session id. */
  uasId?: string;
  /** Remote ID only: operator / ground-station position, when broadcast. */
  operatorLat?: number;
  operatorLon?: number;
  /** Epoch ms the position was last observed. Drives staleness + fade. */
  lastSeen: number;
}

/** Full snapshot of live contacts within the current viewport. */
export interface TrafficBatch {
  contacts: TrafficContact[];
  generatedAt: number;
}

/** Viewport the renderer asks providers to cover (centre + radius). */
export interface ViewportBbox {
  lat: number;
  lon: number;
  radiusKm: number;
}

// ─── Provider configuration ──────────────────────────────────────────────────

/** Hosted ADS-B API presets. `custom` lets the user supply their own endpoint. */
export type AdsbApiPreset = 'adsbexchange' | 'airplanes-live' | 'adsb-fi' | 'custom';

export interface AdsbApiPresetSpec {
  id: AdsbApiPreset;
  label: string;
  /** Whether the preset requires an API key. */
  needsKey: boolean;
  /** Header name the key is sent under (RapidAPI style), if any. */
  keyHeader?: string;
  /** Extra static headers (e.g. RapidAPI host). */
  extraHeaders?: Record<string, string>;
  /**
   * URL template for a radius query. `{lat}` `{lon}` `{radiusNm}` are substituted.
   * Empty for `custom` (user supplies the full template).
   */
  urlTemplate: string;
  /** Response shape so the parser knows how to read it. */
  shape: 'adsbx-v2' | 'opensky';
}

/**
 * Remote ID JSON response shapes the provider can read.
 * - 'ardudeck': a normalised array of {id,lat,lon,alt,...} (our documented shape).
 * - 'opendroneid': the field layout an OpenDroneID receiver/gateway emits
 *   (Basic ID + Location/Vector blocks).
 */
export type RemoteIdShape = 'ardudeck' | 'opendroneid';

/**
 * A geofenced alert zone. A cooperative contact (ADS-B / OGN / Remote ID)
 * entering an enabled zone within its altitude band raises a perimeter alert.
 * Detect-and-alert only: ArduDeck never mitigates.
 */
export interface AlertZone {
  id: string;
  name: string;
  enabled: boolean;
  shape: 'circle' | 'polygon';
  /** circle */
  center?: { lat: number; lon: number };
  radiusMeters?: number;
  /** polygon ring [{lat,lon}], not closed */
  polygon?: Array<{ lat: number; lon: number }>;
  /** Optional altitude gate (MSL metres). Undefined = any altitude. */
  minAltMeters?: number;
  maxAltMeters?: number;
}

/** Non-secret config persisted in the `traffic` electron-store. API keys/passwords
 *  live in the existing encrypted api-keys store, never here. */
export interface TrafficConfig {
  localAdsb: { enabled: boolean; url: string; pollMs: number };
  adsbApi: { enabled: boolean; preset: AdsbApiPreset; customUrl: string; customKeyHeader: string; pollMs: number };
  openSky: { enabled: boolean; useAuth: boolean; pollMs: number };
  ogn: { enabled: boolean; host: string; port: number };
  /** Remote ID ingestion from a local receiver / gateway exposing JSON over HTTP. */
  remoteId: { enabled: boolean; url: string; shape: RemoteIdShape; pollMs: number };
  /** Perimeter alert zones (detect + alert only). */
  alertZones: AlertZone[];
  proximity: { rangeMeters: number; verticalMeters: number };
  /** Altitude band the operator cares about (MSL metres). Contacts inside the
   *  band render full size + vivid. Below the floor is always hidden (low/surface
   *  clutter). Above the ceiling fades by default; `hardCeiling` hides it instead. */
  altitudeFilter: { floorMeters: number; ceilingMeters: number; hardCeiling: boolean };
  /** Global multiplier on contact icon size (1 = default). */
  iconScale: number;
}

export const DEFAULT_TRAFFIC_CONFIG: TrafficConfig = {
  localAdsb: { enabled: false, url: 'http://localhost:8080/data/aircraft.json', pollMs: 1000 },
  // Free, no-key hosted API on by default so the Traffic layer works out of the box.
  adsbApi: { enabled: true, preset: 'airplanes-live', customUrl: '', customKeyHeader: 'X-API-Key', pollMs: 8000 },
  openSky: { enabled: false, useAuth: false, pollMs: 10000 },
  // Public OGN network on by default so the Gliders layer works out of the box.
  ogn: { enabled: true, host: 'aprs.glidernet.org', port: 14580 },
  // Remote ID needs a local receiver, so it's off until the user points it at one.
  remoteId: { enabled: false, url: 'http://localhost:9090/api/remoteid', shape: 'ardudeck', pollMs: 1000 },
  alertZones: [],
  proximity: { rangeMeters: 2000, verticalMeters: 300 },
  altitudeFilter: { floorMeters: 0, ceilingMeters: 1500, hardCeiling: false },
  iconScale: 1,
};

export const ADSB_API_PRESETS: Record<AdsbApiPreset, AdsbApiPresetSpec> = {
  'airplanes-live': {
    id: 'airplanes-live',
    label: 'airplanes.live (free, no key)', // i18n-exempt
    needsKey: false,
    urlTemplate: 'https://api.airplanes.live/v2/point/{lat}/{lon}/{radiusNm}',
    shape: 'adsbx-v2',
  },
  'adsb-fi': {
    id: 'adsb-fi',
    label: 'adsb.fi (free, no key)', // i18n-exempt
    needsKey: false,
    urlTemplate: 'https://opendata.adsb.fi/api/v2/lat/{lat}/lon/{lon}/dist/{radiusNm}',
    shape: 'adsbx-v2',
  },
  adsbexchange: {
    id: 'adsbexchange',
    label: 'ADSBExchange (RapidAPI key)', // i18n-exempt
    needsKey: true,
    keyHeader: 'X-RapidAPI-Key',
    extraHeaders: { 'X-RapidAPI-Host': 'adsbexchange-com1.p.rapidapi.com' },
    urlTemplate: 'https://adsbexchange-com1.p.rapidapi.com/v2/lat/{lat}/lon/{lon}/dist/{radiusNm}/',
    shape: 'adsbx-v2',
  },
  custom: {
    id: 'custom',
    label: 'Custom endpoint', // i18n-exempt
    needsKey: false,
    urlTemplate: '',
    shape: 'adsbx-v2',
  },
};

export function adsbPresetLabel(preset: AdsbApiPreset): string {
  return t(`shared:trafficTypes.adsbPreset.${preset}`, { defaultValue: ADSB_API_PRESETS[preset]?.label ?? preset });
}

/** Secret-store service ids (used with the existing getApiKey/setApiKey). */
export const TRAFFIC_SECRET_SERVICES = {
  adsbexchange: 'adsb-adsbexchange',
  custom: 'adsb-custom',
  /** OpenSky credentials stored as "username:password". */
  openSky: 'opensky',
} as const;
