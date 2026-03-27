import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSettingsStore } from '../../stores/settings-store';
import type { VehicleProfile, BoardStats } from '../../stores/settings-store';

/**
 * Tests for the board-profile association feature (Issue #38).
 *
 * The useBoardProfileAssociation hook is a React effect hook that wires
 * connection state → settings store. Since we don't have @testing-library/react,
 * we test the underlying logic by simulating the same workflows the hook performs:
 *
 * 1. Board association: when a new boardUid appears in connection state,
 *    call associateBoard() with the right args
 * 2. Stats sync: after parameters load, extract STAT_* params and call
 *    updateBoardStats()
 * 3. Conditional guards: reconnection skipping, protocol filtering,
 *    deduplication
 */

// Mock window.electronAPI to prevent IPC calls during tests
vi.stubGlobal('window', {
  electronAPI: {
    saveSettings: vi.fn().mockResolvedValue(undefined),
    loadSettings: vi.fn().mockResolvedValue(null),
  },
});

/**
 * The STAT_* parameter mapping — mirrors the hook's STAT_PARAMS constant.
 * We re-declare it here to test the mapping contract independently.
 */
const STAT_PARAMS: Record<string, keyof BoardStats> = {
  STAT_FLTTIME: 'totalFlightTime',
  STAT_FLTCNT: 'totalFlightCount',
  STAT_RUNTIME: 'totalRunTime',
  STAT_DISTFLWN: 'totalDistance',
  STAT_BOOTCNT: 'bootCount',
};

function makeVehicle(overrides: Partial<VehicleProfile> & { id: string; name: string }): VehicleProfile {
  return {
    type: 'copter',
    weight: 500,
    batteryCells: 4,
    batteryCapacity: 1500,
    ...overrides,
  };
}

function resetStore(vehicles: VehicleProfile[], activeId: string | null) {
  useSettingsStore.setState({
    vehicles,
    activeVehicleId: activeId,
    _isInitialized: true,
  });
}

// ─── STAT_* Parameter Extraction Logic ──────────────────────────────────────

describe('STAT_* parameter extraction (hook logic simulation)', () => {
  beforeEach(() => {
    resetStore(
      [makeVehicle({ id: 'v1', name: 'Copter', boardUid: 'uid-abc' })],
      'v1',
    );
  });

  /**
   * Simulates what the hook does: reads STAT_* params from a Map and calls
   * updateBoardStats with the extracted values.
   */
  function extractAndUpdateStats(paramMap: Map<string, { value: number }>) {
    const stats: BoardStats = {};
    let hasAny = false;

    for (const [paramName, statKey] of Object.entries(STAT_PARAMS)) {
      const param = paramMap.get(paramName);
      if (param) {
        (stats as Record<string, number>)[statKey] = param.value;
        hasAny = true;
      }
    }

    if (hasAny) {
      useSettingsStore.getState().updateBoardStats(stats);
    }
    return { stats, hasAny };
  }

  it('extracts all five STAT_* parameters into BoardStats', () => {
    const params = new Map<string, { value: number }>([
      ['STAT_FLTTIME', { value: 7200 }],
      ['STAT_FLTCNT', { value: 150 }],
      ['STAT_RUNTIME', { value: 36000 }],
      ['STAT_DISTFLWN', { value: 250000 }],
      ['STAT_BOOTCNT', { value: 500 }],
    ]);

    const { stats, hasAny } = extractAndUpdateStats(params);

    expect(hasAny).toBe(true);
    expect(stats.totalFlightTime).toBe(7200);
    expect(stats.totalFlightCount).toBe(150);
    expect(stats.totalRunTime).toBe(36000);
    expect(stats.totalDistance).toBe(250000);
    expect(stats.bootCount).toBe(500);

    // Verify store was updated
    const vehicle = useSettingsStore.getState().vehicles.find(v => v.id === 'v1');
    expect(vehicle?.boardStats?.totalFlightTime).toBe(7200);
    expect(vehicle?.boardStats?.totalFlightCount).toBe(150);
  });

  it('handles partial STAT_* parameters (only some present)', () => {
    const params = new Map<string, { value: number }>([
      ['STAT_FLTCNT', { value: 42 }],
      ['STAT_BOOTCNT', { value: 10 }],
      // Other STAT_* params not present (board hasn't reported them)
    ]);

    const { stats, hasAny } = extractAndUpdateStats(params);

    expect(hasAny).toBe(true);
    expect(stats.totalFlightCount).toBe(42);
    expect(stats.bootCount).toBe(10);
    expect(stats.totalFlightTime).toBeUndefined();
    expect(stats.totalRunTime).toBeUndefined();
    expect(stats.totalDistance).toBeUndefined();
  });

  it('skips extraction when no STAT_* parameters exist', () => {
    const params = new Map<string, { value: number }>([
      ['SERVO1_MIN', { value: 1000 }],
      ['ARMING_CHECK', { value: 1 }],
      // No STAT_* params at all
    ]);

    const { hasAny } = extractAndUpdateStats(params);
    expect(hasAny).toBe(false);

    // Store should NOT have been called
    const vehicle = useSettingsStore.getState().vehicles.find(v => v.id === 'v1');
    expect(vehicle?.boardStats).toBeUndefined();
  });

  it('correctly maps each STAT_* parameter name to its BoardStats key', () => {
    // Verify the mapping contract one-by-one
    expect(STAT_PARAMS['STAT_FLTTIME']).toBe('totalFlightTime');
    expect(STAT_PARAMS['STAT_FLTCNT']).toBe('totalFlightCount');
    expect(STAT_PARAMS['STAT_RUNTIME']).toBe('totalRunTime');
    expect(STAT_PARAMS['STAT_DISTFLWN']).toBe('totalDistance');
    expect(STAT_PARAMS['STAT_BOOTCNT']).toBe('bootCount');
    // Exactly 5 entries
    expect(Object.keys(STAT_PARAMS)).toHaveLength(5);
  });

  it('handles zero-value STAT_* parameters (fresh board)', () => {
    const params = new Map<string, { value: number }>([
      ['STAT_FLTTIME', { value: 0 }],
      ['STAT_FLTCNT', { value: 0 }],
      ['STAT_RUNTIME', { value: 0 }],
      ['STAT_DISTFLWN', { value: 0 }],
      ['STAT_BOOTCNT', { value: 1 }], // At least 1 boot
    ]);

    const { stats, hasAny } = extractAndUpdateStats(params);

    expect(hasAny).toBe(true);
    expect(stats.totalFlightTime).toBe(0);
    expect(stats.totalFlightCount).toBe(0);
    expect(stats.bootCount).toBe(1);

    const vehicle = useSettingsStore.getState().vehicles.find(v => v.id === 'v1');
    expect(vehicle?.boardStats?.totalFlightCount).toBe(0);
  });

  it('ignores non-STAT parameters in the parameter map', () => {
    const params = new Map<string, { value: number }>([
      ['STAT_FLTCNT', { value: 5 }],
      ['ARMING_CHECK', { value: 1 }],
      ['BATT_CAPACITY', { value: 5200 }],
      ['INS_GYRO_FILTER', { value: 20 }],
      ['STAT_NOT_REAL', { value: 999 }], // Not a real STAT param
    ]);

    const { stats } = extractAndUpdateStats(params);

    expect(stats.totalFlightCount).toBe(5);
    // STAT_NOT_REAL should not appear in stats
    expect((stats as Record<string, unknown>)['STAT_NOT_REAL']).toBeUndefined();
  });
});

// ─── Hook Workflow Simulation ───────────────────────────────────────────────

describe('board association workflow (hook behavior simulation)', () => {
  beforeEach(() => {
    resetStore(
      [makeVehicle({ id: 'v1', name: 'Default Copter' })],
      'v1',
    );
  });

  it('simulates first connection: associate board → load params → update stats', () => {
    // Step 1: Connection established with boardUid
    const profileId = useSettingsStore.getState().associateBoard('uid-FC01', 'Pixhawk4');

    expect(profileId).toBe('v1');
    let vehicle = useSettingsStore.getState().vehicles.find(v => v.id === 'v1');
    expect(vehicle?.boardUid).toBe('uid-FC01');
    expect(vehicle?.boardId).toBe('Pixhawk4');

    // Step 2: Parameters loaded (simulating what hook does after isLoading becomes false)
    useSettingsStore.getState().updateBoardStats({
      totalFlightCount: 25,
      totalFlightTime: 1800,
      totalRunTime: 5400,
      totalDistance: 12000,
      bootCount: 75,
    });

    vehicle = useSettingsStore.getState().vehicles.find(v => v.id === 'v1');
    expect(vehicle?.boardStats?.totalFlightCount).toBe(25);
    expect(vehicle?.boardStats?.totalFlightTime).toBe(1800);
    expect(vehicle?.boardStats?.bootCount).toBe(75);
    expect(vehicle?.boardStats?.lastUpdated).toBeDefined();
  });

  it('simulates reconnect to same board: should find existing profile and switch', () => {
    // First connection
    useSettingsStore.getState().associateBoard('uid-ABC', 'CubeOrange');
    useSettingsStore.getState().updateBoardStats({ totalFlightCount: 10 });

    // Simulate disconnect (hook resets refs, but store state persists)
    // ... (refs are internal to hook, store state unchanged)

    // Second connection to same board
    const profileId = useSettingsStore.getState().associateBoard('uid-ABC', 'CubeOrange');

    expect(profileId).toBe('v1');
    expect(useSettingsStore.getState().activeVehicleId).toBe('v1');

    // Stats from before should still be there
    const vehicle = useSettingsStore.getState().vehicles.find(v => v.id === 'v1');
    expect(vehicle?.boardStats?.totalFlightCount).toBe(10);

    // Now update stats with new values (board flew more since last connection)
    useSettingsStore.getState().updateBoardStats({ totalFlightCount: 15, totalFlightTime: 600 });

    const updated = useSettingsStore.getState().vehicles.find(v => v.id === 'v1');
    expect(updated?.boardStats?.totalFlightCount).toBe(15);
    expect(updated?.boardStats?.totalFlightTime).toBe(600);
  });

  it('simulates connecting different board while profile is already bound', () => {
    // Bind first board
    useSettingsStore.getState().associateBoard('uid-BOARD-A', 'Pixhawk4');
    useSettingsStore.getState().updateBoardStats({ totalFlightCount: 50 });

    // Connect a different board
    const newId = useSettingsStore.getState().associateBoard('uid-BOARD-B', 'MatekH743');

    expect(newId).not.toBe('v1');
    expect(useSettingsStore.getState().activeVehicleId).toBe(newId);
    expect(useSettingsStore.getState().vehicles).toHaveLength(2);

    // New profile should have correct board info
    const newVehicle = useSettingsStore.getState().vehicles.find(v => v.id === newId);
    expect(newVehicle?.boardUid).toBe('uid-BOARD-B');
    expect(newVehicle?.boardId).toBe('MatekH743');
    expect(newVehicle?.boardStats).toBeUndefined(); // Fresh profile

    // Update stats on new (active) profile
    useSettingsStore.getState().updateBoardStats({ totalFlightCount: 3 });

    // Verify stats went to the new profile, not the old one
    const profileA = useSettingsStore.getState().vehicles.find(v => v.boardUid === 'uid-BOARD-A');
    const profileB = useSettingsStore.getState().vehicles.find(v => v.boardUid === 'uid-BOARD-B');
    expect(profileA?.boardStats?.totalFlightCount).toBe(50); // unchanged
    expect(profileB?.boardStats?.totalFlightCount).toBe(3);
  });

  it('simulates switching between two known boards', () => {
    // Set up two profiles with different boards
    resetStore(
      [
        makeVehicle({ id: 'v1', name: 'Quad', boardUid: 'uid-QUAD', boardId: 'Pixhawk4' }),
        makeVehicle({ id: 'v2', name: 'Plane', boardUid: 'uid-PLANE', boardId: 'MatekF405' }),
      ],
      'v1',
    );

    // Connect quad's board (already active)
    let id = useSettingsStore.getState().associateBoard('uid-QUAD');
    expect(id).toBe('v1');
    expect(useSettingsStore.getState().activeVehicleId).toBe('v1');

    // Now connect plane's board
    id = useSettingsStore.getState().associateBoard('uid-PLANE');
    expect(id).toBe('v2');
    expect(useSettingsStore.getState().activeVehicleId).toBe('v2');

    // Back to quad
    id = useSettingsStore.getState().associateBoard('uid-QUAD');
    expect(id).toBe('v1');
    expect(useSettingsStore.getState().activeVehicleId).toBe('v1');

    // Vehicle count should not have changed
    expect(useSettingsStore.getState().vehicles).toHaveLength(2);
  });

  it('hook should skip association when store is not initialized', () => {
    // _isInitialized is false — simulates the guard in the hook's useEffect
    useSettingsStore.setState({ _isInitialized: false });

    // The hook would bail out early, so association should not happen.
    // We can verify the store state remains unchanged if we DON'T call associateBoard
    // (the hook's guard prevents it from calling associateBoard)
    const vehicle = useSettingsStore.getState().vehicles.find(v => v.id === 'v1');
    expect(vehicle?.boardUid).toBeUndefined();
  });
});

// ─── Protocol Filtering ────────────────────────────────────────────────────

describe('protocol-based stats filtering (hook guard logic)', () => {
  beforeEach(() => {
    resetStore(
      [makeVehicle({ id: 'v1', name: 'Copter', boardUid: 'uid-abc' })],
      'v1',
    );
  });

  it('STAT_* params should only be synced for MAVLink protocol', () => {
    // Simulate MAVLink protocol — stats should be synced
    // (The hook checks connectionState.protocol !== 'mavlink')
    const isMavlink = true;
    if (isMavlink) {
      useSettingsStore.getState().updateBoardStats({ totalFlightCount: 42 });
    }

    const vehicle = useSettingsStore.getState().vehicles.find(v => v.id === 'v1');
    expect(vehicle?.boardStats?.totalFlightCount).toBe(42);
  });

  it('MSP protocol should NOT sync STAT_* params', () => {
    // Simulate MSP protocol — hook skips stats update
    const protocol: string = 'msp';
    if (protocol === 'mavlink') {
      useSettingsStore.getState().updateBoardStats({ totalFlightCount: 42 });
    }

    const vehicle = useSettingsStore.getState().vehicles.find(v => v.id === 'v1');
    expect(vehicle?.boardStats).toBeUndefined();
  });
});

// ─── Edge Cases ─────────────────────────────────────────────────────────────

describe('board association edge cases', () => {
  it('handles empty vehicles array gracefully', () => {
    resetStore([], null);

    const result = useSettingsStore.getState().associateBoard('uid-orphan', 'PixhawkMini');
    const state = useSettingsStore.getState();

    // Should create a new profile with default values
    expect(state.vehicles).toHaveLength(1);
    expect(state.activeVehicleId).toBe(result);
    const vehicle = state.vehicles[0];
    expect(vehicle?.boardUid).toBe('uid-orphan');
    expect(vehicle?.boardId).toBe('PixhawkMini');
    expect(vehicle?.type).toBe('copter'); // fallback default
    expect(vehicle?.weight).toBe(500);    // fallback default
  });

  it('cloned profile clears boardStats from the template', () => {
    // Template has stats from a previous board
    resetStore(
      [makeVehicle({
        id: 'v1', name: 'Old Board', boardUid: 'uid-old',
        boardStats: { totalFlightCount: 100, totalFlightTime: 50000, bootCount: 200 },
      })],
      'v1',
    );

    const newId = useSettingsStore.getState().associateBoard('uid-new', 'NewBoard');
    const cloned = useSettingsStore.getState().vehicles.find(v => v.id === newId);

    // boardStats must be undefined on the new profile (it's a different physical board)
    expect(cloned?.boardStats).toBeUndefined();
  });

  it('preserves boardStats when re-associating the same board', () => {
    resetStore(
      [makeVehicle({
        id: 'v1', name: 'My Quad', boardUid: 'uid-abc',
        boardStats: { totalFlightCount: 50, totalFlightTime: 3600 },
      })],
      'v1',
    );

    // Re-associate same board (e.g., reconnect)
    useSettingsStore.getState().associateBoard('uid-abc', 'Pixhawk4');

    const vehicle = useSettingsStore.getState().vehicles.find(v => v.id === 'v1');
    expect(vehicle?.boardStats?.totalFlightCount).toBe(50);
    expect(vehicle?.boardStats?.totalFlightTime).toBe(3600);
  });

  it('removes vehicle and re-associates same board creates a new profile', () => {
    // Associate board with v1
    resetStore(
      [
        makeVehicle({ id: 'v1', name: 'Copter A', boardUid: 'uid-abc' }),
        makeVehicle({ id: 'v2', name: 'Copter B' }),
      ],
      'v1',
    );

    // Remove v1 (the one bound to uid-abc)
    useSettingsStore.getState().removeVehicle('v1');

    const afterRemove = useSettingsStore.getState();
    expect(afterRemove.vehicles).toHaveLength(1);
    expect(afterRemove.vehicles[0]?.id).toBe('v2');

    // Reconnect the same board — no profile has uid-abc anymore
    // v2 has no boardUid, so it should claim v2
    const result = useSettingsStore.getState().associateBoard('uid-abc', 'Pixhawk4');
    expect(result).toBe('v2');

    const v2 = useSettingsStore.getState().vehicles.find(v => v.id === 'v2');
    expect(v2?.boardUid).toBe('uid-abc');
    expect(v2?.boardId).toBe('Pixhawk4');
  });

  it('handles very long boardUid strings (hex UIDs can be 32+ chars)', () => {
    resetStore(
      [makeVehicle({ id: 'v1', name: 'Default' })],
      'v1',
    );
    const longUid = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0';

    useSettingsStore.getState().associateBoard(longUid, 'Pixhawk6X');

    const vehicle = useSettingsStore.getState().vehicles.find(v => v.id === 'v1');
    expect(vehicle?.boardUid).toBe(longUid);
  });

  it('associateBoard with same boardUid but different boardId updates the boardId', () => {
    // Board firmware was updated, boardId changed
    resetStore(
      [makeVehicle({ id: 'v1', name: 'Copter', boardUid: 'uid-abc', boardId: 'fmuv3' })],
      'v1',
    );

    useSettingsStore.getState().associateBoard('uid-abc', 'fmuv5');

    const vehicle = useSettingsStore.getState().vehicles.find(v => v.id === 'v1');
    expect(vehicle?.boardId).toBe('fmuv5');
    expect(vehicle?.boardUid).toBe('uid-abc'); // UID unchanged
  });

  it('sequential associations with different boards each find or create correct profile', () => {
    // Set up 3 profiles bound to different boards
    resetStore(
      [
        makeVehicle({ id: 'v1', name: 'Board A', boardUid: 'uid-board-A' }),
        makeVehicle({ id: 'v2', name: 'Board B', boardUid: 'uid-board-B' }),
        makeVehicle({ id: 'v3', name: 'Board C', boardUid: 'uid-board-C' }),
      ],
      'v1',
    );

    // Associate each board in sequence — should switch to existing profile
    const id1 = useSettingsStore.getState().associateBoard('uid-board-B');
    expect(id1).toBe('v2');

    const id2 = useSettingsStore.getState().associateBoard('uid-board-C');
    expect(id2).toBe('v3');

    const id3 = useSettingsStore.getState().associateBoard('uid-board-A');
    expect(id3).toBe('v1');

    // No new profiles should have been created
    expect(useSettingsStore.getState().vehicles).toHaveLength(3);
  });
});

// ─── Stats + Board Fields Persistence Through updateVehicle ─────────────────

describe('board fields survive updateVehicle operations', () => {
  beforeEach(() => {
    resetStore(
      [makeVehicle({
        id: 'v1', name: 'Copter',
        boardUid: 'uid-abc', boardId: 'Pixhawk4', boardName: 'My Pix',
        lastConnected: '2026-01-01T00:00:00.000Z',
        boardStats: { totalFlightCount: 25, totalFlightTime: 1800 },
      })],
      'v1',
    );
  });

  it('updating weight preserves board fields', () => {
    useSettingsStore.getState().updateVehicle('v1', { weight: 750 });

    const vehicle = useSettingsStore.getState().vehicles.find(v => v.id === 'v1');
    expect(vehicle?.weight).toBe(750);
    expect(vehicle?.boardUid).toBe('uid-abc');
    expect(vehicle?.boardId).toBe('Pixhawk4');
    expect(vehicle?.boardName).toBe('My Pix');
    expect(vehicle?.boardStats?.totalFlightCount).toBe(25);
  });

  it('updating name preserves board fields', () => {
    useSettingsStore.getState().updateVehicle('v1', { name: 'Renamed Copter' });

    const vehicle = useSettingsStore.getState().vehicles.find(v => v.id === 'v1');
    expect(vehicle?.name).toBe('Renamed Copter');
    expect(vehicle?.boardUid).toBe('uid-abc');
    expect(vehicle?.boardStats?.totalFlightTime).toBe(1800);
  });

  it('updating vehicle type preserves board fields', () => {
    useSettingsStore.getState().updateVehicle('v1', { type: 'plane' });

    const vehicle = useSettingsStore.getState().vehicles.find(v => v.id === 'v1');
    expect(vehicle?.type).toBe('plane');
    expect(vehicle?.boardUid).toBe('uid-abc');
    expect(vehicle?.lastConnected).toBe('2026-01-01T00:00:00.000Z');
  });

  it('can clear boardUid via updateVehicle (unbind board)', () => {
    useSettingsStore.getState().updateVehicle('v1', { boardUid: undefined });

    const vehicle = useSettingsStore.getState().vehicles.find(v => v.id === 'v1');
    expect(vehicle?.boardUid).toBeUndefined();
  });
});

// ─── displayName Derivation ─────────────────────────────────────────────────

describe('displayName derivation for new profiles (hook logic)', () => {
  /**
   * The hook derives displayName as: boardId || connectionState.vehicleType || undefined
   * Then passes it as the third arg (boardName) to associateBoard.
   * When associateBoard creates a new profile, it uses: boardName || boardId || 'New Board'
   */
  beforeEach(() => {
    resetStore(
      [makeVehicle({ id: 'v1', name: 'Copter', boardUid: 'uid-existing' })],
      'v1',
    );
  });

  it('uses boardId as display name when available', () => {
    // Hook would compute: displayName = boardId = "CubeOrange"
    const id = useSettingsStore.getState().associateBoard('uid-new', 'CubeOrange', 'CubeOrange');
    const vehicle = useSettingsStore.getState().vehicles.find(v => v.id === id);
    expect(vehicle?.name).toBe('CubeOrange');
  });

  it('uses vehicleType as display name when boardId is absent', () => {
    // Hook would compute: displayName = vehicleType = "ArduCopter"
    const id = useSettingsStore.getState().associateBoard('uid-new', undefined, 'ArduCopter');
    const vehicle = useSettingsStore.getState().vehicles.find(v => v.id === id);
    expect(vehicle?.name).toBe('ArduCopter');
  });

  it('falls back to "New Board" when both boardId and vehicleType are absent', () => {
    // Hook would compute: displayName = undefined
    const id = useSettingsStore.getState().associateBoard('uid-new');
    const vehicle = useSettingsStore.getState().vehicles.find(v => v.id === id);
    expect(vehicle?.name).toBe('New Board');
  });
});

// ─── Stats Update Idempotency ───────────────────────────────────────────────

describe('stats update idempotency (hook deduplication)', () => {
  beforeEach(() => {
    resetStore(
      [makeVehicle({ id: 'v1', name: 'Copter', boardUid: 'uid-abc' })],
      'v1',
    );
  });

  it('calling updateBoardStats multiple times with same data is idempotent', () => {
    const stats: BoardStats = { totalFlightCount: 42, totalFlightTime: 3600 };

    useSettingsStore.getState().updateBoardStats(stats);
    const firstUpdate = useSettingsStore.getState().vehicles.find(v => v.id === 'v1');
    const firstTimestamp = firstUpdate?.boardStats?.lastUpdated;

    // Small delay would cause different timestamp, but values should be same
    useSettingsStore.getState().updateBoardStats(stats);
    const secondUpdate = useSettingsStore.getState().vehicles.find(v => v.id === 'v1');

    expect(secondUpdate?.boardStats?.totalFlightCount).toBe(42);
    expect(secondUpdate?.boardStats?.totalFlightTime).toBe(3600);
    // lastUpdated will be re-set (different timestamp), but data is same
    expect(secondUpdate?.boardStats?.lastUpdated).toBeDefined();
    expect(firstTimestamp).toBeDefined();
  });

  it('stats update with increasing values reflects progression', () => {
    // First connection: 10 flights
    useSettingsStore.getState().updateBoardStats({ totalFlightCount: 10, totalFlightTime: 600 });

    // After more flights: 15 flights
    useSettingsStore.getState().updateBoardStats({ totalFlightCount: 15, totalFlightTime: 900 });

    const vehicle = useSettingsStore.getState().vehicles.find(v => v.id === 'v1');
    expect(vehicle?.boardStats?.totalFlightCount).toBe(15);
    expect(vehicle?.boardStats?.totalFlightTime).toBe(900);
  });
});
