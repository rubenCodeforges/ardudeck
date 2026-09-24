import { GuidesButton } from './GuidesButton';
import { Fragment, useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FileCode, Globe, Library, ListOrdered } from 'lucide-react';
import { useConnectionStore } from '../../stores/connection-store';
import { useMissionStore } from '../../stores/mission-store';
import { useSurveyStore } from '../../stores/survey-store';
import { useFenceStore } from '../../stores/fence-store';
import { useRallyStore } from '../../stores/rally-store';
import { useEditModeStore, type EditMode, type MapMode } from '../../stores/edit-mode-store';
import { useSettingsStore, type MissionFirmware } from '../../stores/settings-store';
import { effectiveMissionFirmware } from '../../utils/mission-firmware';
import { SaveMissionModal } from '../mission-library/SaveMissionModal';
import { UploadPreviewModal } from './UploadPreviewModal';
import { AutoAdjustAltitudeDialog } from './AutoAdjustAltitudeDialog';
import type { PlanResult, PlannerWaypoint } from './terrain-altitude-planner';
import { hasValidCoordinates, mavFrameToAltFrame } from '../../../shared/mission-types';
import { formatAltitudeFromMeters } from '../../../shared/user-units.js';
import { VaultSyncBadge } from '../vault/VaultSyncBadge';
import { useCargoEnabled, MISSION_LIBRARY_CARGO_SLUG } from '../../modules/capabilities';
import { useFleetVehicles } from '../../hooks/useFleet';
import { useVehicleAppearanceStore, resolveVehicleColor } from '../../stores/vehicle-appearance-store';
import { buildArduPilotWireMission } from '../../../shared/mission-wire';

type ToastType = 'success' | 'error' | 'info';

interface MissionToolbarProps {
  onResetLayout: () => void;
  showToast?: (message: string, type: ToastType) => void;
}

// Segmented control button component
function ModeButton({
  mode,
  label,
  activeMode,
  onClick,
  color,
  hasModified,
}: {
  mode: EditMode;
  label: string;
  activeMode: EditMode;
  onClick: () => void;
  color: 'blue' | 'green' | 'orange';
  hasModified?: boolean;
}) {
  const isActive = activeMode === mode;
  const colorClasses = {
    blue: isActive ? 'bg-blue-600 text-white' : 'text-blue-400 hover:bg-blue-600/20',
    green: isActive ? 'bg-green-600 text-white' : 'text-green-400 hover:bg-green-600/20',
    orange: isActive ? 'bg-orange-600 text-white' : 'text-orange-400 hover:bg-orange-600/20',
  };

  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-medium transition-colors relative ${colorClasses[color]}`}
    >
      {label}
      {hasModified && (
        <span className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${
          color === 'blue' ? 'bg-blue-400' : color === 'green' ? 'bg-green-400' : 'bg-orange-400'
        }`} />
      )}
    </button>
  );
}

/** Offline mission-planning targets. One accent colour per flight stack. */
const MISSION_FIRMWARE_OPTIONS = [
  { id: 'ardupilot', label: 'ArduPilot', title: 'ArduPilot mission commands' },
  { id: 'px4', label: 'PX4', title: 'PX4 mission commands' },
  { id: 'inav', label: 'iNav', title: 'iNav mission commands (8 waypoint types)' },
] as const satisfies ReadonlyArray<{ id: MissionFirmware; label: string; title: string }>;

const MISSION_FIRMWARE_ACCENT: Record<MissionFirmware, { border: string; divider: string; active: string }> = {
  ardupilot: { border: 'border-sky-500/40', divider: 'bg-sky-500/30', active: 'bg-sky-600/80 text-white' },
  px4: { border: 'border-emerald-500/40', divider: 'bg-emerald-500/30', active: 'bg-emerald-600/80 text-white' },
  inav: { border: 'border-violet-500/40', divider: 'bg-violet-500/30', active: 'bg-violet-600/80 text-white' },
};

function MissionModeControls() {
  const advancedLabels = useSettingsStore((s) => s.missionDefaults.advancedMissionLabels);
  const missionFirmware = useSettingsStore((s) => s.missionDefaults.missionFirmware);
  const updateMissionDefaults = useSettingsStore((s) => s.updateMissionDefaults);
  const { connectionState } = useConnectionStore();
  const isConnected = connectionState.isConnected;

  // Same rule as the waypoint table, from one shared detector.
  const effectiveFirmware = effectiveMissionFirmware(connectionState, missionFirmware);
  const isInav = effectiveFirmware === 'inav';

  return (
    <div className="flex items-center gap-1.5">
      <VaultSyncBadge />
      {/* Simple / Advanced toggle - only relevant for ArduPilot (iNav has only 8 commands) */}
      {!isInav && (
        <div className="flex items-center rounded-lg overflow-hidden border border-subtle">
          <button
            onClick={() => updateMissionDefaults({ advancedMissionLabels: false })}
            className={`p-1.5 transition-colors ${
              !advancedLabels
                ? 'bg-blue-600 text-white'
                : 'text-content-secondary hover:bg-surface-raised'
            }`}
            data-tip="Simple mode: friendly waypoint labels (Fly here, Circle here) and common commands only"
          >
            {/* Eye icon - simple/readable view */}
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          </button>
          <div className="w-px h-5 bg-subtle" />
          <button
            onClick={() => updateMissionDefaults({ advancedMissionLabels: true })}
            className={`p-1.5 transition-colors ${
              advancedLabels
                ? 'bg-blue-600 text-white'
                : 'text-content-secondary hover:bg-surface-raised'
            }`}
            data-tip="Advanced mode: standard GCS command names and the full command list"
          >
            {/* Code/terminal icon - advanced/technical view */}
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
          </button>
        </div>
      )}

      {/* Firmware selector - only when disconnected. Connected, the link
          decides and this is hidden, so the two can never disagree.
          Class names are spelled out in full: Tailwind scans source
          statically, so an interpolated `bg-${color}-600` is purged. */}
      {!isConnected && (
        <div className={`flex items-center rounded-lg overflow-hidden border transition-colors ${MISSION_FIRMWARE_ACCENT[effectiveFirmware].border}`}>
          {MISSION_FIRMWARE_OPTIONS.map((option, i) => (
            <Fragment key={option.id}>
              {i > 0 && <div className={`w-px h-5 transition-colors ${MISSION_FIRMWARE_ACCENT[effectiveFirmware].divider}`} />}
              <button
                onClick={() => updateMissionDefaults({ missionFirmware: option.id })}
                className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  effectiveFirmware === option.id
                    ? MISSION_FIRMWARE_ACCENT[option.id].active
                    : 'text-content-secondary hover:bg-surface-raised'
                }`}
                title={option.title}
              >
                {option.label}
              </button>
            </Fragment>
          ))}
        </div>
      )}

      {/* Firmware badge hidden when connected - redundant info */}
    </div>
  );
}

/**
 * Save / Export dropdown for the mission toolbar. Consolidates the three "where
 * does this plan go" destinations behind one obvious button: the ArduDeck
 * library (groups-aware) and the two file formats. A floppy-disk glyph keeps it
 * visually distinct from the FC up/down-arrow transfer buttons. Dropdown is
 * portalled so a clipping toolbar ancestor can't hide it.
 */
function SaveMenu({
  enabled,
  multipleGroups,
  showLibrary,
  onLibrary,
  onExport,
}: {
  enabled: boolean;
  multipleGroups: boolean;
  /** Library option is gated behind the mission-library cargo */
  showLibrary: boolean;
  onLibrary: () => void;
  onExport: (format: 'waypoints' | 'plan' | 'kmz') => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const toggle = () => {
    if (!enabled) return;
    if (!open) {
      const r = btnRef.current?.getBoundingClientRect();
      if (r) setPos({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) });
    }
    setOpen((v) => !v);
  };

  return (
    <div data-tour="mission-export" className="relative">
      <button
        ref={btnRef}
        onClick={toggle}
        disabled={!enabled}
        className={`px-2 py-1.5 rounded bg-surface-raised flex items-center gap-1 transition-colors ${
          enabled ? 'text-content hover:brightness-125' : 'text-content-tertiary cursor-not-allowed'
        }`}
        data-tip={enabled ? 'Save or export the mission' : 'Add waypoints first'}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 4h11l3 3v13H5z M9 4v5h6V4 M9 17h6" />
        </svg>
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && pos && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
          <div
            className="fixed z-[9999] w-[288px] bg-surface-solid border border-default rounded-lg shadow-2xl py-1"
            style={{ top: pos.top, right: pos.right }}
          >
            {showLibrary && (
              <>
                <ExportMenuItem
                  icon={<Library className="w-3.5 h-3.5" />}
                  tint="bg-purple-500/10 text-purple-700 dark:text-purple-300"
                  title="Save project"
                  titleClass="text-purple-700 dark:text-purple-300"
                  detail="The whole plan in ArduDeck: waypoint groups, every survey area and its settings, all editable later"
                  onClick={() => { onLibrary(); setOpen(false); }}
                />
                <div className="my-1 h-px bg-subtle" />
              </>
            )}
            <ExportMenuItem
              icon={<ListOrdered className="w-3.5 h-3.5" />}
              tint="bg-sky-500/10 text-sky-700 dark:text-sky-300"
              title="Waypoints file (.waypoints)"
              detail={`QGC WPL · ArduPilot / Mission Planner${multipleGroups ? ' · flattens groups' : ''}`}
              onClick={() => { onExport('waypoints'); setOpen(false); }}
            />
            <ExportMenuItem
              icon={<FileCode className="w-3.5 h-3.5" />}
              tint="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              title="QGC Plan (.plan)"
              detail={`QGroundControl${multipleGroups ? ' · flattens groups' : ''}`}
              onClick={() => { onExport('plan'); setOpen(false); }}
            />
            <ExportMenuItem
              icon={<Globe className="w-3.5 h-3.5" />}
              tint="bg-amber-500/10 text-amber-700 dark:text-amber-300"
              title="DJI KMZ (.kmz)"
              detail="DJI Fly waypoint mission · plain waypoints only"
              onClick={() => { onExport('kmz'); setOpen(false); }}
            />
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}

/** One export target: its own icon and tint, so the list reads by shape. */
function ExportMenuItem({
  icon, tint, title, titleClass, detail, onClick,
}: {
  icon: React.ReactNode;
  tint: string;
  title: string;
  titleClass?: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-start gap-2.5 px-3 py-2 text-left text-xs text-content hover:bg-surface-raised transition-colors"
    >
      <span className={`mt-0.5 w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${tint}`}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className={`block font-medium ${titleClass ?? ''}`}>{title}</span>
        <span className="block text-[10px] text-content-secondary mt-0.5">{detail}</span>
      </span>
    </button>
  );
}

export function MissionToolbar({ onResetLayout, showToast }: MissionToolbarProps) {
  const { connectionState } = useConnectionStore();
  const isConnected = connectionState.isConnected;
  const isMspProtocol = connectionState?.protocol === 'msp';

  // Edit mode state
  const { activeMode, setActiveMode, mapMode, setMapMode } = useEditModeStore();

  // Mission store
  const missionStore = useMissionStore();
  const canUndo = missionStore._canUndo;
  const canRedo = missionStore._canRedo;
  const missionHasItems = missionStore.missionItems.length > 0;

  // Cmd/Ctrl+Z to undo, Cmd/Ctrl+Shift+Z to redo - only in mission mode and
  // not while typing in an input.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (activeMode !== 'mission') return;
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
      if (e.shiftKey) useMissionStore.getState().redo();
      else useMissionStore.getState().undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeMode]);
  const missionIsLoading = missionStore.isLoading;
  const missionIsDirty = missionStore.isDirty;
  const missionIsDownloading = missionIsLoading && missionStore.progress?.operation === 'download';
  const missionIsUploading = missionIsLoading && missionStore.progress?.operation === 'upload';

  // Distributed survey: split the current plan across the connected swarm.
  // Target = the selected group when it qualifies, else the biggest
  // unassigned group with enough waypoints to give every vehicle a share.
  const fleetVehiclesLive = useFleetVehicles();
  const vehicleColorOverrides = useVehicleAppearanceStore((s) => s.overrides);
  const distributeTarget = useMemo(() => {
    if (fleetVehiclesLive.length < 2) return null;
    const counts = new Map<string, number>();
    for (const it of missionStore.missionItems) {
      if (it.groupId) counts.set(it.groupId, (counts.get(it.groupId) ?? 0) + 1);
    }
    const candidates = missionStore.groups
      .filter((g) => !g.assignedVehicleKey && (counts.get(g.id) ?? 0) >= fleetVehiclesLive.length * 2)
      .sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0));
    return candidates.find((g) => g.id === missionStore.selectedGroupId) ?? candidates[0] ?? null;
  }, [fleetVehiclesLive, missionStore.groups, missionStore.missionItems, missionStore.selectedGroupId]);

  const handleDistribute = () => {
    if (!distributeTarget) return;
    const vehicles = fleetVehiclesLive.map((v) => ({
      key: v.key,
      label: v.label,
      color: resolveVehicleColor(vehicleColorOverrides, v.key, v.sysid),
    }));
    const ids = missionStore.distributeGroupAcrossFleet(distributeTarget.id, vehicles);
    if (ids) {
      showToast?.(`${distributeTarget.name} split across ${ids.length} vehicles - Fleet Ops has the Start missions button`, 'success');
    }
  };

  // Fence store
  const fenceStore = useFenceStore();
  const fenceHasItems = fenceStore.polygons.length > 0 || fenceStore.circles.length > 0;
  const fenceIsLoading = fenceStore.isLoading;
  const fenceIsDirty = fenceStore.isDirty;
  const fenceIsDownloading = fenceIsLoading && fenceStore.progress?.operation === 'download';
  const fenceIsUploading = fenceIsLoading && fenceStore.progress?.operation === 'upload';

  // Rally store
  const isPx4 = connectionState.firmware === 'px4';
  // Connecting a PX4 vehicle while the Rally tab is open hides that tab, which
  // would strand the editor on a panel with no way back to the mission.
  useEffect(() => {
    if (isPx4 && activeMode === 'rally') setActiveMode('mission');
  }, [isPx4, activeMode, setActiveMode]);

  const rallyStore = useRallyStore();
  const rallyHasItems = rallyStore.rallyPoints.length > 0;
  const rallyIsLoading = rallyStore.isLoading;
  const rallyIsDirty = rallyStore.isDirty;
  const rallyIsDownloading = rallyIsLoading && rallyStore.progress?.operation === 'download';
  const rallyIsUploading = rallyIsLoading && rallyStore.progress?.operation === 'upload';

  // Computed state based on active mode
  const isLoading = activeMode === 'mission' ? missionIsLoading :
                    activeMode === 'geofence' ? fenceIsLoading :
                    rallyIsLoading;

  const isDownloading = activeMode === 'mission' ? missionIsDownloading :
                        activeMode === 'geofence' ? fenceIsDownloading :
                        rallyIsDownloading;

  const isUploading = activeMode === 'mission' ? missionIsUploading :
                      activeMode === 'geofence' ? fenceIsUploading :
                      rallyIsUploading;

  const hasItems = activeMode === 'mission' ? missionHasItems :
                   activeMode === 'geofence' ? fenceHasItems :
                   rallyHasItems;

  // MSP boards (iNav/Betaflight) don't support geofence or rally via protocol
  const fcOpsDisabledForMsp = isMspProtocol && (activeMode === 'geofence' || activeMode === 'rally');

  // ArduPilot holds a single flat mission, so "upload everything" is ambiguous
  // once the plan has more than one group. Disable the bulk upload and steer
  // the user to the per-group Upload button in the waypoint table.
  const multipleGroups = activeMode === 'mission' && missionStore.groups.length > 1;

  // Collision warning dialog state (mission only)
  const [showCollisionWarning, setShowCollisionWarning] = useState(false);
  // Auto-adjust altitude dialog — a second entry point reachable from the
  // terrain-collision warning, not just the Altitude Profile panel.
  const [showAltitudeAdjust, setShowAltitudeAdjust] = useState(false);
  // Confirm before the New button blows away the working mission.
  const [showNewConfirm, setShowNewConfirm] = useState(false);

  const safeAltitudeBuffer = useSettingsStore((s) => s.missionDefaults.safeAltitudeBuffer);
  const altitudeUnit = useSettingsStore((s) => s.unitPreferences.altitude);

  // Planner waypoints for the auto-adjust dialog. (0,0) sentinels are excluded
  // so a NAV_TAKEOFF "current position" marker doesn't sample Null Island.
  const plannerWaypoints: PlannerWaypoint[] = useMemo(
    () => missionStore.missionItems
      .filter((wp) => hasValidCoordinates(wp.latitude, wp.longitude))
      .map((wp) => ({
        seq: wp.seq,
        latitude: wp.latitude,
        longitude: wp.longitude,
        altitude: wp.altitude,
        frame: mavFrameToAltFrame(wp.frame),
      })),
    [missionStore.missionItems],
  );

  const handleApplyAltitudePlan = (plan: PlanResult) => {
    missionStore.applyTerrainPlan({
      raisedAltitudes: plan.raisedAltitudes,
      inserts: plan.inserts,
    });
    setShowAltitudeAdjust(false);
  };
  const [showUploadPreview, setShowUploadPreview] = useState(false);

  // Save to Library modal state
  const [showSaveLibraryModal, setShowSaveLibraryModal] = useState(false);
  const libraryEnabled = useCargoEnabled(MISSION_LIBRARY_CARGO_SLUG);

  // Mode-aware handlers
  const handleDownload = async () => {
    if (activeMode === 'mission') {
      await missionStore.fetchMission();
    } else if (activeMode === 'geofence') {
      await fenceStore.fetchFence();
    } else {
      await rallyStore.fetchRally();
    }
  };

  const handleUpload = async () => {
    if (activeMode === 'mission') {
      // Check for terrain collisions before upload
      if (missionStore.hasTerrainCollisions) {
        setShowCollisionWarning(true);
        return;
      }
      // Always show the preview when a mission upload is requested. The
      // modal shows the flattened summary, feasibility flags, and
      // selected/excluded groups before any wire traffic.
      setShowUploadPreview(true);
    } else if (activeMode === 'geofence') {
      await fenceStore.uploadFence();
    } else {
      await rallyStore.uploadRally();
    }
  };

  const handleConfirmUpload = async () => {
    setShowCollisionWarning(false);
    // Skip the preview after a terrain-collision override; the user has
    // already explicitly chosen to upload despite the warning.
    await missionStore.uploadMission();
  };

  const handleConfirmUploadFromPreview = async () => {
    setShowUploadPreview(false);
    await missionStore.uploadMission();
  };

  const handleClearFC = async () => {
    if (!isConnected) return;

    if (activeMode === 'mission') {
      // Clears the vehicle ONLY. The planner keeps its waypoints: wiping hours
      // of planning as a side effect of clearing the FC is not something the
      // button says it does, and there is no undo across an upload boundary.
      await missionStore.clearMissionFromFC();
    } else if (activeMode === 'geofence') {
      await fenceStore.clearFenceFromFC();
    } else {
      await rallyStore.clearRallyFromFC();
    }
  };

  const handleNew = () => {
    if (activeMode === 'mission') {
      // Clearing the mission is destructive and easy to fat-finger; confirm
      // first when there's anything to lose.
      if (hasItems) {
        setShowNewConfirm(true);
        return;
      }
      doClearMission();
    } else if (activeMode === 'geofence') {
      fenceStore.clearFence();
    } else {
      rallyStore.clearRally();
    }
  };

  const doClearMission = () => {
    setShowNewConfirm(false);
    missionStore.clearMission();
    // clearMission only owns mission-store; the survey draft (polygon + preview
    // waypoints on the map) lives in survey-store, so reset it too or its points
    // linger after New.
    useSurveyStore.getState().deactivateSurvey();
  };

  const handleSaveFile = async (format: 'waypoints' | 'plan' | 'kmz' = 'waypoints') => {
    if (!hasItems) return;

    if (activeMode === 'mission') {
      // .waypoints treats line 0 as HOME; .plan carries home separately and kmz is visual.
      const exportItems = format === 'waypoints'
        ? buildArduPilotWireMission(missionStore.missionItems, missionStore.homePosition)
        : missionStore.missionItems;
      const result = await window.electronAPI?.saveMissionToFile(exportItems, format);
      if (result?.success) {
        showToast?.(`Exported ${missionStore.missionItems.length} waypoints to ${format === 'plan' ? '.plan' : format === 'kmz' ? '.kmz' : '.waypoints'}`, 'success');
      } else if (result?.error && result.error !== 'Cancelled') {
        showToast?.(result.error, 'error');
      }
    } else if (activeMode === 'geofence') {
      // TODO: Implement fence file save
      showToast?.('Fence file save not implemented yet', 'info');
    } else {
      // TODO: Implement rally file save
      showToast?.('Rally file save not implemented yet', 'info');
    }
  };

  const handleLoadFile = async () => {
    if (activeMode === 'mission') {
      const result = await window.electronAPI?.loadMissionFromFile();
      if (result?.success && result.items) {
        missionStore.setMissionItemsFromFile(result.items);
        showToast?.(`Loaded ${result.items.length} waypoints from file`, 'success');
      } else if (result?.error && result.error !== 'Cancelled') {
        showToast?.(result.error, 'error');
      }
    } else if (activeMode === 'geofence') {
      // TODO: Implement fence file load
      showToast?.('Fence file load not implemented yet', 'info');
    } else {
      // TODO: Implement rally file load
      showToast?.('Rally file load not implemented yet', 'info');
    }
  };

  // Get button label based on mode
  const getModeLabel = () => {
    switch (activeMode) {
      case 'mission': return 'mission';
      case 'geofence': return 'geofence';
      case 'rally': return 'rally points';
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1.5 bg-surface border-b border-subtle shrink-0">
      {/* Mode Selector - Segmented Control */}
      <div className="flex items-center rounded-lg overflow-hidden border border-subtle shrink-0">
        <ModeButton
          mode="mission"
          label="Mission"
          activeMode={activeMode}
          onClick={() => setActiveMode('mission')}
          color="blue"
          hasModified={missionIsDirty}
        />
        <div className="w-px h-5 bg-subtle" />
        <ModeButton
          mode="geofence"
          label="Geofence"
          activeMode={activeMode}
          onClick={() => setActiveMode('geofence')}
          color="green"
          hasModified={fenceIsDirty}
        />
        {/* Rally points are an ArduPilot concept; PX4 has no equivalent
            mission type, so the tab would only ever fail on upload. */}
        {!isPx4 && (
          <>
            <div className="w-px h-5 bg-subtle" />
            <ModeButton
              mode="rally"
              label="Rally"
              activeMode={activeMode}
              onClick={() => setActiveMode('rally')}
              color="orange"
              hasModified={rallyIsDirty}
            />
          </>
        )}
      </div>

      {/* Separator */}
      <div className="w-px h-6 bg-subtle shrink-0" />

      {/* FC Operations */}
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          onClick={handleDownload}
          disabled={!isConnected || isLoading || fcOpsDisabledForMsp}
          className={`p-1.5 rounded-l transition-colors ${
            isConnected && !isLoading && !fcOpsDisabledForMsp
              ? 'bg-blue-600/80 hover:bg-blue-500/80 text-white'
              : 'bg-surface-raised text-content-tertiary cursor-not-allowed'
          }`}
          data-tip={fcOpsDisabledForMsp ? `${getModeLabel()} not supported on iNav/Betaflight` : isConnected ? `Download ${getModeLabel()} from FC` : 'Connect to download'}
        >
          {isDownloading ? (
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          )}
        </button>
        <button
          onClick={handleUpload}
          disabled={!isConnected || isLoading || !hasItems || fcOpsDisabledForMsp || multipleGroups}
          className={`p-1.5 transition-colors ${
            isConnected && !isLoading && hasItems && !fcOpsDisabledForMsp && !multipleGroups
              ? 'bg-emerald-600/80 hover:bg-emerald-500/80 text-white'
              : 'bg-surface-raised text-content-tertiary cursor-not-allowed'
          }`}
          data-tip={fcOpsDisabledForMsp ? `${getModeLabel()} not supported on iNav/Betaflight` : multipleGroups ? 'Multiple groups: upload one at a time from each group in the list' : !isConnected ? 'Connect to upload' : !hasItems ? `Add ${getModeLabel()} first` : `Upload ${getModeLabel()} to FC`}
        >
          {isUploading ? (
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
          )}
        </button>
        <button
          onClick={handleClearFC}
          disabled={!isConnected || isLoading || fcOpsDisabledForMsp}
          className={`p-1.5 rounded-r transition-colors ${
            isConnected && !isLoading && !fcOpsDisabledForMsp
              ? 'bg-red-600/80 hover:bg-red-500/80 text-white'
              : 'bg-surface-raised text-content-tertiary cursor-not-allowed'
          }`}
          data-tip={fcOpsDisabledForMsp ? `${getModeLabel()} not supported on iNav/Betaflight` : isConnected ? `Clear ${getModeLabel()} from FC` : 'Connect to clear from FC'}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>

      {/* Separator */}
      <div className="w-px h-6 bg-subtle shrink-0" />

      {/* File Operations: Undo/Redo, New, Save (Library + export formats), Open, Import */}
      <div className="flex items-center gap-1 shrink-0">
        {activeMode === 'mission' && (
          <>
            <button
              data-tour="mission-history"
              onClick={() => missionStore.undo()}
              disabled={!canUndo}
              className={`p-1.5 rounded bg-surface-raised transition-colors ${
                canUndo ? 'text-content hover:brightness-125' : 'text-content-tertiary cursor-not-allowed'
              }`}
              data-tip="Undo (Cmd/Ctrl+Z)"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v1m-15-6l4-4m-4 4l4 4" />
              </svg>
            </button>
            <button
              onClick={() => missionStore.redo()}
              disabled={!canRedo}
              className={`p-1.5 rounded bg-surface-raised transition-colors ${
                canRedo ? 'text-content hover:brightness-125' : 'text-content-tertiary cursor-not-allowed'
              }`}
              data-tip="Redo (Cmd/Ctrl+Shift+Z)"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10H11a5 5 0 00-5 5v1m15-6l-4-4m4 4l-4 4" />
              </svg>
            </button>
          </>
        )}
        <button
          onClick={handleNew}
          disabled={isLoading || !hasItems}
          className={`p-1.5 rounded bg-surface-raised transition-colors ${
            !isLoading && hasItems
              ? 'text-content hover:brightness-125'
              : 'text-content-tertiary cursor-not-allowed'
          }`}
          data-tip={`New - clear current ${getModeLabel()}`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
        {/* Save: mission mode gets the multi-destination dropdown (Library +
            file formats). A floppy glyph - NOT an up/down arrow - so it never
            reads like the FC transfer buttons. Fence/rally file save is still
            a stub (handleSaveFile TODO branches), so those modes get no save
            button until it is implemented. */}
        {activeMode === 'mission' && (
          <SaveMenu
            enabled={missionHasItems}
            multipleGroups={multipleGroups}
            showLibrary={libraryEnabled}
            onLibrary={() => setShowSaveLibraryModal(true)}
            onExport={(fmt) => { void handleSaveFile(fmt); }}
          />
        )}
        {/* Open from file - folder glyph, distinct from the FC download arrow.
            Fence/rally file load is still a stub (handleLoadFile TODO
            branches); the button returns for those modes once implemented. */}
        {activeMode === 'mission' && (
          <button
            onClick={handleLoadFile}
            className="p-1.5 rounded bg-surface-raised text-content hover:brightness-125 transition-colors"
            data-tip={`Open ${getModeLabel()} file`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" />
            </svg>
          </button>
        )}
        {activeMode === 'mission' && (
          <GuidesButton showToast={showToast} />
        )}
        {/* Swarm survey: prominent by design - the one-click wow moment. Only
            appears when a fleet is connected and a group is big enough to split.
            After a split it hands over to a quiet "distributed" pill so the
            feature does not vanish without a trace. */}
        {activeMode === 'mission' && !distributeTarget && fleetVehiclesLive.length >= 2 &&
          missionStore.groups.filter((g) => g.assignedVehicleKey).length >= 2 && (
          <div
            className="px-2.5 py-1.5 rounded flex items-center gap-1.5 text-xs font-medium text-cyan-500 border border-cyan-500/30 bg-cyan-500/10"
            data-tip="This plan is already split across the fleet - Fleet Ops has the Start missions button. Regenerate or add a survey to distribute again."
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Distributed ({missionStore.groups.filter((g) => g.assignedVehicleKey).length})
          </div>
        )}
        {activeMode === 'mission' && distributeTarget && (
          <button
            onClick={handleDistribute}
            className="px-2.5 py-1.5 rounded flex items-center gap-1.5 text-xs font-semibold text-white bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 shadow-[0_0_10px_rgba(34,211,238,0.35)] transition-all"
            data-tip={`Split "${distributeTarget.name}" into ${fleetVehiclesLive.length} missions, one per vehicle, coloured by vehicle`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="5" r="2.2" />
              <circle cx="5" cy="18" r="2.2" />
              <circle cx="19" cy="18" r="2.2" />
              <path strokeLinecap="round" d="M12 7.5v4m0 0l-5 4.5m5-4.5l5 4.5" />
            </svg>
            Distribute to fleet
            <span className="px-1.5 py-0.5 rounded-full bg-white/20 text-[10px] font-bold">
              {fleetVehiclesLive.length}
            </span>
          </button>
        )}
        {activeMode === 'mission' && (
          <button
            onClick={() => { window.electronAPI?.openAreaEditor?.().catch(() => undefined); }}
            className="p-1.5 rounded bg-surface-raised text-content hover:brightness-125 transition-colors"
            data-tip="Open the Area Editor in a separate window"
          >
            {/* pencil-ruler glyph - open the area editor */}
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 11l6.5-6.5a2 2 0 012.828 2.828L11.828 14H9v-3z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21h18" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 17l4-4" />
            </svg>
          </button>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Collision warning indicator (mission mode only). Clickable: opens the
          auto-adjust altitude dialog to fix it. */}
      {activeMode === 'mission' && missionStore.hasTerrainCollisions && (
        <button
          onClick={() => setShowAltitudeAdjust(true)}
          className="px-2 py-1 rounded text-xs bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 hover:text-red-300 transition-colors flex items-center gap-1.5 shrink-0"
          data-tip="Flight path dips below terrain + safe buffer. Click to auto-adjust altitudes."
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          Terrain collision
        </button>
      )}

      {/* Simple/Advanced + Firmware controls */}
      <MissionModeControls />

      {/* 2D/3D Map Toggle - dev-only until 3D is reworked */}
      {import.meta.env.DEV && (
        <div className="flex items-center rounded-lg overflow-hidden border border-subtle shrink-0">
          <button
            onClick={() => setMapMode('2d')}
            className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
              mapMode === '2d'
                ? 'bg-surface-raised text-content'
                : 'text-content-secondary hover:bg-surface-raised'
            }`}
            title="2D Map"
          >
            2D
          </button>
          <div className="w-px h-5 bg-subtle" />
          <button
            onClick={() => setMapMode('3d')}
            className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
              mapMode === '3d'
                ? 'bg-indigo-600 text-white'
                : 'text-content-secondary hover:bg-surface-raised'
            }`}
            title="3D Terrain View"
          >
            3D
          </button>
        </div>
      )}

      {/* Layout controls */}
      <button
        onClick={onResetLayout}
        className="px-2 py-1 bg-surface-raised hover:bg-surface border border-subtle text-content-secondary text-xs rounded transition-colors shrink-0"
        title="Reset panel layout"
      >
        Reset Layout
      </button>

      {/* Collision warning modal */}
      {showCollisionWarning && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface-raised rounded-lg shadow-xl border border-default p-6 max-w-md mx-4">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-content mb-2">Terrain Collision Warning</h3>
                <p className="text-content-secondary text-sm mb-4">
                  The flight path goes below the safe altitude (terrain + {formatAltitudeFromMeters(safeAltitudeBuffer, altitudeUnit)} buffer) at one or more points.
                  This could result in a collision with terrain.
                </p>
                <p className="text-amber-400 text-sm mb-4">
                  Are you sure you want to upload this mission?
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => setShowCollisionWarning(false)}
                className="px-4 py-2 rounded text-sm font-medium bg-surface-raised hover:bg-surface border border-subtle text-content transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => { setShowCollisionWarning(false); setShowAltitudeAdjust(true); }}
                className="px-4 py-2 rounded text-sm font-medium bg-purple-600 hover:bg-purple-500 text-white transition-colors"
              >
                Fix Altitudes
              </button>
              <button
                onClick={handleConfirmUpload}
                className="px-4 py-2 rounded text-sm font-medium bg-red-600/80 hover:bg-red-500/80 text-white transition-colors"
              >
                Upload Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New / clear-mission confirmation */}
      {showNewConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface-raised rounded-lg shadow-xl border border-default p-6 max-w-md mx-4">
            <h3 className="text-lg font-semibold text-content mb-2">Clear mission?</h3>
            <p className="text-content-secondary text-sm mb-4">
              This removes all {missionStore.missionItems.length} waypoint{missionStore.missionItems.length === 1 ? '' : 's'} and every group from the working plan. Saved library missions and exported files are not affected.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowNewConfirm(false)}
                className="px-4 py-2 rounded text-sm font-medium bg-surface-raised hover:bg-surface border border-subtle text-content transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={doClearMission}
                className="px-4 py-2 rounded text-sm font-medium bg-red-600/80 hover:bg-red-500/80 text-white transition-colors"
              >
                Clear all
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auto-adjust altitude dialog (second entry point from the collision
          warning; the Altitude Profile panel is the first). */}
      {showAltitudeAdjust && (
        <AutoAdjustAltitudeDialog
          waypoints={plannerWaypoints}
          safeBuffer={safeAltitudeBuffer}
          homeElevationMeters={missionStore.homePosition?.alt}
          onApply={handleApplyAltitudePlan}
          onClose={() => setShowAltitudeAdjust(false)}
        />
      )}

      {/* Save to Library modal */}
      {libraryEnabled && showSaveLibraryModal && (
        <SaveMissionModal
          onClose={() => setShowSaveLibraryModal(false)}
          onSaved={() => showToast?.('Mission saved to library', 'success')}
        />
      )}

      {/* Upload preview modal: shows the flattened mission summary, group
          inclusion, feasibility warnings, and DO_JUMP cross-group issues
          before any wire traffic. */}
      <UploadPreviewModal
        open={showUploadPreview}
        onClose={() => setShowUploadPreview(false)}
        onConfirm={handleConfirmUploadFromPreview}
      />
    </div>
  );
}
