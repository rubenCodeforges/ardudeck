/**
 * Live telemetry -> OSD value mapping.
 *
 * Converts the MAVLink/MSP telemetry store into the DemoTelemetry shape the OSD
 * renderers consume, computing every value that can be derived from real
 * telemetry (timers, home distance/bearing, wind, ESC temps/RPM, power, RSSI%)
 * instead of leaving them at zero. A small session tracker holds the few values
 * that need history (flight time, on time, max speed).
 */

import type { DemoTelemetry } from './element-renderers';
import { DEFAULT_DEMO_VALUES } from './element-renderers';

export interface LiveTelemetrySnapshot {
  attitude: { roll: number; pitch: number; yaw: number };
  position: { lat: number; lon: number; alt: number; relativeAlt: number };
  gps: { satellites: number; hdop: number; lat: number; lon: number };
  battery: { voltage: number; current: number; remaining: number; cellCount?: number; cellVoltage?: number; mahDrawn?: number };
  vfrHud: { airspeed: number; groundspeed: number; heading: number; throttle: number; alt: number; climb: number };
  wind: { direction: number; speed: number; speedZ: number };
  flight: { mode: string; armed: boolean };
  rcChannels: { rssi: number };
  escTelemetry: { motors: Array<{ rpm: number; tempC: number } | undefined> } | null;
  craftName?: string;
}

export interface OsdLiveTracker {
  /** ms epoch when tracking (connection) started. */
  onTimeStartMs: number;
  /** ms epoch when the vehicle last armed, or null while disarmed. */
  armStartMs: number | null;
  /** Last computed flight time (s), frozen on disarm like a real OSD. */
  lastFlightTimeS: number;
  /** Peak ground speed (m/s) seen while armed. */
  maxSpeedMs: number;
  wasArmed: boolean;
}

export function createOsdLiveTracker(nowMs: number): OsdLiveTracker {
  return {
    onTimeStartMs: nowMs,
    armStartMs: null,
    lastFlightTimeS: 0,
    maxSpeedMs: 0,
    wasArmed: false,
  };
}

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/** Great-circle distance in metres between two lat/lon points. */
export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Initial bearing (deg, 0=N) from point 1 to point 2. */
export function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export interface GeoTargetPoint {
  latitude: number;
  longitude: number;
  seq?: number;
}

export interface ForwardTarget {
  /** Horizontal ground range to the point, metres. */
  range: number;
  /** Bearing from north to the point, degrees. */
  bearing: number;
  seq?: number;
}

/**
 * Pick a forward target from a set of waypoints: the NEAREST point that lies
 * ahead (within ±90° of the current heading), so it auto-advances to the next
 * as each is overflown - without relying on the FC's AUTO mission sequencing
 * (MISSION_CURRENT doesn't advance in manual/FPV flight). Falls back to the
 * nearest point overall when nothing is ahead. Returns null with no points.
 */
export function pickForwardTarget(
  lat: number,
  lon: number,
  heading: number,
  points: GeoTargetPoint[],
): ForwardTarget | null {
  let ahead: ForwardTarget | null = null;
  let nearest: ForwardTarget | null = null;
  for (const p of points) {
    const range = haversineMeters(lat, lon, p.latitude, p.longitude);
    const bearing = bearingDeg(lat, lon, p.latitude, p.longitude);
    const candidate: ForwardTarget = { range, bearing, seq: p.seq };
    if (!nearest || range < nearest.range) nearest = candidate;
    const rel = ((bearing - heading + 540) % 360) - 180;
    if (Math.abs(rel) <= 90 && (!ahead || range < ahead.range)) ahead = candidate;
  }
  return ahead ?? nearest;
}

/** Convert MAVLink RC rssi (0-255, 255=unknown) to a 0-100 percentage. */
function rssiToPercent(raw: number): number {
  if (!raw || raw >= 255) return 0;
  if (raw <= 100) return Math.round(raw); // some links already report %
  return Math.round((raw / 254) * 100);
}

/**
 * Build a full DemoTelemetry from live telemetry, updating the session tracker.
 * Fields with no telemetry source (baro/imu temp, g-force, rssi dBm) fall back
 * to their demo defaults' neutral value of 0.
 */
export function buildLiveTelemetry(
  snap: LiveTelemetrySnapshot,
  home: { lat: number; lon: number } | null,
  tracker: OsdLiveTracker,
  nowMs: number,
): DemoTelemetry {
  const { flight, vfrHud, battery, gps, position, attitude, wind } = snap;

  // ── timers ──────────────────────────────────────────────────────────────
  if (flight.armed && !tracker.wasArmed) {
    tracker.armStartMs = nowMs;
    tracker.maxSpeedMs = 0;
  }
  if (flight.armed && tracker.armStartMs != null) {
    tracker.lastFlightTimeS = Math.floor((nowMs - tracker.armStartMs) / 1000);
  }
  tracker.wasArmed = flight.armed;
  const onTime = Math.floor((nowMs - tracker.onTimeStartMs) / 1000);

  // ── max speed ───────────────────────────────────────────────────────────
  if (flight.armed && vfrHud.groundspeed > tracker.maxSpeedMs) {
    tracker.maxSpeedMs = vfrHud.groundspeed;
  }

  // ── home distance & relative bearing ──────────────────────────────────────
  const lat = gps.lat || position.lat;
  const lon = gps.lon || position.lon;
  let distance = 0;
  let homeDirection = 0;
  if (home && (lat || lon)) {
    distance = haversineMeters(lat, lon, home.lat, home.lon);
    const toHome = bearingDeg(lat, lon, home.lat, home.lon);
    const heading = vfrHud.heading || attitude.yaw;
    homeDirection = (toHome - heading + 360) % 360;
  }

  // ── ESC telemetry (hottest temp, fastest rpm across reporting motors) ─────
  let escTemp = 0;
  let escRpm = 0;
  if (snap.escTelemetry) {
    for (const m of snap.escTelemetry.motors) {
      if (!m) continue;
      if (m.tempC > escTemp) escTemp = m.tempC;
      if (m.rpm > escRpm) escRpm = m.rpm;
    }
  }

  // A partial telemetry frame (e.g. GPS before lock) can leave individual
  // fields undefined in the store. DemoTelemetry promises all-numbers, and the
  // OSD element renderers call .toString()/.toFixed() on them directly, so any
  // undefined that slips through crashes the whole OSD view. Coalesce every
  // telemetry-derived numeric field to a number here, at the contract boundary.
  return {
    ...DEFAULT_DEMO_VALUES,
    altitude: (vfrHud.alt || position.relativeAlt) ?? 0,
    mslAltitude: position.alt ?? 0,
    speed: vfrHud.groundspeed ?? 0,
    airspeed: vfrHud.airspeed ?? 0,
    maxSpeed: tracker.maxSpeedMs ?? 0,
    vario: vfrHud.climb ?? 0,
    heading: (vfrHud.heading || attitude.yaw) ?? 0,
    pitch: attitude.pitch ?? 0,
    roll: attitude.roll ?? 0,
    throttle: vfrHud.throttle ?? 0,

    batteryVoltage: battery.voltage ?? 0,
    batteryCurrent: battery.current ?? 0,
    batteryPercent: battery.remaining ?? 0,
    cellVoltage: battery.cellVoltage ?? 0,
    cellCount: battery.cellCount ?? 0,
    mahDrawn: battery.mahDrawn ?? 0,
    powerWatts: (battery.voltage ?? 0) * (battery.current ?? 0),

    gpsSats: gps.satellites ?? 0,
    gpsHdop: gps.hdop ?? 0,
    latitude: lat ?? 0,
    longitude: lon ?? 0,

    distance,
    homeDirection,

    flightMode: flight.mode || '',
    isArmed: flight.armed ?? false,
    craftName: snap.craftName ?? '',

    flightTime: tracker.lastFlightTimeS,
    onTime,

    rssi: rssiToPercent(snap.rcChannels.rssi ?? 0),

    windSpeed: wind.speed ?? 0,
    windDirection: wind.direction ?? 0,
    windVertical: wind.speedZ ?? 0,

    escTemp,
    escRpm,

    // No telemetry source on a standard MAVLink/MSP feed -> neutral.
    baroTemp: 0,
    imuTemp: 0,
    gForce: 0,
    rssiDbm: 0,
  };
}
