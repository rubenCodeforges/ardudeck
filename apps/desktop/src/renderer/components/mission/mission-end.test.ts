import { describe, it, expect } from 'vitest';
import { midMissionReturns, connectSurveys, disconnectSurveys, setFlightBreak, flightBoundaries, isReturnCommand, isTakeoffCommand } from './mission-end';
import { createSurveyGroup, createManualGroup, type Group } from '../../../shared/mission-group-types';
import { MAV_CMD, MAV_FRAME, type MissionItem } from '../../../shared/mission-types';

const poly = [
  { lat: 51.5, lng: -0.1 },
  { lat: 51.51, lng: -0.1 },
  { lat: 51.51, lng: -0.09 },
];

const item = (seq: number, command: number, groupId: string | undefined, lng = -0.1): MissionItem => ({
  seq,
  frame: MAV_FRAME.GLOBAL_RELATIVE_ALT,
  command,
  current: false,
  autocontinue: true,
  param1: 0, param2: 0, param3: 0, param4: 0,
  latitude: command === MAV_CMD.NAV_WAYPOINT ? 51.5 : 0,
  longitude: command === MAV_CMD.NAV_WAYPOINT ? lng : 0,
  altitude: 50,
  groupId,
});

function survey(name: string, order: number): Group {
  return {
    ...createSurveyGroup({
      name,
      generatorId: 'builtin.grid',
      generatorVersion: '1.0.0',
      polygon: poly,
      config: { altitude: 50, finish: 'rtl' },
    }),
    order,
  };
}

/** One survey's worth of items: two waypoints then a return. */
const legWithReturn = (g: Group, base: number, lng: number) => [
  item(base, MAV_CMD.NAV_WAYPOINT, g.id, lng),
  item(base + 1, MAV_CMD.NAV_WAYPOINT, g.id, lng + 0.001),
  item(base + 2, MAV_CMD.NAV_RETURN_TO_LAUNCH, g.id),
];

describe('midMissionReturns', () => {
  // The pilot's complaint: two surveys, and the aircraft flies home between them.
  it('reports the return the second survey flies after', () => {
    const a = survey('A', 0);
    const b = survey('B', 1);
    const found = midMissionReturns([...legWithReturn(a, 0, -0.1), ...legWithReturn(b, 3, -0.2)], [a, b]);
    expect(found).toHaveLength(1);
    expect(found[0]!.groupId).toBe(a.id);
  });

  it('is quiet when the plan already ends once', () => {
    const a = survey('A', 0);
    expect(midMissionReturns(legWithReturn(a, 0, -0.1), [a])).toEqual([]);
  });

  // Sorties and per-vehicle shares are separate flights: each one lands.
  it('says nothing about split flights', () => {
    const a: Group = { ...createManualGroup({ name: 'Flight 1', order: 0 }), separateFlight: true };
    const b: Group = { ...createManualGroup({ name: 'Flight 2', order: 1 }), separateFlight: true };
    expect(midMissionReturns([...legWithReturn(a, 0, -0.1), ...legWithReturn(b, 3, -0.2)], [a, b])).toEqual([]);
  });

  // A hand-placed RTL is the pilot's, whatever it sits in front of.
  it('leaves manual waypoints alone', () => {
    const m = createManualGroup({ name: 'Manual', order: 0 }) as Group;
    const b = survey('B', 1);
    const items = [
      item(0, MAV_CMD.NAV_WAYPOINT, m.id),
      item(1, MAV_CMD.NAV_RETURN_TO_LAUNCH, m.id),
      ...legWithReturn(b, 2, -0.2),
    ];
    expect(midMissionReturns(items, [m, b])).toEqual([]);
  });

  it('ignores an ungrouped return', () => {
    const b = survey('B', 1);
    const items = [item(0, MAV_CMD.NAV_RETURN_TO_LAUNCH, undefined), ...legWithReturn(b, 1, -0.2)];
    expect(midMissionReturns(items, [b, survey('A', 0)])).toEqual([]);
  });

  it('spots a Land in the middle too', () => {
    const a = survey('A', 0);
    const b = survey('B', 1);
    const items = [
      item(0, MAV_CMD.NAV_WAYPOINT, a.id),
      item(1, MAV_CMD.NAV_LAND, a.id),
      ...legWithReturn(b, 2, -0.2),
    ];
    expect(midMissionReturns(items, [a, b])).toHaveLength(1);
  });
});

describe('connectSurveys', () => {
  it('drops the stranded returns and keeps the last one', () => {
    const a = survey('A', 0);
    const b = survey('B', 1);
    const out = connectSurveys([...legWithReturn(a, 0, -0.1), ...legWithReturn(b, 3, -0.2)], [a, b]);
    expect(out.filter((i) => isReturnCommand(i.command))).toHaveLength(1);
    expect(out[out.length - 1]!.groupId).toBe(b.id);
    expect(out.map((i) => i.seq)).toEqual([0, 1, 2, 3, 4]);
  });

  it('changes nothing when there is nothing to connect', () => {
    const a = survey('A', 0);
    const items = legWithReturn(a, 0, -0.1);
    expect(connectSurveys(items, [a])).toBe(items);
  });

  it('is idempotent', () => {
    const a = survey('A', 0);
    const b = survey('B', 1);
    const once = connectSurveys([...legWithReturn(a, 0, -0.1), ...legWithReturn(b, 3, -0.2)], [a, b]);
    expect(connectSurveys(once, [a, b])).toBe(once);
  });

  it('never touches a manual group\u2019s waypoints', () => {
    const m = createManualGroup({ name: 'Manual', order: 0 }) as Group;
    const b = survey('B', 1);
    const items = [
      item(0, MAV_CMD.NAV_WAYPOINT, m.id),
      item(1, MAV_CMD.NAV_RETURN_TO_LAUNCH, m.id),
      ...legWithReturn(b, 2, -0.2),
    ];
    expect(connectSurveys(items, [m, b])).toBe(items);
  });
});

describe('disconnectSurveys', () => {
  const legNoReturn = (g: Group, base: number, lng: number) => [
    item(base, MAV_CMD.NAV_WAYPOINT, g.id, lng),
    item(base + 1, MAV_CMD.NAV_WAYPOINT, g.id, lng + 0.001),
  ];

  // Two chained surveys the pilot now wants to fly on separate batteries.
  it('gives each survey its own takeoff and ending', () => {
    const a = survey('A', 0);
    const b = survey('B', 1);
    const chained = [
      item(0, MAV_CMD.NAV_TAKEOFF, a.id),
      ...legNoReturn(a, 1, -0.1),
      ...legNoReturn(b, 3, -0.2),
      item(5, MAV_CMD.NAV_RETURN_TO_LAUNCH, b.id),
    ];
    const out = disconnectSurveys(chained, [a, b]);
    const ofA = out.filter((i) => i.groupId === a.id);
    const ofB = out.filter((i) => i.groupId === b.id);
    expect(ofA[0]!.command).toBe(MAV_CMD.NAV_TAKEOFF);
    expect(ofA[ofA.length - 1]!.command).toBe(MAV_CMD.NAV_RETURN_TO_LAUNCH);
    expect(ofB[0]!.command).toBe(MAV_CMD.NAV_TAKEOFF);
    expect(ofB[ofB.length - 1]!.command).toBe(MAV_CMD.NAV_RETURN_TO_LAUNCH);
    expect(out.map((i) => i.seq)).toEqual(out.map((_, i) => i));
  });

  it('is the inverse of connecting', () => {
    const a = survey('A', 0);
    const b = survey('B', 1);
    const separate = [
      item(0, MAV_CMD.NAV_TAKEOFF, a.id),
      ...legNoReturn(a, 1, -0.1),
      item(3, MAV_CMD.NAV_RETURN_TO_LAUNCH, a.id),
      item(4, MAV_CMD.NAV_TAKEOFF, b.id),
      ...legNoReturn(b, 5, -0.2),
      item(7, MAV_CMD.NAV_RETURN_TO_LAUNCH, b.id),
    ];
    const connected = connectSurveys(separate, [a, b]);
    expect(connected.filter((i) => isReturnCommand(i.command))).toHaveLength(1);
    const again = disconnectSurveys(connected, [a, b]);
    expect(again.map((i) => i.command)).toEqual(separate.map((i) => i.command));
  });

  it('does nothing when every survey already stands alone', () => {
    const a = survey('A', 0);
    const items = [
      item(0, MAV_CMD.NAV_TAKEOFF, a.id),
      ...legNoReturn(a, 1, -0.1),
      item(3, MAV_CMD.NAV_RETURN_TO_LAUNCH, a.id),
    ];
    expect(disconnectSurveys(items, [a, survey('B', 1)])).toBe(items);
  });

  // Pressing Disconnect on surveys whose Finish says None is exactly the case
  // that did nothing before: separate flights have to end somewhere.
  it('gives an ending even to a survey whose Finish is None', () => {
    const a = { ...survey('A', 0), config: { altitude: 50, finish: 'none' } } as Group;
    const b = { ...survey('B', 1), config: { altitude: 50, finish: 'none' } } as Group;
    const items = [...legNoReturn(a, 0, -0.1), ...legNoReturn(b, 2, -0.2)];
    const out = disconnectSurveys(items, [a, b]);
    expect(out.filter((i) => isReturnCommand(i.command))).toHaveLength(2);
  });

  // A plan the pilot launches by hand stays that way.
  it('invents no takeoff in a plan that has none', () => {
    const a = survey('A', 0);
    const b = survey('B', 1);
    const items = [...legNoReturn(a, 0, -0.1), ...legNoReturn(b, 2, -0.2)];
    expect(disconnectSurveys(items, [a, b]).some((i) => isTakeoffCommand(i.command))).toBe(false);
  });

  it('leaves manual groups untouched', () => {
    const m = createManualGroup({ name: 'Manual', order: 0 }) as Group;
    const b = survey('B', 1);
    const items = [
      item(0, MAV_CMD.NAV_WAYPOINT, m.id),
      ...legNoReturn(b, 1, -0.2),
      item(3, MAV_CMD.NAV_RETURN_TO_LAUNCH, b.id),
    ];
    expect(disconnectSurveys(items, [m, b]).filter((i) => i.groupId === m.id))
      .toEqual([items[0]]);
  });
});

describe('popping one survey out of a chain', () => {
  const leg = (g: Group, base: number, lng: number) => [
    item(base, MAV_CMD.NAV_WAYPOINT, g.id, lng),
    item(base + 1, MAV_CMD.NAV_WAYPOINT, g.id, lng + 0.001),
  ];

  const a = survey('A', 0);
  const b = survey('B', 1);
  const c = survey('C', 2);
  const groups = [a, b, c];
  // One flight: takeoff, three surveys back to back, one RTL.
  const chained = [
    item(0, MAV_CMD.NAV_TAKEOFF, a.id),
    ...leg(a, 1, -0.1),
    ...leg(b, 3, -0.2),
    ...leg(c, 5, -0.3),
    item(7, MAV_CMD.NAV_RETURN_TO_LAUNCH, c.id),
  ];

  const commandsOf = (items: MissionItem[], g: Group) =>
    items.filter((i) => i.groupId === g.id).map((i) => i.command);

  it('reads as one flight to start with', () => {
    expect(flightBoundaries(chained, groups).map((x) => x.ends)).toEqual([false, false, true]);
  });

  // Ending the flight at A makes B start its own, so B gets a takeoff.
  it('ending at A gives B a takeoff', () => {
    const out = setFlightBreak(chained, groups, a.id, true);
    expect(commandsOf(out, a).at(-1)).toBe(MAV_CMD.NAV_RETURN_TO_LAUNCH);
    expect(commandsOf(out, b)[0]).toBe(MAV_CMD.NAV_TAKEOFF);
    expect(commandsOf(out, c)[0]).not.toBe(MAV_CMD.NAV_TAKEOFF);
  });

  // Two breaks and survey B is a flight of its own, between A and C.
  it('pops B out as its own flight', () => {
    let out = setFlightBreak(chained, groups, a.id, true);
    out = setFlightBreak(out, groups, b.id, true);
    expect(flightBoundaries(out, groups).map((x) => x.ends)).toEqual([true, true, true]);
    expect(commandsOf(out, b)[0]).toBe(MAV_CMD.NAV_TAKEOFF);
    expect(commandsOf(out, b).at(-1)).toBe(MAV_CMD.NAV_RETURN_TO_LAUNCH);
    expect(commandsOf(out, c)[0]).toBe(MAV_CMD.NAV_TAKEOFF);
    expect(out.map((i) => i.seq)).toEqual(out.map((_, i) => i));
  });

  it('joining B back removes its takeoff again', () => {
    let out = setFlightBreak(chained, groups, a.id, true);
    out = setFlightBreak(out, groups, a.id, false);
    expect(commandsOf(out, b)[0]).not.toBe(MAV_CMD.NAV_TAKEOFF);
    expect(commandsOf(out, a).some(isReturnCommand)).toBe(false);
    expect(out.map((i) => i.command)).toEqual(chained.map((i) => i.command));
  });
});

describe('what is joined to what', () => {
  const leg = (g: Group, base: number, lng: number) => [
    item(base, MAV_CMD.NAV_WAYPOINT, g.id, lng),
    item(base + 1, MAV_CMD.NAV_WAYPOINT, g.id, lng + 0.001),
  ];
  const a = survey('A', 0);
  const b = survey('B', 1);
  const c = survey('C', 2);
  const groups = [a, b, c];

  const rtl = (seq: number, g: Group) => item(seq, MAV_CMD.NAV_RETURN_TO_LAUNCH, g.id);

  it('numbers one flight with three legs', () => {
    const items = [...leg(a, 0, -0.1), ...leg(b, 2, -0.2), ...leg(c, 4, -0.3), rtl(6, c)];
    expect(flightBoundaries(items, groups).map((x) => `${x.flight}:${x.leg}/${x.legs}`))
      .toEqual(['1:1/3', '1:2/3', '1:3/3']);
  });

  // A break after A: two flights, and the list has to say which is which.
  it('numbers two flights when one survey stands alone', () => {
    const items = [...leg(a, 0, -0.1), rtl(2, a), ...leg(b, 3, -0.2), ...leg(c, 5, -0.3), rtl(7, c)];
    expect(flightBoundaries(items, groups).map((x) => `${x.flight}:${x.leg}/${x.legs}`))
      .toEqual(['1:1/1', '2:1/2', '2:2/2']);
  });

  it('numbers three separate flights', () => {
    const items = [
      ...leg(a, 0, -0.1), rtl(2, a),
      ...leg(b, 3, -0.2), rtl(5, b),
      ...leg(c, 6, -0.3), rtl(8, c),
    ];
    expect(flightBoundaries(items, groups).map((x) => x.flight)).toEqual([1, 2, 3]);
    expect(flightBoundaries(items, groups).every((x) => x.legs === 1)).toBe(true);
  });
});

describe('flight order follows the waypoints, not group.order', () => {
  const leg = (g: Group, base: number, lng: number) => [
    item(base, MAV_CMD.NAV_WAYPOINT, g.id, lng),
    item(base + 1, MAV_CMD.NAV_WAYPOINT, g.id, lng + 0.001),
  ];

  // The live bug: group.order said A was first, its waypoints came second, so
  // the list showed B on top and labelled A "flight 1".
  it('orders by first waypoint when group.order disagrees', () => {
    const a = survey('A', 0);
    const b = survey('B', 1);
    const items = [
      ...leg(b, 0, -0.2),
      ...leg(a, 2, -0.1),
      item(4, MAV_CMD.NAV_RETURN_TO_LAUNCH, a.id),
    ];
    const rows = flightBoundaries(items, [a, b]);
    expect(rows.map((r) => r.name)).toEqual(['B', 'A']);
    expect(rows.map((r) => r.leg)).toEqual([1, 2]);
  });

  it('connect leaves the return on whichever survey flies last', () => {
    const a = survey('A', 0);
    const b = survey('B', 1);
    const items = [
      ...leg(b, 0, -0.2), item(2, MAV_CMD.NAV_RETURN_TO_LAUNCH, b.id),
      ...leg(a, 3, -0.1), item(5, MAV_CMD.NAV_RETURN_TO_LAUNCH, a.id),
    ];
    const out = connectSurveys(items, [a, b]);
    const returns = out.filter((i) => isReturnCommand(i.command));
    expect(returns).toHaveLength(1);
    expect(returns[0]!.groupId).toBe(a.id);
  });

  it('an empty group keeps its place without breaking the order', () => {
    const a = survey('A', 0);
    const empty = survey('Empty', 1);
    const b = survey('B', 2);
    const items = [...leg(a, 0, -0.1), ...leg(b, 2, -0.2), item(4, MAV_CMD.NAV_RETURN_TO_LAUNCH, b.id)];
    expect(flightBoundaries(items, [a, empty, b]).map((r) => r.name)).toEqual(['A', 'B', 'Empty']);
  });
});
