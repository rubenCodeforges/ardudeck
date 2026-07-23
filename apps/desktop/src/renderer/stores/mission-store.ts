import { create } from 'zustand';
import {
  type MissionItem,
  type MissionProgress,
  createDefaultWaypoint,
  createTakeoffWaypoint,
  calculateMissionDistance,
  estimateMissionTime,
  MAV_CMD,
  MAV_FRAME,
  altFrameToMavFrame,
  type AltReferenceFrame,
} from '../../shared/mission-types';
import {
  createManualGroup,
  createImportedGroup,
  nextGroupColor,
  type Group,
  type ManualGroup,
  type SurveyGroup,
  type MissionMirrorSnapshot,
} from '../../shared/mission-group-types';
import { useSettingsStore } from './settings-store';
import { useConnectionStore } from './connection-store';
import { useParameterStore } from './parameter-store';
import { useArduPilotSitlStore } from './ardupilot-sitl-store';
import { getVehicleClass } from '../../shared/telemetry-types';

// MSP Waypoint types (matching msp-ts)
interface MSPWaypoint {
  wpNo: number;
  action: number;
  lat: number;
  lon: number;
  altitude: number;
  p1: number;
  p2: number;
  p3: number;
  flag: number;
}

// MSP waypoint action types (iNav)
const MSP_WP_ACTION = {
  WAYPOINT: 1,
  POSHOLD_UNLIM: 2,
  POSHOLD_TIME: 3,
  RTH: 4,
  SET_POI: 5,
  JUMP: 6,
  SET_HEAD: 7,
  LAND: 8,
} as const;

/**
 * Convert MissionItem to MSP Waypoint
 * Handles command type mapping between MAVLink and MSP
 */
function missionItemToMspWaypoint(item: MissionItem, isLast: boolean): MSPWaypoint {
  let action: number = MSP_WP_ACTION.WAYPOINT;
  let p1 = 0; // Speed in cm/s (default: 0 = use nav_auto_speed)

  // Map MAVLink command to MSP action
  switch (item.command) {
    case MAV_CMD.NAV_WAYPOINT:
    case MAV_CMD.NAV_SPLINE_WAYPOINT:
    case MAV_CMD.NAV_TAKEOFF:
      action = MSP_WP_ACTION.WAYPOINT;
      p1 = item.param1 > 0 ? Math.round(item.param1 * 100) : 0; // Speed m/s to cm/s
      break;
    case MAV_CMD.NAV_LOITER_UNLIM:
      action = MSP_WP_ACTION.POSHOLD_UNLIM;
      break;
    case MAV_CMD.NAV_LOITER_TIME:
      action = MSP_WP_ACTION.POSHOLD_TIME;
      p1 = Math.round(item.param1); // Time in seconds
      break;
    case MAV_CMD.NAV_RETURN_TO_LAUNCH:
      action = MSP_WP_ACTION.RTH;
      p1 = item.param1 === 1 ? 1 : 0; // Land flag
      break;
    case MAV_CMD.DO_SET_ROI:
    case MAV_CMD.DO_SET_ROI_LOCATION:
      action = MSP_WP_ACTION.SET_POI;
      break;
    case MAV_CMD.DO_JUMP:
      action = MSP_WP_ACTION.JUMP;
      p1 = Math.round(item.param1); // Target waypoint number
      break;
    case MAV_CMD.CONDITION_YAW:
      action = MSP_WP_ACTION.SET_HEAD;
      p1 = Math.round(item.param1); // Heading degrees
      break;
    case MAV_CMD.NAV_LAND:
      action = MSP_WP_ACTION.LAND;
      break;
    default:
      action = MSP_WP_ACTION.WAYPOINT;
  }

  return {
    wpNo: item.seq + 1, // MSP uses 1-based indexing
    action,
    lat: item.latitude,
    lon: item.longitude,
    altitude: item.altitude,
    p1,
    p2: 0,
    p3: 0,
    flag: isLast ? 0xa5 : 0x00, // 0xa5 = LAST flag
  };
}

/**
 * Convert MSP Waypoint to MissionItem
 */
function mspWaypointToMissionItem(wp: MSPWaypoint): MissionItem {
  let command: number = MAV_CMD.NAV_WAYPOINT;
  let param1 = 0;

  switch (wp.action) {
    case MSP_WP_ACTION.WAYPOINT:
      command = MAV_CMD.NAV_WAYPOINT;
      param1 = wp.p1 / 100; // Speed cm/s to m/s
      break;
    case MSP_WP_ACTION.POSHOLD_UNLIM:
      command = MAV_CMD.NAV_LOITER_UNLIM;
      break;
    case MSP_WP_ACTION.POSHOLD_TIME:
      command = MAV_CMD.NAV_LOITER_TIME;
      param1 = wp.p1; // Time in seconds
      break;
    case MSP_WP_ACTION.RTH:
      command = MAV_CMD.NAV_RETURN_TO_LAUNCH;
      param1 = wp.p1; // Land flag
      break;
    case MSP_WP_ACTION.SET_POI:
      command = MAV_CMD.DO_SET_ROI;
      break;
    case MSP_WP_ACTION.JUMP:
      command = MAV_CMD.DO_JUMP;
      param1 = wp.p1; // Target waypoint number
      break;
    case MSP_WP_ACTION.SET_HEAD:
      command = MAV_CMD.CONDITION_YAW;
      param1 = wp.p1; // Heading degrees
      break;
    case MSP_WP_ACTION.LAND:
      command = MAV_CMD.NAV_LAND;
      break;
  }

  return {
    seq: wp.wpNo - 1, // Convert 1-based to 0-based
    command,
    frame: MAV_FRAME.GLOBAL_RELATIVE_ALT,
    param1,
    param2: 0,
    param3: 0,
    param4: 0,
    latitude: wp.lat,
    longitude: wp.lon,
    altitude: wp.altitude,
    autocontinue: true,
    current: false,
  };
}

// Home position (separate from waypoints, used as reference point)
interface HomePosition {
  lat: number;
  lon: number;
  alt: number;  // Altitude (usually 0 for ground level)
}

/**
 * Locate the default Manual group used to absorb hand-placed, FC-downloaded,
 * and file-loaded WPs during PR 1. Creates one if it doesn't exist yet.
 * Returns the (possibly-new) full groups array and the group itself so the
 * caller can stamp items in the same `set()` call.
 */
function ensureDefaultManualGroup(groups: Group[]): {
  groups: Group[];
  group: ManualGroup;
} {
  const existing = groups.find((g): g is ManualGroup => g.kind === 'manual');
  if (existing) return { groups, group: existing };
  const fresh = createManualGroup({ name: 'Manual', order: 0 });
  return { groups: [...groups, fresh], group: fresh };
}

/**
 * Stamp every item that lacks a groupId with the supplied one. Items that
 * already have a groupId are passed through unchanged so survey-generated
 * items (which already carry their generator group's id) survive merges.
 */
function stampWithGroup(items: MissionItem[], groupId: string): MissionItem[] {
  return items.map((it) => (it.groupId ? it : { ...it, groupId }));
}

/**
 * Enforce the invariant that every waypoint belongs to a group that actually
 * exists. Any item with no groupId, or a groupId that doesn't resolve to a
 * current group (e.g. a stale autosave whose groups were dropped, or an old
 * pre-grouping session), is adopted into one recovered manual group so it can
 * never render headerless / "ungrouped" in the table or escape per-group
 * upload. Returns the inputs untouched when nothing is orphaned.
 */
function adoptOrphanItems(
  items: MissionItem[],
  groups: Group[],
): { items: MissionItem[]; groups: Group[] } {
  const ids = new Set(groups.map((g) => g.id));
  const hasOrphan = items.some((it) => !it.groupId || !ids.has(it.groupId));
  if (!hasOrphan) return { items, groups };

  const order = groups.reduce((m, g) => Math.max(m, g.order), -1) + 1;
  const recovered = createManualGroup({
    name: 'Recovered',
    order,
    color: nextGroupColor(groups),
  });
  const nextItems = items.map((it) =>
    it.groupId && ids.has(it.groupId) ? it : { ...it, groupId: recovered.id },
  );
  return { items: nextItems, groups: [...groups, recovered] };
}

interface MissionStore {
  // State
  missionItems: MissionItem[];
  /**
   * Ordered list of groups. Every waypoint in `missionItems` references one
   * of these by `groupId`. PR 1 keeps everything in a single auto-created
   * Manual group; survey + imported groups land in later PRs.
   *
   * Spec: docs/superpowers/specs/2026-05-28-mission-groups-design.md
   */
  groups: Group[];
  homePosition: HomePosition | null;  // Home/launch position
  isLoading: boolean;
  progress: MissionProgress | null;
  error: string | null;
  currentSeq: number | null;      // Active waypoint from FC (already translated
                                  // through fcSeqOffset so it indexes our
                                  // renumbered missionItems[].seq directly).
  /** Last raw value received in MISSION_CURRENT (before any offset). Kept for
   *  diagnostics so the UI can show a hint when display vs. observed behavior
   *  disagree (off-by-one tuning of fcSeqOffset). */
  currentSeqRaw: number | null;
  /**
   * How much to subtract from raw FC `MISSION_CURRENT.seq` to align it with
   * our store's renumbered `missionItems[].seq`. ArduPilot includes HOME at
   * raw seq 0; we strip it on download and renumber the rest from 0, so the
   * raw seq is always 1 ahead. Set when `setMissionItems` runs.
   */
  fcSeqOffset: number;
  isDirty: boolean;               // Has unsaved changes
  selectedSeq: number | null;     // UI selection
  /**
   * Currently-selected group id. Drives the bidirectional polygon ↔
   * group-header ↔ WP highlight coupling. Distinct from `selectedSeq`:
   * a group can be selected without any specific WP in it being focused
   * (e.g. by clicking its polygon on the map).
   */
  selectedGroupId: string | null;
  lastSuccessMessage: string | null;  // For toast notifications
  hasTerrainCollisions: boolean;  // Terrain collision warning
  loadCounter: number;            // Increments on bulk load (file/download) to trigger map fit

  /**
   * Snapshot of the last successful upload to the vehicle. Used for the
   * post-upload "on vehicle" indicator and basic verification ("did the
   * set of WPs we sent match what the user thought they were sending").
   * Cleared on `clearMission` and `reset`.
   */
  lastUploadedAt: number | null;
  lastUploadedGroupIds: string[];
  lastUploadedItemCount: number;
  /**
   * Group ids participating in the in-flight upload, captured at upload start
   * so the async completion handler can snapshot exactly what was sent
   * (toolbar upload = all groups; per-group upload = just that one).
   */
  pendingUploadGroupIds: string[];

  // Computed (as functions)
  getWaypointCount: () => number;
  getTotalDistance: () => number;
  getEstimatedTime: () => number;
  /**
   * Flatten the mission into the linear WP list that will be sent to the
   * vehicle. Every group is included (map visibility no longer gates upload;
   * the toolbar upload is only reachable with one group, and per-group upload
   * uses getUploadItemsForGroup). Items are emitted in group `order`, then by
   * their existing `seq` within each group. Sequences are renumbered
   * starting at 0 so the vehicle gets a clean contiguous list.
   *
   * DO_JUMP target indices are rewritten in PR 6 once the validation +
   * upload modal lands; for now jumps are passed through and the caller
   * must validate.
   */
  getUploadItems: () => MissionItem[];
  /** Flatten just one group's WPs into a standalone uploadable list (seq from 0). */
  getUploadItemsForGroup: (groupId: string) => MissionItem[];

  // Actions
  fetchMission: () => Promise<void>;
  uploadMission: () => Promise<boolean>;
  /** Upload only the given group's WPs, replacing the vehicle mission. */
  uploadGroup: (groupId: string) => Promise<boolean>;
  /**
   * Fleet/swarm: upload one group's WPs to a SPECIFIC vehicle (by key), via the
   * per-vehicle mission protocol. Used by the per-group "upload to vehicle"
   * picker. Progress is reported per-vehicle (MISSION_VEHICLE_PROGRESS).
   */
  uploadGroupToVehicle: (groupId: string, vehicleKey: string) => Promise<boolean>;
  /** Save only the given group's WPs to a .waypoints file (offline export). */
  saveGroupToFile: (groupId: string) => Promise<boolean>;
  clearMissionFromFC: () => Promise<boolean>;

  // Home position
  setHomePosition: (lat: number, lon: number, alt?: number) => void;
  clearHomePosition: () => void;

  // Group management
  renameGroup: (groupId: string, name: string) => void;
  setGroupColor: (groupId: string, color: string) => void;
  /** Assign (or clear with null) the fleet vehicle this group uploads to / is coloured by. */
  setGroupVehicle: (groupId: string, vehicleKey: string | null) => void;
  deleteGroup: (groupId: string) => void;
  toggleGroupCollapsed: (groupId: string) => void;
  /** Toggle whether a group is shown on the map. */
  setGroupVisible: (groupId: string, visible: boolean) => void;
  reorderGroups: (groupId: string, toOrder: number) => void;
  /**
   * Add a survey group together with its generated WPs atomically. Items
   * are stamped with the new group's id and appended to the mission.
   * Returns the group id for the caller (e.g. survey panel) to remember
   * which group it just created.
   */
  addSurveyGroup: (group: SurveyGroup, items: MissionItem[]) => string;
  /**
   * Add several groups with their items in one atomic update, appended after
   * existing groups in array order. Used by survey sortie-splitting to drop N
   * flight groups at once. Returns the new group ids in order.
   */
  addGroupsWithItems: (entries: Array<{ group: Group; items: MissionItem[] }>) => string[];
  /**
   * Replace the WPs of an existing survey group, keeping the group itself
   * (id, polygon, config). Used on regeneration. The group's
   * lastGeneratedAt / lastGeneratedSignature are refreshed.
   */
  replaceSurveyGroupItems: (
    groupId: string,
    items: MissionItem[],
    signature?: string,
    /** Generator extras to re-cache (undefined keeps the existing ones). */
    generatorResult?: unknown,
  ) => void;
  /**
   * Atomically replace polygon + config + items on a survey group from a
   * live edit on the survey draft. Called by survey-store every time the
   * user moves a vertex or tweaks a config field while editingGroupId is
   * set. Marks the group fresh (signature recomputed) so the Regenerate
   * affordance only appears when an out-of-band edit later breaks the
   * link.
   */
  syncSurveyGroupFromDraft: (
    groupId: string,
    polygon: Array<{ lat: number; lng: number }>,
    config: Record<string, unknown>,
    items: MissionItem[],
    signature: string,
    /** Generator extras to re-cache (undefined keeps the existing ones). */
    generatorResult?: unknown,
  ) => void;

  // Local editing
  addWaypoint: (lat: number, lon: number, alt?: number) => void;
  insertWaypoint: (afterSeq: number, lat: number, lon: number, alt?: number) => void;
  updateWaypoint: (seq: number, updates: Partial<MissionItem>) => void;
  removeWaypoint: (seq: number) => void;
  removeWaypoints: (seqs: number[]) => void;
  reorderWaypoints: (fromSeq: number, toSeq: number) => void;
  insertMissionItems: (items: MissionItem[]) => void;
  applyTerrainPlan: (plan: {
    raisedAltitudes: Map<number, number>;
    inserts: Array<{ afterSeq: number; latitude: number; longitude: number; altitude: number; frame?: AltReferenceFrame }>;
  }) => void;
  clearMission: () => void;

  // UI state
  setSelectedSeq: (seq: number | null) => void;
  setSelectedGroupId: (id: string | null) => void;
  /**
   * Bumped each time the user asks to focus a waypoint on the map (the "focus"
   * button in the WP list). The map's focus controller watches the nonce and
   * pans/zooms to `focusedSeq`. A nonce (not just the seq) so re-focusing the
   * already-focused WP still re-centres.
   */
  focusNonce: number;
  focusedSeq: number | null;
  /** Request the map pan/zoom to a waypoint by seq. */
  focusWaypoint: (seq: number) => void;

  // IPC event handlers (from FC). Non-destructive by default: the
  // downloaded WPs land in a new `imported` group at the top of the
  // table; existing local groups are untouched. For a destructive
  // replace (wipe local mission, accept FC mission as the new source of
  // truth), the caller should run clearMission() first.
  setMissionItems: (items: MissionItem[]) => void;
  /**
   * Apply a mission snapshot mirrored from the primary window (used by detached
   * pop-outs so they render the SAME authored mission the main window holds,
   * not just FC downloads). Replaces items / groups / home / fcSeqOffset
   * verbatim — no FC-import re-stamping, no dirty flag.
   */
  applyMissionMirror: (snapshot: MissionMirrorSnapshot) => void;
  // For file loading (no success message - toolbar handles it).
  // When `groups` is supplied (e.g. mission-library load of a migrated v2
  // file), it is adopted wholesale and items must already carry valid
  // groupIds referencing those groups. When omitted (legacy callers),
  // every item is stamped into the default Manual group.
  setMissionItemsFromFile: (items: MissionItem[], groups?: Group[]) => void;
  updateProgress: (progress: MissionProgress) => void;
  setCurrentSeq: (seq: number) => void;
  setError: (error: string | null) => void;
  setLoading: (loading: boolean) => void;
  setUploadComplete: (itemCount: number) => void;
  setClearComplete: () => void;
  clearLastSuccessMessage: () => void;
  markAsSaved: () => void;
  setHasTerrainCollisions: (hasCollisions: boolean) => void;
  /** Bump loadCounter so the map refits to the current mission (e.g. after import). */
  fitMapToMission: () => void;
  reset: () => void;

  // Undo/redo over the editable mission content (groups + items + home).
  _canUndo: boolean;
  _canRedo: boolean;
  undo: () => void;
  redo: () => void;
}

export const useMissionStore = create<MissionStore>((set, get) => ({
  // Initial state
  missionItems: [],
  groups: [],
  homePosition: null,
  isLoading: false,
  progress: null,
  error: null,
  currentSeq: null,
  currentSeqRaw: null,
  fcSeqOffset: 0,
  isDirty: false,
  selectedSeq: null,
  selectedGroupId: null,
  focusNonce: 0,
  focusedSeq: null,
  lastSuccessMessage: null,
  hasTerrainCollisions: false,
  loadCounter: 0,
  lastUploadedAt: null,
  lastUploadedGroupIds: [],
  lastUploadedItemCount: 0,
  pendingUploadGroupIds: [],
  _canUndo: false,
  _canRedo: false,

  // Computed values
  getWaypointCount: () => get().missionItems.length,

  getTotalDistance: () => {
    return calculateMissionDistance(get().missionItems);
  },

  getEstimatedTime: () => {
    const distance = get().getTotalDistance();
    return estimateMissionTime(distance);
  },

  getUploadItems: () => {
    const { missionItems, groups } = get();
    if (groups.length === 0) return missionItems;
    // Flatten every group in order. Map visibility no longer gates upload;
    // the toolbar upload is only enabled when there is at most one group
    // (ArduPilot holds a single flat mission), and per-group upload uses
    // getUploadItemsForGroup. Renumber seqs to a clean contiguous list.
    const ordered = [...groups].sort((a, b) => a.order - b.order);
    const out: MissionItem[] = [];
    let nextSeq = 0;
    for (const g of ordered) {
      const groupItems = missionItems
        .filter((it) => it.groupId === g.id)
        .sort((a, b) => a.seq - b.seq);
      for (const it of groupItems) {
        out.push({ ...it, seq: nextSeq++ });
      }
    }
    // Catch any orphaned items (missing groupId) - shouldn't happen but
    // defensively include them at the tail so we never silently drop WPs.
    const orphans = missionItems.filter((it) => !it.groupId);
    for (const it of orphans) {
      out.push({ ...it, seq: nextSeq++ });
    }
    return out;
  },

  getUploadItemsForGroup: (groupId) => {
    const { missionItems } = get();
    return missionItems
      .filter((it) => it.groupId === groupId)
      .sort((a, b) => a.seq - b.seq)
      .map((it, i) => ({ ...it, seq: i }));
  },

  // Actions - FC communication (will be wired to IPC)
  // Automatically detects protocol (MAVLink vs MSP) and uses appropriate method
  fetchMission: async () => {
    const { connectionState } = useConnectionStore.getState();
    const isMsp = connectionState.protocol === 'msp';
    const isInav = connectionState.fcVariant === 'INAV';

    // Set initial progress to track operation type
    set({ isLoading: true, error: null, progress: { total: 0, transferred: 0, operation: 'download' } });

    try {
      // MSP path for iNav boards
      if (isMsp && isInav) {
        const waypoints = await window.electronAPI?.mspGetWaypoints();
        if (waypoints === null) {
          set({ error: 'Failed to download waypoints - MSP not supported', isLoading: false, progress: null });
          return;
        }
        if (waypoints.length === 0) {
          set({ isLoading: false, progress: null, lastSuccessMessage: 'No waypoints on FC' });
          return;
        }
        // Non-destructive: land MSP-downloaded waypoints in a new
        // `imported` group at the top of the table; existing local
        // groups are untouched.
        const items = waypoints.map(wp => mspWaypointToMissionItem(wp));
        const { groups, missionItems: existingItems } = get();
        const stamp = new Date().toLocaleString();
        const importedGroup = createImportedGroup({
          importedFrom: 'fc',
          sourceLabel: `Vehicle mission @ ${stamp}`,
          name: `From vehicle @ ${stamp}`,
          color: nextGroupColor(groups),
          order: -1,
        });
        const reorderedGroups = [importedGroup, ...groups]
          .sort((a, b) => a.order - b.order)
          .map((g, i) => ({ ...g, order: i }));
        const startSeq = existingItems.length;
        const stampedItems = items.map((it, i) => ({
          ...it,
          seq: startSeq + i,
          groupId: importedGroup.id,
        }));
        set({
          missionItems: [...existingItems, ...stampedItems],
          groups: reorderedGroups,
          selectedGroupId: importedGroup.id,
          isLoading: false,
          progress: null,
          error: null,
          lastSuccessMessage: `Downloaded ${items.length} waypoints from FC into "${importedGroup.name}"`,
        });
        return;
      }

      // MAVLink path for ArduPilot boards
      const result = await window.electronAPI?.downloadMission();
      if (!result?.success) {
        set({ error: result?.error || 'Failed to download mission', isLoading: false, progress: null });
      }
      // Items will be set via IPC events (onMissionComplete)
    } catch (err) {
      set({ error: String(err), isLoading: false, progress: null });
    }
  },

  uploadMission: async () => {
    const itemsToUpload = get().getUploadItems();
    // Toolbar upload sends every group (only reachable when there is at most
    // one group anyway). Snapshot for the completion handler's "on vehicle"
    // markers.
    set({ pendingUploadGroupIds: get().groups.map((g) => g.id) });
    const { connectionState } = useConnectionStore.getState();
    const isMsp = connectionState.protocol === 'msp';
    const isInav = connectionState.fcVariant === 'INAV';

    if (itemsToUpload.length === 0) {
      set({ error: 'No waypoints to upload (all groups deselected?)' });
      return false;
    }

    // Set initial progress to track operation type
    set({ isLoading: true, error: null, progress: { total: itemsToUpload.length, transferred: 0, operation: 'upload' } });

    try {
      // MSP path for iNav boards
      if (isMsp && isInav) {
        // Convert MissionItems to MSP waypoints
        const mspWaypoints = itemsToUpload.map((item, i) =>
          missionItemToMspWaypoint(item, i === itemsToUpload.length - 1)
        );

        const success = await window.electronAPI?.mspSaveWaypoints(mspWaypoints);
        if (success) {
          set({
            isLoading: false,
            isDirty: false,
            progress: null,
            error: null,
            lastSuccessMessage: `Uploaded ${itemsToUpload.length} waypoints to FC`,
          });
          return true;
        } else {
          set({ error: 'Failed to upload waypoints', isLoading: false, progress: null });
          return false;
        }
      }

      // MAVLink path for ArduPilot boards
      // Home position is a planning reference only — ArduPilot sets its own home on arm via GPS.
      const result = await window.electronAPI?.uploadMission(itemsToUpload);
      if (result?.success) {
        // Don't set isLoading: false here - wait for MISSION_ACK via onMissionUploadComplete
        return true;
      } else {
        set({ error: result?.error || 'Failed to upload mission', isLoading: false, progress: null });
        return false;
      }
    } catch (err) {
      set({ error: String(err), isLoading: false, progress: null });
      return false;
    }
  },

  uploadGroup: async (groupId) => {
    const itemsToUpload = get().getUploadItemsForGroup(groupId);
    if (itemsToUpload.length === 0) {
      set({ error: 'No waypoints in this group to upload' });
      return false;
    }
    // Snapshot just this group so the completion handler marks only it as
    // "on vehicle".
    set({ pendingUploadGroupIds: [groupId] });

    const { connectionState } = useConnectionStore.getState();
    const isMsp = connectionState.protocol === 'msp';
    const isInav = connectionState.fcVariant === 'INAV';

    set({
      isLoading: true,
      error: null,
      progress: { total: itemsToUpload.length, transferred: 0, operation: 'upload' },
    });

    try {
      if (isMsp && isInav) {
        const mspWaypoints = itemsToUpload.map((item, i) =>
          missionItemToMspWaypoint(item, i === itemsToUpload.length - 1),
        );
        const success = await window.electronAPI?.mspSaveWaypoints(mspWaypoints);
        if (success) {
          set({
            isLoading: false,
            isDirty: false,
            progress: null,
            error: null,
            lastSuccessMessage: `Uploaded ${itemsToUpload.length} waypoints to FC`,
          });
          return true;
        }
        set({ error: 'Failed to upload waypoints', isLoading: false, progress: null });
        return false;
      }

      const result = await window.electronAPI?.uploadMission(itemsToUpload);
      if (result?.success) {
        // isLoading cleared on MISSION_ACK via onMissionUploadComplete.
        return true;
      }
      set({ error: result?.error || 'Failed to upload mission', isLoading: false, progress: null });
      return false;
    } catch (err) {
      set({ error: String(err), isLoading: false, progress: null });
      return false;
    }
  },

  uploadGroupToVehicle: async (groupId, vehicleKey) => {
    const itemsToUpload = get().getUploadItemsForGroup(groupId);
    if (itemsToUpload.length === 0) {
      set({ error: 'No waypoints in this group to upload' });
      return false;
    }
    // Snapshot this group so the "on vehicle" indicator reflects it on success.
    set({ pendingUploadGroupIds: [groupId] });
    try {
      const result = await window.electronAPI?.uploadMissionToVehicle?.(vehicleKey, itemsToUpload);
      if (result?.success) {
        set({
          isDirty: false,
          lastUploadedAt: Date.now(),
          lastUploadedGroupIds: [groupId],
          lastUploadedItemCount: itemsToUpload.length,
          lastSuccessMessage: `Uploaded ${itemsToUpload.length} waypoints to vehicle`,
        });
        return true;
      }
      set({ error: result?.error || 'Failed to upload mission to vehicle' });
      return false;
    } catch (err) {
      set({ error: String(err) });
      return false;
    }
  },

  saveGroupToFile: async (groupId) => {
    const items = get().getUploadItemsForGroup(groupId);
    if (items.length === 0) {
      set({ error: 'No waypoints in this group to save' });
      return false;
    }
    const result = await window.electronAPI?.saveMissionToFile(items);
    if (result?.success) {
      set({ lastSuccessMessage: `Saved ${items.length} waypoints to file` });
      return true;
    }
    if (result?.error && result.error !== 'Cancelled') {
      set({ error: result.error });
    }
    return false;
  },

  clearMissionFromFC: async () => {
    const { connectionState } = useConnectionStore.getState();
    const isMsp = connectionState.protocol === 'msp';
    const isInav = connectionState.fcVariant === 'INAV';

    set({ isLoading: true, error: null });

    try {
      // MSP path for iNav boards
      if (isMsp && isInav) {
        const success = await window.electronAPI?.mspClearWaypoints();
        if (success) {
          set({
            isLoading: false,
            progress: null,
            error: null,
            lastSuccessMessage: 'Mission cleared from FC',
          });
          return true;
        } else {
          set({ error: 'Failed to clear waypoints', isLoading: false });
          return false;
        }
      }

      // MAVLink path for ArduPilot boards
      const result = await window.electronAPI?.clearMission();
      if (result?.success) {
        // Don't set isLoading: false here - wait for MISSION_ACK via onMissionClearComplete
        return true;
      } else {
        set({ error: result?.error || 'Failed to clear mission', isLoading: false });
        return false;
      }
    } catch (err) {
      set({ error: String(err), isLoading: false });
      return false;
    }
  },

  // Home position management
  setHomePosition: (lat: number, lon: number, alt: number = 0) => {
    set({ homePosition: { lat, lon, alt }, isDirty: true });
  },

  clearHomePosition: () => {
    set({ homePosition: null, isDirty: true });
  },

  // Local editing - one click = one valid mission step.
  // For air vehicles, the first click also auto-prepends a TAKEOFF command so
  // the resulting mission is immediately uploadable. Ground/marine vehicles
  // skip the takeoff and get a regular waypoint as item #0.
  addWaypoint: (lat: number, lon: number, alt?: number) => {
    const { missionItems, groups } = get();
    const { groups: nextGroups, group } = ensureDefaultManualGroup(groups);

    // Get default altitudes from settings
    const { missionDefaults } = useSettingsStore.getState();
    const defaultAlt = alt ?? missionDefaults.defaultWaypointAltitude;

    if (missionItems.length === 0) {
      const { connectionState } = useConnectionStore.getState();
      const qParam = useParameterStore.getState().parameters.get('Q_ENABLE');
      const sitl = useArduPilotSitlStore.getState();
      const vehicleClass = getVehicleClass(connectionState.mavType, {
        qEnable: typeof qParam?.value === 'number' ? qParam.value : undefined,
        sitlFrame: sitl.isRunning ? sitl.model : undefined,
      });
      const needsTakeoff = vehicleClass === 'copter' || vehicleClass === 'plane' || vehicleClass === 'vtol';

      if (needsTakeoff) {
        const takeoff = createTakeoffWaypoint(0, lat, lon, missionDefaults.defaultTakeoffAltitude, 15, group.id);
        const firstWp = createDefaultWaypoint(1, lat, lon, defaultAlt, group.id);
        set({
          missionItems: [takeoff, firstWp],
          groups: nextGroups,
          isDirty: true,
          selectedSeq: 1,
        });
        return;
      }
    }

    const seq = missionItems.length;
    const newItem = createDefaultWaypoint(seq, lat, lon, defaultAlt, group.id);
    set({
      missionItems: [...missionItems, newItem],
      groups: nextGroups,
      isDirty: true,
      selectedSeq: seq,
    });
  },

  insertWaypoint: (afterSeq: number, lat: number, lon: number, alt: number = 100) => {
    const { missionItems, groups } = get();
    const { groups: nextGroups, group } = ensureDefaultManualGroup(groups);
    const newSeq = afterSeq + 1;
    const newItem = createDefaultWaypoint(newSeq, lat, lon, alt, group.id);

    // Insert and renumber
    const newItems = [
      ...missionItems.slice(0, newSeq),
      newItem,
      ...missionItems.slice(newSeq).map(item => ({ ...item, seq: item.seq + 1 })),
    ];

    set({
      missionItems: newItems,
      groups: nextGroups,
      isDirty: true,
      selectedSeq: newSeq,
    });
  },

  updateWaypoint: (seq: number, updates: Partial<MissionItem>) => {
    const { missionItems } = get();
    const newItems = missionItems.map(item =>
      item.seq === seq ? { ...item, ...updates } : item
    );
    set({ missionItems: newItems, isDirty: true });
  },

  removeWaypoint: (seq: number) => {
    const { missionItems, selectedSeq } = get();
    const newItems = missionItems
      .filter(item => item.seq !== seq)
      .map((item, index) => ({ ...item, seq: index }));

    // Adjust selection
    let newSelectedSeq = selectedSeq;
    if (selectedSeq !== null) {
      if (selectedSeq === seq) {
        newSelectedSeq = newItems.length > 0 ? Math.min(seq, newItems.length - 1) : null;
      } else if (selectedSeq > seq) {
        newSelectedSeq = selectedSeq - 1;
      }
    }

    set({
      missionItems: newItems,
      isDirty: true,
      selectedSeq: newSelectedSeq,
    });
  },

  removeWaypoints: (seqs: number[]) => {
    if (seqs.length === 0) return;
    const { missionItems, selectedSeq } = get();
    const toRemove = new Set(seqs);
    const newItems = missionItems
      .filter(item => !toRemove.has(item.seq))
      .map((item, index) => ({ ...item, seq: index }));

    const newSelectedSeq = selectedSeq !== null && toRemove.has(selectedSeq) ? null : selectedSeq;

    set({
      missionItems: newItems,
      isDirty: true,
      selectedSeq: newSelectedSeq,
    });
  },

  reorderWaypoints: (fromSeq: number, toSeq: number) => {
    if (fromSeq === toSeq) return;

    const { missionItems } = get();
    const items = [...missionItems];
    const [moved] = items.splice(fromSeq, 1);
    items.splice(toSeq, 0, moved!);

    // Renumber all items
    const renumbered = items.map((item, index) => ({ ...item, seq: index }));

    set({
      missionItems: renumbered,
      isDirty: true,
      selectedSeq: toSeq,
    });
  },

  insertMissionItems: (items: MissionItem[]) => {
    const { missionItems, groups } = get();
    const { groups: nextGroups, group } = ensureDefaultManualGroup(groups);
    const startSeq = missionItems.length;
    const renumbered = items.map((item, i) => ({
      ...item,
      seq: startSeq + i,
      ...(item.groupId ? {} : { groupId: group.id }),
    }));
    set({
      missionItems: [...missionItems, ...renumbered],
      groups: nextGroups,
      isDirty: true,
    });
  },

  /**
   * Apply terrain-adjustment plan atomically: raise altitudes on existing WPs
   * and splice in new intermediate NAV_WAYPOINTs, renumbering once at the end.
   *
   * Inserts carry an `afterSeq` that refers to the seq BEFORE this call (the
   * preceding nav waypoint). DO_* child commands that follow a nav waypoint
   * logically belong to it and execute at that waypoint; we emit queued
   * inserts just before the next nav waypoint so child commands stay tied
   * to their parent.
   */
  applyTerrainPlan: (plan) => {
    const { missionItems } = get();
    if (missionItems.length === 0) return;

    const bySeq = new Map<number, typeof plan.inserts>();
    for (const ins of plan.inserts) {
      const list = bySeq.get(ins.afterSeq);
      if (list) list.push(ins);
      else bySeq.set(ins.afterSeq, [ins]);
    }

    // Terrain inserts inherit the group of the preceding nav waypoint so a
    // terrain-corrected survey leg stays in its survey group. The default
    // Manual group covers the leading-edge case where the first item is an
    // insert.
    const { groups: nextGroups, group: defaultGroup } = ensureDefaultManualGroup(get().groups);

    const makeNavWp = (ins: (typeof plan.inserts)[number], groupId: string): MissionItem => ({
      seq: 0,
      frame: altFrameToMavFrame(ins.frame),
      command: MAV_CMD.NAV_WAYPOINT,
      current: false,
      autocontinue: true,
      param1: 0,
      param2: 0,
      param3: 0,
      param4: 0,
      latitude: ins.latitude,
      longitude: ins.longitude,
      altitude: ins.altitude,
      groupId,
    });

    const isNav = (cmd: number) => cmd >= 16 && cmd <= 95;

    const out: MissionItem[] = [];
    let pending: typeof plan.inserts | null = null;
    let lastNavGroupId: string = defaultGroup.id;

    for (const item of missionItems) {
      if (isNav(item.command) && pending) {
        for (const ins of pending) out.push(makeNavWp(ins, lastNavGroupId));
        pending = null;
      }
      const raised = plan.raisedAltitudes.get(item.seq);
      out.push(raised !== undefined ? { ...item, altitude: raised } : item);
      if (isNav(item.command)) {
        if (item.groupId) lastNavGroupId = item.groupId;
        const toInsertHere = bySeq.get(item.seq);
        if (toInsertHere) pending = toInsertHere;
      }
    }
    if (pending) {
      for (const ins of pending) out.push(makeNavWp(ins, lastNavGroupId));
    }

    const renumbered = out.map((item, i) => ({ ...item, seq: i }));
    set({ missionItems: renumbered, groups: nextGroups, isDirty: true });
  },

  clearMission: () => {
    // Intentional clear: drop the crash-recovery file immediately (don't wait
    // for the debounce) so a New + close doesn't resurrect the old mission.
    clearMissionAutosave();
    set({
      missionItems: [],
      groups: [],
      homePosition: null,
      isDirty: false,
      selectedSeq: null,
      selectedGroupId: null,
      currentSeq: null,
      fcSeqOffset: 0,
      lastUploadedAt: null,
      lastUploadedGroupIds: [],
      lastUploadedItemCount: 0,
    });
  },

  // ---------------------------------------------------------------------------
  // Group management
  // ---------------------------------------------------------------------------

  renameGroup: (groupId, name) => {
    set((s) => ({
      groups: s.groups.map((g) =>
        g.id === groupId ? { ...g, name, updatedAt: Date.now() } : g,
      ),
      isDirty: true,
    }));
  },

  setGroupColor: (groupId, color) => {
    set((s) => ({
      groups: s.groups.map((g) =>
        g.id === groupId ? { ...g, color, updatedAt: Date.now() } : g,
      ),
      isDirty: true,
    }));
  },

  setGroupVehicle: (groupId, vehicleKey) => {
    set((s) => ({
      groups: s.groups.map((g) =>
        g.id === groupId
          ? { ...g, assignedVehicleKey: vehicleKey ?? undefined, updatedAt: Date.now() }
          : g,
      ),
      isDirty: true,
    }));
  },

  /**
   * Delete a group AND every waypoint it owns. Use with care; this is the
   * destructive variant. A future PR may add "detach waypoints to manual"
   * for users who want to keep the WPs but lose the group structure.
   */
  deleteGroup: (groupId) => {
    set((s) => {
      const remainingItems = s.missionItems.filter((it) => it.groupId !== groupId);
      const renumbered = remainingItems.map((it, idx) => ({ ...it, seq: idx }));
      const remainingGroups = s.groups.filter((g) => g.id !== groupId);
      // Selection cleanup: if the selected WP was in the deleted group,
      // clear it. Otherwise re-resolve its seq after renumbering.
      let nextSelected: number | null = s.selectedSeq;
      if (s.selectedSeq !== null) {
        const wasInGroup = s.missionItems.find((it) => it.seq === s.selectedSeq)?.groupId === groupId;
        nextSelected = wasInGroup ? null : nextSelected;
      }
      return {
        groups: remainingGroups,
        missionItems: renumbered,
        selectedSeq: nextSelected,
        isDirty: true,
      };
    });
  },

  toggleGroupCollapsed: (groupId) => {
    set((s) => ({
      groups: s.groups.map((g) =>
        g.id === groupId ? { ...g, collapsed: !g.collapsed, updatedAt: Date.now() } : g,
      ),
    }));
  },

  setGroupVisible: (groupId, visible) => {
    set((s) => ({
      groups: s.groups.map((g) =>
        g.id === groupId ? { ...g, visible, updatedAt: Date.now() } : g,
      ),
      isDirty: true,
    }));
  },

  reorderGroups: (groupId, toOrder) => {
    set((s) => {
      const sorted = [...s.groups].sort((a, b) => a.order - b.order);
      const fromIdx = sorted.findIndex((g) => g.id === groupId);
      if (fromIdx === -1) return {};
      const [moved] = sorted.splice(fromIdx, 1);
      const clamped = Math.max(0, Math.min(toOrder, sorted.length));
      sorted.splice(clamped, 0, moved!);
      const renumbered = sorted.map((g, i) => ({ ...g, order: i }));
      return { groups: renumbered, isDirty: true };
    });
  },

  addSurveyGroup: (group, items) => {
    const { missionItems, groups } = get();
    const startSeq = missionItems.length;
    const stampedItems = items.map((it, i) => ({
      ...it,
      seq: startSeq + i,
      groupId: group.id,
    }));
    // Place the new survey group after the highest existing order so it
    // appears at the bottom of the table by default.
    const maxOrder = groups.reduce((m, g) => Math.max(m, g.order), -1);
    const placedGroup: SurveyGroup = { ...group, order: maxOrder + 1 };
    set({
      groups: [...groups, placedGroup],
      missionItems: [...missionItems, ...stampedItems],
      isDirty: true,
    });
    return placedGroup.id;
  },

  addGroupsWithItems: (entries) => {
    const { missionItems, groups } = get();
    let seq = missionItems.length;
    let order = groups.reduce((m, g) => Math.max(m, g.order), -1);
    const newGroups: Group[] = [];
    const newItems: MissionItem[] = [];
    const ids: string[] = [];
    for (const entry of entries) {
      order += 1;
      const placed = { ...entry.group, order } as Group;
      newGroups.push(placed);
      ids.push(placed.id);
      for (const it of entry.items) {
        newItems.push({ ...it, seq: seq++, groupId: placed.id });
      }
    }
    set({
      groups: [...groups, ...newGroups],
      missionItems: [...missionItems, ...newItems],
      isDirty: true,
    });
    return ids;
  },

  replaceSurveyGroupItems: (groupId, items, signature, generatorResult) => {
    const { missionItems, groups } = get();
    const group = groups.find((g) => g.id === groupId);
    if (!group || group.kind !== 'survey') return;
    // Drop existing items belonging to this group, keep everything else in
    // its current relative order, then append the freshly generated items.
    // PR 8 may revisit positioning to keep the survey "in place" rather
    // than rebuild-at-end semantics; for now appending is the safe default.
    const others = missionItems.filter((it) => it.groupId !== groupId);
    const startSeq = others.length;
    const stampedItems = items.map((it, i) => ({
      ...it,
      seq: startSeq + i,
      groupId,
    }));
    const updatedGroup: SurveyGroup = {
      ...(group as SurveyGroup),
      lastGeneratedAt: Date.now(),
      lastGeneratedSignature: signature ?? null,
      // undefined = generator carried no extras; keep the cached ones.
      ...(generatorResult !== undefined ? { generatorResult } : {}),
      updatedAt: Date.now(),
    };
    set({
      groups: groups.map((g) => (g.id === groupId ? updatedGroup : g)),
      missionItems: [...others, ...stampedItems],
      isDirty: true,
    });
  },

  syncSurveyGroupFromDraft: (groupId, polygon, config, items, signature, generatorResult) => {
    const { missionItems, groups } = get();
    const group = groups.find((g) => g.id === groupId);
    if (!group || group.kind !== 'survey') return;
    const others = missionItems.filter((it) => it.groupId !== groupId);
    const startSeq = others.length;
    const stampedItems = items.map((it, i) => ({
      ...it,
      seq: startSeq + i,
      groupId,
    }));
    const updatedGroup: SurveyGroup = {
      ...(group as SurveyGroup),
      polygon,
      config,
      lastGeneratedAt: Date.now(),
      lastGeneratedSignature: signature,
      // undefined = generator carried no extras; keep the cached ones.
      ...(generatorResult !== undefined ? { generatorResult } : {}),
      updatedAt: Date.now(),
    };
    set({
      groups: groups.map((g) => (g.id === groupId ? updatedGroup : g)),
      missionItems: [...others, ...stampedItems],
      isDirty: true,
    });
  },

  // UI state
  setSelectedSeq: (seq: number | null) => {
    // Selecting a WP implicitly selects its group too. This drives the
    // bidirectional polygon ↔ row highlight without a separate effect.
    if (seq === null) {
      set({ selectedSeq: null });
      return;
    }
    const wp = get().missionItems.find((it) => it.seq === seq);
    set({
      selectedSeq: seq,
      ...(wp?.groupId ? { selectedGroupId: wp.groupId } : {}),
    });
  },

  setSelectedGroupId: (id: string | null) => {
    set({ selectedGroupId: id });
  },

  focusWaypoint: (seq: number) => {
    // Also select it so the row + details panel reflect the focused WP.
    const wp = get().missionItems.find((it) => it.seq === seq);
    set((s) => ({
      focusedSeq: seq,
      focusNonce: s.focusNonce + 1,
      selectedSeq: seq,
      ...(wp?.groupId ? { selectedGroupId: wp.groupId } : {}),
    }));
  },

  // IPC event handlers (from FC download). Non-destructive: the downloaded
  // WPs are placed in a fresh `imported` group at the top of the table.
  // Existing local groups (Manual surveys, etc.) are untouched.
  setMissionItems: (items: MissionItem[]) => {
    // Extract home waypoint: seq=0 is always the home position in ArduPilot missions.
    // It shares MAV_CMD 16 (WAYPOINT) but has current=true in the protocol.
    // Also detect seq=0 at 0,0 (placeholder when no GPS fix).
    let homePosition: HomePosition | null = null;
    const homeWasStripped = items.some(item => item.seq === 0);
    const filteredItems = items.filter(item => {
      if (item.seq === 0) {
        // seq=0 is home position - extract it if it has valid coordinates
        if (item.latitude !== 0 || item.longitude !== 0) {
          homePosition = { lat: item.latitude, lon: item.longitude, alt: item.altitude };
        }
        return false; // Always remove seq=0 from mission items
      }
      return true;
    });

    const { groups, missionItems: existingItems } = get();

    // A fresh download from the FC REPLACES the previous FC-imported mission
    // instead of stacking another copy. Every re-download (reconnect, re-fetch,
    // AUTO progress) was appending ~N waypoints, growing the mission into the
    // thousands and piling duplicate markers on the map until it lagged / OOM'd.
    // Local edits and file-imported groups are preserved.
    const isFcGroup = (g: Group): boolean => 'importedFrom' in g && g.importedFrom === 'fc';
    const priorFcGroupIds = new Set(groups.filter(isFcGroup).map(g => g.id));
    const keptGroups = groups.filter(g => !isFcGroup(g));
    const keptItems = existingItems.filter(it => !it.groupId || !priorFcGroupIds.has(it.groupId));

    // Create a fresh imported group for this download. Stamp items into it,
    // append after any KEPT items, and renumber globally so the table seq stays
    // contiguous.
    const now = new Date();
    const stamp = now.toLocaleString();
    const importedGroup = createImportedGroup({
      importedFrom: 'fc',
      sourceLabel: `Vehicle mission @ ${stamp}`,
      name: `From vehicle @ ${stamp}`,
      color: nextGroupColor(keptGroups),
      // Place at order = -1 then renumber so the imported group sits at
      // the top of the table. The user can drag-reorder later.
      order: -1,
    });
    const reorderedGroups = [importedGroup, ...keptGroups]
      .sort((a, b) => a.order - b.order)
      .map((g, i) => ({ ...g, order: i }));

    const startSeq = keptItems.length;
    const stampedNewItems = filteredItems.map((it, i) => ({
      ...it,
      seq: startSeq + i,
      groupId: importedGroup.id,
    }));

    // If we stripped HOME at seq=0, the FC will keep reporting raw seqs that
    // are 1 ahead of our renumbered indices in MISSION_CURRENT events. Record
    // the offset so setCurrentSeq can subtract it; otherwise the map would
    // highlight the wp AFTER the actual target.
    set({
      missionItems: [...keptItems, ...stampedNewItems],
      groups: reorderedGroups,
      fcSeqOffset: homeWasStripped ? 1 : 0,
      ...(homePosition ? { homePosition } : {}),
      selectedGroupId: importedGroup.id,
      isLoading: false,
      progress: null,
      // Imports are NOT considered "the user's edits" — leave isDirty as-is.
      // Otherwise the toolbar would falsely show unsaved changes after a
      // read-from-FC of a fresh session.
      error: null,
      lastSuccessMessage: `Downloaded ${stampedNewItems.length} waypoints from flight controller into "${importedGroup.name}"`,
      loadCounter: get().loadCounter + 1,
    });
  },

  applyMissionMirror: (snapshot: MissionMirrorSnapshot) => {
    set({
      missionItems: snapshot.items as MissionItem[],
      groups: snapshot.groups,
      homePosition: snapshot.home,
      fcSeqOffset: snapshot.fcSeqOffset,
    });
  },

  // For file loading (toolbar handles toast via showToast prop)
  setMissionItemsFromFile: (items: MissionItem[], groups?: Group[]) => {
    // Extract home waypoint: seq=0 with current=true is the home/launch position.
    // In QGC WPL format: "0  1  0  16  ..." where second field (current=1) marks home.
    let homePosition: HomePosition | null = null;
    const homeWasStripped = items.some(item => item.seq === 0 && item.current);
    const filteredItems = items.filter(item => {
      if (item.seq === 0 && item.current) {
        // This is the home position - extract it
        if (item.latitude !== 0 || item.longitude !== 0) {
          homePosition = { lat: item.latitude, lon: item.longitude, alt: item.altitude };
        }
        return false; // Remove from mission items
      }
      return true;
    });

    // Renumber remaining items starting from 0
    const renumberedItems = filteredItems.map((item, index) => ({
      ...item,
      seq: index,
    }));

    // If the caller supplied groups (e.g. mission-library load of a migrated
    // v2 file), adopt them and trust that items already carry valid groupIds.
    // Otherwise stamp into the default Manual group as the legacy fallback.
    let nextGroups: Group[];
    let stampedItems: MissionItem[];
    if (groups && groups.length > 0) {
      nextGroups = groups;
      // Defensive: items might be missing groupId on a legacy file that came
      // through a non-migrated path. Fall back to the first group's id.
      const fallbackId = groups[0]!.id;
      stampedItems = renumberedItems.map((it) =>
        it.groupId ? it : { ...it, groupId: fallbackId },
      );
    } else {
      const ensured = ensureDefaultManualGroup(get().groups);
      nextGroups = ensured.groups;
      stampedItems = stampWithGroup(renumberedItems, ensured.group.id);
    }

    set({
      missionItems: stampedItems,
      groups: nextGroups,
      fcSeqOffset: homeWasStripped ? 1 : 0,
      ...(homePosition ? { homePosition } : {}),
      isLoading: false,
      progress: null,
      isDirty: false,
      error: null,
      loadCounter: get().loadCounter + 1,
    });
  },

  updateProgress: (progress: MissionProgress) => {
    set({ progress });
  },

  setCurrentSeq: (seq: number) => {
    // Translate raw FC seq through fcSeqOffset so callers can compare directly
    // against missionItems[].seq. ArduPilot's HOME entry at raw seq 0 is
    // stripped on download, so raw seq N corresponds to renumbered seq N-1
    // when home was present.
    const offset = get().fcSeqOffset;
    const aligned = Math.max(0, seq - offset);
    set({ currentSeq: aligned, currentSeqRaw: seq });
  },

  setError: (error: string | null) => {
    set({ error, isLoading: false, progress: null });
  },

  setLoading: (loading: boolean) => {
    set({ isLoading: loading });
  },

  setUploadComplete: (itemCount: number) => {
    // Snapshot which groups participated in this upload so the table can
    // render "on vehicle" indicators per group. Stale comparison uses
    // `group.updatedAt` against `lastUploadedAt`. The participating ids were
    // captured at upload start (toolbar = all groups, per-group = just one).
    const uploadedGroupIds = get().pendingUploadGroupIds;
    set({
      isLoading: false,
      isDirty: false,
      progress: null,
      error: null,
      lastSuccessMessage: `Uploaded ${itemCount} waypoints to flight controller`,
      lastUploadedAt: Date.now(),
      lastUploadedGroupIds: uploadedGroupIds,
      lastUploadedItemCount: itemCount,
    });
  },

  setClearComplete: () => {
    set({
      isLoading: false,
      progress: null,
      error: null,
      lastSuccessMessage: 'Mission cleared from flight controller',
    });
  },

  clearLastSuccessMessage: () => {
    set({ lastSuccessMessage: null });
  },

  markAsSaved: () => {
    set({ isDirty: false });
  },

  setHasTerrainCollisions: (hasCollisions: boolean) => {
    set({ hasTerrainCollisions: hasCollisions });
  },

  fitMapToMission: () => set((s) => ({ loadCounter: s.loadCounter + 1 })),

  reset: () => {
    clearMissionAutosave();
    set({
      missionItems: [],
      groups: [],
      homePosition: null,
      isLoading: false,
      progress: null,
      error: null,
      currentSeq: null,
      fcSeqOffset: 0,
      isDirty: false,
      selectedSeq: null,
      selectedGroupId: null,
      lastSuccessMessage: null,
      hasTerrainCollisions: false,
      loadCounter: 0,
      lastUploadedAt: null,
      lastUploadedGroupIds: [],
      lastUploadedItemCount: 0,
      pendingUploadGroupIds: [],
      _canUndo: false,
      _canRedo: false,
    });
  },

  undo: () => {
    if (past.length === 0) return;
    isTimeTraveling = true;
    future.push(snapshot(get()));
    const prev = past.pop()!;
    lastSnapshot = prev;
    set({
      groups: prev.groups,
      missionItems: prev.missionItems,
      homePosition: prev.homePosition,
      isDirty: true,
      _canUndo: past.length > 0,
      _canRedo: true,
    });
    isTimeTraveling = false;
  },

  redo: () => {
    if (future.length === 0) return;
    isTimeTraveling = true;
    past.push(snapshot(get()));
    const next = future.pop()!;
    lastSnapshot = next;
    set({
      groups: next.groups,
      missionItems: next.missionItems,
      homePosition: next.homePosition,
      isDirty: true,
      _canUndo: true,
      _canRedo: future.length > 0,
    });
    isTimeTraveling = false;
  },
}));

// ── Undo/redo history ────────────────────────────────────────────────────────
// History captures only the editable mission content (groups + items + home),
// not transient UI/connection state. We record the PREVIOUS snapshot whenever
// those references change, so each discrete edit is one undo step.
interface MissionSnapshot {
  groups: Group[];
  missionItems: MissionItem[];
  homePosition: { lat: number; lon: number; alt: number } | null;
}
function snapshot(s: MissionStore): MissionSnapshot {
  return { groups: s.groups, missionItems: s.missionItems, homePosition: s.homePosition };
}
const past: MissionSnapshot[] = [];
const future: MissionSnapshot[] = [];
const MAX_HISTORY = 100;
let isTimeTraveling = false;
let lastSnapshot = snapshot(useMissionStore.getState());

useMissionStore.subscribe((state) => {
  if (isTimeTraveling) return;
  if (
    state.groups === lastSnapshot.groups &&
    state.missionItems === lastSnapshot.missionItems &&
    state.homePosition === lastSnapshot.homePosition
  ) {
    return; // mission content unchanged - ignore UI/selection churn
  }
  past.push(lastSnapshot);
  if (past.length > MAX_HISTORY) past.shift();
  future.length = 0;
  lastSnapshot = snapshot(state);
  if (!state._canUndo || state._canRedo) {
    useMissionStore.setState({ _canUndo: true, _canRedo: false });
  }
});

// ── Autosave / crash recovery ────────────────────────────────────────────────
// Debounced mirror of the working mission to localStorage so a crash or an
// accidental close doesn't lose hours of survey prep. Restored on next launch.
const AUTOSAVE_KEY = 'ardudeck:mission-autosave';
let autosaveTimer: ReturnType<typeof setTimeout> | null = null;

export function clearMissionAutosave(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
  } catch {
    /* storage unavailable - ignore */
  }
}

function scheduleAutosave(state: MissionStore): void {
  if (typeof localStorage === 'undefined') return;
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    try {
      if (state.groups.length === 0 && state.missionItems.length === 0) {
        localStorage.removeItem(AUTOSAVE_KEY);
        return;
      }
      localStorage.setItem(
        AUTOSAVE_KEY,
        JSON.stringify({
          groups: state.groups,
          items: state.missionItems,
          home: state.homePosition,
          savedAt: Date.now(),
        }),
      );
    } catch {
      /* quota or serialization failure - non-fatal */
    }
  }, 800);
}

let lastAutosaved = snapshot(useMissionStore.getState());
useMissionStore.subscribe((state) => {
  // Self-heal the "every waypoint has an existing group" invariant. Cheap
  // orphan scan; only writes when something is actually orphaned, and the fix
  // leaves no orphans so the re-fire is a no-op (no loop). Catches any path
  // that ever lands an item without a resolvable group.
  const groupIds = new Set(state.groups.map((g) => g.id));
  if (state.missionItems.some((it) => !it.groupId || !groupIds.has(it.groupId))) {
    const normalized = adoptOrphanItems(state.missionItems, state.groups);
    useMissionStore.setState({ groups: normalized.groups, missionItems: normalized.items });
    return;
  }

  if (
    state.groups === lastAutosaved.groups &&
    state.missionItems === lastAutosaved.missionItems &&
    state.homePosition === lastAutosaved.homePosition
  ) {
    return;
  }
  lastAutosaved = snapshot(state);
  scheduleAutosave(state);
});

/** True when a recoverable autosave exists from a previous session. */
export function hasMissionAutosave(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { items?: unknown[] };
    return Array.isArray(parsed.items) && parsed.items.length > 0;
  } catch {
    return false;
  }
}

/** Restore the autosaved mission into the store. Returns false if none/invalid. */
export function restoreMissionAutosave(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as {
      groups?: Group[];
      items?: MissionItem[];
      home?: { lat: number; lon: number; alt: number } | null;
    };
    if (!Array.isArray(parsed.items) || parsed.items.length === 0) return false;
    // A saved session can carry items whose groups were lost (or predate the
    // grouping model); adopt any such orphans so the restore never lands
    // headerless waypoints in the table.
    const normalized = adoptOrphanItems(parsed.items, parsed.groups ?? []);
    useMissionStore.setState({
      groups: normalized.groups,
      missionItems: normalized.items,
      homePosition: parsed.home ?? null,
      isDirty: true,
      lastSuccessMessage: `Recovered ${normalized.items.length} waypoints from your last session`,
    });
    return true;
  } catch {
    return false;
  }
}
