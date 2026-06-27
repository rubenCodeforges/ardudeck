/**
 * Survey Config Panel — settings UI for the survey grid planner.
 *
 * Rendered as a dockable panel (sibling tab of Waypoints in MissionPlanningView).
 * Renders nothing when no polygon has been drawn yet, so the empty state is
 * the dock tab itself with no content fields shown.
 *
 * Layout philosophy:
 *  - Top: Template dropdown + draw/clear icons (compact toolbar)
 *  - Always-visible essentials: Camera (or Corridor), Movement, Pattern
 *  - Advanced: collapsed by default, contains Overlap, Grid angle/overshoot,
 *    Show footprints toggle. Power users open once and it sticks for the session.
 *  - Stats + Insert button pinned at the bottom outside the scroll area.
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSurveyStore } from '../../stores/survey-store';
import { useMissionStore } from '../../stores/mission-store';
import { useSettingsStore } from '../../stores/settings-store';
import { useNavigationStore } from '../../stores/navigation-store';
import { CameraPresetSelector } from './CameraPresetSelector';
import { SurveyStatsPanel } from './SurveyStatsPanel';
import { estimateBatteryCount, estimateDataSizeGb } from './survey-stats';
import { surveyToMissionItems } from './mission-builder';
import { patternToGeneratorId, getSurveyGenerator } from './generator-registry';
import { createSurveyGroup, createManualGroup, nextGroupColor, GROUP_COLOR_PALETTE } from '../../../shared/mission-group-types';
import { splitIntoSorties } from './survey-sortie-split';
import { computeSurveyGroupSignature } from './survey-group-signature';
import { MAV_CMD } from '../../../shared/mission-types';
import {
  BUILTIN_SURVEY_PRESETS,
  captureCurrentAsPresetConfig,
  makeUserPreset,
  type SurveyPreset,
} from './survey-presets';
import type { SurveyPattern, CameraPreset, AltitudeReference, GroundPattern, CorridorMode } from './survey-types';
import type { PersistedSurveyPreset } from '../../../shared/ipc-channels';
import {
  altitudeValueFromMeters,
  formatAltitudeFromMeters,
  speedValueFromMetersPerSecond,
  toMetersPerSecondFromSpeedUnit,
  toMetersFromAltitudeUnit,
  UNIT_LABELS,
  UNIT_PRECISION,
} from '../../../shared/user-units.js';

// Pattern catalog. Each entry advertises which modes it applies to so the UI
// can filter without scattering conditional logic across the component.
const ALL_PATTERN_OPTIONS: {
  id: SurveyPattern;
  label: string;
  description: string;
  modes: ('camera' | 'mower')[];
}[] = [
  { id: 'grid', label: 'Grid', description: 'Parallel back-and-forth lines', modes: ['camera', 'mower'] },
  { id: 'crosshatch', label: 'Crosshatch', description: 'Two perpendicular grid passes', modes: ['camera', 'mower'] },
  { id: 'circular', label: 'Circular', description: 'Concentric rings around centroid', modes: ['camera'] },
  { id: 'corridor', label: 'Corridor', description: 'Follow a centerline (roads, rail, power lines, pipelines)', modes: ['camera', 'mower'] },
  { id: 'spiral', label: 'Spiral', description: 'Polygon-aware inward/outward spiral', modes: ['mower'] },
  { id: 'perimeter-fill', label: 'Perimeter + Fill', description: 'Edge passes then grid interior', modes: ['mower'] },
];

const CORRIDOR_MODE_OPTIONS: { id: CorridorMode; label: string; description: string }[] = [
  { id: 'plane', label: 'Plane', description: 'Fixed wing: strips get overshoot and racetrack turns at sharp bends' },
  { id: 'copter', label: 'Copter', description: 'Multirotor: turns on the spot, no overshoot or turn loops' },
];

const GROUND_PATTERN_OPTIONS: { id: GroundPattern; label: string; description: string }[] = [
  { id: 'boustrophedon', label: 'Zigzag', description: 'U-turn at line ends (skid-steer rovers)' },
  { id: 'reverse-alternating', label: 'Reverse', description: 'Drive forward then reverse — no U-turns (Ackermann/car-like rovers, needs ArduRover DO_SET_REVERSE support)' },
];

const ALT_REF_OPTIONS: { id: AltitudeReference; label: string; description: string }[] = [
  { id: 'relative', label: 'Relative', description: 'Altitude relative to home position' },
  { id: 'terrain', label: 'Terrain', description: 'Altitude above terrain (AGL) at each point' },
  { id: 'asl', label: 'ASL', description: 'Altitude above mean sea level' },
];

// Rehydrate a persisted preset blob from settings into a typed SurveyPreset.
// The persisted form is intentionally loose (Record<string, unknown>) so the
// shared module doesn't import renderer-only types; we cast here at the edge.
function rehydrateUserPreset(p: PersistedSurveyPreset): SurveyPreset {
  return {
    id: p.id,
    name: p.name,
    description: p.description || 'Saved preset',
    tag: 'Custom',
    isUserDefined: true,
    config: p.config as SurveyPreset['config'],
    ...(p.camera ? { camera: p.camera as unknown as CameraPreset } : {}),
  };
}

export function SurveyConfigPanel() {
  const polygon = useSurveyStore((s) => s.polygon);
  const config = useSurveyStore((s) => s.config);
  const result = useSurveyStore((s) => s.result);
  const showFootprints = useSurveyStore((s) => s.showFootprints);
  const editingGroupId = useSurveyStore((s) => s.editingGroupId);
  const polygonEditMode = useSurveyStore((s) => s.polygonEditMode);
  const pendingRecompute = useSurveyStore((s) => s.pendingRecompute);
  const enterPolygonEdit = useSurveyStore((s) => s.enterPolygonEdit);
  const exitPolygonEdit = useSurveyStore((s) => s.exitPolygonEdit);
  const setEditingGroupId = useSurveyStore((s) => s.setEditingGroupId);

  const setPattern = useSurveyStore((s) => s.setPattern);
  const setAltitude = useSurveyStore((s) => s.setAltitude);
  const setSpeed = useSurveyStore((s) => s.setSpeed);
  const setFrontOverlap = useSurveyStore((s) => s.setFrontOverlap);
  const setSideOverlap = useSurveyStore((s) => s.setSideOverlap);
  const setCamera = useSurveyStore((s) => s.setCamera);
  const setGridAngle = useSurveyStore((s) => s.setGridAngle);
  const setOvershoot = useSurveyStore((s) => s.setOvershoot);
  const setMargin = useSurveyStore((s) => s.setMargin);
  const setCameraOffOutside = useSurveyStore((s) => s.setCameraOffOutside);
  const setGridMode = useSurveyStore((s) => s.setGridMode);
  const setAltitudeReference = useSurveyStore((s) => s.setAltitudeReference);
  const setShowFootprints = useSurveyStore((s) => s.setShowFootprints);
  const setGroundPattern = useSurveyStore((s) => s.setGroundPattern);
  const setSpiralDirection = useSurveyStore((s) => s.setSpiralDirection);
  const setPerimeterPasses = useSurveyStore((s) => s.setPerimeterPasses);
  const setPlanBy = useSurveyStore((s) => s.setPlanBy);
  const setGsd = useSurveyStore((s) => s.setGsd);
  const setEnduranceMinutes = useSurveyStore((s) => s.setEnduranceMinutes);
  const setCrossGridAltitudeOffset = useSurveyStore((s) => s.setCrossGridAltitudeOffset);
  const setCorridorWidth = useSurveyStore((s) => s.setCorridorWidth);
  const setCorridorStrips = useSurveyStore((s) => s.setCorridorStrips);
  const setCorridorMode = useSurveyStore((s) => s.setCorridorMode);
  const setCorridorSideOffset = useSurveyStore((s) => s.setCorridorSideOffset);
  const setMaxTurnAngle = useSurveyStore((s) => s.setMaxTurnAngle);
  const setFlipLegs = useSurveyStore((s) => s.setFlipLegs);
  const setInvertPath = useSurveyStore((s) => s.setInvertPath);
  const startDrawing = useSurveyStore((s) => s.startDrawing);
  const importArea = useSurveyStore((s) => s.importArea);
  const clearSurvey = useSurveyStore((s) => s.clearSurvey);
  const deactivateSurvey = useSurveyStore((s) => s.deactivateSurvey);
  const applyPresetConfig = useSurveyStore((s) => s.applyPresetConfig);
  const altitudeUnit = useSettingsStore((s) => s.unitPreferences.altitude);

  const addSurveyGroup = useMissionStore((s) => s.addSurveyGroup);
  const addGroupsWithItems = useMissionStore((s) => s.addGroupsWithItems);
  const existingGroups = useMissionStore((s) => s.groups);
  const existingItems = useMissionStore((s) => s.missionItems);

  // Preset state lives in settings-store (persisted via electron-store).
  const userPresets = useSettingsStore((s) => s.surveyPresets);
  const lastPresetId = useSettingsStore((s) => s.lastSurveyPresetId);
  const saveSurveyPreset = useSettingsStore((s) => s.saveSurveyPreset);
  const saveCameraPreset = useSettingsStore((s) => s.saveCameraPreset);
  const removeSurveyPreset = useSettingsStore((s) => s.removeSurveyPreset);
  const setLastSurveyPresetId = useSettingsStore((s) => s.setLastSurveyPresetId);

  const [isCustomCamera, setIsCustomCamera] = useState(config.camera.name === 'Custom');
  const [isManualCamera, setIsManualCamera] = useState(config.camera.name === 'Manual');
  const [customCamera, setCustomCamera] = useState<CameraPreset>(config.camera);
  const [insertSuccess, setInsertSuccess] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  // null = not naming; '' or text = inline camera-name entry open. (Electron has
  // no window.prompt, so naming is an inline field.)
  const [cameraNameDraft, setCameraNameDraft] = useState<string | null>(null);

  const simplifyToleranceM = useSettingsStore((s) => s.surveyPerformance.importSimplifyToleranceM);
  const updateSurveyPerformance = useSettingsStore((s) => s.updateSurveyPerformance);
  const goToPerformanceSettings = useCallback(() => {
    useNavigationStore.getState().setView('settings', 'settings-survey-performance');
  }, []);

  const handleImportArea = useCallback(async () => {
    setImportError(null);
    const res = await importArea();
    if (!res.ok && res.error) setImportError(res.error);
  }, [importArea]);

  // Combined preset list: built-ins first, user-defined below.
  const allPresets: SurveyPreset[] = [
    ...BUILTIN_SURVEY_PRESETS,
    ...userPresets.map(rehydrateUserPreset),
  ];

  const handleCameraChange = useCallback((preset: CameraPreset) => {
    const nextIsManual = preset.name === 'Manual';
    setIsCustomCamera(preset.name === 'Custom');
    setIsManualCamera(nextIsManual);
    setCustomCamera(preset);
    setCamera(preset);
    // If the pattern we're holding doesn't apply in the new mode, snap it to
    // grid so the Pattern selector always shows an active button. Without
    // this, switching camera→mower while on 'circular' (camera-only) leaves
    // the row of buttons with nothing highlighted.
    const mode = nextIsManual ? 'mower' : 'camera';
    const currentValid = ALL_PATTERN_OPTIONS.find((o) => o.id === config.pattern)?.modes.includes(mode);
    if (!currentValid) setPattern('grid');
  }, [setCamera, config.pattern, setPattern]);

  const handleCustomField = useCallback((field: keyof CameraPreset, value: number) => {
    const updated = { ...customCamera, [field]: value };
    setCustomCamera(updated);
    setCamera(updated);
  }, [customCamera, setCamera]);

  const commitCameraName = useCallback(() => {
    const name = (cameraNameDraft ?? '').trim();
    if (!name) return;
    const preset: CameraPreset = { ...customCamera, name };
    saveCameraPreset(preset);
    // Switch the active camera to the freshly-saved named preset so it's
    // selected (and no longer the editable "Custom" entry).
    setIsCustomCamera(false);
    setCustomCamera(preset);
    setCamera(preset);
    setCameraNameDraft(null);
  }, [cameraNameDraft, customCamera, saveCameraPreset, setCamera]);

  const handleManualCorridorChange = useCallback((value: number) => {
    const updated = { ...customCamera, manualCorridorWidth: value };
    setCustomCamera(updated);
    setCamera(updated);
  }, [customCamera, setCamera]);

  const handlePresetSelect = useCallback((preset: SurveyPreset) => {
    // The store action applies config (and camera, when present) atomically
    // and regenerates the survey result. Camera change also has to update the
    // local isCustom/isManual flags so the right detail inputs show up.
    applyPresetConfig(preset.config, preset.camera);
    const nextIsManual = preset.camera ? preset.camera.name === 'Manual' : isManualCamera;
    if (preset.camera) {
      setIsCustomCamera(preset.camera.name === 'Custom');
      setIsManualCamera(nextIsManual);
      setCustomCamera(preset.camera);
    }
    // Pattern is taken from preset.config when set, but if the preset didn't
    // specify one we may now be in a different mode with an incompatible
    // pattern (e.g. circular carried over from camera→mower). Snap to grid.
    const resolvedPattern = preset.config.pattern ?? config.pattern;
    const mode = nextIsManual ? 'mower' : 'camera';
    const valid = ALL_PATTERN_OPTIONS.find((o) => o.id === resolvedPattern)?.modes.includes(mode);
    if (!valid) setPattern('grid');
    setLastSurveyPresetId(preset.id);
  }, [applyPresetConfig, isManualCamera, config.pattern, setPattern, setLastSurveyPresetId]);

  const handleSavePreset = useCallback(() => {
    // Simple prompt for the name — full dialog is overkill for this. If the
    // user cancels we bail; empty names are also rejected.
    const name = window.prompt('Name this preset:', `My preset ${userPresets.length + 1}`);
    if (!name || !name.trim()) return;
    const preset = makeUserPreset(
      name.trim(),
      captureCurrentAsPresetConfig({ ...config, polygon: [] }),
      // Only persist camera details if the user is on a non-built-in camera —
      // otherwise loading the preset on a different vehicle profile shouldn't
      // forcibly swap the camera back.
      (isCustomCamera || isManualCamera) ? config.camera : undefined,
    );
    saveSurveyPreset({
      id: preset.id,
      name: preset.name,
      description: preset.description,
      tag: preset.tag,
      isUserDefined: true,
      config: preset.config as unknown as Record<string, unknown>,
      ...(preset.camera ? { camera: preset.camera as unknown as Record<string, unknown> } : {}),
    });
    setLastSurveyPresetId(preset.id);
  }, [config, isCustomCamera, isManualCamera, userPresets.length, saveSurveyPreset, setLastSurveyPresetId]);

  const handleDeletePreset = useCallback((id: string) => {
    if (!window.confirm('Delete this preset?')) return;
    removeSurveyPreset(id);
  }, [removeSurveyPreset]);

  const handleInsertSurvey = useCallback(() => {
    if (!result || !polygon) return;
    const fullConfig = { ...config, polygon };
    let items = surveyToMissionItems(result, fullConfig);
    if (items.length === 0) return;

    // If the mission already contains a NAV_TAKEOFF (either auto-prepended
    // when the user dropped their first manual WP, or from an earlier
    // survey), strip the leading NAV_TAKEOFF that surveyToMissionItems
    // always emits. Otherwise we'd end up with two takeoff commands and
    // the flight controller would refuse the mission or behave oddly.
    const missionAlreadyHasTakeoff = existingItems.some(
      (it) => it.command === MAV_CMD.NAV_TAKEOFF,
    );
    if (missionAlreadyHasTakeoff && items[0]?.command === MAV_CMD.NAV_TAKEOFF) {
      items = items.slice(1).map((it, i) => ({ ...it, seq: i }));
    }

    // Build a SurveyGroup that owns the polygon + generator config + cached
    // result so the survey is editable + regeneratable later (PR 5 + 8).
    // The `generatorResult` carries any generator-specific extras (e.g. TOPAS
    // decomposition); built-in generators leave it null.
    const generatorId = patternToGeneratorId(config.pattern);
    const reg = getSurveyGenerator(generatorId);
    const survey = createSurveyGroup({
      name: `Survey ${existingGroups.filter((g) => g.kind === 'survey').length + 1}`,
      generatorId,
      generatorVersion: reg?.version ?? '1.0.0',
      polygon: polygon.map((p) => ({ lat: p.lat, lng: p.lng })),
      config: fullConfig as unknown as Record<string, unknown>,
      color: nextGroupColor(existingGroups),
    });
    // Stamp the signature now so the group starts off in a non-stale
    // state. Subsequent polygon / config edits flip it to stale.
    survey.lastGeneratedSignature = computeSurveyGroupSignature(survey);
    survey.lastGeneratedAt = Date.now();
    const newGroupId = addSurveyGroup(survey, items);

    // Link the survey draft to the freshly-committed SurveyGroup so further
    // vertex / config edits flow back through generateSurvey -> mission-store
    // and keep the committed WPs in sync. Polygon stays visible (existing
    // SurveyMapOverlay renders the draft), panel stays open. Re-Insert is
    // disabled when linked; the Clear button starts a new draft.
    setEditingGroupId(newGroupId);

    setInsertSuccess(true);
    setTimeout(() => setInsertSuccess(false), 2000);
  }, [result, polygon, config, existingGroups, existingItems, addSurveyGroup, setEditingGroupId]);

  // Split the survey into one battery-sized flight group per sortie, instead of
  // a single group. Each flight is independently uploadable from the table.
  const handleSplitIntoFlights = useCallback(() => {
    if (!result || !polygon) return;
    const sorties = splitIntoSorties(result.waypoints, config.speed, config.enduranceMinutes ?? 20);
    if (sorties.length <= 1) return;
    const fullConfig = { ...config, polygon };
    const baseName = `Survey ${existingGroups.filter((g) => g.kind === 'survey').length + 1}`;
    const entries = sorties.map((slice, i) => {
      // Each sortie is its own complete flight: takeoff -> slice -> RTL.
      const items = surveyToMissionItems({ ...result, waypoints: slice }, fullConfig);
      const group = createManualGroup({
        name: `${baseName} · Flight ${i + 1}/${sorties.length}`,
        color: GROUP_COLOR_PALETTE[i % GROUP_COLOR_PALETTE.length]!,
      });
      return { group, items };
    });
    addGroupsWithItems(entries);
    clearSurvey();
    setInsertSuccess(true);
    setTimeout(() => setInsertSuccess(false), 2000);
  }, [result, polygon, config, existingGroups, addGroupsWithItems, clearSurvey]);

  // Empty-state copy when no polygon yet — guides the user back to the map.
  if (!polygon) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-6 text-content-secondary bg-surface">
        <svg className="w-10 h-10 mb-3 text-content-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
        </svg>
        <p className="text-sm font-medium mb-1 text-content">No survey polygon</p>
        <p className="text-xs text-content-tertiary max-w-[14rem]">
          Click the Survey button on the map toolbar, then draw a polygon to plan a grid.
        </p>
        <div className="mt-4 flex flex-col items-center gap-1">
          <span className="text-[10px] uppercase tracking-wide text-content-tertiary">or</span>
          <button
            onClick={handleImportArea}
            className="px-3 py-1.5 text-xs rounded-md bg-surface-raised text-content hover:text-purple-300 transition-colors"
            title="Import a boundary from a KML, KMZ, or GeoJSON file"
          >
            Import area from file
          </button>
          <span className="text-[10px] text-content-tertiary">KML · KMZ · GeoJSON</span>

          {/* Simplify tolerance — applied to imported boundaries. Dense GIS
              rings (thousands of points) are reduced to this tolerance so the
              map stays responsive; 0 disables simplification. */}
          <div className="flex items-center gap-1.5 mt-2 text-[10px] text-content-tertiary">
            <span>Simplify</span>
            <input
              type="number"
              value={simplifyToleranceM}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) updateSurveyPerformance({ importSimplifyToleranceM: Math.max(0, Math.min(50, n)) });
              }}
              className="w-12 px-1.5 py-0.5 bg-surface-input border border-border rounded text-content text-[10px] focus:outline-none focus:border-blue-500"
              min="0"
              max="50"
              step="0.5"
              title="RDP tolerance in meters for imported boundaries (0 = off)"
            />
            <span>m</span>
            <button
              onClick={goToPerformanceSettings}
              className="ml-1 underline decoration-dotted hover:text-purple-300 transition-colors"
              title="Open survey performance settings"
            >
              Performance settings
            </button>
          </div>
          {importError && <span className="text-[10px] text-red-400 max-w-[14rem]">{importError}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-surface">
      {/* Top toolbar: template picker + redraw/clear icons.
          Tab title comes from dockview, no need to repeat "Survey Grid" here. */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-subtle flex-shrink-0">
        <div className="flex-1 min-w-0">
          <PresetDropdown
            presets={allPresets}
            selectedId={lastPresetId}
            onSelect={handlePresetSelect}
            onDelete={handleDeletePreset}
          />
        </div>
        <button
          onClick={handleSavePreset}
          className="p-1.5 text-content-secondary hover:text-purple-400 transition-colors"
          title="Save current settings as a preset"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 4h11l3 3v13H5z M9 4v5h6V4 M9 17h6" />
          </svg>
        </button>
        <button
          onClick={handleImportArea}
          className="p-1.5 text-content-secondary hover:text-purple-400 transition-colors"
          title="Import area from file (KML/KMZ/GeoJSON)"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </button>
        <button
          onClick={startDrawing}
          className="p-1.5 text-content-secondary hover:text-purple-400 transition-colors"
          title="Redraw polygon"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
        <button
          onClick={clearSurvey}
          className="p-1.5 text-content-secondary hover:text-red-400 transition-colors"
          title="Clear survey"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
        <button
          onClick={goToPerformanceSettings}
          className="p-1.5 text-content-secondary hover:text-purple-400 transition-colors"
          title="Survey performance settings"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>

      <div className="p-3 space-y-3 overflow-y-auto flex-1 min-h-0">
        {/* Camera Section */}
        <Section title={isManualCamera ? 'Corridor' : 'Camera'}>
          <CameraPresetSelector value={config.camera} onChange={handleCameraChange} />
          {isCustomCamera && (
            <div className="grid grid-cols-2 gap-2 mt-2">
              <NumberInput label="Sensor W (mm)" value={customCamera.sensorWidth} onChange={(v) => handleCustomField('sensorWidth', v)} min={1} max={100} step={0.1} />
              <NumberInput label="Sensor H (mm)" value={customCamera.sensorHeight} onChange={(v) => handleCustomField('sensorHeight', v)} min={1} max={100} step={0.1} />
              <NumberInput label="Image W (px)" value={customCamera.imageWidth} onChange={(v) => handleCustomField('imageWidth', v)} min={100} max={20000} step={1} />
              <NumberInput label="Image H (px)" value={customCamera.imageHeight} onChange={(v) => handleCustomField('imageHeight', v)} min={100} max={20000} step={1} />
              <NumberInput label="Focal (mm)" value={customCamera.focalLength} onChange={(v) => handleCustomField('focalLength', v)} min={1} max={200} step={0.1} />
            </div>
          )}
          {isCustomCamera && (
            cameraNameDraft === null ? (
              <button
                onClick={() => setCameraNameDraft('')}
                className="mt-2 w-full py-1.5 text-xs rounded-md bg-surface-raised text-content hover:text-purple-300 transition-colors"
                title="Save these specs as a named camera in the dropdown"
              >
                Save camera to list
              </button>
            ) : (
              <div className="mt-2 flex items-center gap-1.5">
                <input
                  autoFocus
                  value={cameraNameDraft}
                  onChange={(e) => setCameraNameDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') commitCameraName(); if (e.key === 'Escape') setCameraNameDraft(null); }}
                  placeholder="Camera name"
                  className="flex-1 px-2 py-1 text-xs bg-surface-input border border-subtle rounded text-content placeholder-content-tertiary focus:border-purple-500 focus:outline-none"
                />
                <button
                  onClick={commitCameraName}
                  disabled={!cameraNameDraft.trim()}
                  className="px-2.5 py-1 text-xs rounded bg-purple-600 text-white hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Save
                </button>
                <button
                  onClick={() => setCameraNameDraft(null)}
                  className="px-2 py-1 text-xs rounded bg-surface-raised text-content hover:text-content transition-colors"
                >
                  Cancel
                </button>
              </div>
            )
          )}
          {isManualCamera && (
            <div className="mt-2">
              <NumberInput
                label="Corridor width (m)"
                value={customCamera.manualCorridorWidth ?? 1.5}
                onChange={handleManualCorridorChange}
                min={0.1}
                max={500}
                step={0.1}
              />
              <p className="mt-1 text-[10px] text-content-tertiary leading-snug">
                Sets line spacing directly. For ground vehicles (rover/lawnmower) where the corridor is the operating width, not a camera footprint.
              </p>
            </div>
          )}
        </Section>

        {/* Movement (or Flight) — always visible. Altitude only for camera modes. */}
        <Section title={isManualCamera ? 'Movement' : 'Flight'}>
          <div className="space-y-2">
            {!isManualCamera && (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-content-secondary w-14 flex-shrink-0">Plan by</span>
                  <div className="flex gap-1 flex-1">
                    {(['altitude', 'gsd'] as const).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => setPlanBy(mode)}
                        className={`flex-1 px-1.5 py-1 text-[10px] rounded-md transition-colors ${
                          (config.planBy ?? 'altitude') === mode
                            ? 'bg-purple-600/80 text-white'
                            : 'bg-surface-raised text-content-secondary hover:text-content'
                        }`}
                        title={mode === 'gsd' ? 'Set target ground sample distance; altitude is derived' : 'Set altitude directly'}
                      >
                        {mode === 'gsd' ? 'GSD' : 'Altitude'}
                      </button>
                    ))}
                  </div>
                </div>
                {(config.planBy ?? 'altitude') === 'gsd' ? (
                  <>
                    <SliderInput
                      label="Target GSD"
                      value={result ? Number(result.stats.gsd.toFixed(1)) : 0}
                      onChange={setGsd}
                      min={0.5}
                      max={20}
                      step={0.1}
                      unit="cm/px"
                    />
                    <p className="text-[10px] text-content-tertiary leading-snug">
                      Altitude {formatAltitudeFromMeters(config.altitude, altitudeUnit)} (derived from GSD and camera)
                    </p>
                  </>
                ) : (
                  <AltitudeSliderInput label="Altitude" valueMeters={config.altitude} onChangeMeters={setAltitude} minMeters={10} maxMeters={500} stepMeters={5} />
                )}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-content-secondary w-14 flex-shrink-0">Alt Ref</span>
                  <div className="flex gap-1 flex-1">
                    {ALT_REF_OPTIONS.map(opt => (
                      <button
                        key={opt.id}
                        onClick={() => setAltitudeReference(opt.id)}
                        className={`flex-1 px-1.5 py-1 text-[10px] rounded-md transition-colors ${
                          config.altitudeReference === opt.id
                            ? 'bg-purple-600/80 text-white'
                            : 'bg-surface-raised text-content-secondary hover:text-content hover:bg-surface-raised'
                        }`}
                        title={opt.description}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
            <SpeedSliderInput label="Speed" valueMps={config.speed} onChangeMps={setSpeed} minMps={1} maxMps={30} />
            <SliderInput
              label="Endurance"
              value={config.enduranceMinutes ?? 20}
              onChange={setEnduranceMinutes}
              min={5}
              max={90}
              step={1}
              unit="min"
            />
            <p className="text-[10px] text-content-tertiary leading-snug -mt-1">
              Usable flight time per battery (after your reserve). Drives the battery estimate.
            </p>
          </div>
        </Section>

        {/* Pattern — filtered by mode so the user only sees patterns that
            make sense (mower hides Circular which generates wedge-leaving
            circles regardless of polygon shape; camera mode hides Spiral and
            Perimeter+Fill which are mowing-specific). */}
        <Section title="Pattern">
          {(() => {
            const mode = isManualCamera ? 'mower' : 'camera';
            const visible = ALL_PATTERN_OPTIONS.filter((o) => o.modes.includes(mode));
            return (
              <div className="grid grid-cols-2 gap-1">
                {visible.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setPattern(opt.id)}
                    className={`px-2 py-1.5 text-xs rounded-lg transition-colors ${
                      config.pattern === opt.id
                        ? 'bg-purple-600/80 text-white'
                        : 'bg-surface-raised text-content-secondary hover:text-content hover:bg-surface-raised'
                    }`}
                    title={opt.description}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            );
          })()}

          {/* Spiral direction sub-control — only when spiral pattern is active. */}
          {config.pattern === 'spiral' && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-content-secondary w-14 flex-shrink-0">Direction</span>
              <div className="flex gap-1 flex-1">
                {(['inward', 'outward'] as const).map((dir) => {
                  const active = (config.spiralDirection ?? 'inward') === dir;
                  return (
                    <button
                      key={dir}
                      onClick={() => setSpiralDirection(dir)}
                      className={`flex-1 px-2 py-1 text-[11px] rounded-md transition-colors ${
                        active
                          ? 'bg-purple-600/80 text-white'
                          : 'bg-surface-raised text-content-secondary hover:text-content'
                      }`}
                      title={dir === 'inward' ? 'Start at perimeter, end at center' : 'Start at center, end at perimeter'}
                    >
                      {dir === 'inward' ? 'In' : 'Out'}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Perimeter+Fill passes — only when that pattern is active. */}
          {config.pattern === 'perimeter-fill' && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-content-secondary w-14 flex-shrink-0">Passes</span>
              <input
                type="range"
                value={config.perimeterPasses ?? 2}
                onChange={(e) => setPerimeterPasses(Number(e.target.value))}
                min={1}
                max={5}
                step={1}
                className="flex-1 h-1 bg-surface-inset rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-400 [&::-webkit-slider-thumb]:cursor-grab"
              />
              <span className="text-xs text-content w-14 text-right tabular-nums font-medium">
                {config.perimeterPasses ?? 2}×
              </span>
            </div>
          )}

          {/* Crosshatch second-pass altitude offset — camera mode only. Flying
              the two perpendicular passes at two heights improves 3D
              reconstruction. 0% = classic same-altitude crosshatch. */}
          {config.pattern === 'crosshatch' && !isManualCamera && (
            <div className="mt-2">
              <SliderInput
                label="2nd alt"
                value={config.crossGridAltitudeOffset ?? 0}
                onChange={setCrossGridAltitudeOffset}
                min={0}
                max={100}
                step={5}
                unit="%"
              />
              <p className="mt-1 text-[10px] text-content-tertiary leading-snug">
                {(config.crossGridAltitudeOffset ?? 0) > 0
                  ? `Perpendicular pass flies ${formatAltitudeFromMeters(config.altitude * (1 + (config.crossGridAltitudeOffset ?? 0) / 100), altitudeUnit)} (+${config.crossGridAltitudeOffset}%) for better photogrammetry.`
                  : 'Both passes at the same altitude. Raise to fly the second pass higher.'}
              </p>
            </div>
          )}
        </Section>

        {/* Corridor settings — only when the corridor pattern is active. The
            drawn polygon is treated as a centerline, not an area. */}
        {config.pattern === 'corridor' && (
          <Section title="Corridor">
            <div className="space-y-2">
              {!isManualCamera && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-content-secondary w-14 flex-shrink-0">Mode</span>
                  <div className="flex gap-1 flex-1">
                    {CORRIDOR_MODE_OPTIONS.map((opt) => {
                      const active = (config.corridorMode ?? 'plane') === opt.id;
                      return (
                        <button
                          key={opt.id}
                          onClick={() => setCorridorMode(opt.id)}
                          className={`flex-1 px-2 py-1 text-[11px] rounded-md transition-colors ${
                            active
                              ? 'bg-purple-600/80 text-white'
                              : 'bg-surface-raised text-content-secondary hover:text-content'
                          }`}
                          title={opt.description}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <SliderInput
                label="Width"
                value={config.corridorWidth ?? 60}
                onChange={setCorridorWidth}
                min={5}
                max={500}
                step={5}
                unit="m"
              />

              <div className="flex items-center gap-2">
                <span className="text-xs text-content-secondary w-14 flex-shrink-0">Strips</span>
                <input
                  type="range"
                  value={config.corridorStrips ?? 0}
                  onChange={(e) => setCorridorStrips(Number(e.target.value))}
                  min={0}
                  max={20}
                  step={1}
                  className="flex-1 h-1 bg-surface-inset rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-400 [&::-webkit-slider-thumb]:cursor-grab"
                />
                <span className="text-xs text-content w-14 text-right tabular-nums font-medium">
                  {(config.corridorStrips ?? 0) === 0 ? (result ? `${result.stats.lineCount} auto` : 'auto') : config.corridorStrips}
                </span>
              </div>

              <SliderInput
                label="Side off"
                value={config.corridorSideOffset ?? 0}
                onChange={setCorridorSideOffset}
                min={-200}
                max={200}
                step={5}
                unit="m"
              />

              {!isManualCamera && (config.corridorMode ?? 'plane') === 'plane' && (
                <>
                  <SliderInput label="Overshoot" value={config.overshoot} onChange={setOvershoot} min={0} max={150} step={5} unit="m" />
                  <SliderInput
                    label="Max turn"
                    value={config.maxTurnAngle ?? 15}
                    onChange={setMaxTurnAngle}
                    min={5}
                    max={90}
                    step={5}
                    unit="°"
                  />
                  <p className="text-[10px] text-content-tertiary leading-snug -mt-1">
                    Bends sharper than this get racetrack turn waypoints so the plane re-enters the next leg aligned.
                  </p>
                </>
              )}

              <div className="flex gap-1 pt-1">
                <button
                  onClick={() => setFlipLegs(!config.flipLegs)}
                  className={`flex-1 px-2 py-1.5 text-[11px] rounded-md transition-colors ${
                    config.flipLegs
                      ? 'bg-purple-600/80 text-white'
                      : 'bg-surface-raised text-content-secondary hover:text-content'
                  }`}
                  title="Fly the strips starting from the far side"
                >
                  Flip legs
                </button>
                <button
                  onClick={() => setInvertPath(!config.invertPath)}
                  className={`flex-1 px-2 py-1.5 text-[11px] rounded-md transition-colors ${
                    config.invertPath
                      ? 'bg-purple-600/80 text-white'
                      : 'bg-surface-raised text-content-secondary hover:text-content'
                  }`}
                  title="Reverse the travel direction along the centerline"
                >
                  Invert path
                </button>
              </div>

              <p className="text-[10px] text-content-tertiary leading-snug">
                Draw the centerline as a path (roads, rail, power lines). Strips run parallel to it; an odd strip count rides the centerline, even straddles it.
              </p>
            </div>
          </Section>
        )}

        {/* Ground path — manual / mower mode only. Picks how the rover moves
            between lines: zigzag (skid-steer) vs reverse (Ackermann). */}
        {isManualCamera && (
          <Section title="Path">
            <div className="flex gap-1">
              {GROUND_PATTERN_OPTIONS.map(opt => {
                const active = (config.groundPattern ?? 'boustrophedon') === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => setGroundPattern(opt.id)}
                    className={`flex-1 px-2 py-1.5 text-xs rounded-lg transition-colors ${
                      active
                        ? 'bg-purple-600/80 text-white'
                        : 'bg-surface-raised text-content-secondary hover:text-content hover:bg-surface-raised'
                    }`}
                    title={opt.description}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-[10px] text-content-tertiary leading-snug">
              {(config.groundPattern ?? 'boustrophedon') === 'reverse-alternating'
                ? 'Mission inserts DO_SET_REVERSE between lines. Rover firmware must support it.'
                : 'Standard zigzag pattern. Rover turns 180° at each line end.'}
            </p>
          </Section>
        )}

        {/* Advanced — collapsed by default. Holds Overlap, Grid tuning, and
            the Show footprints toggle. Once expanded, state sticks for the
            session (no need to re-open every regen). */}
        <div>
          <button
            onClick={() => setAdvancedOpen((v) => !v)}
            className="w-full flex items-center justify-between px-2 py-1.5 text-[11px] font-medium text-content-secondary hover:text-content uppercase tracking-wider transition-colors"
            title="Show/hide advanced settings"
          >
            <span>Advanced</span>
            <svg
              className={`w-3 h-3 transition-transform ${advancedOpen ? 'rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          {advancedOpen && (
            <div className="mt-1 space-y-3 pl-2 border-l border-subtle">
              {!isManualCamera && (
                <Section title="Overlap">
                  <div className="space-y-2">
                    <SliderInput label="Front" value={config.frontOverlap} onChange={setFrontOverlap} min={10} max={95} step={1} unit="%" />
                    <SliderInput label="Side" value={config.sideOverlap} onChange={setSideOverlap} min={10} max={99} step={1} unit="%" />
                  </div>
                </Section>
              )}

              {config.pattern !== 'circular' && config.pattern !== 'corridor' && (
                <Section title="Grid">
                  <div className="space-y-2">
                    <SliderInput label="Angle" value={config.gridAngle} onChange={setGridAngle} min={0} max={359} step={1} unit="°" />
                    {!isManualCamera && (
                      <SliderInput label="Overshoot" value={config.overshoot} onChange={setOvershoot} min={0} max={100} step={5} unit="m" />
                    )}
                    <SliderInput label="Margin" value={config.margin ?? 0} onChange={setMargin} min={-50} max={50} step={1} unit="m" />
                    <p className="text-[10px] text-content-tertiary leading-snug -mt-1">
                      Buffers the boundary: positive grows coverage past the edge, negative keeps lines inside.
                    </p>
                    {!isManualCamera && (
                      <div className="flex items-center gap-2 pt-1">
                        <span className="text-xs text-content-secondary w-14 flex-shrink-0">Turns</span>
                        <div className="flex gap-1 flex-1">
                          {(['copter', 'plane'] as const).map((mode) => (
                            <button
                              key={mode}
                              onClick={() => setGridMode(mode)}
                              className={`flex-1 px-1.5 py-1 text-[10px] rounded-md transition-colors ${
                                (config.gridMode ?? 'copter') === mode
                                  ? 'bg-purple-600/80 text-white'
                                  : 'bg-surface-raised text-content-secondary hover:text-content'
                              }`}
                              title={mode === 'plane'
                                ? 'Fixed-wing: extend the shorter line end at each turn for a clean 180° racetrack turn'
                                : 'Multirotor: turn on the spot, lines connect directly'}
                            >
                              {mode === 'plane' ? 'Plane' : 'Copter'}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </Section>
              )}

              {!isManualCamera && (config.pattern === 'grid' || config.pattern === 'crosshatch') && (
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs text-content-secondary" title="Camera triggers only along the scan lines; off during the turn-arounds outside the boundary">Camera off on turns</span>
                  <button
                    onClick={() => setCameraOffOutside(!config.cameraOffOutside)}
                    className={`w-8 h-4.5 rounded-full transition-colors relative ${
                      config.cameraOffOutside ? 'bg-purple-600' : 'bg-surface-raised'
                    }`}
                  >
                    <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-all ${
                      config.cameraOffOutside ? 'left-4' : 'left-0.5'
                    }`} />
                  </button>
                </div>
              )}

              {!isManualCamera && (
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs text-content-secondary">Show footprints</span>
                  <button
                    onClick={() => setShowFootprints(!showFootprints)}
                    className={`w-8 h-4.5 rounded-full transition-colors relative ${
                      showFootprints ? 'bg-purple-600' : 'bg-surface-raised'
                    }`}
                  >
                    <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-all ${
                      showFootprints ? 'left-4' : 'left-0.5'
                    }`} />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Stats — show whenever we have a generated result. */}
        {result && result.waypoints.length > 0 && (
          <div className="pt-3 border-t border-subtle">
            <SurveyStatsPanel
              stats={result.stats}
              batteries={estimateBatteryCount(result.stats.flightTime, config.enduranceMinutes ?? 20)}
              dataSizeGb={estimateDataSizeGb(result.stats.photoCount, config.camera.imageWidth, config.camera.imageHeight)}
            />
          </div>
        )}
      </div>

      {/* Insert / Editing button — pinned outside scroll area.
          When linked to a SurveyGroup (editingGroupId set), edits flow
          through live and the button shows "Editing live" as a non-action
          status indicator. To start a fresh survey: use Clear (top of panel)
          which resets editingGroupId. */}
      {result && result.waypoints.length > 0 && (
        <div className="p-3 pt-0 flex-shrink-0">
          {editingGroupId ? (
            polygonEditMode ? (
              <div className="space-y-1.5">
                <div className="text-[11px] text-center text-amber-300">
                  Editing polygon - drag points on the map (zoom in to reach them).
                  {pendingRecompute ? ' Waypoints will recompute on Done.' : ''}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => exitPolygonEdit(true)}
                    className="flex-1 py-2 rounded-lg text-sm font-medium bg-purple-600 hover:bg-purple-500 text-white transition-colors"
                    title="Finish editing and recompute the waypoints"
                  >
                    {pendingRecompute ? 'Done - recompute waypoints' : 'Done'}
                  </button>
                  <button
                    onClick={() => exitPolygonEdit(false)}
                    className="px-3 py-2 rounded-lg text-sm font-medium bg-surface-raised text-content hover:text-white hover:bg-surface-input transition-colors"
                    title="Discard polygon changes"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={enterPolygonEdit}
                  className="flex-1 py-2 rounded-lg text-sm font-medium bg-surface-raised text-content hover:text-purple-300 border border-purple-500/30 transition-colors"
                  title="Edit the boundary - drag vertices on the map, then Done recomputes the waypoints"
                >
                  Edit polygon
                </button>
                <button
                  onClick={deactivateSurvey}
                  className="px-3 py-2 rounded-lg text-sm font-medium bg-surface-raised text-content hover:text-white hover:bg-surface-input transition-colors"
                  title="Finish editing this survey"
                >
                  Close
                </button>
              </div>
            )
          ) : (
            <div className="space-y-1.5">
              <button
                onClick={handleInsertSurvey}
                className={`w-full py-2 rounded-lg text-sm font-medium transition-colors ${
                  insertSuccess
                    ? 'bg-emerald-600 text-white'
                    : 'bg-purple-600 hover:bg-purple-500 text-white'
                }`}
              >
                {insertSuccess
                  ? `Inserted ${result.waypoints.length} waypoints`
                  : `Insert Survey (${result.waypoints.length} WPs)`}
              </button>
              {!isManualCamera && estimateBatteryCount(result.stats.flightTime, config.enduranceMinutes ?? 20) > 1 && (
                <button
                  onClick={handleSplitIntoFlights}
                  className="w-full py-1.5 rounded-lg text-xs font-medium bg-surface-raised text-content hover:text-purple-300 transition-colors"
                  title="Split into one battery-sized flight group per sortie; upload each from the table"
                >
                  Split into {estimateBatteryCount(result.stats.flightTime, config.enduranceMinutes ?? 20)} flights
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- Sub-components ---

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-medium text-content-secondary uppercase tracking-wider mb-1.5">{title}</div>
      {children}
    </div>
  );
}

function SliderInput({
  label, value, onChange, min, max, step, unit,
}: {
  label: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step: number; unit: string;
}) {
  // The value is both a slider AND a directly-editable number field (power
  // users asked to type exact values). Out-of-range keystrokes are ignored
  // mid-type (matches NumberInput); blur snaps back into range.
  const clampBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    if (!Number.isFinite(v)) { onChange(min); return; }
    const clamped = Math.min(max, Math.max(min, v));
    if (clamped !== value) onChange(clamped);
  };
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-content-secondary w-14 flex-shrink-0">{label}</span>
      <input
        type="range"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
        step={step}
        className="flex-1 h-1 bg-surface-inset rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-400 [&::-webkit-slider-thumb]:cursor-grab"
      />
      <div className="flex items-center gap-0.5 w-14 flex-shrink-0 justify-end">
        <input
          type="number"
          value={value}
          onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v >= min && v <= max) onChange(v); }}
          onBlur={clampBlur}
          min={min}
          max={max}
          step={step}
          aria-label={label}
          className="w-10 px-1 py-0.5 text-xs text-right tabular-nums font-medium bg-surface-input border border-subtle rounded text-content focus:outline-none focus:border-purple-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <span className="text-[10px] text-content-tertiary w-6">{unit}</span>
      </div>
    </div>
  );
}

function AltitudeSliderInput({
  label,
  valueMeters,
  onChangeMeters,
  minMeters,
  maxMeters,
  stepMeters,
}: {
  label: string;
  valueMeters: number;
  onChangeMeters: (v: number) => void;
  minMeters: number;
  maxMeters: number;
  stepMeters: number;
}) {
  const altitudeUnit = useSettingsStore((s) => s.unitPreferences.altitude);
  const min = altitudeValueFromMeters(minMeters, altitudeUnit);
  const max = altitudeValueFromMeters(maxMeters, altitudeUnit);
  const step = altitudeValueFromMeters(stepMeters, altitudeUnit);
  const value = altitudeValueFromMeters(valueMeters, altitudeUnit);
  const displayPrecision = altitudeUnit === 'km' ? 3 : 1;
  const roundedDisplayValue = Number(value.toFixed(displayPrecision));
  const unit = UNIT_LABELS.altitude[altitudeUnit];

  const commitDisplay = (displayValue: number) => {
    if (!Number.isFinite(displayValue) || displayValue < min || displayValue > max) return;
    onChangeMeters(toMetersFromAltitudeUnit(displayValue, altitudeUnit));
  };

  const clampBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    if (rawValue.trim() === '') return;
    const displayValue = Number(rawValue);
    if (!Number.isFinite(displayValue)) return;
    if (displayValue === roundedDisplayValue) return;
    const clamped = Math.min(max, Math.max(min, displayValue));
    const meters = toMetersFromAltitudeUnit(clamped, altitudeUnit);
    if (meters !== valueMeters) onChangeMeters(meters);
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-content-secondary w-14 flex-shrink-0">{label}</span>
      <input
        type="range"
        value={value}
        onChange={(e) => commitDisplay(Number(e.target.value))}
        min={min}
        max={max}
        step={step}
        className="flex-1 h-1 bg-surface-inset rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-400 [&::-webkit-slider-thumb]:cursor-grab"
      />
      <div className="flex items-center gap-0.5 w-14 flex-shrink-0 justify-end">
        <input
          type="number"
          value={roundedDisplayValue}
          onChange={(e) => {
            const rawValue = e.target.value;
            if (rawValue.trim() === '') return;
            const displayValue = Number(rawValue);
            commitDisplay(displayValue);
          }}
          onBlur={clampBlur}
          min={min}
          max={max}
          step={step}
          aria-label={label}
          className="w-10 px-1 py-0.5 text-xs text-right tabular-nums font-medium bg-surface-input border border-subtle rounded text-content focus:outline-none focus:border-purple-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <span className="text-[10px] text-content-tertiary w-3">{unit}</span>
      </div>
    </div>
  );
}

function SpeedSliderInput({
  label,
  valueMps,
  onChangeMps,
  minMps,
  maxMps,
}: {
  label: string;
  valueMps: number;
  onChangeMps: (v: number) => void;
  minMps: number;
  maxMps: number;
}) {
  const speedUnit = useSettingsStore((s) => s.unitPreferences.speed);
  const precision = UNIT_PRECISION.speed[speedUnit];
  const min = Number(speedValueFromMetersPerSecond(minMps, speedUnit).toFixed(precision));
  const max = Number(speedValueFromMetersPerSecond(maxMps, speedUnit).toFixed(precision));
  const step = 1 / (10 ** precision);
  const value = speedValueFromMetersPerSecond(valueMps, speedUnit);
  const roundedDisplayValue = Number(value.toFixed(precision));
  const unit = UNIT_LABELS.speed[speedUnit];

  const commitDisplay = (displayValue: number) => {
    if (!Number.isFinite(displayValue) || displayValue < min || displayValue > max) return;
    onChangeMps(toMetersPerSecondFromSpeedUnit(displayValue, speedUnit));
  };

  const clampBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    if (rawValue.trim() === '') return;
    const displayValue = Number(rawValue);
    if (!Number.isFinite(displayValue)) return;
    if (displayValue === roundedDisplayValue) return;
    const clamped = Math.min(max, Math.max(min, displayValue));
    const mps = toMetersPerSecondFromSpeedUnit(clamped, speedUnit);
    if (mps !== valueMps) onChangeMps(mps);
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-content-secondary w-14 flex-shrink-0">{label}</span>
      <input
        type="range"
        value={roundedDisplayValue}
        onChange={(e) => commitDisplay(Number(e.target.value))}
        min={min}
        max={max}
        step={step}
        className="flex-1 h-1 bg-surface-inset rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-400 [&::-webkit-slider-thumb]:cursor-grab"
      />
      <div className="flex items-center gap-0.5 w-16 flex-shrink-0 justify-end">
        <input
          type="number"
          value={roundedDisplayValue}
          onChange={(e) => {
            const rawValue = e.target.value;
            if (rawValue.trim() === '') return;
            const displayValue = Number(rawValue);
            commitDisplay(displayValue);
          }}
          onBlur={clampBlur}
          min={min}
          max={max}
          step={step}
          aria-label={label}
          className="w-10 px-1 py-0.5 text-xs text-right tabular-nums font-medium bg-surface-input border border-subtle rounded text-content focus:outline-none focus:border-purple-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <span className="text-[10px] text-content-tertiary w-5">{unit}</span>
      </div>
    </div>
  );
}

function NumberInput({
  label, value, onChange, min, max, step,
}: {
  label: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step: number;
}) {
  return (
    <div>
      <label className="text-[10px] text-content-secondary">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (v >= min && v <= max) onChange(v);
        }}
        min={min}
        max={max}
        step={step}
        className="w-full px-2 py-1 text-xs bg-surface-raised border border rounded text-content focus:border-purple-500 focus:outline-none"
      />
    </div>
  );
}

// Templates dropdown — grouped by tag (Flying / Ground / Custom). Selecting
// a preset applies its config; user-defined presets carry a delete affordance
// on hover.
function PresetDropdown({
  presets,
  selectedId,
  onSelect,
  onDelete,
}: {
  presets: SurveyPreset[];
  selectedId: string | null;
  onSelect: (preset: SurveyPreset) => void;
  onDelete: (id: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selected = presets.find((p) => p.id === selectedId);
  const grouped = {
    Flying: presets.filter((p) => p.tag === 'Flying'),
    Ground: presets.filter((p) => p.tag === 'Ground'),
    Custom: presets.filter((p) => p.tag === 'Custom'),
  };

  // Compute popup position from the trigger's bounding rect. We render via a
  // portal to document.body so the dropdown isn't clipped by the dockview
  // panel's overflow:hidden boundary. Anchored to the trigger's right edge —
  // the survey tab lives on the right side of the screen, so growing leftward
  // keeps the menu inside the viewport.
  useEffect(() => {
    if (!isOpen || !triggerRef.current) return;
    const update = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.max(rect.width, 288);
      setPopupStyle({
        position: 'fixed',
        top: rect.bottom + 4,
        right: Math.max(8, window.innerWidth - rect.right),
        width,
        maxHeight: Math.min(360, window.innerHeight - rect.bottom - 16),
      });
    };
    update();
    // Recompute on scroll/resize so the popup tracks the trigger if anything
    // shifts. Capture-phase scroll catches inner scroll containers too.
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [isOpen]);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        onClick={() => setIsOpen((v) => !v)}
        className="w-full px-2.5 py-1.5 text-left text-xs bg-surface-raised border border rounded-md text-content hover:border transition-colors flex items-center justify-between"
        title="Pick a preset (or stay with current settings)"
      >
        <span className="truncate">
          {selected ? selected.name : 'Pick a template…'}
        </span>
        <svg className={`w-3 h-3 text-content-secondary transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && createPortal(
        <>
          {/* Click-outside scrim. Sits below the popup but above the rest of
              the app — clicks dismiss without flashing past other UI. */}
          <div
            className="fixed inset-0"
            style={{ zIndex: 9998 }}
            onClick={() => setIsOpen(false)}
          />
          <div
            style={{ ...popupStyle, zIndex: 9999 }}
            className="bg-surface-solid border border-subtle rounded-md shadow-2xl overflow-y-auto"
          >
            {(['Flying', 'Ground', 'Custom'] as const).map((tag) => {
              const items = grouped[tag];
              if (items.length === 0) return null;
              return (
                <div key={tag}>
                  <div className="px-3 py-1.5 text-[10px] font-medium text-content-secondary uppercase tracking-wider bg-surface-input">
                    {tag === 'Custom' ? 'Saved' : tag}
                  </div>
                  {items.map((p) => (
                    <div
                      key={p.id}
                      className={`group flex items-center gap-1 hover:bg-purple-600/20 transition-colors ${
                        p.id === selectedId ? 'bg-purple-600/10' : ''
                      }`}
                    >
                      <button
                        onClick={() => { onSelect(p); setIsOpen(false); }}
                        className={`flex-1 px-3 py-2 text-left text-xs ${
                          p.id === selectedId ? 'text-purple-300' : 'text-content'
                        }`}
                      >
                        <div className="font-medium whitespace-nowrap">{p.name}</div>
                        <div className="text-[10px] text-content-tertiary leading-snug mt-0.5">{p.description}</div>
                      </button>
                      {p.isUserDefined && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onDelete(p.id); }}
                          className="opacity-0 group-hover:opacity-100 px-2 text-content-tertiary hover:text-red-400 transition-opacity"
                          title="Delete preset"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
