import { useEffect, useRef } from 'react';
import { useConnectionStore } from '../stores/connection-store';
import { useSettingsStore } from '../stores/settings-store';
import { useParameterStore } from '../stores/parameter-store';
import type { BoardStats } from '../../shared/ipc-channels';

/**
 * STAT_* parameter names used by ArduPilot for board-level flight statistics.
 * These are read-only parameters populated by the firmware.
 */
const STAT_PARAMS: Record<string, keyof BoardStats> = {
  STAT_FLTTIME: 'totalFlightTime',
  STAT_FLTCNT: 'totalFlightCount',
  STAT_RUNTIME: 'totalRunTime',
  STAT_DISTFLWN: 'totalDistance',
  STAT_BOOTCNT: 'bootCount',
};

/**
 * Hook that automatically associates connected boards with vehicle profiles.
 *
 * On each new connection where a boardUid is detected:
 * 1. Looks for an existing profile bound to that boardUid and switches to it
 * 2. Or binds the active profile if it has no board yet
 * 3. Or creates a new profile (cloned from the active one) for the new board
 *
 * Also reads STAT_* parameters after param load to update board statistics.
 */
export function useBoardProfileAssociation() {
  const { connectionState } = useConnectionStore();
  const { associateBoard, updateBoardStats, _isInitialized } = useSettingsStore();
  const { parameters, isLoading } = useParameterStore();

  // Track which boardUid we've already handled this session to avoid re-running
  const lastAssociatedUid = useRef<string | null>(null);
  // Track whether we've already synced stats for this session
  const statsSyncedForUid = useRef<string | null>(null);

  // Board association — runs when boardUid appears in connection state
  useEffect(() => {
    if (!_isInitialized) return;

    const { boardUid, boardId, isConnected, isReconnecting } = connectionState;

    // Skip during reconnection (board identity doesn't change)
    if (isReconnecting) return;

    // Reset tracking on disconnect
    if (!isConnected) {
      lastAssociatedUid.current = null;
      statsSyncedForUid.current = null;
      return;
    }

    // Need a boardUid to associate, and don't re-run for same UID
    if (!boardUid || boardUid === lastAssociatedUid.current) return;

    // Derive a friendly name from available connection info (prefer hardware ID over generic type)
    const displayName = boardId || connectionState.vehicleType || undefined;

    associateBoard(boardUid, boardId, displayName);
    lastAssociatedUid.current = boardUid;
  }, [
    connectionState,
    _isInitialized,
    associateBoard,
  ]);

  // Board stats sync — runs after parameters finish loading
  useEffect(() => {
    if (!_isInitialized) return;
    if (!connectionState.isConnected || !connectionState.boardUid) return;
    if (isLoading) return; // still loading
    if (parameters.size === 0) return; // no params yet
    if (statsSyncedForUid.current === connectionState.boardUid) return; // already synced

    // Only update if we're on MAVLink (STAT_* is ArduPilot-specific)
    if (connectionState.protocol !== 'mavlink') return;

    const stats: BoardStats = {};
    let hasAny = false;

    for (const [paramName, statKey] of Object.entries(STAT_PARAMS)) {
      const param = parameters.get(paramName);
      if (param) {
        (stats as Record<string, number>)[statKey] = param.value;
        hasAny = true;
      }
    }

    if (hasAny) {
      updateBoardStats(stats);
      statsSyncedForUid.current = connectionState.boardUid;
    }
  }, [
    connectionState,
    _isInitialized,
    isLoading,
    parameters,
    updateBoardStats,
  ]);
}
