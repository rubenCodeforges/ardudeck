// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useMissionStore } from './mission-store';
import { useConnectionStore } from './connection-store';
import { useSettingsStore } from './settings-store';
import type { MissionItem } from '../../shared/mission-types';
import { MAV_CMD, MAV_FRAME } from '../../shared/mission-types';

function wp(seq: number, lat: number): MissionItem {
  return {
    seq, frame: MAV_FRAME.GLOBAL_RELATIVE_ALT, command: MAV_CMD.NAV_WAYPOINT, current: seq === 0, autocontinue: true,
    param1: 0, param2: 0, param3: 0, param4: 0, latitude: lat, longitude: 7, altitude: 50,
  };
}

/** A 3-item mission as the FC sends it: seq 0, 1, 2. */
const fromFc = () => [wp(0, 51.0), wp(1, 51.1), wp(2, 51.2)];

function connectAs(firmware: 'ardupilot' | 'px4' | 'custom') {
  useConnectionStore.setState((s) => ({
    connectionState: { ...s.connectionState, isConnected: true, protocol: 'mavlink', firmware },
  }));
}

const uploaded = vi.fn(async (_items: MissionItem[]) => ({ success: true }));

beforeEach(() => {
  useMissionStore.getState().reset();
  uploaded.mockClear();
  (window as unknown as { electronAPI: unknown }).electronAPI = { uploadMission: uploaded };
});

describe('mission seq 0', () => {
  it('ArduPilot: seq 0 is HOME, so a download keeps 2 waypoints and the home position', () => {
    connectAs('ardupilot');
    useMissionStore.getState().setMissionItems(fromFc());
    const s = useMissionStore.getState();
    expect(s.missionItems.map((i) => i.latitude)).toEqual([51.1, 51.2]);
    expect(s.homePosition?.lat).toBe(51.0);
  });

  it.each(['custom', 'px4'] as const)('%s (INAV over MAVLink, Vehicle SDK, PX4): seq 0 is the first waypoint', (fw) => {
    connectAs(fw);
    useMissionStore.getState().setMissionItems(fromFc());
    expect(useMissionStore.getState().missionItems.map((i) => i.latitude)).toEqual([51.0, 51.1, 51.2]);
  });

  it('a generic autopilot never gets a HOME slot, even with the planner toggle on ArduPilot', () => {
    useSettingsStore.getState().updateMissionDefaults({ missionFirmware: 'ardupilot' });
    connectAs('custom');
    useMissionStore.getState().setMissionItems(fromFc());
    expect(useMissionStore.getState().missionItems).toHaveLength(3);
  });

  it('upload adds a HOME slot only for ArduPilot', async () => {
    connectAs('ardupilot');
    useMissionStore.getState().setMissionItems(fromFc());
    await useMissionStore.getState().uploadMission();
    expect(uploaded.mock.calls[0]![0]).toHaveLength(3);

    useMissionStore.getState().reset();
    connectAs('custom');
    useMissionStore.getState().setMissionItems(fromFc());
    useMissionStore.setState({ homePosition: { lat: 60, lon: 7, alt: 0 } });
    await useMissionStore.getState().uploadMission();
    const sent = uploaded.mock.calls[1]![0];
    expect(sent.map((i) => i.latitude)).toEqual([51.0, 51.1, 51.2]);
  });
});
