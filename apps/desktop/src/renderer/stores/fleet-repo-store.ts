/**
 * Fleet vault store: renderer-side state for the local git vault
 * (snapshots, history, GitHub sync). Heavy lifting happens in the main
 * process; this store orchestrates IPC and holds view state.
 */
import { create } from 'zustand';
import { t } from '../../shared/i18n/index.js';
import { useMemo } from 'react';
import type {
  FleetRepoStatus,
  FleetRepoHistoryEntry,
  FleetRepoUnit,
  FleetRepoSite,
} from '../../shared/ipc-channels';
import { parseParamFile, parseParamFileHeader } from '../../shared/param-file';
import { isCalibrationParam } from '../../shared/calibration-params';
import { useParameterStore } from './parameter-store';
import { useSettingsStore } from './settings-store';
import { useConnectionStore } from './connection-store';
import { useMissionStore } from './mission-store';
import { isSurveyGroup } from '../../shared/mission-group-types';

/** Non-unique board ids: the no-hardware-UID fallback and SITL's lane. These
 *  must never claim a real vehicle's identity (they collapse distinct boards). */
export function isWeakBoardUid(uid: string | null | undefined): boolean {
  return !uid || uid.startsWith('mavlink-') || uid.startsWith('sitl-');
}

export interface SnapshotDiffRow {
  id: string;
  snapshotValue: number;
  /** null = param not present on the connected vehicle */
  currentValue: number | null;
  calibration: boolean;
}

export interface SnapshotDiff {
  oid: string;
  uid: string;
  /** Params whose snapshot value differs from the live value */
  changed: SnapshotDiffRow[];
  /** Params in the snapshot that the live vehicle doesn't report */
  missingOnVehicle: SnapshotDiffRow[];
  sameCount: number;
  totalInSnapshot: number;
  /** No live params loaded: diff is against nothing, view shows raw content */
  liveAvailable: boolean;
  /** Param download still in progress: comparing now would be misleading */
  liveLoading: boolean;
  /**
   * Flight stack that produced the snapshot, from its `# Firmware:` header.
   * Undefined for snapshots taken before the stamp existed.
   */
  snapshotFirmware?: string;
}

interface FleetRepoState {
  status: FleetRepoStatus | null;
  units: FleetRepoUnit[];
  sites: FleetRepoSite[];
  history: FleetRepoHistoryEntry[];
  loading: boolean;
  snapshotBusy: boolean;
  syncBusy: boolean;
  lastError: string | null;
  lastNotice: string | null;
  /** 'units/<uid>' | 'sites/<site>' | null = everything */
  filterPrefix: string | null;
  /**
   * User-chosen unit for this session ("I'm working on X"), overriding
   * automatic vehicle matching. Cleared on disconnect.
   */
  unitOverride: string | null;
  diff: SnapshotDiff | null;
  diffLoading: boolean;
  restoreBusy: boolean;
  restoreProgress: { done: number; total: number } | null;
  backupSetupOpen: boolean;

  refresh: () => Promise<void>;
  setBackupSetupOpen: (open: boolean) => void;
  setFilterPrefix: (prefix: string | null) => void;
  setUnitOverride: (uid: string | null) => void;
  clearMessages: () => void;

  snapshotParams: (note?: string) => Promise<boolean>;
  /** Mint a fresh identity for the connected vehicle and snapshot under it.
   *  Used when the board has no unique UID, or the auto-match is wrong. */
  snapshotAsNewVehicle: (name?: string, note?: string) => Promise<boolean>;
  snapshotMission: (site: string, missionName: string) => Promise<boolean>;
  snapshotArea: (site: string) => Promise<boolean>;

  renameUnit: (uid: string, name: string) => Promise<boolean>;
  deleteUnit: (uid: string) => Promise<boolean>;
  linkUnit: (unitUid: string, aliasUid: string) => Promise<boolean>;
  loadDiff: (oid: string, uid: string) => Promise<void>;
  clearDiff: () => void;
  restoreSnapshot: (includeCalibration: boolean) => Promise<{ applied: number; failed: number }>;

  sync: () => Promise<void>;
}

/**
 * Does a snapshot's flight stack match the vehicle it is about to be written
 * to? A board keeps its hardware uid across a reflash, so the SAME vault unit
 * can hold both ArduPilot and PX4 snapshots; restoring across that boundary
 * writes parameter names the running stack has never heard of.
 *
 * Unknown on either side means allow: snapshots taken before the Firmware
 * stamp existed carry no stack, and refusing those would break every restore
 * of an older snapshot.
 */
export function isRestoreFirmwareMatch(
  snapshotFirmware: string | undefined,
  liveFirmware: string | undefined,
): boolean {
  if (!snapshotFirmware || !liveFirmware) return true;
  return snapshotFirmware === liveFirmware;
}

/**
 * May a snapshot belonging to `snapshotUid` be restored onto the vehicle the
 * vault currently resolves to?
 *
 * Alias-aware, matching how the main-side repo resolves units: a unit folder
 * keeps aliases for board ids it has been known by (identity scheme changes,
 * swapped FCs), so the live board id may differ from the folder id and still be
 * the same aircraft. An explicit "Working on" override wins, since that is the
 * user asserting which unit is on the link.
 *
 * Pure so the rule is testable without a link or a repo.
 */
export function isRestoreTargetMatch(
  snapshotUid: string,
  unitOverride: string | null,
  boardUid: string | null,
  snapshotUnitAliases: string[] | undefined,
): boolean {
  const targetUid = unitOverride ?? boardUid;
  if (!targetUid) return false;
  if (snapshotUid === targetUid) return true;
  return snapshotUnitAliases?.includes(targetUid) ?? false;
}

function currentBoard(): { uid: string; name: string; vehicleType?: string; sitl: boolean } | null {
  const conn = useConnectionStore.getState().connectionState;
  const profile = useSettingsStore.getState().getActiveVehicle();

  // SITL never shares a unit with real hardware: its fallback board id
  // (mavlink-<sysid>) would otherwise collide with any board that reports
  // no uid, silently mixing simulator and aircraft history.
  if (conn.isSitl) {
    return {
      uid: `sitl-${conn.systemId ?? 1}`,
      name: `SITL ${conn.vehicleType ?? 'vehicle'}`,
      vehicleType: conn.vehicleType,
      sitl: true,
    };
  }

  // Weak/absent uid = unidentified; the vault offers "new vehicle" not a merge.
  if (isWeakBoardUid(profile?.boardUid)) return null;
  // The profile name is the user's own model name ("Agri Octo"), the most
  // recognizable label; board name is only a seed fallback.
  return {
    uid: profile!.boardUid!,
    name: profile!.name || profile!.boardName || 'My Vehicle', // i18n-exempt: written to the vault
    vehicleType: profile!.type,
    sitl: false,
  };
}

function liveParams(): Array<{ id: string; value: number }> {
  const params = useParameterStore.getState().parameters;
  const out: Array<{ id: string; value: number }> = [];
  for (const [id, p] of params) {
    out.push({ id, value: p.value });
  }
  return out;
}

/** Build a minimal KML document from the mission store's survey polygons */
function surveyPolygonsToKml(siteName: string): string | null {
  const groups = useMissionStore.getState().groups;
  const polygons = groups.filter(isSurveyGroup).filter((g) => g.polygon.length >= 3);
  if (polygons.length === 0) return null;
  const placemarks = polygons
    .map((g, i) => {
      const first = g.polygon[0]!;
      const coords = [...g.polygon, first]
        .map((p) => `${p.lng},${p.lat},0`)
        .join(' ');
      const name = (g.name || `Area ${i + 1}`).replace(/[<>&]/g, '');
      return [
        '    <Placemark>',
        `      <name>${name}</name>`,
        '      <Polygon><outerBoundaryIs><LinearRing><coordinates>',
        `        ${coords}`,
        '      </coordinates></LinearRing></outerBoundaryIs></Polygon>',
        '    </Placemark>',
      ].join('\n');
    })
    .join('\n');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<kml xmlns="http://www.opengis.net/kml/2.2">',
    '  <Document>',
    `    <name>${siteName.replace(/[<>&]/g, '')}</name>`,
    placemarks,
    '  </Document>',
    '</kml>',
    '',
  ].join('\n');
}

export interface CurrentVaultUnit {
  uid: string;
  name: string;
  sitl: boolean;
  overridden?: boolean;
}

/**
 * Non-hook variant of useCurrentVaultUnit for imperative callers
 * (module host API). Same identity rules: user override first, then SITL
 * quarantine, then the active vehicle profile's board uid.
 */
export function getCurrentVaultUnit(): CurrentVaultUnit | null {
  const conn = useConnectionStore.getState().connectionState;
  if (!conn.isConnected) return null;
  const { unitOverride, units } = useFleetRepoStore.getState();
  if (unitOverride) {
    const unit = units.find((u) => u.uid === unitOverride);
    if (unit) return { uid: unit.uid, name: unit.name, sitl: unit.sitl ?? false, overridden: true };
  }
  const board = currentBoard();
  return board ? { uid: board.uid, name: board.name, sitl: board.sitl } : null;
}

/** Subscribe to identity changes across all contributing stores */
export function subscribeCurrentVaultUnit(
  listener: (unit: CurrentVaultUnit | null) => void,
): () => void {
  let last = JSON.stringify(getCurrentVaultUnit());
  const notify = () => {
    const next = getCurrentVaultUnit();
    const key = JSON.stringify(next);
    if (key === last) return;
    last = key;
    listener(next);
  };
  const unsubs = [
    useConnectionStore.subscribe(notify),
    useSettingsStore.subscribe(notify),
    useFleetRepoStore.subscribe(notify),
  ];
  return () => unsubs.forEach((u) => u());
}

/**
 * Reactive identity of the vehicle currently on the link, in vault-unit terms.
 * Null while disconnected. Same rules as snapshotParams uses, so the vault UI
 * can mark "this unit is the connected vehicle".
 */
export function useCurrentVaultUnit(): CurrentVaultUnit | null {
  const conn = useConnectionStore((s) => s.connectionState);
  const vehicles = useSettingsStore((s) => s.vehicles);
  const activeVehicleId = useSettingsStore((s) => s.activeVehicleId);
  const unitOverride = useFleetRepoStore((s) => s.unitOverride);
  const units = useFleetRepoStore((s) => s.units);
  return useMemo(() => {
    if (!conn.isConnected) return null;
    if (unitOverride) {
      const unit = units.find((u) => u.uid === unitOverride);
      if (unit) {
        return { uid: unit.uid, name: unit.name, sitl: unit.sitl ?? false, overridden: true };
      }
    }
    if (conn.isSitl) {
      return {
        uid: `sitl-${conn.systemId ?? 1}`,
        name: `SITL ${conn.vehicleType ?? 'vehicle'}`,
        sitl: true,
      };
    }
    const profile = vehicles.find((v) => v.id === activeVehicleId);
    if (isWeakBoardUid(profile?.boardUid)) return null;
    return {
      uid: profile!.boardUid!,
      name: profile!.name || profile!.boardName || 'My Vehicle', // i18n-exempt: written to the vault
      sitl: false,
    };
  }, [conn.isConnected, conn.isSitl, conn.systemId, conn.vehicleType, vehicles, activeVehicleId, unitOverride, units]);
}

export const useFleetRepoStore = create<FleetRepoState>()((set, get) => ({
  status: null,
  units: [],
  sites: [],
  history: [],
  loading: false,
  snapshotBusy: false,
  syncBusy: false,
  lastError: null,
  lastNotice: null,
  filterPrefix: null,
  unitOverride: null,
  diff: null,
  diffLoading: false,
  restoreBusy: false,
  restoreProgress: null,
  backupSetupOpen: false,

  setBackupSetupOpen: (open) => set({ backupSetupOpen: open }),

  refresh: async () => {
    const api = window.electronAPI;
    if (!api) return;
    set({ loading: true });
    try {
      const [status, units, sites, history] = await Promise.all([
        api.fleetRepoStatus(),
        api.fleetRepoListUnits(),
        api.fleetRepoListSites(),
        api.fleetRepoHistory(150),
      ]);
      set({ status, units, sites, history, loading: false });
    } catch (err) {
      set({ loading: false, lastError: err instanceof Error ? err.message : t('stores:fleetRepoStore.vaultUnavailable') });
    }
  },

  setFilterPrefix: (prefix) => set({ filterPrefix: prefix, diff: null }),
  setUnitOverride: (uid) => set({ unitOverride: uid }),
  clearMessages: () => set({ lastError: null, lastNotice: null }),

  snapshotParams: async (note) => {
    const params = liveParams();
    if (params.length === 0) {
      set({ lastError: t('stores:fleetRepoStore.noParams') });
      return false;
    }
    // Explicit user choice ("Working on: X") beats automatic matching
    const override = get().unitOverride;
    const overrideUnit = override ? get().units.find((u) => u.uid === override) : undefined;
    const board = currentBoard();
    if (!overrideUnit && !board) {
      set({ lastError: t('stores:fleetRepoStore.cannotIdentify') });
      return false;
    }
    set({ snapshotBusy: true, lastError: null, lastNotice: null });
    const result = overrideUnit
      ? await window.electronAPI?.fleetRepoSnapshotParams(
          // sitl left undefined so the unit's stored flag is kept
          overrideUnit.uid, overrideUnit.name, params, board?.vehicleType ?? overrideUnit.vehicleType, note, undefined,
        )
      : await window.electronAPI?.fleetRepoSnapshotParams(
          board!.uid, board!.name, params, board!.vehicleType, note, board!.sitl,
        );
    set({ snapshotBusy: false });
    if (!result?.success) {
      set({ lastError: result?.error ?? t('stores:fleetRepoStore.snapshotFailed') });
      return false;
    }
    set({ lastNotice: result.changed ? t('stores:fleetRepoStore.snapshotSaved', { count: params.length }) : t('stores:fleetRepoStore.noChanges') });
    await get().refresh();
    return true;
  },

  snapshotAsNewVehicle: async (name, note) => {
    const params = liveParams();
    if (params.length === 0) {
      set({ lastError: t('stores:fleetRepoStore.noParams') });
      return false;
    }
    const conn = useConnectionStore.getState().connectionState;
    const displayName = name?.trim() || conn.boardId || 'New vehicle'; // i18n-exempt: written to the vault
    const uid = `vehicle-${crypto.randomUUID()}`;
    // Bind the active profile (or a fresh one) to this strong identity so the
    // vault resolves the connected board here on subsequent snapshots.
    useSettingsStore.getState().associateBoard(uid, conn.boardId, displayName);
    set({ unitOverride: null, snapshotBusy: true, lastError: null, lastNotice: null });
    const result = await window.electronAPI?.fleetRepoSnapshotParams(
      uid, displayName, params, conn.vehicleType, note, false,
    );
    set({ snapshotBusy: false });
    if (!result?.success) {
      set({ lastError: result?.error ?? t('stores:fleetRepoStore.snapshotFailed') });
      return false;
    }
    set({ lastNotice: t('stores:fleetRepoStore.newVehicleSaved', { name: displayName, count: params.length }) });
    await get().refresh();
    return true;
  },

  snapshotMission: async (site, missionName) => {
    const items = useMissionStore.getState().missionItems;
    if (items.length === 0) {
      set({ lastError: t('stores:fleetRepoStore.noMission') });
      return false;
    }
    set({ snapshotBusy: true, lastError: null, lastNotice: null });
    const result = await window.electronAPI?.fleetRepoSnapshotMission(site, missionName, items);
    set({ snapshotBusy: false });
    if (!result?.success) {
      set({ lastError: result?.error ?? t('stores:fleetRepoStore.snapshotFailed') });
      return false;
    }
    set({ lastNotice: result.changed ? t('stores:fleetRepoStore.missionSaved', { site }) : t('stores:fleetRepoStore.missionUnchanged') });
    await get().refresh();
    return true;
  },

  snapshotArea: async (site) => {
    const kml = surveyPolygonsToKml(site);
    if (!kml) {
      set({ lastError: t('stores:fleetRepoStore.noSurveyPolygon') });
      return false;
    }
    set({ snapshotBusy: true, lastError: null, lastNotice: null });
    const result = await window.electronAPI?.fleetRepoSnapshotArea(site, kml);
    set({ snapshotBusy: false });
    if (!result?.success) {
      set({ lastError: result?.error ?? t('stores:fleetRepoStore.snapshotFailed') });
      return false;
    }
    set({ lastNotice: result.changed ? t('stores:fleetRepoStore.boundarySaved', { site }) : t('stores:fleetRepoStore.boundaryUnchanged') });
    await get().refresh();
    return true;
  },

  renameUnit: async (uid, name) => {
    const result = await window.electronAPI?.fleetRepoRenameUnit(uid, name);
    if (!result?.success) {
      set({ lastError: result?.error ?? t('stores:fleetRepoStore.renameFailed') });
      return false;
    }
    await get().refresh();
    return true;
  },

  deleteUnit: async (uid) => {
    const result = await window.electronAPI?.fleetRepoDeleteUnit(uid).catch(
      (err: unknown) => ({ success: false, error: err instanceof Error ? err.message : undefined }),
    );
    if (!result?.success) {
      set({ lastError: result?.error ?? t('stores:fleetRepoStore.deleteFailed') });
      return false;
    }
    set((s) => ({
      lastNotice: t('stores:fleetRepoStore.deleted'),
      unitOverride: s.unitOverride === uid ? null : s.unitOverride,
      diff: s.diff?.uid === uid ? null : s.diff,
    }));
    await get().refresh();
    return true;
  },

  linkUnit: async (unitUid, aliasUid) => {
    const result = await window.electronAPI?.fleetRepoLinkUnit(unitUid, aliasUid);
    if (!result?.success) {
      set({ lastError: result?.error ?? t('stores:fleetRepoStore.linkFailed') });
      return false;
    }
    set({ lastNotice: t('stores:fleetRepoStore.linked') });
    await get().refresh();
    return true;
  },

  loadDiff: async (oid, uid) => {
    set({ diffLoading: true, diff: null });
    const content = await window.electronAPI?.fleetRepoReadFile(`units/${uid}/params.param`, oid);
    if (!content) {
      set({ diffLoading: false, lastError: t('stores:fleetRepoStore.readSnapshotFailed') });
      return;
    }
    const snapshot = parseParamFile(content);
    // 'Firmware' is absent on snapshots taken before the stamp existed.
    const snapshotFirmware = parseParamFileHeader(content).Firmware;
    const paramState = useParameterStore.getState();
    const live = new Map(paramState.parameters);
    // A half-downloaded param table would report hundreds of "missing on
    // vehicle" params; refuse to compare until the download settles.
    const liveLoading = paramState.isLoading;
    const liveAvailable = live.size > 0 && !liveLoading;
    const changed: SnapshotDiffRow[] = [];
    const missingOnVehicle: SnapshotDiffRow[] = [];
    let sameCount = 0;
    for (const p of snapshot) {
      const cur = live.get(p.id);
      const row: SnapshotDiffRow = {
        id: p.id,
        snapshotValue: p.value,
        currentValue: cur ? cur.value : null,
        calibration: isCalibrationParam(p.id),
      };
      if (!cur) {
        missingOnVehicle.push(row);
      } else if (Math.abs(cur.value - p.value) > 1e-6) {
        changed.push(row);
      } else {
        sameCount++;
      }
    }
    changed.sort((a, b) => a.id.localeCompare(b.id));
    set({
      diff: {
        oid,
        uid,
        changed,
        missingOnVehicle,
        sameCount,
        totalInSnapshot: snapshot.length,
        liveAvailable,
        liveLoading,
        snapshotFirmware,
      },
      diffLoading: false,
    });
  },

  clearDiff: () => set({ diff: null }),

  restoreSnapshot: async (includeCalibration) => {
    const diff = get().diff;
    if (!diff) return { applied: 0, failed: 0 };

    // A snapshot may only be written back to the vehicle it came from. The
    // history list is repo-wide and opening any commit loads its diff, so
    // without this check hitting Restore while looking at another aircraft's
    // snapshot would push ITS parameters into whatever is on the link. The
    // deliberate way to do that is the "Working on" override, which is an
    // explicit statement that the connected vehicle IS that unit.
    const owner = get().units.find((u) => u.uid === diff.uid);
    if (!isRestoreTargetMatch(diff.uid, get().unitOverride, currentBoard()?.uid ?? null, owner?.aliases)) {
      const ownerName = owner?.name ?? diff.uid;
      set({
        lastError: t('stores:fleetRepoStore.wrongOwner', { owner: ownerName }),
        lastNotice: null,
      });
      return { applied: 0, failed: 0 };
    }

    // Same unit is not the same flight stack. A reflashed board keeps its uid,
    // so a unit's history can span ArduPilot and PX4; writing one stack's
    // parameter names to the other is meaningless at best.
    const liveFirmware = useConnectionStore.getState().connectionState.firmware;
    if (!isRestoreFirmwareMatch(diff.snapshotFirmware, liveFirmware)) {
      set({
        lastError: t('stores:fleetRepoStore.firmwareMismatch', { snapshotFirmware: diff.snapshotFirmware, liveFirmware }),
        lastNotice: null,
      });
      return { applied: 0, failed: 0 };
    }

    const rows = diff.changed.filter((r) => includeCalibration || !r.calibration);
    const setParameter = useParameterStore.getState().setParameterImmediate;
    set({ restoreBusy: true, restoreProgress: { done: 0, total: rows.length } });
    let applied = 0;
    let failed = 0;
    for (const row of rows) {
      const ok = await setParameter(row.id, row.snapshotValue);
      if (ok) applied++;
      else failed++;
      set({ restoreProgress: { done: applied + failed, total: rows.length } });
    }
    set({
      restoreBusy: false,
      restoreProgress: null,
      lastNotice: failed === 0
        ? t('stores:fleetRepoStore.restored', { count: applied })
        : t('stores:fleetRepoStore.restoredPartial', { applied, failed }),
      lastError: null,
    });
    // Live values changed: recompute the diff against the restored state
    await get().loadDiff(diff.oid, diff.uid);
    return { applied, failed };
  },

  sync: async () => {
    set({ syncBusy: true, lastError: null, lastNotice: null });
    const result = await window.electronAPI?.fleetRepoGhSync();
    set({ syncBusy: false });
    if (result?.success) {
      set({ lastNotice: t('stores:fleetRepoStore.synced') });
    } else {
      set({ lastError: result?.error ?? t('stores:fleetRepoStore.syncFailed') });
    }
    await get().refresh();
  },
}));

// The "Working on" override is a per-connection choice: a different vehicle
// may be plugged in next, so it must not survive the link going down.
useConnectionStore.subscribe((state) => {
  if (!state.connectionState.isConnected && useFleetRepoStore.getState().unitOverride !== null) {
    useFleetRepoStore.setState({ unitOverride: null });
  }
});
