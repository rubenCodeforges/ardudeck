import { beforeEach, describe, expect, it } from 'vitest';
import { useMissionStore } from '../stores/mission-store';
import { applyMissionProposal } from './proposal-apply';
import { getPendingProposal, proposeSurvey } from './module-proposal-registry';
import { MAV_CMD } from '../../shared/mission-types';

const pts = [
  { lat: 47.1, lng: 8.1, altitude: 30 },
  { lat: 47.101, lng: 8.101, altitude: 40 },
  { lat: 47.102, lng: 8.102, altitude: 50 },
];

describe('applyMissionProposal', () => {
  beforeEach(() => {
    useMissionStore.setState({ missionItems: [], groups: [] });
  });

  it('adds items as their own group with the requested commands and a trailing RTL', () => {
    const r = applyMissionProposal('AI agent', { name: 'Leg', reason: 'test', items: pts }, {
      commands: [{ command: 'takeoff' }, { command: 'loiter_time', holdSeconds: 12 }, { command: 'waypoint', holdSeconds: 3 }],
      returnToLaunch: true,
    });
    const { missionItems, groups } = useMissionStore.getState();
    expect(r).toEqual({ accepted: true, pointsAccepted: 4 });
    expect(groups).toHaveLength(1);
    expect(missionItems.map((i) => i.command)).toEqual([MAV_CMD.NAV_TAKEOFF, MAV_CMD.NAV_LOITER_TIME, MAV_CMD.NAV_WAYPOINT, MAV_CMD.NAV_RETURN_TO_LAUNCH]);
    expect(missionItems[1]!.param1).toBe(12);
    expect(missionItems[2]!.param1).toBe(3);
    expect(missionItems.every((i) => i.groupId === groups[0]!.id)).toBe(true);
    expect(missionItems.map((i) => i.seq)).toEqual([0, 1, 2, 3]);
  });

  it('appends after the existing plan', () => {
    applyMissionProposal('AI agent', { name: 'A', reason: 'r', items: pts.slice(0, 1) });
    applyMissionProposal('AI agent', { name: 'B', reason: 'r', items: pts.slice(1) });
    const { missionItems, groups } = useMissionStore.getState();
    expect(groups).toHaveLength(2);
    expect(missionItems.map((i) => i.seq)).toEqual([0, 1, 2]);
  });
});

describe('proposeSurvey', () => {
  it('refuses an area with fewer than three points, but takes a two-point corridor', async () => {
    const area = await proposeSurvey('mcp-agent', 'AI agent', { name: 'S', reason: 'r', polygon: pts.slice(0, 2), pattern: 'grid', altitudeM: 50, areaM2: 0 });
    expect(area.accepted).toBe(false);
    expect(getPendingProposal()).toBeNull();

    const corridor = proposeSurvey('mcp-agent', 'AI agent', { name: 'C', reason: 'r', polygon: pts.slice(0, 2), pattern: 'corridor', altitudeM: 50, areaM2: 0 });
    const pending = getPendingProposal();
    expect(pending?.kind).toBe('survey');
    pending!.resolve({ accepted: false });
    expect((await corridor).accepted).toBe(false);
  });
});
