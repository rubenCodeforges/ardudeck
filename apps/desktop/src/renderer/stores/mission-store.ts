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
} from '../../shared/mission-types';
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

interface MissionStore {
  // State
  missionItems: MissionItem[];
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
  lastSuccessMessage: string | null;  // For toast notifications
  hasTerrainCollisions: boolean;  // Terrain collision warning
  loadCounter: number;            // Increments on bulk load (file/download) to trigger map fit

  // Computed (as functions)
  getWaypointCount: () => number;
  getTotalDistance: () => number;
  getEstimatedTime: () => number;

  // Actions
  fetchMission: () => Promise<void>;
  /** When `overrideItems` is set, upload that list instead of store `missionItems` (same ACK flow). */
  uploadMission: (overrideItems?: MissionItem[]) => Promise<boolean>;
  clearMissionFromFC: () => Promise<boolean>;

  // Home position
  setHomePosition: (lat: number, lon: number, alt?: number) => void;
  clearHomePosition: () => void;

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
    inserts: Array<{ afterSeq: number; latitude: number; longitude: number; altitude: number }>;
  }) => void;
  clearMission: () => void;

  // UI state
  setSelectedSeq: (seq: number | null) => void;

  // IPC event handlers (from FC)
  setMissionItems: (items: MissionItem[]) => void;
  // For file loading (no success message - toolbar handles it)
  setMissionItemsFromFile: (items: MissionItem[]) => void;
  updateProgress: (progress: MissionProgress) => void;
  setCurrentSeq: (seq: number) => void;
  setError: (error: string | null) => void;
  setLoading: (loading: boolean) => void;
  setUploadComplete: (itemCount: number) => void;
  setClearComplete: () => void;
  clearLastSuccessMessage: () => void;
  markAsSaved: () => void;
  setHasTerrainCollisions: (hasCollisions: boolean) => void;
  reset: () => void;
}

export const useMissionStore = create<MissionStore>((set, get) => ({
  // Initial state
  missionItems: [],
  homePosition: null,
  isLoading: false,
  progress: null,
  error: null,
  currentSeq: null,
  currentSeqRaw: null,
  fcSeqOffset: 0,
  isDirty: false,
  selectedSeq: null,
  lastSuccessMessage: null,
  hasTerrainCollisions: false,
  loadCounter: 0,

  // Computed values
  getWaypointCount: () => get().missionItems.length,

  getTotalDistance: () => {
    return calculateMissionDistance(get().missionItems);
  },

  getEstimatedTime: () => {
    const distance = get().getTotalDistance();
    return estimateMissionTime(distance);
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
          set({ missionItems: [], isLoading: false, progress: null, isDirty: false, lastSuccessMessage: 'No waypoints on FC' });
          return;
        }
        // Convert MSP waypoints to MissionItems
        const items = waypoints.map(wp => mspWaypointToMissionItem(wp));
        set({
          missionItems: items,
          isLoading: false,
          progress: null,
          isDirty: false,
          error: null,
          lastSuccessMessage: `Downloaded ${items.length} waypoints from FC`,
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

  uploadMission: async (overrideItems?: MissionItem[]) => {
    const missionItems = overrideItems ?? get().missionItems;
    const { connectionState } = useConnectionStore.getState();
    const isMsp = connectionState.protocol === 'msp';
    const isInav = connectionState.fcVariant === 'INAV';

    if (missionItems.length === 0) {
      set({ error: 'No waypoints to upload' });
      return false;
    }

    // Set initial progress to track operation type
    set({ isLoading: true, error: null, progress: { total: missionItems.length, transferred: 0, operation: 'upload' } });

    try {
      // MSP path for iNav boards
      if (isMsp && isInav) {
        // Convert MissionItems to MSP waypoints
        const mspWaypoints = missionItems.map((item, i) =>
          missionItemToMspWaypoint(item, i === missionItems.length - 1)
        );

        const success = await window.electronAPI?.mspSaveWaypoints(mspWaypoints);
        if (success) {
          set({
            isLoading: false,
            isDirty: false,
            progress: null,
            error: null,
            lastSuccessMessage: `Uploaded ${missionItems.length} waypoints to FC`,
          });
          return true;
        } else {
          set({ error: 'Failed to upload waypoints', isLoading: false, progress: null });
          return false;
        }
      }

      // MAVLink path for ArduPilot boards
      // Home position is a planning reference only — ArduPilot sets its own home on arm via GPS.
      const result = await window.electronAPI?.uploadMission(missionItems);
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
    const { missionItems } = get();

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
        const takeoff = createTakeoffWaypoint(0, lat, lon, missionDefaults.defaultTakeoffAltitude);
        const firstWp = createDefaultWaypoint(1, lat, lon, defaultAlt);
        set({
          missionItems: [takeoff, firstWp],
          isDirty: true,
          selectedSeq: 1,
        });
        return;
      }
    }

    const seq = missionItems.length;
    const newItem = createDefaultWaypoint(seq, lat, lon, defaultAlt);
    set({
      missionItems: [...missionItems, newItem],
      isDirty: true,
      selectedSeq: seq,
    });
  },

  insertWaypoint: (afterSeq: number, lat: number, lon: number, alt: number = 100) => {
    const { missionItems } = get();
    const newSeq = afterSeq + 1;
    const newItem = createDefaultWaypoint(newSeq, lat, lon, alt);

    // Insert and renumber
    const newItems = [
      ...missionItems.slice(0, newSeq),
      newItem,
      ...missionItems.slice(newSeq).map(item => ({ ...item, seq: item.seq + 1 })),
    ];

    set({
      missionItems: newItems,
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
    const { missionItems } = get();
    const startSeq = missionItems.length;
    const renumbered = items.map((item, i) => ({ ...item, seq: startSeq + i }));
    set({
      missionItems: [...missionItems, ...renumbered],
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

    const makeNavWp = (ins: (typeof plan.inserts)[number]): MissionItem => ({
      seq: 0,
      frame: MAV_FRAME.GLOBAL_RELATIVE_ALT,
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
    });

    const isNav = (cmd: number) => cmd >= 16 && cmd <= 95;

    const out: MissionItem[] = [];
    let pending: typeof plan.inserts | null = null;

    for (const item of missionItems) {
      if (isNav(item.command) && pending) {
        for (const ins of pending) out.push(makeNavWp(ins));
        pending = null;
      }
      const raised = plan.raisedAltitudes.get(item.seq);
      out.push(raised !== undefined ? { ...item, altitude: raised } : item);
      if (isNav(item.command)) {
        const toInsertHere = bySeq.get(item.seq);
        if (toInsertHere) pending = toInsertHere;
      }
    }
    if (pending) {
      for (const ins of pending) out.push(makeNavWp(ins));
    }

    const renumbered = out.map((item, i) => ({ ...item, seq: i }));
    set({ missionItems: renumbered, isDirty: true });
  },

  clearMission: () => {
    set({
      missionItems: [],
      homePosition: null,
      isDirty: false,
      selectedSeq: null,
      currentSeq: null,
      fcSeqOffset: 0,
    });
  },

  // UI state
  setSelectedSeq: (seq: number | null) => {
    set({ selectedSeq: seq });
  },

  // IPC event handlers (from FC download)
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

    // Renumber remaining items starting from 0
    const renumberedItems = filteredItems.map((item, index) => ({
      ...item,
      seq: index,
    }));

    // If we stripped HOME at seq=0, the FC will keep reporting raw seqs that
    // are 1 ahead of our renumbered indices in MISSION_CURRENT events. Record
    // the offset so setCurrentSeq can subtract it; otherwise the map would
    // highlight the wp AFTER the actual target.
    set({
      missionItems: renumberedItems,
      fcSeqOffset: homeWasStripped ? 1 : 0,
      ...(homePosition ? { homePosition } : {}),
      isLoading: false,
      progress: null,
      isDirty: false,
      error: null,
      lastSuccessMessage: `Downloaded ${renumberedItems.length} waypoints from flight controller`,
      loadCounter: get().loadCounter + 1,
    });
  },

  // For file loading (toolbar handles toast via showToast prop)
  setMissionItemsFromFile: (items: MissionItem[]) => {
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

    set({
      missionItems: renumberedItems,
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
    set({
      isLoading: false,
      isDirty: false,
      progress: null,
      error: null,
      lastSuccessMessage: `Uploaded ${itemCount} waypoints to flight controller`,
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

  reset: () => {
    set({
      missionItems: [],
      homePosition: null,
      isLoading: false,
      progress: null,
      error: null,
      currentSeq: null,
      fcSeqOffset: 0,
      isDirty: false,
      selectedSeq: null,
      lastSuccessMessage: null,
      hasTerrainCollisions: false,
      loadCounter: 0,
    });
  },
}));
