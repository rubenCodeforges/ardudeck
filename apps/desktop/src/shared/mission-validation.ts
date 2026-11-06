/**
 * Pre-flight mission validation - catch the mistakes that waste a field trip
 * before the operator drives out. Pure and data-only so it unit-tests cleanly
 * and can run on every edit.
 *
 * Each check is advisory metadata; the UI decides how loudly to surface it.
 * Errors should block upload; warnings are worth a look but not fatal.
 */
import type { MissionItem } from './mission-types';
import { MAV_CMD, commandHasLocation, hasValidCoordinates, isNavigationCommand, mavFrameToAltFrame } from './mission-types';
import type { Group } from './mission-group-types';
import {
  DEFAULT_USER_UNIT_PREFERENCES,
  formatAltitudeFromMeters,
  type AltitudeUnit,
} from './user-units';
import { t } from './i18n/index.js';
import { crossingLegs } from './hazard-geometry.js';
import type { Hazard } from './hazard-types.js';

export type ValidationSeverity = 'error' | 'warn';

export interface ValidationCheck {
  id: string;
  severity: ValidationSeverity;
  message: string;
  /** A one-press fix the panel offers next to the message. */
  action?: 'connect-surveys';
}

export interface ValidationResult {
  checks: ValidationCheck[];
  errorCount: number;
  warnCount: number;
}

export interface ValidateMissionOptions {
  /** FC mission-item ceiling (default: conservative ArduPilot 724). */
  ceiling?: number;
  /** True for air vehicles, where a missing takeoff is worth flagging. */
  isAir?: boolean;
  /** Soft maximum altitude (m) above which a waypoint looks suspect. */
  maxAltitude?: number;
  /** Display unit for user-facing altitude warning text. Native values stay metres. */
  altitudeUnit?: AltitudeUnit;
  /** How many surveys end with a return that something else flies after. */
  midMissionReturns?: number;
  /** Admin-locked exclusion zones no leg may cross. */
  hazards?: readonly Hazard[];
  /** Home, so the leg out to the first waypoint is checked too. */
  home?: { lat: number; lon: number } | null;
}

export interface ZoneCrossing {
  zone: Hazard;
  /** Mission seq of the leg's ends; null for home. */
  fromSeq: number | null;
  toSeq: number;
}

/** Legs of the mission (home first) that cross a locked zone or its buffer. */
export function hazardCrossings(
  items: readonly MissionItem[],
  zones: readonly Hazard[],
  home?: { lat: number; lon: number } | null,
): ZoneCrossing[] {
  if (zones.length === 0) return [];
  const stops: Array<{ seq: number | null; lat: number; lon: number }> = [
    ...(home ? [{ seq: null, lat: home.lat, lon: home.lon }] : []),
    ...items
      .filter((it) => commandHasLocation(it.command) && hasValidCoordinates(it.latitude, it.longitude))
      .map((it) => ({ seq: it.seq, lat: it.latitude, lon: it.longitude })),
  ];
  return crossingLegs(stops, zones).map(({ leg, zone }) => ({ zone, fromSeq: stops[leg]!.seq, toSeq: stops[leg + 1]!.seq! }));
}

const DEFAULT_CEILING = 724;
const DEFAULT_MAX_ALT = 500;

export function validateMission(
  items: MissionItem[],
  groups: Group[],
  opts: ValidateMissionOptions = {},
): ValidationResult {
  const ceiling = opts.ceiling ?? DEFAULT_CEILING;
  const maxAlt = opts.maxAltitude ?? DEFAULT_MAX_ALT;
  const altitudeUnit = opts.altitudeUnit ?? DEFAULT_USER_UNIT_PREFERENCES.altitude;
  const checks: ValidationCheck[] = [];

  // 1. Mission-item ceiling. ArduPilot rejects an over-size mission outright.
  if (items.length > ceiling) {
    checks.push({
      id: 'ceiling',
      severity: 'error',
      message: t('shared:missionValidation.ceiling', { count: items.length, ceiling }),
    });
  }

  // 2. Empty groups - usually a leftover the operator forgot to remove.
  const counts = new Map<string, number>();
  for (const it of items) {
    if (it.groupId) counts.set(it.groupId, (counts.get(it.groupId) ?? 0) + 1);
  }
  for (const g of groups) {
    if ((counts.get(g.id) ?? 0) === 0) {
      checks.push({ id: `empty-group:${g.id}`, severity: 'warn', message: t('shared:missionValidation.emptyGroup', { name: g.name }) });
    }
  }

  // 3. Altitude sanity on located waypoints. The thresholds mean "height above
  // the launch area": relative-frame values are exactly that and terrain-frame
  // values (AGL) are close enough, but ASL values are dominated by the site's
  // ground elevation (an 80m-AGL survey at a 1100m site bakes to ~1180m ASL).
  // ASL-frame items are skipped rather than flagged - judging them needs a
  // ground reference this pure check doesn't have (#106: every baked
  // terrain-follow mission warned "above 500m").
  let nonPositiveAlt = 0;
  let tooHighAlt = 0;
  for (const it of items) {
    if (!commandHasLocation(it.command) || !hasValidCoordinates(it.latitude, it.longitude)) continue;
    if (mavFrameToAltFrame(it.frame) === 'asl') continue;
    if (it.altitude <= 0) nonPositiveAlt++;
    else if (it.altitude > maxAlt) tooHighAlt++;
  }
  if (nonPositiveAlt > 0) {
    checks.push({ id: 'alt-nonpositive', severity: 'warn', message: t('shared:missionValidation.altNonPositive', { count: nonPositiveAlt, altitude: formatAltitudeFromMeters(0, altitudeUnit) }) });
  }
  if (tooHighAlt > 0) {
    checks.push({ id: 'alt-high', severity: 'warn', message: t('shared:missionValidation.altHigh', { count: tooHighAlt, altitude: formatAltitudeFromMeters(maxAlt, altitudeUnit) }) });
  }

  // 4. DO_JUMP targets must point at a real sequence.
  const seqs = new Set(items.map((it) => it.seq));
  let badJumps = 0;
  for (const it of items) {
    if (it.command !== MAV_CMD.DO_JUMP) continue;
    const target = Math.round(it.param1);
    if (!seqs.has(target)) badJumps++;
  }
  if (badJumps > 0) {
    checks.push({ id: 'do-jump', severity: 'error', message: t('shared:missionValidation.badJumps', { count: badJumps }) });
  }

  // 5. Air mission with nav waypoints but no takeoff.
  if (opts.isAir) {
    const hasNav = items.some((it) => isNavigationCommand(it.command) && commandHasLocation(it.command));
    const hasTakeoff = items.some(
      (it) => it.command === MAV_CMD.NAV_TAKEOFF || it.command === MAV_CMD.NAV_VTOL_TAKEOFF,
    );
    if (hasNav && !hasTakeoff) {
      checks.push({ id: 'no-takeoff', severity: 'warn', message: t('shared:missionValidation.noTakeoff') });
    }
  }

  // 6. Surveys that each fly home, so the aircraft returns mid-mission. The
  // fix is offered as a button rather than applied: it deletes waypoints.
  if (opts.midMissionReturns && opts.midMissionReturns > 0) {
    const n = opts.midMissionReturns;
    checks.push({
      id: 'mid-mission-return',
      severity: 'warn',
      message: t('shared:missionValidation.midMissionReturn', { count: n }),
      action: 'connect-surveys',
    });
  }

  // 7. Legs through an admin-locked exclusion zone: upload is blocked until rerouted or overridden.
  for (const c of hazardCrossings(items, opts.hazards ?? [], opts.home)) {
    checks.push({
      id: `hazard:${c.zone.id}:${c.toSeq}`,
      severity: 'error',
      message: c.fromSeq === null
        ? t('shared:missionValidation.hazardFromHome', { to: c.toSeq + 1, zone: c.zone.name })
        : t('shared:missionValidation.hazard', { from: c.fromSeq + 1, to: c.toSeq + 1, zone: c.zone.name }),
    });
  }

  const errorCount = checks.filter((c) => c.severity === 'error').length;
  const warnCount = checks.filter((c) => c.severity === 'warn').length;
  return { checks, errorCount, warnCount };
}
