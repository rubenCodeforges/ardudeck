// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useMissionStore } from '../stores/mission-store';
import { useFenceStore } from '../stores/fence-store';
import { useRallyStore } from '../stores/rally-store';
import { applyMissionPackage, buildMissionPackage, packageIdFor } from './mission-share';
import type { MissionItem } from '../../shared/mission-types';

const wp = (seq: number, lat: number, lng: number): MissionItem =>
  ({ seq, frame: 3, command: 16, current: false, autocontinue: true, param1: 0, param2: 0, param3: 0, param4: 0, latitude: lat, longitude: lng, altitude: 60 } as MissionItem);
const who = { id: 'me', name: 'Ann' };

describe('mission share round trip', () => {
  it('keeps the same id for the same mission name', () => {
    expect(packageIdFor('North Field  Survey!')).toBe('north-field-survey');
    expect(packageIdFor('  ')).toBe('mission');
  });

  it('carries mission, home, fence and rally into a fresh editor', () => {
    useMissionStore.getState().setHomePosition(47, 8, 450);
    useMissionStore.getState().setMissionItemsFromFile([wp(0, 47.001, 8), wp(1, 47.002, 8.001)]);
    useFenceStore.getState().setFenceItemsFromFile([
      { seq: 0, command: 5002, frame: 0, param1: 3, param2: 0, param3: 0, param4: 0, latitude: 47, longitude: 8, altitude: 0 },
      { seq: 1, command: 5002, frame: 0, param1: 3, param2: 0, param3: 0, param4: 0, latitude: 47.001, longitude: 8, altitude: 0 },
      { seq: 2, command: 5002, frame: 0, param1: 3, param2: 0, param3: 0, param4: 0, latitude: 47.001, longitude: 8.001, altitude: 0 },
    ] as never);
    useRallyStore.getState().setRallyPoints([{ seq: 0, latitude: 47.0005, longitude: 8.0005, altitude: 30, breakAltitude: 0, landDirection: 0, flags: 0 }]);

    const pkg = buildMissionPackage('North', { fence: true, rally: true, survey: true, vehicleProfile: false }, 'new hedge', who);
    expect(pkg.mission.items).toHaveLength(2);
    expect(pkg.mission.home).toEqual({ lat: 47, lon: 8, alt: 450 });
    expect(pkg.note).toBe('new hedge');

    useMissionStore.getState().setMissionItemsFromFile([]);
    useFenceStore.getState().setFenceItemsFromFile([]);
    useRallyStore.getState().setRallyPoints([]);

    applyMissionPackage(pkg);
    expect(useMissionStore.getState().missionItems.map((i) => i.latitude)).toEqual([47.001, 47.002]);
    expect(useMissionStore.getState().homePosition).toMatchObject({ lat: 47, lon: 8 });
    expect(useFenceStore.getState().polygons).toHaveLength(1);
    expect(useFenceStore.getState().polygons[0]!.type).toBe('exclusion');
    expect(useRallyStore.getState().rallyPoints).toHaveLength(1);
  });

  it('leaves out what was not ticked', () => {
    const pkg = buildMissionPackage('North', { fence: false, rally: false, survey: false, vehicleProfile: false }, '', who);
    expect(pkg.fence).toBeNull();
    expect(pkg.rally).toBeNull();
    expect(pkg.note).toBeUndefined();
  });
});
