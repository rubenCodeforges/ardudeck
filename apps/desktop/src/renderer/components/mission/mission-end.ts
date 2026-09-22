/**
 * Where one flight ends and the next begins, in a plan holding several surveys.
 *
 * Each survey builds a self-contained mission, so two in one plan give two
 * RTLs and the aircraft returns home in between. The whole question is per
 * group and has one answer: does the flight END at this group, or run on into
 * the next? Everything else follows. A group that ends gets its return; the
 * group after it starts a flight, so it gets a takeoff.
 *
 * Nothing here runs on its own. The panel shows the state per group and the
 * pilot changes it. Only a survey group's own leading takeoff and trailing
 * return are touched: a hand-placed RTL is the pilot's.
 */

import {
  MAV_CMD,
  MAV_FRAME,
  createTakeoffWaypoint,
  type MissionItem,
} from '../../../shared/mission-types';
import { isSurveyGroup, type Group, type SurveyGroup } from '../../../shared/mission-group-types';
import {
  finishCommand,
  startCommand,
  resolveAirframe,
  type SurveyAirframe,
  type SurveyFinish,
  type SurveyLaunch,
  type SurveyStart,
} from '../survey/survey-vehicle';

export function isReturnCommand(command: number): boolean {
  return command === MAV_CMD.NAV_RETURN_TO_LAUNCH
    || command === MAV_CMD.NAV_LAND
    || command === MAV_CMD.NAV_VTOL_LAND;
}

export function isTakeoffCommand(command: number): boolean {
  return command === MAV_CMD.NAV_TAKEOFF || command === MAV_CMD.NAV_VTOL_TAKEOFF;
}

/** The pilot has said these groups are flown separately, so no nagging. */
export function flownSeparately(groups: Group[]): boolean {
  return groups.some((g) => g.separateFlight);
}

interface SurveyEnds {
  start?: SurveyStart;
  finish?: SurveyFinish;
  launch?: SurveyLaunch;
  airframe?: SurveyAirframe;
  altitude?: number;
}

const endsOf = (g: SurveyGroup): SurveyEnds => (g.config ?? {}) as SurveyEnds;

/**
 * Groups in the order the aircraft flies them, which is the order of their
 * waypoints, not `group.order`. The two can drift, and when they do the list
 * shows the rows in one order and labels them in the other.
 */
function inFlightOrder(items: MissionItem[], groups: Group[]): Group[] {
  const firstSeq = new Map<string, number>();
  for (const it of items) {
    const at = firstSeq.get(it.groupId ?? '');
    if (it.groupId && (at === undefined || it.seq < at)) firstSeq.set(it.groupId, it.seq);
  }
  return [...groups].sort((a, b) => {
    const sa = firstSeq.get(a.id);
    const sb = firstSeq.get(b.id);
    if (sa !== undefined && sb !== undefined) return sa - sb;
    // An empty group has no waypoints to place it, so it keeps its own order.
    if (sa !== undefined) return -1;
    if (sb !== undefined) return 1;
    return a.order - b.order;
  });
}

function itemsByGroup(items: MissionItem[]): Map<string, MissionItem[]> {
  const byGroup = new Map<string, MissionItem[]>();
  for (const it of [...items].sort((a, b) => a.seq - b.seq)) {
    if (!it.groupId) continue;
    const list = byGroup.get(it.groupId);
    if (list) list.push(it);
    else byGroup.set(it.groupId, [it]);
  }
  return byGroup;
}

/** Does the flight end at this group, i.e. does it close with a return? */
export function groupEndsFlight(group: Group, items: MissionItem[]): boolean {
  const own = itemsByGroup(items).get(group.id) ?? [];
  const last = own[own.length - 1];
  return !!last && isReturnCommand(last.command);
}

export interface FlightBoundary {
  groupId: string;
  name: string;
  /** The flight ends here; the next group starts a new one. */
  ends: boolean;
  /** The command it ends with, when it does. */
  endCommand?: number;
  /** Which flight this group belongs to, counting from 1. */
  flight: number;
  /** Its position within that flight, and how many legs the flight has. */
  leg: number;
  legs: number;
  /** Last in the plan and with no return: the mission ends in mid-air. */
  danglingEnd: boolean;
}

/** What each survey group does at its end, in flight order, for the group list. */
export { inFlightOrder };

export function flightBoundaries(items: MissionItem[], groups: Group[]): FlightBoundary[] {
  const byGroup = itemsByGroup(items);
  let flight = 1;
  let leg = 0;
  const rows = inFlightOrder(items, groups).filter(isSurveyGroup).map((g) => {
    const own = byGroup.get(g.id) ?? [];
    const last = own[own.length - 1];
    const ends = !!last && isReturnCommand(last.command);
    leg += 1;
    const row = {
      groupId: g.id,
      name: g.name,
      ends,
      endCommand: ends ? last!.command : undefined,
      flight,
      leg,
      legs: 0,
      /** Nothing follows it and it has no return: the mission just stops. */
      danglingEnd: false,
    };
    if (ends) {
      flight += 1;
      leg = 0;
    }
    return row;
  });
  const tail = rows[rows.length - 1];
  if (tail && !tail.ends) tail.danglingEnd = true;

  const legCount = new Map<number, number>();
  for (const r of rows) legCount.set(r.flight, (legCount.get(r.flight) ?? 0) + 1);
  for (const r of rows) r.legs = legCount.get(r.flight) ?? 1;
  return rows;
}

/**
 * Returns belonging to a survey group that something else flies after. What
 * the pre-flight warning counts.
 */
export function midMissionReturns(items: MissionItem[], groups: Group[]): MissionItem[] {
  if (groups.length < 2) return [];
  const surveyIds = new Set(groups.filter(isSurveyGroup).map((g) => g.id));
  if (surveyIds.size === 0) return [];

  const ordered = [...items].sort((a, b) => a.seq - b.seq);
  const lastIndex = new Map<string, number>();
  ordered.forEach((it, i) => {
    if (it.groupId) lastIndex.set(it.groupId, i);
  });

  return ordered.filter((it, i) =>
    isReturnCommand(it.command)
    && !!it.groupId
    && surveyIds.has(it.groupId)
    && lastIndex.get(it.groupId) === i
    && i < ordered.length - 1);
}

/**
 * Rebuild every survey's takeoff and return from `wantsEnd`, which says for
 * each group whether the flight stops there. A group that starts a flight
 * (the first, or the one after a group that ends) gets its takeoff back; the
 * others have theirs removed, since a mission takes off once.
 */
export function applyFlightBreaks(
  items: MissionItem[],
  groups: Group[],
  wantsEnd: (group: SurveyGroup) => boolean,
): MissionItem[] {
  const ordered = inFlightOrder(items, groups);
  const surveys = new Map(ordered.filter(isSurveyGroup).map((g) => [g.id, g]));
  if (surveys.size === 0) return items;

  // A group opens a flight when nothing before it is still flying.
  const opensFlight = new Map<string, boolean>();
  let previousEnded = true;
  for (const g of ordered) {
    if (isSurveyGroup(g)) opensFlight.set(g.id, previousEnded);
    previousEnded = isSurveyGroup(g) ? wantsEnd(g) : previousEnded;
  }

  const byGroup = itemsByGroup(items);
  // Only manage takeoffs in a plan that uses them. A plan with none is one the
  // pilot launches by hand, and inventing one would be a change they did not
  // ask for.
  const takeoffsInUse = [...surveys.keys()].some((id) => {
    const first = byGroup.get(id)?.[0];
    return !!first && isTakeoffCommand(first.command);
  });
  // Same rule for the ending: a plan that returns nowhere is one the pilot
  // built that way, and reordering it must not hand it an RTL.
  const returnsInUse = [...surveys.keys()].some((id) => {
    const own = byGroup.get(id);
    const last = own?.[own.length - 1];
    return !!last && isReturnCommand(last.command);
  });
  const out: MissionItem[] = [];

  for (const it of [...items].sort((a, b) => a.seq - b.seq)) {
    const group = it.groupId ? surveys.get(it.groupId) : undefined;
    if (!group) {
      out.push(it);
      continue;
    }
    const own = byGroup.get(group.id)!;
    const ends = endsOf(group);
    const airframe = resolveAirframe(ends.airframe, undefined);
    const isFirst = it === own[0];
    const isLast = it === own[own.length - 1];

    // Leading takeoff: present exactly when this group opens a flight.
    if (isFirst) {
      const wanted = takeoffsInUse && opensFlight.get(group.id)
        ? startCommand(ends.start, ends.launch, airframe)
        : null;
      if (wanted !== null && !isTakeoffCommand(it.command)) {
        out.push({
          ...createTakeoffWaypoint(0, 0, 0, ends.altitude ?? it.altitude, 15),
          command: wanted,
          groupId: group.id,
        });
      }
      if (isTakeoffCommand(it.command) && wanted === null) continue;
    }
    if (isTakeoffCommand(it.command) && !isFirst) {
      out.push(it);
      continue;
    }

    // Trailing return: present exactly when the flight ends at this group.
    if (isLast) {
      const stated = ends.finish !== undefined;
      const wanted = wantsEnd(group) && (returnsInUse || stated)
        ? finishCommand(ends.finish === 'none' ? 'rtl' : ends.finish ?? 'rtl', ends.launch, airframe)
        : null;
      if (isReturnCommand(it.command)) {
        if (wanted === null) continue;
        out.push(it.command === wanted ? it : { ...it, command: wanted });
        continue;
      }
      out.push(it);
      if (wanted !== null) {
        const lands = wanted === MAV_CMD.NAV_LAND || wanted === MAV_CMD.NAV_VTOL_LAND;
        out.push({
          seq: 0,
          frame: MAV_FRAME.GLOBAL_RELATIVE_ALT,
          command: wanted,
          current: false,
          autocontinue: true,
          param1: 0,
          param2: 0,
          param3: 0,
          param4: 0,
          latitude: lands ? it.latitude : 0,
          longitude: lands ? it.longitude : 0,
          altitude: 0,
          groupId: group.id,
        });
      }
      continue;
    }

    out.push(it);
  }

  const before = [...items].sort((a, b) => a.seq - b.seq);
  const unchanged = out.length === before.length && out.every((it, i) => it === before[i]);
  return unchanged ? items : out.map((it, i) => (it.seq === i ? it : { ...it, seq: i }));
}

/** Every survey runs on into the next; only the last one returns. */
export function connectSurveys(items: MissionItem[], groups: Group[]): MissionItem[] {
  const surveys = inFlightOrder(items, groups).filter(isSurveyGroup);
  const lastId = surveys[surveys.length - 1]?.id;
  return applyFlightBreaks(items, groups, (g) => g.id === lastId);
}

/** Every survey is its own flight: own takeoff, own ending. */
export function disconnectSurveys(items: MissionItem[], groups: Group[]): MissionItem[] {
  return applyFlightBreaks(items, groups, () => true);
}

/** One group's answer changes; the rest keep theirs. */
export function setFlightBreak(
  items: MissionItem[],
  groups: Group[],
  groupId: string,
  ends: boolean,
): MissionItem[] {
  return applyFlightBreaks(items, groups, (g) =>
    g.id === groupId ? ends : groupEndsFlight(g, items));
}
