import type { MissionItem } from '../../../shared/mission-types';
import { MAV_CMD, commandHasLocation } from '../../../shared/mission-types';

export interface BulkResult {
  items: MissionItem[];
  /** Waypoints actually modified (mobile reports this in its snackbar). */
  changed: number;
}

const renumber = (items: MissionItem[]): MissionItem[] =>
  items.map((it, i) => (it.seq === i ? it : { ...it, seq: i }));

/** Altitude frames are deliberately untouched (mobile's contract). */
export function bulkSetAltitude(
  items: MissionItem[],
  seqs: ReadonlySet<number>,
  altMeters: number,
): BulkResult {
  let changed = 0;
  const next = items.map((it) => {
    if (!seqs.has(it.seq)) return it;
    if (!commandHasLocation(it.command)) return it;
    if (it.altitude === altMeters) return it;
    changed++;
    return { ...it, altitude: altMeters };
  });
  return { items: changed > 0 ? next : items, changed };
}

/** speedMs <= 0 removes the selection's DO_CHANGE_SPEED items ("zero clears it"). */
export function bulkSetSpeed(
  items: MissionItem[],
  seqs: ReadonlySet<number>,
  speedMs: number,
): BulkResult {
  if (seqs.size === 0) return { items, changed: 0 };

  if (speedMs <= 0) {
    const removed = items.filter(
      (it) => seqs.has(it.seq) && it.command === MAV_CMD.DO_CHANGE_SPEED,
    ).length;
    if (removed === 0) return { items, changed: 0 };
    const next = renumber(
      items.filter((it) => !(seqs.has(it.seq) && it.command === MAV_CMD.DO_CHANGE_SPEED)),
    );
    return { items: next, changed: removed };
  }

  let changed = 0;
  let sawSpeedCmd = false;
  const next: MissionItem[] = [];
  let inserted = false;

  for (const it of items) {
    if (seqs.has(it.seq) && it.command === MAV_CMD.DO_CHANGE_SPEED) {
      sawSpeedCmd = true;
      if (it.param2 !== speedMs) {
        changed++;
        next.push({ ...it, param2: speedMs });
      } else {
        next.push(it);
      }
      continue;
    }
    if (!inserted && !sawSpeedCmd && seqs.has(it.seq)) {
      inserted = true;
      changed++;
      next.push({
        seq: 0, // renumbered below
        frame: it.frame,
        command: MAV_CMD.DO_CHANGE_SPEED,
        current: false,
        autocontinue: true,
        param1: 1, // ground speed
        param2: speedMs,
        param3: -1, // throttle unchanged
        param4: 0,
        latitude: 0,
        longitude: 0,
        altitude: 0,
        groupId: it.groupId,
      });
    }
    next.push(it);
  }

  if (changed === 0) return { items, changed: 0 };
  return { items: renumber(next), changed };
}

/** Do any of the selected seqs belong to a survey-generated group? */
export function selectionTouchesGroups(
  items: MissionItem[],
  seqs: ReadonlySet<number>,
  surveyGroupIds: ReadonlySet<string>,
): boolean {
  return items.some(
    (it) => seqs.has(it.seq) && it.groupId != null && surveyGroupIds.has(it.groupId),
  );
}

/**
 * Heading for one waypoint, ArduPilot style: a CONDITION_YAW (absolute) right after it.
 * ArduCopter ignores NAV_WAYPOINT param4; the yaw command runs when the leg to the
 * waypoint starts and holds until the next waypoint. null removes it.
 */
export function setWaypointHeading(
  items: MissionItem[],
  seq: number,
  headingDeg: number | null,
): BulkResult {
  const wp = items.find((it) => it.seq === seq);
  if (!wp) return { items, changed: 0 };
  const next = items.find((it) => it.seq === seq + 1);
  const existing = next && isAbsoluteYaw(next) ? next : undefined;

  if (headingDeg === null) {
    if (!existing) return { items, changed: 0 };
    return { items: renumber(items.filter((it) => it !== existing)), changed: 1 };
  }

  const deg = ((headingDeg % 360) + 360) % 360;
  if (existing) {
    if (existing.param1 === deg) return { items, changed: 0 };
    return { items: items.map((it) => (it === existing ? { ...it, param1: deg } : it)), changed: 1 };
  }
  const yaw: MissionItem = {
    seq: 0, // renumbered below
    frame: wp.frame,
    command: MAV_CMD.CONDITION_YAW,
    current: false,
    autocontinue: true,
    param1: deg,
    param2: 0, // default turn rate
    param3: 0, // shortest way
    param4: 0, // absolute
    latitude: 0,
    longitude: 0,
    altitude: 0,
    groupId: wp.groupId,
  };
  const at = items.indexOf(wp) + 1;
  return { items: renumber([...items.slice(0, at), yaw, ...items.slice(at)]), changed: 1 };
}

function isAbsoluteYaw(it: MissionItem): boolean {
  return it.command === MAV_CMD.CONDITION_YAW && it.param4 === 0;
}

/** Heading a waypoint has through a following absolute CONDITION_YAW, or null. */
export function waypointHeading(items: MissionItem[], seq: number): number | null {
  const next = items.find((it) => it.seq === seq + 1);
  return next && isAbsoluteYaw(next) ? next.param1 : null;
}
