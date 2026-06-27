/**
 * Pre-flight mission validation - catch the mistakes that waste a field trip
 * before the operator drives out. Pure and data-only so it unit-tests cleanly
 * and can run on every edit.
 *
 * Each check is advisory metadata; the UI decides how loudly to surface it.
 * Errors should block upload; warnings are worth a look but not fatal.
 */
import type { MissionItem } from './mission-types';
import { MAV_CMD, commandHasLocation, hasValidCoordinates, isNavigationCommand } from './mission-types';
import type { Group } from './mission-group-types';
import {
  DEFAULT_USER_UNIT_PREFERENCES,
  formatAltitudeFromMeters,
  type AltitudeUnit,
} from './user-units';

export type ValidationSeverity = 'error' | 'warn';

export interface ValidationCheck {
  id: string;
  severity: ValidationSeverity;
  message: string;
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
      message: `${items.length} items exceeds the ${ceiling}-item FC limit. Split into smaller flights.`,
    });
  }

  // 2. Empty groups - usually a leftover the operator forgot to remove.
  const counts = new Map<string, number>();
  for (const it of items) {
    if (it.groupId) counts.set(it.groupId, (counts.get(it.groupId) ?? 0) + 1);
  }
  for (const g of groups) {
    if ((counts.get(g.id) ?? 0) === 0) {
      checks.push({ id: `empty-group:${g.id}`, severity: 'warn', message: `Group "${g.name}" has no waypoints.` });
    }
  }

  // 3. Altitude sanity on located waypoints.
  let nonPositiveAlt = 0;
  let tooHighAlt = 0;
  for (const it of items) {
    if (!commandHasLocation(it.command) || !hasValidCoordinates(it.latitude, it.longitude)) continue;
    if (it.altitude <= 0) nonPositiveAlt++;
    else if (it.altitude > maxAlt) tooHighAlt++;
  }
  if (nonPositiveAlt > 0) {
    checks.push({ id: 'alt-nonpositive', severity: 'warn', message: `${nonPositiveAlt} waypoint(s) at or below ${formatAltitudeFromMeters(0, altitudeUnit)} altitude.` });
  }
  if (tooHighAlt > 0) {
    checks.push({ id: 'alt-high', severity: 'warn', message: `${tooHighAlt} waypoint(s) above ${formatAltitudeFromMeters(maxAlt, altitudeUnit)} - check your altitude reference.` });
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
    checks.push({ id: 'do-jump', severity: 'error', message: `${badJumps} DO_JUMP command(s) target a missing waypoint.` });
  }

  // 5. Air mission with nav waypoints but no takeoff.
  if (opts.isAir) {
    const hasNav = items.some((it) => isNavigationCommand(it.command) && commandHasLocation(it.command));
    const hasTakeoff = items.some(
      (it) => it.command === MAV_CMD.NAV_TAKEOFF || it.command === MAV_CMD.NAV_VTOL_TAKEOFF,
    );
    if (hasNav && !hasTakeoff) {
      checks.push({ id: 'no-takeoff', severity: 'warn', message: 'No takeoff command - the vehicle will fly to the first waypoint from its current state.' });
    }
  }

  const errorCount = checks.filter((c) => c.severity === 'error').length;
  const warnCount = checks.filter((c) => c.severity === 'warn').length;
  return { checks, errorCount, warnCount };
}
