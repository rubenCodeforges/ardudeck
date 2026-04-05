import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSettingsStore } from '../settings-store';
import type { VehicleProfile, BoardStats } from '../settings-store';

// Mock window.electronAPI to prevent IPC calls during tests
vi.stubGlobal('window', {
  electronAPI: {
    saveSettings: vi.fn().mockResolvedValue(undefined),
    loadSettings: vi.fn().mockResolvedValue(null),
  },
});

/**
 * Helper: create a vehicle profile with required fields and optional overrides.
 */
function makeVehicle(overrides: Partial<VehicleProfile> & { id: string; name: string }): VehicleProfile {
  return {
    type: 'copter',
    weight: 500,
    batteryCells: 4,
    batteryCapacity: 1500,
    ...overrides,
  };
}

/**
 * Reset the store to a known state before each test.
 * Sets _isInitialized so actions don't bail out.
 */
function resetStore(vehicles: VehicleProfile[], activeId: string | null) {
  useSettingsStore.setState({
    vehicles,
    activeVehicleId: activeId,
    _isInitialized: true,
  });
}

// ─── associateBoard ─────────────────────────────────────────────────────────

describe('associateBoard', () => {
  beforeEach(() => {
    // Start with a single unbound default vehicle
    resetStore(
      [makeVehicle({ id: 'v1', name: 'My Copter' })],
      'v1',
    );
  });

  it('assigns boardUid to the active profile when it has no board yet', () => {
    const result = useSettingsStore.getState().associateBoard('uid-abc', 'Pixhawk4', 'Pix4');

    const state = useSettingsStore.getState();
    const vehicle = state.vehicles.find(v => v.id === 'v1');

    expect(result).toBe('v1');
    expect(vehicle?.boardUid).toBe('uid-abc');
    expect(vehicle?.boardId).toBe('Pixhawk4');
    expect(vehicle?.boardName).toBe('Pix4');
    expect(vehicle?.lastConnected).toBeDefined();
    // Active vehicle should remain unchanged
    expect(state.activeVehicleId).toBe('v1');
  });

  it('sets lastConnected to a valid ISO date string', () => {
    const before = new Date().toISOString();
    useSettingsStore.getState().associateBoard('uid-abc');
    const after = new Date().toISOString();

    const vehicle = useSettingsStore.getState().vehicles.find(v => v.id === 'v1');
    expect(vehicle?.lastConnected).toBeDefined();
    // Timestamp should be between before and after
    expect(vehicle!.lastConnected! >= before).toBe(true);
    expect(vehicle!.lastConnected! <= after).toBe(true);
  });

  it('switches to existing profile when boardUid already exists', () => {
    // Set up two vehicles: v1 is active (bound to uid-111), v2 is bound to uid-222
    resetStore(
      [
        makeVehicle({ id: 'v1', name: 'Copter A', boardUid: 'uid-111' }),
        makeVehicle({ id: 'v2', name: 'Copter B', boardUid: 'uid-222' }),
      ],
      'v1',
    );

    const result = useSettingsStore.getState().associateBoard('uid-222', 'fmuv3');

    const state = useSettingsStore.getState();
    expect(result).toBe('v2');
    expect(state.activeVehicleId).toBe('v2');
    // Should update boardId on the matched profile
    const v2 = state.vehicles.find(v => v.id === 'v2');
    expect(v2?.boardId).toBe('fmuv3');
    expect(v2?.lastConnected).toBeDefined();
  });

  it('updates boardId and boardName on existing profile match', () => {
    resetStore(
      [makeVehicle({ id: 'v1', name: 'Old Name', boardUid: 'uid-xyz' })],
      'v1',
    );

    useSettingsStore.getState().associateBoard('uid-xyz', 'NewBoardId', 'NewBoardName');

    const vehicle = useSettingsStore.getState().vehicles.find(v => v.id === 'v1');
    expect(vehicle?.boardId).toBe('NewBoardId');
    expect(vehicle?.boardName).toBe('NewBoardName');
  });

  it('does not overwrite boardId/boardName with undefined on existing match', () => {
    resetStore(
      [makeVehicle({ id: 'v1', name: 'Copter', boardUid: 'uid-abc', boardId: 'OldId', boardName: 'OldName' })],
      'v1',
    );

    // Associate with same UID but no boardId/boardName
    useSettingsStore.getState().associateBoard('uid-abc');

    const vehicle = useSettingsStore.getState().vehicles.find(v => v.id === 'v1');
    // Original values should be preserved (spread with falsy guard)
    expect(vehicle?.boardId).toBe('OldId');
    expect(vehicle?.boardName).toBe('OldName');
  });

  it('creates a new profile when active profile already has a different board', () => {
    // v1 is active and already bound to uid-111
    resetStore(
      [makeVehicle({ id: 'v1', name: 'Copter A', boardUid: 'uid-111', type: 'plane', weight: 2000 })],
      'v1',
    );

    const result = useSettingsStore.getState().associateBoard('uid-999', 'CubeOrange', 'Cube');

    const state = useSettingsStore.getState();
    // Should have created a new vehicle
    expect(state.vehicles).toHaveLength(2);
    expect(result).not.toBe('v1');
    expect(state.activeVehicleId).toBe(result);

    const newVehicle = state.vehicles.find(v => v.id === result);
    expect(newVehicle).toBeDefined();
    expect(newVehicle?.boardUid).toBe('uid-999');
    expect(newVehicle?.boardId).toBe('CubeOrange');
    expect(newVehicle?.boardName).toBe('Cube');
    expect(newVehicle?.lastConnected).toBeDefined();
    // Should be a blank profile with defaults (not cloned)
    expect(newVehicle?.type).toBe('copter');
    expect(newVehicle?.weight).toBe(500);
    expect(newVehicle?.boardStats).toBeUndefined();
  });

  it('uses boardName as the new profile name when cloning', () => {
    resetStore(
      [makeVehicle({ id: 'v1', name: 'Copter A', boardUid: 'uid-111' })],
      'v1',
    );

    useSettingsStore.getState().associateBoard('uid-new', 'fmuv3', 'My Custom Board');

    const state = useSettingsStore.getState();
    const newVehicle = state.vehicles.find(v => v.id === state.activeVehicleId);
    expect(newVehicle?.name).toBe('My Custom Board');
  });

  it('falls back to boardId for profile name when boardName is not provided', () => {
    resetStore(
      [makeVehicle({ id: 'v1', name: 'Copter A', boardUid: 'uid-111' })],
      'v1',
    );

    useSettingsStore.getState().associateBoard('uid-new', 'Pixhawk6X');

    const state = useSettingsStore.getState();
    const newVehicle = state.vehicles.find(v => v.id === state.activeVehicleId);
    expect(newVehicle?.name).toBe('Pixhawk6X');
  });

  it('uses "New Board" as fallback name when no boardName or boardId provided', () => {
    resetStore(
      [makeVehicle({ id: 'v1', name: 'Copter A', boardUid: 'uid-111' })],
      'v1',
    );

    useSettingsStore.getState().associateBoard('uid-new');

    const state = useSettingsStore.getState();
    const newVehicle = state.vehicles.find(v => v.id === state.activeVehicleId);
    expect(newVehicle?.name).toBe('New Board');
  });

  it('works with only boardUid (no boardId or boardName)', () => {
    // Active profile has no board → should claim it
    const result = useSettingsStore.getState().associateBoard('uid-only');

    const vehicle = useSettingsStore.getState().vehicles.find(v => v.id === 'v1');
    expect(result).toBe('v1');
    expect(vehicle?.boardUid).toBe('uid-only');
    expect(vehicle?.boardId).toBeUndefined();
    expect(vehicle?.boardName).toBeUndefined();
  });

  it('does not modify other vehicles when assigning to active profile', () => {
    resetStore(
      [
        makeVehicle({ id: 'v1', name: 'Active' }),
        makeVehicle({ id: 'v2', name: 'Other', boardUid: 'uid-other' }),
      ],
      'v1',
    );

    useSettingsStore.getState().associateBoard('uid-new', 'BoardX');

    const v2 = useSettingsStore.getState().vehicles.find(v => v.id === 'v2');
    expect(v2?.boardUid).toBe('uid-other');
    expect(v2?.boardId).toBeUndefined();
  });

  it('handles association when there is no active profile (null activeVehicleId)', () => {
    resetStore(
      [makeVehicle({ id: 'v1', name: 'Copter' })],
      null,
    );

    // No activeProfile found → should create a new vehicle
    const result = useSettingsStore.getState().associateBoard('uid-abc', 'Pixhawk4');

    const state = useSettingsStore.getState();
    // Should have created from template (first vehicle)
    expect(state.vehicles.length).toBeGreaterThanOrEqual(2);
    expect(state.activeVehicleId).toBe(result);
    const newVehicle = state.vehicles.find(v => v.id === result);
    expect(newVehicle?.boardUid).toBe('uid-abc');
  });

  it('returns the correct profile ID in all three code paths', () => {
    // Path 1: unbound active → claims it
    resetStore([makeVehicle({ id: 'p1', name: 'V1' })], 'p1');
    expect(useSettingsStore.getState().associateBoard('uid-1')).toBe('p1');

    // Path 2: existing match → switches to it
    resetStore(
      [
        makeVehicle({ id: 'p1', name: 'V1', boardUid: 'uid-A' }),
        makeVehicle({ id: 'p2', name: 'V2', boardUid: 'uid-B' }),
      ],
      'p1',
    );
    expect(useSettingsStore.getState().associateBoard('uid-B')).toBe('p2');

    // Path 3: active has different board → creates new
    resetStore([makeVehicle({ id: 'p1', name: 'V1', boardUid: 'uid-A' })], 'p1');
    const newId = useSettingsStore.getState().associateBoard('uid-C');
    expect(newId).not.toBe('p1');
    expect(typeof newId).toBe('string');
  });
});

// ─── updateBoardStats ───────────────────────────────────────────────────────

describe('updateBoardStats', () => {
  beforeEach(() => {
    resetStore(
      [makeVehicle({ id: 'v1', name: 'Copter', boardUid: 'uid-abc' })],
      'v1',
    );
  });

  it('sets board stats on the active vehicle', () => {
    const stats: BoardStats = {
      totalFlightTime: 3600,
      totalFlightCount: 42,
      totalRunTime: 7200,
      totalDistance: 50000,
      bootCount: 100,
    };

    useSettingsStore.getState().updateBoardStats(stats);

    const vehicle = useSettingsStore.getState().vehicles.find(v => v.id === 'v1');
    expect(vehicle?.boardStats?.totalFlightTime).toBe(3600);
    expect(vehicle?.boardStats?.totalFlightCount).toBe(42);
    expect(vehicle?.boardStats?.totalRunTime).toBe(7200);
    expect(vehicle?.boardStats?.totalDistance).toBe(50000);
    expect(vehicle?.boardStats?.bootCount).toBe(100);
    expect(vehicle?.boardStats?.lastUpdated).toBeDefined();
  });

  it('adds lastUpdated timestamp', () => {
    const before = new Date().toISOString();
    useSettingsStore.getState().updateBoardStats({ totalFlightCount: 1 });
    const after = new Date().toISOString();

    const vehicle = useSettingsStore.getState().vehicles.find(v => v.id === 'v1');
    expect(vehicle?.boardStats?.lastUpdated).toBeDefined();
    expect(vehicle!.boardStats!.lastUpdated! >= before).toBe(true);
    expect(vehicle!.boardStats!.lastUpdated! <= after).toBe(true);
  });

  it('merges partial stats without overwriting existing values', () => {
    // First update: set some stats
    useSettingsStore.getState().updateBoardStats({
      totalFlightCount: 10,
      totalFlightTime: 1000,
    });

    // Second update: add more stats
    useSettingsStore.getState().updateBoardStats({
      totalDistance: 5000,
      bootCount: 50,
    });

    const vehicle = useSettingsStore.getState().vehicles.find(v => v.id === 'v1');
    expect(vehicle?.boardStats?.totalFlightCount).toBe(10);
    expect(vehicle?.boardStats?.totalFlightTime).toBe(1000);
    expect(vehicle?.boardStats?.totalDistance).toBe(5000);
    expect(vehicle?.boardStats?.bootCount).toBe(50);
  });

  it('overwrites stats values when they change', () => {
    useSettingsStore.getState().updateBoardStats({ totalFlightCount: 10 });
    useSettingsStore.getState().updateBoardStats({ totalFlightCount: 20 });

    const vehicle = useSettingsStore.getState().vehicles.find(v => v.id === 'v1');
    expect(vehicle?.boardStats?.totalFlightCount).toBe(20);
  });

  it('does nothing when there is no active vehicle', () => {
    resetStore(
      [makeVehicle({ id: 'v1', name: 'Copter' })],
      null,
    );

    useSettingsStore.getState().updateBoardStats({ totalFlightCount: 5 });

    const vehicle = useSettingsStore.getState().vehicles.find(v => v.id === 'v1');
    expect(vehicle?.boardStats).toBeUndefined();
  });

  it('only updates the active vehicle, not others', () => {
    resetStore(
      [
        makeVehicle({ id: 'v1', name: 'Active', boardUid: 'uid-1' }),
        makeVehicle({ id: 'v2', name: 'Other', boardUid: 'uid-2' }),
      ],
      'v1',
    );

    useSettingsStore.getState().updateBoardStats({ totalFlightCount: 99 });

    const v1 = useSettingsStore.getState().vehicles.find(v => v.id === 'v1');
    const v2 = useSettingsStore.getState().vehicles.find(v => v.id === 'v2');
    expect(v1?.boardStats?.totalFlightCount).toBe(99);
    expect(v2?.boardStats).toBeUndefined();
  });

  it('handles empty stats object without error', () => {
    useSettingsStore.getState().updateBoardStats({});

    const vehicle = useSettingsStore.getState().vehicles.find(v => v.id === 'v1');
    // Should still set lastUpdated even with empty stats
    expect(vehicle?.boardStats?.lastUpdated).toBeDefined();
  });

  it('handles zero values correctly (not treated as falsy)', () => {
    useSettingsStore.getState().updateBoardStats({
      totalFlightCount: 0,
      totalFlightTime: 0,
      bootCount: 0,
    });

    const vehicle = useSettingsStore.getState().vehicles.find(v => v.id === 'v1');
    expect(vehicle?.boardStats?.totalFlightCount).toBe(0);
    expect(vehicle?.boardStats?.totalFlightTime).toBe(0);
    expect(vehicle?.boardStats?.bootCount).toBe(0);
  });
});

// ─── VehicleProfile board fields ────────────────────────────────────────────

describe('VehicleProfile board fields', () => {
  it('new vehicles from addVehicle can include board fields', () => {
    resetStore([], null);

    const id = useSettingsStore.getState().addVehicle({
      name: 'Board Vehicle',
      type: 'copter',
      weight: 600,
      batteryCells: 4,
      batteryCapacity: 1500,
      boardUid: 'uid-test',
      boardId: 'Pixhawk4',
      boardName: 'My Pixhawk',
      lastConnected: '2025-01-01T00:00:00.000Z',
    });

    const vehicle = useSettingsStore.getState().vehicles.find(v => v.id === id);
    expect(vehicle?.boardUid).toBe('uid-test');
    expect(vehicle?.boardId).toBe('Pixhawk4');
    expect(vehicle?.boardName).toBe('My Pixhawk');
    expect(vehicle?.lastConnected).toBe('2025-01-01T00:00:00.000Z');
  });

  it('updateVehicle can set board fields', () => {
    resetStore(
      [makeVehicle({ id: 'v1', name: 'Copter' })],
      'v1',
    );

    useSettingsStore.getState().updateVehicle('v1', {
      boardUid: 'uid-updated',
      boardId: 'CubeBlack',
    });

    const vehicle = useSettingsStore.getState().vehicles.find(v => v.id === 'v1');
    expect(vehicle?.boardUid).toBe('uid-updated');
    expect(vehicle?.boardId).toBe('CubeBlack');
  });

  it('updateVehicle can set boardStats directly', () => {
    resetStore(
      [makeVehicle({ id: 'v1', name: 'Copter' })],
      'v1',
    );

    useSettingsStore.getState().updateVehicle('v1', {
      boardStats: {
        totalFlightCount: 5,
        totalFlightTime: 300,
        lastUpdated: '2025-06-01T00:00:00.000Z',
      },
    });

    const vehicle = useSettingsStore.getState().vehicles.find(v => v.id === 'v1');
    expect(vehicle?.boardStats?.totalFlightCount).toBe(5);
    expect(vehicle?.boardStats?.totalFlightTime).toBe(300);
  });
});

// ─── BoardStats type ────────────────────────────────────────────────────────

describe('BoardStats interface', () => {
  it('supports all STAT_* parameter fields', () => {
    const stats: BoardStats = {
      totalFlightTime: 12345,
      totalFlightCount: 100,
      totalRunTime: 99999,
      totalDistance: 500000,
      bootCount: 200,
      lastUpdated: '2025-01-01T00:00:00.000Z',
    };

    expect(stats.totalFlightTime).toBe(12345);
    expect(stats.totalFlightCount).toBe(100);
    expect(stats.totalRunTime).toBe(99999);
    expect(stats.totalDistance).toBe(500000);
    expect(stats.bootCount).toBe(200);
    expect(stats.lastUpdated).toBe('2025-01-01T00:00:00.000Z');
  });

  it('all fields are optional', () => {
    const empty: BoardStats = {};
    expect(empty.totalFlightTime).toBeUndefined();
    expect(empty.totalFlightCount).toBeUndefined();
    expect(empty.totalRunTime).toBeUndefined();
    expect(empty.totalDistance).toBeUndefined();
    expect(empty.bootCount).toBeUndefined();
    expect(empty.lastUpdated).toBeUndefined();
  });
});

// ─── associateBoard + updateBoardStats integration ──────────────────────────

describe('board association + stats integration', () => {
  it('full lifecycle: associate → stats update → reconnect same board', () => {
    // Start with unbound profile
    resetStore(
      [makeVehicle({ id: 'v1', name: 'My Copter' })],
      'v1',
    );

    // Step 1: First connection — associates board
    const profileId = useSettingsStore.getState().associateBoard('uid-ABC', 'Pixhawk4');
    expect(profileId).toBe('v1');

    // Step 2: Parameters load — stats update
    useSettingsStore.getState().updateBoardStats({
      totalFlightCount: 42,
      totalFlightTime: 3600,
      bootCount: 100,
    });

    let vehicle = useSettingsStore.getState().vehicles.find(v => v.id === 'v1');
    expect(vehicle?.boardUid).toBe('uid-ABC');
    expect(vehicle?.boardStats?.totalFlightCount).toBe(42);

    // Step 3: Disconnect and reconnect same board
    // On reconnect, associateBoard should find the existing profile
    const reconnectId = useSettingsStore.getState().associateBoard('uid-ABC', 'Pixhawk4');
    expect(reconnectId).toBe('v1');
    expect(useSettingsStore.getState().activeVehicleId).toBe('v1');

    // Stats should still be there
    vehicle = useSettingsStore.getState().vehicles.find(v => v.id === 'v1');
    expect(vehicle?.boardStats?.totalFlightCount).toBe(42);
  });

  it('connects a second board while first is already associated', () => {
    // Start with board A already associated
    resetStore(
      [makeVehicle({ id: 'v1', name: 'Copter A', boardUid: 'uid-A', boardId: 'Pixhawk4' })],
      'v1',
    );

    // Connect board B — should create new profile
    const newId = useSettingsStore.getState().associateBoard('uid-B', 'CubeOrange');
    expect(newId).not.toBe('v1');

    // Update stats on new profile
    useSettingsStore.getState().updateBoardStats({ totalFlightCount: 5 });

    const state = useSettingsStore.getState();
    expect(state.vehicles).toHaveLength(2);

    const profileA = state.vehicles.find(v => v.boardUid === 'uid-A');
    const profileB = state.vehicles.find(v => v.boardUid === 'uid-B');
    expect(profileA?.boardStats).toBeUndefined(); // untouched
    expect(profileB?.boardStats?.totalFlightCount).toBe(5);

    // Reconnect board A — should switch back
    const switchBackId = useSettingsStore.getState().associateBoard('uid-A');
    expect(switchBackId).toBe('v1');
    expect(useSettingsStore.getState().activeVehicleId).toBe('v1');
  });

  it('new profile uses defaults instead of cloning from template', () => {
    resetStore(
      [makeVehicle({
        id: 'v1',
        name: 'Race Quad',
        boardUid: 'uid-race',
        type: 'copter',
        weight: 350,
        batteryCells: 6,
        batteryCapacity: 1100,
        frameSize: 127,
        motorCount: 4,
        motorKv: 2400,
      })],
      'v1',
    );

    const newId = useSettingsStore.getState().associateBoard('uid-new', 'MatekF405');
    const cloned = useSettingsStore.getState().vehicles.find(v => v.id === newId);

    // Should be a blank profile with defaults (not cloned from template)
    expect(cloned?.type).toBe('copter');
    expect(cloned?.weight).toBe(500);
    expect(cloned?.batteryCells).toBe(4);
    expect(cloned?.batteryCapacity).toBe(1500);
    // Board identity should be the new board's
    expect(cloned?.boardUid).toBe('uid-new');
    expect(cloned?.boardId).toBe('MatekF405');
  });
});
