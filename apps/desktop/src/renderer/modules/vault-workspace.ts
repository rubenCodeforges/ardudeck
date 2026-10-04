import type { VaultWorkspaceState } from '@ardudeck/module-sdk';
import {
  useFleetRepoStore,
  getCurrentVaultUnit,
  isRestoreTargetMatch,
  isRestoreFirmwareMatch,
} from '../stores/fleet-repo-store';
import { useParameterStore } from '../stores/parameter-store';
import { useConnectionStore } from '../stores/connection-store';
import { useSettingsStore } from '../stores/settings-store';

let cached: { key: unknown[]; state: VaultWorkspaceState } | null = null;

/** Stable reference until an input changes, so module subscribers don't re-render on unrelated ticks. */
export function vaultWorkspaceState(): VaultWorkspaceState {
  const fleet = useFleetRepoStore.getState();
  const paramCount = useParameterStore.getState().paramCount;
  const liveFirmware = useConnectionStore.getState().connectionState.firmware;
  const currentUid = getCurrentVaultUnit()?.uid ?? null;
  const key = [fleet, paramCount, liveFirmware, currentUid];
  if (cached && cached.key.every((v, i) => v === key[i])) return cached.state;

  const { diff, units, status } = fleet;
  const owner = diff ? units.find((u) => u.uid === diff.uid) : undefined;
  const state: VaultWorkspaceState = {
    status: status
      ? {
          initialized: status.initialized,
          commitCount: status.commitCount,
          autoSync: status.autoSync,
          backupConfigured: status.github.connected && Boolean(status.github.repo),
          lastSyncAt: status.github.lastSyncAt,
          github: { connected: status.github.connected, login: status.github.login, repo: status.github.repo, mode: status.github.mode },
        }
      : null,
    units,
    sites: fleet.sites,
    history: fleet.history,
    paramCount,
    unitOverride: fleet.unitOverride,
    snapshotBusy: fleet.snapshotBusy,
    syncBusy: fleet.syncBusy,
    lastError: fleet.lastError,
    lastNotice: fleet.lastNotice,
    diff: diff
      ? {
          ...diff,
          restore: {
            targetMatches: isRestoreTargetMatch(diff.uid, fleet.unitOverride, currentUid, owner?.aliases),
            firmwareMatches: isRestoreFirmwareMatch(diff.snapshotFirmware, liveFirmware),
            ownerName: owner?.name ?? diff.uid,
            liveFirmware,
          },
        }
      : null,
    diffLoading: fleet.diffLoading,
    restoreBusy: fleet.restoreBusy,
    restoreProgress: fleet.restoreProgress,
  };
  cached = { key, state };
  return state;
}

export function subscribeVaultWorkspace(listener: (state: VaultWorkspaceState) => void): () => void {
  let last = vaultWorkspaceState();
  const notify = () => {
    const next = vaultWorkspaceState();
    if (next === last) return;
    last = next;
    listener(next);
  };
  const unsubs = [
    useFleetRepoStore.subscribe(notify),
    useParameterStore.subscribe(notify),
    useConnectionStore.subscribe(notify),
    useSettingsStore.subscribe(notify),
  ];
  return () => unsubs.forEach((u) => u());
}
