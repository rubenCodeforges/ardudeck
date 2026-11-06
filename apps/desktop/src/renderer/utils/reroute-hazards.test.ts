// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';
import { useMissionStore, allowHazardCrossingOnce } from '../stores/mission-store';
import { useHazardsStore } from '../stores/hazards-store';
import { hazardCrossings, validateMission } from '../../shared/mission-validation';
import { rerouteAroundHazards } from './reroute-hazards';
import type { Hazard } from '../../shared/hazard-types';
import type { MissionItem } from '../../shared/mission-types';

const lat0 = 47.4;
const lon0 = 8.5;
const at = (e: number, n: number) => ({ lat: lat0 + n / 111_320, lon: lon0 + e / (111_320 * Math.cos((lat0 * Math.PI) / 180)) });
const wp = (seq: number, p: { lat: number; lon: number }): MissionItem =>
  ({ seq, frame: 3, command: 16, current: false, autocontinue: true, param1: 0, param2: 0, param3: 0, param4: 0, latitude: p.lat, longitude: p.lon, altitude: 60 } as MissionItem);
const zone: Hazard = {
  id: 'pl', name: 'Power line', bufferM: 15, uploadAsFence: false, createdAt: 0,
  shape: { kind: 'polygon', points: [at(-100, -100), at(100, -100), at(100, 100), at(-100, 100)] },
};

describe('hazards in the planner', () => {
  beforeEach(() => {
    useHazardsStore.setState({ hazards: [zone] });
    useMissionStore.getState().setMissionItemsFromFile([wp(0, at(-400, 0)), wp(1, at(400, 0)), wp(2, at(400, 300))]);
  });

  it('flags the leg as a pre-flight error', () => {
    const v = validateMission(useMissionStore.getState().missionItems, [], { hazards: [zone] });
    expect(v.checks.some((c) => c.id.startsWith('hazard:') && c.severity === 'error')).toBe(true);
  });

  it('routes around the zone until no leg crosses it', () => {
    const r = rerouteAroundHazards();
    expect(r.rerouted).toBe(1);
    const items = useMissionStore.getState().missionItems;
    expect(items.length).toBeGreaterThan(3);
    expect(hazardCrossings(items, [zone])).toHaveLength(0);
    expect(items[items.length - 1]!.latitude).toBeCloseTo(at(400, 300).lat, 9);
  });

  it('refuses the upload, and lets exactly one through after an admin override', async () => {
    expect(await useMissionStore.getState().uploadMission()).toBe(false);
    expect(useMissionStore.getState().error).toBeTruthy();
    allowHazardCrossingOnce();
    (window as unknown as { electronAPI: unknown }).electronAPI = { uploadMission: async () => ({ success: true }) };
    await useMissionStore.getState().uploadMission();
    expect(useMissionStore.getState().error ?? '').not.toContain('locked');
    expect(await useMissionStore.getState().uploadMission()).toBe(false);
  });
});
