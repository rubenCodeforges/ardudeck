/**
 * Flight briefing - turns a mission (or survey) into the numbers a commercial
 * pilot actually decides on: how long, how far, how many batteries, how high,
 * and what the weather is doing at the site.
 *
 * One pure function, one data object. Everything the panel renders derives from
 * computeMissionBriefing(). The `checks[]` array is the seam for a future
 * go/no-go advisor: today every check is informational ('info'); flipping on
 * the advisor means populating real severities here, with no UI change. See the
 * "start passive, design for advisor" decision.
 */
import { estimateBatteryCount } from '../components/survey/survey-stats';
import {
  DEFAULT_USER_UNIT_PREFERENCES,
  formatAltitudeFromMeters,
  formatDistanceFromMeters,
  formatWindSpeedFromMetersPerSecond,
  type AltitudeUnit,
  type DistanceUnit,
  type WindSpeedUnit,
} from '../../shared/user-units.js';
import type { WeatherSummary } from './weather-api';
import type { AltFrame } from '../components/mission/terrain-altitude-planner';
import { t } from '../../shared/i18n/index.js';

export type CheckSeverity = 'ok' | 'warn' | 'crit' | 'info';

export interface BriefingCheck {
  id: string;
  label: string;
  value: string;
  severity: CheckSeverity;
  detail?: string;
}

export interface BriefingPoint {
  lat: number;
  lng: number;
  altM: number;
  /** Reference frame of `altM`. Defaults to 'relative' (height above home). */
  frame?: AltFrame;
}

export interface BriefingSurvey {
  gsdCm: number;
  photoCount: number;
  dataGb: number;
  areaM2: number;
}

export interface BriefingInput {
  /** Located waypoints in flight order. */
  located: BriefingPoint[];
  home: { lat: number; lng: number } | null;
  /** Home/launch ground elevation (ASL m); used to reduce ASL altitudes to height-above-home. */
  homeAltM?: number;
  cruiseSpeedMs: number;
  /** Usable endurance per battery in seconds (reserve already baked in). */
  enduranceSec: number;
  survey?: BriefingSurvey | null;
  weather?: WeatherSummary | null;
  /** Display unit for briefing distance strings. Native numeric values stay metres. */
  distanceUnit?: DistanceUnit;
  /** Display unit for altitude/depth strings. Native numeric values stay metres. */
  altitudeUnit?: AltitudeUnit;
  /** Display unit for weather wind strings. Native numeric values stay metres/second. */
  windSpeedUnit?: WindSpeedUnit;
  /** Legal AGL ceiling in metres. Defaults to 120 (EASA / 400ft). */
  ceilingM?: number;
}

export interface DaylightWindow {
  sunriseMin: number;   // minutes past site-local midnight
  sunsetMin: number;
  nowMin: number;
  /** Mission end if launched now (now + flight time), minutes past midnight. */
  endMin: number;
  /** Minutes of daylight left after the mission ends; negative = ends after sunset. */
  marginMin: number;
}

export interface MissionBriefing {
  empty: boolean;
  distanceM: number;
  maxFromHomeM: number;
  flightTimeSec: number;
  enduranceSec: number;
  batteryCount: number;
  /** Reserve left on the final battery, 0-100, or null if unknown. */
  reservePct: number | null;
  minAltM: number;
  maxAltM: number;
  totalClimbM: number;
  ceilingM: number;
  waypointCount: number;
  survey: { gsdCm: number; photoCount: number; dataGb: number; coverageHa: number } | null;
  weather: WeatherSummary | null;
  daylight: DaylightWindow | null;
  checks: BriefingCheck[];
}

// Located-waypoint count above which a mission likely won't fit a flight
// controller's mission storage and should be split into sorties before upload.
// Deliberately conservative-high so typical surveys don't false-alarm.
export const FC_WAYPOINT_SOFT_LIMIT = 2000;

function timeIsoToMinutes(iso: string | null): number | null {
  if (!iso) return null;
  const hm = iso.slice(11, 16).split(':');
  if (hm.length < 2) return null;
  const h = Number(hm[0]);
  const m = Number(hm[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

const EARTH_RADIUS_M = 6_371_000;

function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const lat1 = (aLat * Math.PI) / 180;
  const lat2 = (bLat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function formatDistanceM(m: number, unit: DistanceUnit = DEFAULT_USER_UNIT_PREFERENCES.distance): string {
  return formatDistanceFromMeters(m, unit);
}

export function formatAltitudeM(m: number, unit: AltitudeUnit = DEFAULT_USER_UNIT_PREFERENCES.altitude): string {
  return formatAltitudeFromMeters(m, unit);
}

export function formatDurationSec(s: number): string {
  if (s <= 0) return '0 min';
  const totalMin = Math.round(s / 60);
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const mn = totalMin % 60;
  return mn === 0 ? `${h} h` : `${h} h ${mn} min`;
}

export function computeMissionBriefing(input: BriefingInput): MissionBriefing {
  const { located, home, cruiseSpeedMs, enduranceSec } = input;
  const ceilingM = input.ceilingM ?? 120;
  const distanceUnit = input.distanceUnit ?? DEFAULT_USER_UNIT_PREFERENCES.distance;
  const altitudeUnit = input.altitudeUnit ?? DEFAULT_USER_UNIT_PREFERENCES.altitude;
  const windSpeedUnit = input.windSpeedUnit ?? DEFAULT_USER_UNIT_PREFERENCES.windSpeed;
  const weather = input.weather ?? null;
  const survey = input.survey
    ? {
        gsdCm: input.survey.gsdCm,
        photoCount: input.survey.photoCount,
        dataGb: input.survey.dataGb,
        coverageHa: input.survey.areaM2 / 10_000,
      }
    : null;

  if (located.length === 0) {
    return {
      empty: true,
      distanceM: 0,
      maxFromHomeM: 0,
      flightTimeSec: 0,
      enduranceSec,
      batteryCount: 0,
      reservePct: null,
      minAltM: 0,
      maxAltM: 0,
      totalClimbM: 0,
      ceilingM,
      waypointCount: 0,
      survey,
      weather,
      daylight: null,
      checks: [],
    };
  }

  let distanceM = 0;
  for (let i = 1; i < located.length; i++) {
    const a = located[i - 1]!;
    const b = located[i]!;
    distanceM += haversineM(a.lat, a.lng, b.lat, b.lng);
  }

  let maxFromHomeM = 0;
  if (home) {
    for (const p of located) {
      maxFromHomeM = Math.max(maxFromHomeM, haversineM(home.lat, home.lng, p.lat, p.lng));
    }
  }

  // Normalise every waypoint to height-above-home so the ceiling check compares
  // like with like. ASL ('asl') altitudes get the home ground elevation removed;
  // relative/terrain altitudes are already heights and pass through. Without a
  // home elevation an ASL altitude can't be reduced, so it's left as-is.
  const homeAltM = input.homeAltM ?? 0;
  const aboveHome = (p: BriefingPoint): number =>
    (p.frame ?? 'relative') === 'asl' ? p.altM - homeAltM : p.altM;

  let minAltM = aboveHome(located[0]!);
  let maxAltM = minAltM;
  let totalClimbM = 0;
  for (let i = 0; i < located.length; i++) {
    const alt = aboveHome(located[i]!);
    minAltM = Math.min(minAltM, alt);
    maxAltM = Math.max(maxAltM, alt);
    if (i > 0) {
      const delta = alt - aboveHome(located[i - 1]!);
      if (delta > 0) totalClimbM += delta;
    }
  }

  const flightTimeSec = cruiseSpeedMs > 0 ? distanceM / cruiseSpeedMs : 0;
  const batteryCount = estimateBatteryCount(flightTimeSec, enduranceSec / 60);

  let reservePct: number | null = null;
  if (enduranceSec > 0 && batteryCount > 0) {
    // Time spent on the final battery after swaps, vs that battery's endurance.
    const usedOnLast = flightTimeSec - (batteryCount - 1) * enduranceSec;
    reservePct = Math.max(0, Math.min(100, (1 - usedOnLast / enduranceSec) * 100));
  }

  // Daylight margin: launch-now end time vs sunset, all in the site's timezone
  // (weather.currentTimeIso is site-local, so the comparison is apples-to-apples).
  let daylight: DaylightWindow | null = null;
  const sunriseMin = timeIsoToMinutes(weather?.sunriseIso ?? null);
  const sunsetMin = timeIsoToMinutes(weather?.sunsetIso ?? null);
  const nowMin = timeIsoToMinutes(weather?.currentTimeIso ?? null);
  if (sunriseMin !== null && sunsetMin !== null && nowMin !== null) {
    const endMin = nowMin + flightTimeSec / 60;
    daylight = { sunriseMin, sunsetMin, nowMin, endMin, marginMin: sunsetMin - endMin };
  }

  const checks = buildChecks({
    distanceM,
    maxFromHomeM,
    hasHome: !!home,
    flightTimeSec,
    enduranceSec,
    batteryCount,
    reservePct,
    maxAltM,
    ceilingM,
    distanceUnit,
    altitudeUnit,
    windSpeedUnit,
    weather,
  });

  return {
    empty: false,
    distanceM,
    maxFromHomeM,
    flightTimeSec,
    enduranceSec,
    batteryCount,
    reservePct,
    minAltM,
    maxAltM,
    totalClimbM,
    ceilingM,
    waypointCount: located.length,
    survey,
    weather,
    daylight,
    checks,
  };
}

interface CheckContext {
  distanceM: number;
  maxFromHomeM: number;
  hasHome: boolean;
  flightTimeSec: number;
  enduranceSec: number;
  batteryCount: number;
  reservePct: number | null;
  maxAltM: number;
  ceilingM: number;
  distanceUnit: DistanceUnit;
  altitudeUnit: AltitudeUnit;
  windSpeedUnit: WindSpeedUnit;
  weather: WeatherSummary | null;
}

// PASSIVE MODE: every check is informational. The future go/no-go advisor swaps
// this single constant out for real thresholds (e.g. reservePct < 15 => 'crit',
// gust > limit => 'warn', maxAlt > ceiling => 'crit'). The checks[] shape stays
// identical, so the panel renders advisor verdicts with zero changes.
const PASSIVE: CheckSeverity = 'info';

function buildChecks(ctx: CheckContext): BriefingCheck[] {
  const checks: BriefingCheck[] = [
    {
      id: 'flightTime',
      label: t('utils:flightBriefing.flightTime'),
      value: formatDurationSec(ctx.flightTimeSec),
      severity: PASSIVE,
      detail: t('utils:flightBriefing.flightTimeDetail'),
    },
    {
      id: 'batteries',
      label: t('utils:flightBriefing.batteries'),
      value: ctx.batteryCount > 0 ? `${ctx.batteryCount}` : t('utils:flightBriefing.unknown'),
      severity: PASSIVE,
      detail:
        ctx.enduranceSec > 0
          ? t('utils:flightBriefing.usableEach', { duration: formatDurationSec(ctx.enduranceSec) })
          : t('utils:flightBriefing.setProfile'),
    },
    {
      id: 'distance',
      label: t('utils:flightBriefing.distance'),
      value: formatDistanceM(ctx.distanceM, ctx.distanceUnit),
      severity: PASSIVE,
    },
    {
      id: 'maxAlt',
      label: t('utils:flightBriefing.maxAltitude'),
      value: formatAltitudeM(ctx.maxAltM, ctx.altitudeUnit),
      severity: PASSIVE,
      detail: t('utils:flightBriefing.ceiling', { altitude: formatAltitudeM(ctx.ceilingM, ctx.altitudeUnit) }),
    },
  ];

  if (ctx.reservePct !== null) {
    checks.push({
      id: 'reserve',
      label: t('utils:flightBriefing.reserve'),
      value: `${Math.round(ctx.reservePct)}%`,
      severity: PASSIVE,
      detail: t('utils:flightBriefing.reserveDetail'),
    });
  }

  if (ctx.hasHome) {
    checks.push({
      id: 'maxFromHome',
      label: t('utils:flightBriefing.maxFromHome'),
      value: formatDistanceM(ctx.maxFromHomeM, ctx.distanceUnit),
      severity: PASSIVE,
    });
  }

  if (ctx.weather) {
    checks.push({
      id: 'wind',
      label: t('utils:flightBriefing.wind'),
      value: formatWindSpeedFromMetersPerSecond(ctx.weather.windSpeedMs, ctx.windSpeedUnit),
      severity: PASSIVE,
      detail: t('utils:flightBriefing.gusts', { speed: formatWindSpeedFromMetersPerSecond(ctx.weather.windGustMs, ctx.windSpeedUnit) }),
    });
  }

  return checks;
}
