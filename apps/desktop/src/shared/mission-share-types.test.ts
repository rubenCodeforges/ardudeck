import { describe, expect, it } from 'vitest';
import { diffMissionItems, isMissionPackage } from './mission-share-types';
import type { MissionItem } from './mission-types';

const wp = (seq: number, lat: number, lng: number, alt = 50, command = 16): MissionItem =>
  ({ seq, frame: 3, command, current: false, autocontinue: true, param1: 0, param2: 0, param3: 0, param4: 0, latitude: lat, longitude: lng, altitude: alt } as MissionItem);

describe('mission package', () => {
  it('recognises a package and rejects other JSON', () => {
    const pkg = { format: 'ardudeck-mission', version: 1, id: 'north', name: 'North', sharedBy: { id: 'a', name: 'Ann' }, sharedAt: 1, mission: { items: [], home: null } };
    expect(isMissionPackage(pkg)).toBe(true);
    expect(isMissionPackage({ ...pkg, format: 'other' })).toBe(false);
    expect(isMissionPackage({ ...pkg, mission: {} })).toBe(false);
    expect(isMissionPackage(null)).toBe(false);
  });

  it('counts moved, added and removed waypoints', () => {
    const mine = [wp(0, 47, 8), wp(1, 47.001, 8), wp(2, 47.002, 8)];
    const theirs = [wp(0, 47, 8), wp(1, 47.0012, 8), wp(2, 47.002, 8, 80), wp(3, 47.003, 8)];
    expect(diffMissionItems(mine, theirs)).toEqual({ moved: 2, added: 1, removed: 0, unchanged: false });
    expect(diffMissionItems(theirs, mine)).toEqual({ moved: 2, added: 0, removed: 1, unchanged: false });
    expect(diffMissionItems(mine, mine).unchanged).toBe(true);
  });

  it('ignores sub-metre jitter', () => {
    expect(diffMissionItems([wp(0, 47, 8)], [wp(0, 47.000001, 8)]).unchanged).toBe(true);
  });
});
