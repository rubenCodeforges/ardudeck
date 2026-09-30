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
import { useState, useCallback, useEffect, useRef, useMemo, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { Lock, LockOpen, Save } from 'lucide-react';
import { useSurveyStore } from '../../stores/survey-store';
import { useSurveyAreaStore } from '../../stores/survey-area-store';
import { sourceIsBehind } from '../../../shared/survey-document-types';
import { useCargoEnabled, MISSION_LIBRARY_CARGO_SLUG } from '../../modules/capabilities';
import { useMissionStore } from '../../stores/mission-store';
import { useConnectionStore } from '../../stores/connection-store';
import { useParameterStore } from '../../stores/parameter-store';
import { useArduPilotSitlStore } from '../../stores/ardupilot-sitl-store';
import { getVehicleClass } from '../../../shared/telemetry-types';
import { TURN_LOOP_MIN_DEG, countHairpins } from './generators/corridor-generator';
import { stripFlightOrder } from './generators/strip-order';
import { planTurnRadius } from './generators/turn-radius';
import { surveyModeForVehicle, vehiclePlanningNote } from './survey-vehicle';
import { useSettingsStore } from '../../stores/settings-store';
import { useNavigationStore } from '../../stores/navigation-store';
import { CameraPresetSelector } from './CameraPresetSelector';
import { SurveyStatsPanel } from './SurveyStatsPanel';
import { FleetSurveyPanel } from './FleetSurveyPanel';
import { useActiveVehicleStore } from '../../stores/active-vehicle-store';
import { estimateBatteryCount, estimateDataSizeGb } from './survey-stats';
import { surveyToMissionItems } from './mission-builder';
import {
  getSurveyGenerator,
  listSurveyGenerators,
  resolveGeneratorId,
  subscribeSurveyGenerators,
  getSurveyGeneratorsVersion,
  type GeneratorConfigField,
} from './generator-registry';
import { createSurveyGroup, createManualGroup, nextGroupColor, GROUP_COLOR_PALETTE } from '../../../shared/mission-group-types';
import { splitIntoSorties } from './survey-sortie-split';
import { splitCorridorIntoSections, sectionCountForEndurance, sectionCountForLength, centrelineLengthM } from './corridor-sections';
import { computeSurveyGroupSignature } from './survey-group-signature';
import { MAV_CMD } from '../../../shared/mission-types';
import {
  BUILTIN_SURVEY_PRESETS,
  captureCurrentAsPresetConfig,
  makeUserPreset,
  type SurveyPreset,
} from './survey-presets';
import type { SurveyPattern, CameraPreset, AltitudeReference, GroundPattern, CorridorMode } from './survey-types';
import { asOwnFlight } from './survey-types';
import { DraftNumberField } from '../ui/DraftNumberField';
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
import { useVehicleProfileStore } from '../../stores/vehicle-profile-store';
import { AD_FEAT, supports } from '../../../shared/vehicle-profile';

/** Prefer the i18n key; falls back to the literal. */
function svText(t: (key: string) => string, key: string | undefined, fallback: string): string {
  return key ? t(key) : fallback;
}

// Pattern catalog. Each entry advertises which modes it applies to so the UI
// can filter without scattering conditional logic across the component.
const ALL_PATTERN_OPTIONS: {
  id: SurveyPattern;
  label: string;
  labelKey?: string;
  description: string;
  descriptionKey?: string;
  modes: ('camera' | 'mower')[];
}[] = [
  { id: 'grid', label: 'Grid', labelKey: 'survey.pattern.grid', description: 'Parallel back-and-forth lines', descriptionKey: 'survey.pattern.grid-desc', modes: ['camera', 'mower'] },
  { id: 'crosshatch', label: 'Crosshatch', labelKey: 'survey.pattern.crosshatch', description: 'Two perpendicular grid passes', descriptionKey: 'survey.pattern.crosshatch-desc', modes: ['camera', 'mower'] },
  { id: 'circular', label: 'Circular', labelKey: 'survey.pattern.circular', description: 'Concentric rings around centroid', descriptionKey: 'survey.pattern.circular-desc', modes: ['camera'] },
  { id: 'corridor', label: 'Corridor', labelKey: 'survey.pattern.corridor', description: 'Follow a centerline (roads, rail, power lines, pipelines)', descriptionKey: 'survey.pattern.corridor-desc', modes: ['camera', 'mower'] },
  { id: 'spiral', label: 'Spiral', labelKey: 'survey.pattern.spiral', description: 'Polygon-aware inward/outward spiral', descriptionKey: 'survey.pattern.spiral-desc', modes: ['mower'] },
  { id: 'perimeter-fill', label: 'Perimeter + Fill', labelKey: 'survey.pattern.perimeter-fill', description: 'Edge passes then grid interior', descriptionKey: 'survey.pattern.perimeter-fill-desc', modes: ['mower'] },
];

const CORRIDOR_MODE_OPTIONS: {
  id: CorridorMode; label: string; labelKey?: string; description: string; descriptionKey?: string;
}[] = [
  { id: 'plane', label: 'Plane', labelKey: 'survey.mode.plane', description: 'Fixed wing: strips get overshoot and racetrack turns at sharp bends', descriptionKey: 'survey.corridor-mode.plane-desc' },
  { id: 'copter', label: 'Copter', labelKey: 'survey.mode.copter', description: 'Multirotor: turns on the spot, no overshoot or turn loops', descriptionKey: 'survey.corridor-mode.copter-desc' },
];

const GROUND_PATTERN_OPTIONS: {
  id: GroundPattern; label: string; labelKey?: string; description: string; descriptionKey?: string;
}[] = [
  { id: 'boustrophedon', label: 'Zigzag', labelKey: 'survey.ground.zigzag', description: 'U-turn at line ends (skid-steer rovers)', descriptionKey: 'survey.ground.zigzag-desc' },
  { id: 'reverse-alternating', label: 'Reverse', labelKey: 'survey.ground.reverse', description: 'Drive forward then reverse: no U-turns (Ackermann/car-like rovers, needs ArduRover DO_SET_REVERSE support)', descriptionKey: 'survey.ground.reverse-desc' },
];

const ALT_REF_OPTIONS: {
  id: AltitudeReference; label: string; labelKey?: string; description: string; descriptionKey?: string;
}[] = [
  { id: 'relative', label: 'Relative', labelKey: 'survey.alt-ref.relative', description: 'Altitude relative to home position', descriptionKey: 'survey.alt-ref.relative-desc' },
  { id: 'terrain', label: 'Terrain', labelKey: 'survey.alt-ref.terrain', description: 'Altitude above terrain (AGL) at each point', descriptionKey: 'survey.alt-ref.terrain-desc' },
  { id: 'asl', label: 'ASL', labelKey: 'survey.alt-ref.asl', description: 'Altitude above mean sea level', descriptionKey: 'survey.alt-ref.asl-desc' },
];

// Rehydrate a persisted preset blob from settings into a typed SurveyPreset.
// The persisted form is intentionally loose (Record<string, unknown>) so the
// shared module doesn't import renderer-only types; we cast here at the edge.
// `descriptionKey` rides alongside because built-in/user descriptions are
// data, not literals this file can key at the table.
type SurveyPresetView = SurveyPreset & { descriptionKey?: string };

function rehydrateUserPreset(p: PersistedSurveyPreset): SurveyPresetView {
  return {
    id: p.id,
    name: p.name,
    description: p.description || 'Saved preset',
    ...(p.description ? {} : { descriptionKey: 'survey.preset.saved-desc' }),
    tag: 'Custom',
    isUserDefined: true,
    config: p.config as SurveyPreset['config'],
    ...(p.camera ? { camera: p.camera as unknown as CameraPreset } : {}),
  };
}

export function SurveyConfigPanel() {
  const { t } = useTranslation('views');
  // A vehicle that never declared terrain support will refuse a terrain-relative plan on
  // upload, so offering it only wastes the operator's time drawing one.
  const activeVehicleKey = useActiveVehicleStore((s) => s.activeVehicleKey);
  const vehicleProfile = useVehicleProfileStore(
    (s) => (activeVehicleKey ? s.byVehicle[activeVehicleKey] : undefined),
  );
  const altRefOptions = ALT_REF_OPTIONS.filter(
    (opt) => opt.id !== 'terrain' || supports(vehicleProfile, AD_FEAT.TERRAIN),
  );

  const polygon = useSurveyStore((s) => s.polygon);
  const config = useSurveyStore((s) => s.config);
  const result = useSurveyStore((s) => s.result);
  const generating = useSurveyStore((s) => s.generating);
  const generatorError = useSurveyStore((s) => s.generatorError);
  // Fleet survey: offer "split across fleet" once 2+ vehicles are connected.
  const fleetCount = useActiveVehicleStore((s) => Object.keys(s.knownVehicles).length);
  const [showFleetSplit, setShowFleetSplit] = useState(false);
  const showFootprints = useSurveyStore((s) => s.showFootprints);
  const editingGroupId = useSurveyStore((s) => s.editingGroupId);
  const polygonEditMode = useSurveyStore((s) => s.polygonEditMode);
  const pendingRecompute = useSurveyStore((s) => s.pendingRecompute);
  const enterPolygonEdit = useSurveyStore((s) => s.enterPolygonEdit);
  const geometryLocked = useSurveyStore((s) => s.geometryLocked);
  const setGeometryLocked = useSurveyStore((s) => s.setGeometryLocked);
  const exitPolygonEdit = useSurveyStore((s) => s.exitPolygonEdit);
  const setEditingGroupId = useSurveyStore((s) => s.setEditingGroupId);

  // Saving the area keeps the survey after the mission it was planned in. It
  // lands in the Mission Library, so the button follows that cargo: without it
  // there is nowhere to browse what was saved.
  const libraryEnabled = useCargoEnabled(MISSION_LIBRARY_CARGO_SLUG);
  const saveGroupAsArea = useSurveyAreaStore((s) => s.saveGroupAsArea);
  const setSurveyGroupSource = useMissionStore((s) => s.setSurveyGroupSource);
  const [areaSaveState, setAreaSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const savedAreas = useSurveyAreaStore((s) => s.areas);
  const loadAreas = useSurveyAreaStore((s) => s.loadAreas);
  const reloadSavedArea = useSurveyStore((s) => s.reloadSavedArea);
  const editingGroup = useMissionStore((s) => s.groups.find((g) => g.id === editingGroupId));
  const source = editingGroup?.kind === 'survey' ? editingGroup.source : undefined;
  const latestRevision = source ? savedAreas.find((a) => a.id === source.docId)?.revision : undefined;
  const sourceBehind = sourceIsBehind(source, latestRevision);

  useEffect(() => {
    if (editingGroupId && savedAreas.length === 0) void loadAreas();
  }, [editingGroupId]);

  const handleSaveArea = useCallback(async () => {
    if (!editingGroupId) return;
    const group = useMissionStore.getState().groups.find((g) => g.id === editingGroupId);
    if (!group || group.kind !== 'survey') return;
    setAreaSaveState('saving');
    const doc = await saveGroupAsArea(group, {
      name: group.name,
      ...(group.source ? { id: group.source.docId } : {}),
    });
    if (!doc) {
      setAreaSaveState('error');
      setTimeout(() => setAreaSaveState('idle'), 3000);
      return;
    }
    setSurveyGroupSource(editingGroupId, { docId: doc.id, revision: doc.revision, name: doc.name });
    setAreaSaveState('saved');
    setTimeout(() => setAreaSaveState('idle'), 2000);
  }, [editingGroupId, saveGroupAsArea, setSurveyGroupSource]);

  const setPattern = useSurveyStore((s) => s.setPattern);
  const setGeneratorId = useSurveyStore((s) => s.setGeneratorId);
  const setEngineParam = useSurveyStore((s) => s.setEngineParam);
  const requestRecompute = useSurveyStore((s) => s.requestRecompute);
  const setAltitude = useSurveyStore((s) => s.setAltitude);
  const setSpeed = useSurveyStore((s) => s.setSpeed);
  const setFrontOverlap = useSurveyStore((s) => s.setFrontOverlap);
  const setSideOverlap = useSurveyStore((s) => s.setSideOverlap);
  const setCamera = useSurveyStore((s) => s.setCamera);
  const setGridAngle = useSurveyStore((s) => s.setGridAngle);
  const setOvershoot = useSurveyStore((s) => s.setOvershoot);
  const setLeadIn = useSurveyStore((s) => s.setLeadIn);
  const setMargin = useSurveyStore((s) => s.setMargin);
  const setCameraOffOutside = useSurveyStore((s) => s.setCameraOffOutside);
  const setGridMode = useSurveyStore((s) => s.setGridMode);
  const setAltitudeReference = useSurveyStore((s) => s.setAltitudeReference);
  const setTerrainFollow = useSurveyStore((s) => s.setTerrainFollow);
  const setShowFootprints = useSurveyStore((s) => s.setShowFootprints);
  const setGroundPattern = useSurveyStore((s) => s.setGroundPattern);
  const setSpiralDirection = useSurveyStore((s) => s.setSpiralDirection);
  const setPerimeterPasses = useSurveyStore((s) => s.setPerimeterPasses);
  const setPlanBy = useSurveyStore((s) => s.setPlanBy);
  const setGsd = useSurveyStore((s) => s.setGsd);
  const setEnduranceMinutes = useSurveyStore((s) => s.setEnduranceMinutes);
  const setCrossGridAltitudeOffset = useSurveyStore((s) => s.setCrossGridAltitudeOffset);
  const setCorridorWidth = useSurveyStore((s) => s.setCorridorWidth);
  const setCorridorSectionLength = useSurveyStore((s) => s.setCorridorSectionLength);
  const setCorridorStrips = useSurveyStore((s) => s.setCorridorStrips);
  const setCorridorMode = useSurveyStore((s) => s.setCorridorMode);
  const setPanoramaSide = useSurveyStore((s) => s.setPanoramaSide);
  const setPanoramaStandoff = useSurveyStore((s) => s.setPanoramaStandoff);
  const setCorridorSideOffset = useSurveyStore((s) => s.setCorridorSideOffset);
  const setCorridorMargin = useSurveyStore((s) => s.setCorridorMargin);
  const startBranchDraw = useSurveyStore((s) => s.startBranchDraw);
  const completeBranch = useSurveyStore((s) => s.completeBranch);
  const clearCorridorBranches = useSurveyStore((s) => s.clearCorridorBranches);
  const drawMode = useSurveyStore((s) => s.drawMode);
  const setMaxTurnAngle = useSurveyStore((s) => s.setMaxTurnAngle);
  const setStripOrder = useSurveyStore((s) => s.setStripOrder);
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

  // Module-supplied generators (e.g. TOPAS) register after their module loads,
  // which is async - subscribe so they appear without a panel remount.
  const generatorsVersion = useSyncExternalStore(subscribeSurveyGenerators, getSurveyGeneratorsVersion);
  const moduleGenerators = useMemo(
    () => listSurveyGenerators().filter((g) => !g.id.startsWith('builtin.')),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- version is the registry's change counter
    [generatorsVersion],
  );
  const activeGenerator = getSurveyGenerator(resolveGeneratorId(config));
  const engineFields: GeneratorConfigField[] = config.generatorId
    ? (activeGenerator?.configFields ?? [])
    : [];
  // Module engines (TOPAS etc.) compute their own line direction and turns;
  // the built-in Grid tuning controls would be dead knobs that still fire a
  // full (possibly remote) recompute, so hide them entirely.
  const externalEngine = !resolveGeneratorId(config).startsWith('builtin.');

  // Airframe awareness for external engines: the only flight characteristic
  // TOPAS models is min turn radius, and its module default (2 m) is a copter
  // number a fixed wing cannot fly. Derive the class the same way the mission
  // store does and prefill/sanity-check the radius.
  const mavType = useConnectionStore((s) => s.connectionState.mavType);
  const qEnable = useParameterStore((s) => {
    const p = s.parameters.get('Q_ENABLE');
    return typeof p?.value === 'number' ? p.value : undefined;
  });
  const sitlFrame = useArduPilotSitlStore((s) => (s.isRunning ? s.model : undefined));
  const vehicleClass = getVehicleClass(mavType, { qEnable, sitlFrame });
  const isFixedWing = vehicleClass === 'plane' || vehicleClass === 'vtol';
  // Follow the connected aircraft until the pilot overrides the toggle. Only
  // when one IS connected: "nothing detected" is not "multirotor", and taking
  // it as such quietly strips the overshoot and racetracks out of a fixed-wing
  // corridor that was already set up for a plane.
  const applyVehicleFlightMode = useSurveyStore((s) => s.applyVehicleFlightMode);
  const flightModeChosen = useSurveyStore((s) => s.flightModeChosen);
  const detectedMode = mavType === undefined ? null : surveyModeForVehicle(vehicleClass);
  useEffect(() => {
    if (detectedMode) applyVehicleFlightMode(detectedMode);
  }, [detectedMode, applyVehicleFlightMode]);
  // The aircraft's own cruise, so the planned turn is the one it can fly and
  // not one derived from a survey speed it would refuse.
  const cruiseAirspeed = useParameterStore((s) => {
    const p = s.parameters.get('AIRSPEED_CRUISE');
    return typeof p?.value === 'number' ? p.value : undefined;
  });
  const applyVehicleCruise = useSurveyStore((s) => s.applyVehicleCruise);
  useEffect(() => {
    if (isFixedWing && cruiseAirspeed && cruiseAirspeed > 0) applyVehicleCruise(cruiseAirspeed);
  }, [isFixedWing, cruiseAirspeed, applyVehicleCruise]);
  const turnRadiusField = engineFields.find(
    (f): f is Extract<GeneratorConfigField, { type: 'number' }> => f.type === 'number' && f.id === 'minTurnRadius',
  );
  // Level-turn radius at a conservative 30° bank: r = v² / (g·tan(bank)).
  const suggestedTurnRadius = Math.max(25, Math.round((config.speed * config.speed) / (9.81 * Math.tan(Math.PI / 6)) / 5) * 5);
  const currentTurnRadius = config.engineParams?.['minTurnRadius'];
  useEffect(() => {
    if (!externalEngine || !turnRadiusField || !isFixedWing) return;
    // Only prefill while the field is untouched (unset or still the module
    // default); a hand-entered radius is the pilot's call.
    const untouched = currentTurnRadius === undefined || currentTurnRadius === turnRadiusField.default;
    if (!untouched) return;
    setEngineParam('minTurnRadius', suggestedTurnRadius);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalEngine, isFixedWing, turnRadiusField, suggestedTurnRadius]);
  const turnRadiusTooTight =
    externalEngine && isFixedWing && typeof currentTurnRadius === 'number' &&
    currentTurnRadius < suggestedTurnRadius * 0.7;
  const smoothedOnCopter =
    externalEngine && vehicleClass === 'copter' && config.engineParams?.['waypointMode'] === 'smoothed';
  const [importError, setImportError] = useState<string | null>(null);
  const [importNote, setImportNote] = useState<string | null>(null);
  // null = not naming; '' or text = inline camera-name entry open. (Electron has
  // no window.prompt, so naming is an inline field.)
  const [cameraNameDraft, setCameraNameDraft] = useState<string | null>(null);

  // Terrain-follow status line: "sampling..." until the async DEM bake lands,
  // then the MSL altitude band the flight will cover.
  const terrainFollowStatus = useMemo(() => {
    if (!config.terrainFollow) return null;
    const alts = result?.altitudes;
    if (!alts || alts.length === 0) return t('survey.terrain-follow.sampling');
    let min = Infinity;
    let max = -Infinity;
    for (const a of alts) {
      if (a < min) min = a;
      if (a > max) max = a;
    }
    return t('survey.terrain-follow.band', { min: Math.round(min), max: Math.round(max) });
  }, [config.terrainFollow, result, t]);

  const simplifyToleranceM = useSettingsStore((s) => s.surveyPerformance.importSimplifyToleranceM);
  const updateSurveyPerformance = useSettingsStore((s) => s.updateSurveyPerformance);
  const goToPerformanceSettings = useCallback(() => {
    useNavigationStore.getState().setView('settings', 'settings-survey-performance');
  }, []);

  const handleImportArea = useCallback(async () => {
    setImportError(null);
    setImportNote(null);
    const res = await importArea();
    if (!res.ok && res.error) setImportError(res.error);
    if (res.ok && res.importedAsCorridor) {
      setImportNote(t('survey.import.corridor-note'));
    }
  }, [importArea, t]);

  // Combined preset list: built-ins first, user-defined below.
  const allPresets: SurveyPresetView[] = [
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
    // Panorama lives outside the area-pattern catalog and works with any real
    // camera - snapping it to 'grid' here would close the subject line into a
    // polygon just because the user picked a camera.
    const currentValid =
      config.pattern === 'panorama' ||
      ALL_PATTERN_OPTIONS.find((o) => o.id === config.pattern)?.modes.includes(mode);
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
    const valid =
      resolvedPattern === 'panorama' ||
      ALL_PATTERN_OPTIONS.find((o) => o.id === resolvedPattern)?.modes.includes(mode);
    if (!valid) setPattern('grid');
    setLastSurveyPresetId(preset.id);
  }, [applyPresetConfig, isManualCamera, config.pattern, setPattern, setLastSurveyPresetId]);

  // Inline preset naming (Electron has no window.prompt); null = closed.
  const [presetNameDraft, setPresetNameDraft] = useState<string | null>(null);

  const handleSavePreset = useCallback((name: string) => {
    if (!name.trim()) return;
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
    setPresetNameDraft(null);
  }, [config, isCustomCamera, isManualCamera, saveSurveyPreset, setLastSurveyPresetId]);

  const handleDeletePreset = useCallback((id: string) => {
    if (!window.confirm(t('survey.preset.confirm-delete'))) return;
    removeSurveyPreset(id);
  }, [removeSurveyPreset, t]);

  const handleInsertSurvey = useCallback(() => {
    if (!result || !polygon) return;
    const fullConfig = { ...config, polygon };
    const firmware = useConnectionStore.getState().connectionState.firmware;
    let items = surveyToMissionItems(result, asOwnFlight(fullConfig), firmware);
    if (items.length === 0) return;

    // If the mission already contains a NAV_TAKEOFF (either auto-prepended
    // when the user dropped their first manual WP, or from an earlier
    // survey), strip the leading NAV_TAKEOFF that surveyToMissionItems
    // always emits. Otherwise we'd end up with two takeoff commands and
    // the flight controller would refuse the mission or behave oddly.
    const isTakeoff = (cmd: number) => cmd === MAV_CMD.NAV_TAKEOFF || cmd === MAV_CMD.NAV_VTOL_TAKEOFF;
    const missionAlreadyHasTakeoff = existingItems.some((it) => isTakeoff(it.command));
    if (missionAlreadyHasTakeoff && items[0] && isTakeoff(items[0].command)) {
      items = items.slice(1).map((it, i) => ({ ...it, seq: i }));
    }

    // Build a SurveyGroup that owns the polygon + generator config + cached
    // result so the survey is editable + regeneratable later (PR 5 + 8).
    // The `generatorResult` carries any generator-specific extras (e.g. TOPAS
    // decomposition); built-in generators leave it null.
    const generatorId = resolveGeneratorId(fullConfig);
    const reg = getSurveyGenerator(generatorId);
    const survey = createSurveyGroup({
      name: t('survey.group.default-name', {
        n: existingGroups.filter((g) => g.kind === 'survey').length + 1,
      }),
      generatorId,
      generatorVersion: reg?.version ?? '1.0.0',
      polygon: polygon.map((p) => ({ lat: p.lat, lng: p.lng })),
      workspace: fullConfig.workspace,
      config: asOwnFlight(fullConfig) as unknown as Record<string, unknown>,
      color: nextGroupColor(existingGroups),
    });
    survey.generatorResult = result.generatorResult ?? null;
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
  }, [result, polygon, config, existingGroups, existingItems, addSurveyGroup, setEditingGroupId, t]);

  // What "Split along the route" will actually produce, so the button and the
  // length box agree with each other before the user commits.
  const corridorSectionCount = useMemo(() => {
    if (!result || !polygon || config.pattern !== 'corridor') return 1;
    const override = config.corridorSectionLengthM ?? 0;
    return override > 0
      ? sectionCountForLength(polygon, override)
      : sectionCountForEndurance(result.waypoints, config.speed, config.enduranceMinutes ?? 20);
  }, [result, polygon, config.pattern, config.corridorSectionLengthM, config.speed, config.enduranceMinutes]);

  // Bends sharp enough to earn a racetrack, so "the slider does nothing" reads
  // as "this line has no hairpin that sharp" instead of as a broken control.
  // Typed section length, so the box can be emptied back to auto.
  const [sectionLengthDraft, setSectionLengthDraft] = useState('');
  useEffect(() => {
    setSectionLengthDraft(
      config.corridorSectionLengthM ? (config.corridorSectionLengthM / 1000).toFixed(1) : '',
    );
  }, [config.corridorSectionLengthM]);

  const hairpinCount = useMemo(
    () => (config.pattern === 'corridor'
      ? countHairpins([polygon, ...(config.corridorBranches ?? [])], config.maxTurnAngle ?? 15)
      : 0),
    [polygon, config.pattern, config.corridorBranches, config.maxTurnAngle],
  );

  // What the chosen order actually does, so the trade is on screen: how many
  // lines it skips, and whether the turn then fits.
  const stripPlan = useMemo(() => {
    if (config.pattern !== 'corridor' || !result) return null;
    const spacing = result.stats.lineSpacing;
    const lines = config.corridorStrips && config.corridorStrips > 0
      ? config.corridorStrips
      : result.stats.lineCount;
    if (!spacing || lines < 2) return null;
    const radius = planTurnRadius({ ...config, polygon: polygon ?? [] });
    const auto = stripFlightOrder(lines, spacing, radius);
    const inOrder = stripFlightOrder(lines, spacing, 0);
    return {
      radius,
      needed: 2 * radius,
      auto,
      inOrder,
      chosen: (config.stripOrder ?? 'auto') === 'sequential' ? inOrder : auto,
      spacing,
    };
  }, [config, polygon, result]);

  const autoSectionLengthM = useMemo(() => {
    if (!polygon || config.pattern !== 'corridor') return 0;
    const auto = result
      ? sectionCountForEndurance(result.waypoints, config.speed, config.enduranceMinutes ?? 20)
      : 1;
    return centrelineLengthM(polygon) / Math.max(1, auto);
  }, [result, polygon, config.pattern, config.speed, config.enduranceMinutes]);

  // Split the survey into one battery-sized flight group per sortie, instead of
  // a single group. Each flight is independently uploadable from the table.
  const handleSplitIntoFlights = useCallback((mode: 'sections' | 'lines' = 'sections') => {
    if (!result || !polygon) return;
    // A corridor's path is line-major, so slicing it by elapsed time hands each
    // flight a few full-length passes over the whole route. Right for a swarm
    // working side by side, wrong for one aircraft that wants this stretch
    // finished before moving down the route.
    const isCorridor = config.pattern === 'corridor';
    const override = config.corridorSectionLengthM ?? 0;
    const sorties = isCorridor && mode === 'sections'
      ? splitCorridorIntoSections(
          result.waypoints,
          polygon,
          override > 0
            ? sectionCountForLength(polygon, override)
            : sectionCountForEndurance(result.waypoints, config.speed, config.enduranceMinutes ?? 20),
        )
      : splitIntoSorties(result.waypoints, config.speed, config.enduranceMinutes ?? 20);
    if (sorties.length <= 1) return;
    const fullConfig = { ...config, polygon };
    const firmware = useConnectionStore.getState().connectionState.firmware;
    const baseName = t('survey.group.default-name', {
      n: existingGroups.filter((g) => g.kind === 'survey').length + 1,
    });
    const sortieLabel = isCorridor && mode === 'sections'
      ? t('survey.split.section')
      : t('survey.split.flight');
    const entries = sorties.map((slice, i) => {
      // Each sortie is its own complete flight: takeoff -> slice -> RTL.
      const items = surveyToMissionItems({ ...result, waypoints: slice }, fullConfig, firmware);
      const group = createManualGroup({
        name: `${baseName} · ${sortieLabel} ${i + 1}/${sorties.length}`,
        color: GROUP_COLOR_PALETTE[i % GROUP_COLOR_PALETTE.length]!,
      });
      return { group: { ...group, separateFlight: true }, items };
    });
    addGroupsWithItems(entries);
    clearSurvey();
    setInsertSuccess(true);
    setTimeout(() => setInsertSuccess(false), 2000);
  }, [result, polygon, config, existingGroups, addGroupsWithItems, clearSurvey, t]);

  // Empty-state copy when no polygon yet — guides the user back to the map.
  if (!polygon) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-6 text-content-secondary bg-surface">
        <svg className="w-10 h-10 mb-3 text-content-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
        </svg>
        <p className="text-sm font-medium mb-1 text-content">{t('survey.empty.title')}</p>
        <p className="text-xs text-content-tertiary max-w-[14rem]">
          {t('survey.empty.body')}
        </p>
        <div className="mt-4 flex flex-col items-center gap-1">
          <span className="text-[10px] uppercase tracking-wide text-content-tertiary">{t('survey.empty.or')}</span>
          <button
            onClick={handleImportArea}
            className="px-3 py-1.5 text-xs rounded-md bg-surface-raised text-content hover:text-purple-300 transition-colors"
            title={t('survey.import.tooltip')}
          >
            {t('survey.import.button')}
          </button>
          <span className="text-[10px] text-content-tertiary">KML · KMZ · GeoJSON · SHP</span>

          {/* Simplify tolerance — applied to imported boundaries. Dense GIS
              rings (thousands of points) are reduced to this tolerance so the
              map stays responsive; 0 disables simplification. */}
          <div className="flex items-center gap-1.5 mt-2 text-[10px] text-content-tertiary">
            <span>{t('survey.import.simplify')}</span>
            <DraftNumberField
              value={simplifyToleranceM}
              onCommit={(n) => updateSurveyPerformance({ importSimplifyToleranceM: n })}
              className="w-12 px-1.5 py-0.5 bg-surface-input border border-border rounded text-content text-[10px] focus:outline-none focus:border-blue-500"
              aria-label={t('survey.import.simplify-tolerance')}
              min={0}
              max={50}
              step={0.5}
            />
            <span>m</span>
            <button
              onClick={goToPerformanceSettings}
              className="ml-1 underline decoration-dotted hover:text-purple-300 transition-colors"
              title={t('survey.performance.open-tooltip')}
            >
              {t('survey.performance.settings')}
            </button>
          </div>
          {importError && <span className="text-[10px] text-red-400 max-w-[14rem]">{importError}</span>}
          {importNote && <span className="text-[10px] text-cyan-400 max-w-[14rem]">{importNote}</span>}
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
          onClick={() => setPresetNameDraft((d) => (d === null ? t('survey.preset.default-name', { n: userPresets.length + 1 }) : null))}
          className={`p-1.5 transition-colors ${presetNameDraft !== null ? 'text-purple-400' : 'text-content-secondary hover:text-purple-400'}`}
          title={t('survey.preset.save-tooltip')}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 4h11l3 3v13H5z M9 4v5h6V4 M9 17h6" />
          </svg>
        </button>
        <button
          onClick={handleImportArea}
          className="p-1.5 text-content-secondary hover:text-purple-400 transition-colors"
          title={t('survey.import.tooltip-short')}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </button>
        <button
          onClick={startDrawing}
          className="p-1.5 text-content-secondary hover:text-purple-400 transition-colors"
          title={t('survey.toolbar.redraw')}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
        <button
          onClick={clearSurvey}
          className="p-1.5 text-content-secondary hover:text-red-400 transition-colors"
          title={t('survey.toolbar.clear')}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
        <button
          onClick={goToPerformanceSettings}
          className="p-1.5 text-content-secondary hover:text-purple-400 transition-colors"
          title={t('survey.performance.tooltip')}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
        {fleetCount >= 2 && (
          <button
            onClick={() => setShowFleetSplit(true)}
            disabled={!polygon}
            className="p-1.5 text-content-secondary hover:text-cyan-400 transition-colors disabled:opacity-40"
            title={t('survey.fleet.split-tooltip')}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16M12 4v16" />
            </svg>
          </button>
        )}
      </div>

      {/* Inline preset naming row (Electron has no window.prompt) */}
      {presetNameDraft !== null && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-subtle bg-surface-raised flex-shrink-0">
          <input
            autoFocus
            value={presetNameDraft}
            onChange={(e) => setPresetNameDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSavePreset(presetNameDraft);
              else if (e.key === 'Escape') setPresetNameDraft(null);
            }}
            placeholder={t('survey.preset.name-placeholder')}
            className="flex-1 min-w-0 bg-surface-input text-content text-xs px-2 py-1 rounded border border-default focus:border-purple-500 focus:outline-none"
          />
          <button
            onClick={() => handleSavePreset(presetNameDraft)}
            disabled={!presetNameDraft.trim()}
            className="px-2 py-1 text-xs rounded bg-purple-600 text-white hover:bg-purple-500 disabled:opacity-40 transition-colors"
          >
            {t('survey.action.save')}
          </button>
          <button
            onClick={() => setPresetNameDraft(null)}
            className="px-2 py-1 text-xs rounded text-content-secondary hover:text-content transition-colors"
          >
            {t('survey.action.cancel')}
          </button>
        </div>
      )}

      {showFleetSplit && <FleetSurveyPanel onClose={() => setShowFleetSplit(false)} />}

      <div className="p-3 space-y-3 overflow-y-auto flex-1 min-h-0">
        {/* Camera Section */}
        {/* Remote engine status - pinned at the top so a failed plan is
            impossible to miss, with an explicit retry. */}
        {generating && (
          <div className="flex items-center gap-2 text-[11px] text-content-secondary">
            <span className="w-3 h-3 rounded-full border-2 border-teal-400/30 border-t-teal-400 animate-spin" />
            {t('survey.generating.coverage-plan')}{activeGenerator ? ` (${activeGenerator.displayName})` : ''}...
          </div>
        )}
        {generatorError && !generating && (
          <div className="px-2.5 py-2 rounded-lg bg-red-500/10 border border-red-500/30 space-y-1.5">
            <p className="text-[11px] text-red-300 leading-snug">{generatorError}</p>
            <button
              onClick={() => requestRecompute({ immediate: true })}
              className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-red-500/20 text-red-200 hover:bg-red-500/30 transition-colors"
            >
              {t('survey.action.retry')}
            </button>
          </div>
        )}
        {!generating && result?.warnings && result.warnings.length > 0 && (
          <div className="px-2.5 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300 leading-snug space-y-1">
            {result.warnings.map((w, i) => (
              <div key={i}>{w}</div>
            ))}
          </div>
        )}

        {/* Panorama is a line-based capture, not an area survey: the pattern
            grid and module coverage engines (TOPAS is polygon-only) don't
            apply, so the whole selector is replaced by a type banner. */}
        {config.pattern === 'panorama' && (
          <Section title={t('survey.section.type')}>
            <div className="px-2 py-1.5 rounded-lg bg-purple-600/15 border border-purple-500/30">
              <span className="text-xs font-medium text-purple-300">{t('survey.panorama.capture-title')}</span>
              <p className="text-[10px] text-content-tertiary leading-snug mt-0.5">
                {t('survey.panorama.type-note')}
              </p>
              <p className="text-[10px] text-content-secondary leading-snug mt-1.5">
                {t('survey.panorama.edit.intro')}{' '}
                <span className="text-content">{t('survey.panorama.edit.click')}</span>{' '}
                {t('survey.panorama.edit.mid')}{' '}
                <span className="text-content">{t('survey.panorama.edit.tangent-arms')}</span>{' '}
                {t('survey.panorama.edit.tail')}
              </p>
            </div>
            {isManualCamera && (
              <p className="mt-1.5 text-[10px] text-amber-500 leading-snug">
                {t('survey.panorama.needs-camera')}
              </p>
            )}
          </Section>
        )}

        {/* Pattern — filtered by mode so the user only sees patterns that
            make sense (mower hides Circular which generates wedge-leaving
            circles regardless of polygon shape; camera mode hides Spiral and
            Perimeter+Fill which are mowing-specific). */}
        {config.pattern !== 'panorama' && (
        <Section title={t('survey.section.pattern')}>
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
                      config.pattern === opt.id && !config.generatorId
                        ? 'bg-purple-600/80 text-white'
                        : 'bg-surface-raised text-content-secondary hover:text-content hover:bg-surface-raised'
                    }`}
                    title={svText(t, opt.descriptionKey, opt.description)}
                  >
                    {svText(t, opt.labelKey, opt.label)}
                  </button>
                ))}
              </div>
            );
          })()}

          {/* Module-supplied engines (registered via host.survey, e.g. TOPAS).
              Mutually exclusive with the built-in patterns above. */}
          {moduleGenerators.length > 0 && (
            <div className="mt-1 grid grid-cols-1 gap-1">
              {moduleGenerators.map((gen) => (
                <button
                  key={gen.id}
                  onClick={() => setGeneratorId(config.generatorId === gen.id ? null : gen.id)}
                  className={`px-2 py-1.5 text-xs rounded-lg text-left transition-colors ${
                    config.generatorId === gen.id
                      ? 'bg-teal-600/80 text-white'
                      : 'bg-surface-raised text-content-secondary hover:text-content'
                  }`}
                  title={gen.description}
                >
                  <span className="flex items-center gap-1.5">
                    {gen.displayName}
                    {gen.capabilities.isRemote && (
                      <span
                        className={`px-1 py-px text-[9px] font-semibold uppercase tracking-wide rounded border ${
                          config.generatorId === gen.id
                            ? 'bg-white/15 text-white border-white/40'
                            : 'bg-teal-500/20 text-teal-300 border-teal-500/30'
                        }`}
                      >
                        {t('survey.generator.remote')}
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Spiral direction sub-control — only when spiral pattern is active. */}
          {config.pattern === 'spiral' && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-content-secondary w-14 flex-shrink-0">{t('survey.spiral.direction')}</span>
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
                      title={dir === 'inward' ? t('survey.spiral.inward-tooltip') : t('survey.spiral.outward-tooltip')}
                    >
                      {dir === 'inward' ? t('survey.spiral.in') : t('survey.spiral.out')}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Perimeter+Fill passes — only when that pattern is active. */}
          {config.pattern === 'perimeter-fill' && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-content-secondary w-14 flex-shrink-0">{t('survey.perimeter.passes')}</span>
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
                label={t('survey.crosshatch.second-alt')}
                value={config.crossGridAltitudeOffset ?? 0}
                onChange={setCrossGridAltitudeOffset}
                min={0}
                max={100}
                step={5}
                unit="%"
              />
              <p className="mt-1 text-[10px] text-content-tertiary leading-snug">
                {(config.crossGridAltitudeOffset ?? 0) > 0
                  ? t('survey.crosshatch.offset-note', {
                      alt: formatAltitudeFromMeters(config.altitude * (1 + (config.crossGridAltitudeOffset ?? 0) / 100), altitudeUnit),
                      pct: config.crossGridAltitudeOffset,
                    })
                  : t('survey.crosshatch.same-alt-note')}
              </p>
            </div>
          )}
        </Section>
        )}

        {/* Engine parameters - declared by the active module generator via
            its configFields schema. Only shown while that engine is selected. */}
        {engineFields.length > 0 && (
          <Section title={t('survey.section.engine-parameters')}>
            <div className="space-y-2">
              {engineFields.map((field) => (
                <EngineParamControl
                  key={field.id}
                  field={field}
                  value={config.engineParams?.[field.id]}
                  onChange={(v) => setEngineParam(field.id, v)}
                />
              ))}
              {turnRadiusTooTight && (
                <p className="text-[10px] text-amber-500 leading-snug">
                  {t('survey.turn-radius.too-tight', {
                    radius: String(currentTurnRadius),
                    speed: config.speed,
                    needed: suggestedTurnRadius,
                  })}
                </p>
              )}
              {smoothedOnCopter && (
                <p className="text-[10px] text-content-tertiary leading-snug">
                  {t('survey.engine.smoothed-copter-note')}
                </p>
              )}
            </div>
          </Section>
        )}

        <Section title={isManualCamera ? t('survey.section.corridor') : t('survey.section.camera')}>
          <CameraPresetSelector value={config.camera} onChange={handleCameraChange} />
          {isCustomCamera && (
            <div className="grid grid-cols-2 gap-2 mt-2">
              <NumberInput label={t('survey.camera.sensor-width')} value={customCamera.sensorWidth} onChange={(v) => handleCustomField('sensorWidth', v)} min={1} max={100} step={0.1} />
              <NumberInput label={t('survey.camera.sensor-height')} value={customCamera.sensorHeight} onChange={(v) => handleCustomField('sensorHeight', v)} min={1} max={100} step={0.1} />
              <NumberInput label={t('survey.camera.image-width')} value={customCamera.imageWidth} onChange={(v) => handleCustomField('imageWidth', v)} min={100} max={20000} step={1} />
              <NumberInput label={t('survey.camera.image-height')} value={customCamera.imageHeight} onChange={(v) => handleCustomField('imageHeight', v)} min={100} max={20000} step={1} />
              <NumberInput label={t('survey.camera.focal-length')} value={customCamera.focalLength} onChange={(v) => handleCustomField('focalLength', v)} min={1} max={200} step={0.1} />
            </div>
          )}
          {isCustomCamera && (
            cameraNameDraft === null ? (
              <button
                onClick={() => setCameraNameDraft('')}
                className="mt-2 w-full py-1.5 text-xs rounded-md bg-surface-raised text-content hover:text-purple-300 transition-colors"
                title={t('survey.camera.save-tooltip')}
              >
                {t('survey.camera.save-button')}
              </button>
            ) : (
              <div className="mt-2 flex items-center gap-1.5">
                <input
                  autoFocus
                  value={cameraNameDraft}
                  onChange={(e) => setCameraNameDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') commitCameraName(); if (e.key === 'Escape') setCameraNameDraft(null); }}
                  placeholder={t('survey.camera.name-placeholder')}
                  className="flex-1 px-2 py-1 text-xs bg-surface-input border border-subtle rounded text-content placeholder-content-tertiary focus:border-purple-500 focus:outline-none"
                />
                <button
                  onClick={commitCameraName}
                  disabled={!cameraNameDraft.trim()}
                  className="px-2.5 py-1 text-xs rounded bg-purple-600 text-white hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {t('survey.action.save')}
                </button>
                <button
                  onClick={() => setCameraNameDraft(null)}
                  className="px-2 py-1 text-xs rounded bg-surface-raised text-content hover:text-content transition-colors"
                >
                  {t('survey.action.cancel')}
                </button>
              </div>
            )
          )}
          {isManualCamera && (
            <div className="mt-2">
              <NumberInput
                label={t('survey.camera.corridor-width')}
                value={customCamera.manualCorridorWidth ?? 1.5}
                onChange={handleManualCorridorChange}
                min={0.1}
                max={500}
                step={0.1}
              />
              <p className="mt-1 text-[10px] text-content-tertiary leading-snug">
                {t('survey.camera.corridor-width-note')}
              </p>
            </div>
          )}
        </Section>

        {/* Movement (or Flight) — always visible. Altitude only for camera modes. */}
        <Section title={isManualCamera ? t('survey.section.movement') : t('survey.section.flight')}>
          <div className="space-y-2">
            {!isManualCamera && (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-content-secondary w-14 flex-shrink-0">{t('survey.plan.plan-by')}</span>
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
                        title={mode === 'gsd' ? t('survey.plan.gsd-tooltip') : t('survey.plan.altitude-tooltip')}
                      >
                        {mode === 'gsd' ? 'GSD' : t('survey.plan.altitude')}
                      </button>
                    ))}
                  </div>
                </div>
                {(config.planBy ?? 'altitude') === 'gsd' ? (
                  <>
                    <SliderInput
                      label={t('survey.plan.target-gsd')}
                      value={result ? Number(result.stats.gsd.toFixed(1)) : 0}
                      onChange={setGsd}
                      min={0.5}
                      max={20}
                      step={0.1}
                      unit="cm/px"
                    />
                    <p className="text-[10px] text-content-tertiary leading-snug">
                      {t('survey.plan.derived-altitude', {
                        alt: formatAltitudeFromMeters(config.altitude, altitudeUnit),
                      })}
                    </p>
                  </>
                ) : (
                  <AltitudeSliderInput label={t('survey.plan.altitude')} valueMeters={config.altitude} onChangeMeters={setAltitude} minMeters={1} maxMeters={500} stepMeters={1} />
                )}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-content-secondary w-14 flex-shrink-0">{t('survey.plan.alt-ref')}</span>
                  <div className="flex gap-1 flex-1">
                    {altRefOptions.map(opt => (
                      <button
                        key={opt.id}
                        onClick={() => setAltitudeReference(opt.id)}
                        className={`flex-1 px-1.5 py-1 text-[10px] rounded-md transition-colors ${
                          config.altitudeReference === opt.id
                            ? 'bg-purple-600/80 text-white'
                            : 'bg-surface-raised text-content-secondary hover:text-content hover:bg-surface-raised'
                        }`}
                        title={svText(t, opt.descriptionKey, opt.description)}
                      >
                        {svText(t, opt.labelKey, opt.label)}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!config.terrainFollow}
                    onChange={(e) => setTerrainFollow(e.target.checked)}
                    className="mt-0.5 w-3.5 h-3.5 rounded border-subtle bg-surface-input accent-purple-600 cursor-pointer"
                  />
                  <span className="text-[11px] text-content-secondary leading-snug">
                    <span className="text-content">{t('survey.terrain-follow.label')}</span>{' '}
                    {t('survey.terrain-follow.note', {
                      alt: formatAltitudeFromMeters(config.altitude, altitudeUnit),
                    })}
                    {terrainFollowStatus && (
                      <span className="text-purple-300"> {terrainFollowStatus}</span>
                    )}
                  </span>
                </label>
              </>
            )}
            <SpeedSliderInput label={t('survey.plan.speed')} valueMps={config.speed} onChangeMps={setSpeed} minMps={1} maxMps={30} />
            <SliderInput
              label={t('survey.plan.endurance')}
              value={config.enduranceMinutes ?? 20}
              onChange={setEnduranceMinutes}
              min={5}
              max={90}
              step={1}
              unit="min"
            />
            <p className="text-[10px] text-content-tertiary leading-snug -mt-1">
              {t('survey.plan.endurance-note')}
            </p>

          </div>
        </Section>

        {/* Panorama: the drawn line is the SUBJECT; the flight path is derived
            to one side of it with the camera yawed onto the subject. */}
        {config.pattern === 'panorama' && (
          <Section title={t('survey.section.panorama')}>
            <div className="space-y-2">
              <p className="text-[10px] text-content-tertiary leading-snug">
                {t('survey.panorama.plan-note')}
              </p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-content-secondary w-14 flex-shrink-0">{t('survey.panorama.fly-on')}</span>
                <div className="flex gap-1 flex-1">
                  {(['left', 'right'] as const).map((side) => (
                    <button
                      key={side}
                      onClick={() => setPanoramaSide(side)}
                      className={`flex-1 px-2 py-1 text-[11px] rounded-md transition-colors ${
                        (config.panoramaSide ?? 'right') === side
                          ? 'bg-purple-600/80 text-white'
                          : 'bg-surface-raised text-content-secondary hover:text-content'
                      }`}
                      title={t('survey.panorama.side-tooltip', {
                        side: side === 'left' ? t('survey.panorama.side.left') : t('survey.panorama.side.right'),
                      })}
                    >
                      {side === 'left' ? t('survey.panorama.left-side') : t('survey.panorama.right-side')}
                    </button>
                  ))}
                </div>
              </div>
              <SliderInput label={t('survey.panorama.standoff')} value={config.panoramaStandoff ?? 30} onChange={setPanoramaStandoff} min={2} max={500} step={1} unit="m" />
              <p className="text-[10px] text-content-tertiary leading-snug -mt-1">
                {t('survey.panorama.standoff-note')}
              </p>
              <p className="text-[10px] text-content-tertiary leading-snug">
                {t('survey.panorama.yaw-note')}
              </p>
              <p className="text-[10px] text-amber-500 leading-snug">
                {t('survey.panorama.copter-yaw-note')}
              </p>
            </div>
          </Section>
        )}

        {/* Corridor settings — only when the corridor pattern is active. The
            drawn polygon is treated as a centerline, not an area. */}
        {config.pattern === 'corridor' && (
          <Section title={t('survey.section.corridor')}>
            <div className="space-y-2">
              {!isManualCamera && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-content-secondary w-14 flex-shrink-0">{t('survey.corridor.mode')}</span>
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
                          title={svText(t, opt.descriptionKey, opt.description)}
                        >
                          {svText(t, opt.labelKey, opt.label)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {!isManualCamera && (
                <p className="text-[10px] text-content-tertiary leading-snug -mt-1 pl-16">
                  {vehiclePlanningNote(mavType === undefined ? undefined : vehicleClass)}
                  {flightModeChosen && ` · ${t('survey.corridor.set-by-hand')}`}
                </p>
              )}

              <SliderInput
                label={t('survey.corridor.width')}
                value={config.corridorWidth ?? 60}
                onChange={setCorridorWidth}
                min={5}
                max={500}
                step={5}
                unit="m"
              />

              <SliderInput
                label={t('survey.corridor.margin')}
                value={config.corridorMargin ?? 0}
                onChange={setCorridorMargin}
                min={0}
                max={200}
                step={5}
                unit="m"
              />

              <div className="flex items-center gap-2">
                <span className="text-xs text-content-secondary w-14 flex-shrink-0">{t('survey.corridor.strips')}</span>
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
                  {(config.corridorStrips ?? 0) === 0
                    ? (result ? t('survey.corridor.auto-count', { n: result.stats.lineCount }) : t('survey.common.auto'))
                    : config.corridorStrips}
                </span>
              </div>

              <SliderInput
                label={t('survey.corridor.side-off')}
                value={config.corridorSideOffset ?? 0}
                onChange={setCorridorSideOffset}
                min={-200}
                max={200}
                step={5}
                unit="m"
              />

              {/* Branches: extra centerlines that fork off the corridor (forked
                  roads, power-line spurs). Each is flown as its own strip set. */}
              <div className="flex items-center gap-2 pt-1">
                <span className="text-xs text-content-secondary w-14 flex-shrink-0">{t('survey.corridor.branches')}</span>
                {drawMode === 'branch' ? (
                  <button
                    onClick={() => completeBranch()}
                    className="flex-1 px-2 py-1 text-[11px] rounded-md bg-purple-600/80 text-white hover:bg-purple-600 transition-colors"
                  >
                    {t('survey.corridor.branch-drawing')}
                  </button>
                ) : (
                  <button
                    onClick={() => startBranchDraw()}
                    className="flex-1 px-2 py-1 text-[11px] rounded-md bg-surface-raised text-content-secondary hover:text-content transition-colors"
                    title={t('survey.corridor.add-branch-tooltip')}
                  >
                    {t('survey.corridor.add-branch')}
                  </button>
                )}
                {(config.corridorBranches?.length ?? 0) > 0 && (
                  <button
                    onClick={() => clearCorridorBranches()}
                    className="px-2 py-1 text-[11px] rounded-md bg-surface-raised text-content-secondary hover:text-content transition-colors tabular-nums"
                    title={t('survey.corridor.clear-branches-tooltip')}
                  >
                    {t('survey.corridor.clear-branches', { n: config.corridorBranches!.length })}
                  </button>
                )}
              </div>

              {!isManualCamera && (config.corridorMode ?? 'plane') === 'plane' && (
                <>
                  <SliderInput label={t('survey.grid.overshoot')} value={config.overshoot} onChange={setOvershoot} min={0} max={150} step={5} unit="m" />
                  <p className="text-[10px] text-content-tertiary leading-snug -mt-1">
                    {t('survey.corridor.overshoot-note')}
                  </p>
                  <SliderInput label={t('survey.grid.lead-in')} value={config.leadIn ?? 0} onChange={setLeadIn} min={0} max={300} step={10} unit="m" />
                  <p className="text-[10px] text-content-tertiary leading-snug -mt-1">
                    {t('survey.corridor.lead-in-note')}
                  </p>
                  <SliderInput
                    label={t('survey.corridor.max-turn')}
                    value={config.maxTurnAngle ?? 15}
                    onChange={setMaxTurnAngle}
                    min={5}
                    max={90}
                    step={5}
                    unit="°"
                  />
                  <p className="text-[10px] text-content-tertiary leading-snug -mt-1">
                    {t('survey.corridor.max-turn-note')}{' '}
                    {hairpinCount === 0
                      ? t('survey.corridor.no-sharp-bend')
                      : t('survey.corridor.bends-qualify', { n: hairpinCount })}
                  </p>
                  {(config.maxTurnAngle ?? 15) < TURN_LOOP_MIN_DEG && hairpinCount > 0 && (
                    <p className="text-[10px] text-amber-400/90 leading-snug -mt-1">
                      {t('survey.corridor.turn-loop-note', {
                        min: TURN_LOOP_MIN_DEG,
                        corner: config.maxTurnAngle ?? 15,
                        turn: Math.round(180 - (config.maxTurnAngle ?? 15) / 2),
                      })}
                    </p>
                  )}
                </>
              )}

              <div className="flex items-center gap-2 pt-1">
                <span className="text-xs text-content-secondary w-14 flex-shrink-0">{t('survey.corridor.line-order')}</span>
                <div className="flex gap-1 flex-1">
                  {([
                    ['auto', 'Skip', 'survey.corridor.order.skip'],
                    ['sequential', 'In order', 'survey.corridor.order.in-order'],
                  ] as const).map(([id, label, labelKey]) => (
                    <button
                      key={id}
                      onClick={() => setStripOrder(id)}
                      className={`flex-1 px-1.5 py-1 text-[10px] rounded-md transition-colors ${
                        (config.stripOrder ?? 'auto') === id
                          ? 'bg-purple-600/80 text-white'
                          : 'bg-surface-raised text-content-secondary hover:text-content'
                      }`}
                      title={id === 'auto'
                        ? t('survey.corridor.order.skip-tooltip')
                        : t('survey.corridor.order.in-order-tooltip')}
                    >
                      {svText(t, labelKey, label)}
                    </button>
                  ))}
                </div>
              </div>
              {stripPlan && (
                <p className="text-[10px] text-content-tertiary leading-snug -mt-1">
                  {stripPlan.chosen.order.slice(0, 6).map((i) => i + 1).join(', ')}
                  {stripPlan.chosen.order.length > 6 ? ' ...' : ''}
                  {' · '}
                  {t('survey.corridor.turn-plan', {
                    got: Math.round(stripPlan.chosen.tightestTurnM),
                    needed: Math.round(stripPlan.needed),
                    radius: Math.round(stripPlan.radius),
                  })}
                  {!stripPlan.chosen.turnsFit && (
                    <span className="text-amber-400/90">
                      {' '}{t('survey.corridor.turn-plan-warning')}
                    </span>
                  )}
                </p>
              )}

              <div className="flex gap-1 pt-1">
                <button
                  onClick={() => setFlipLegs(!config.flipLegs)}
                  className={`flex-1 px-2 py-1.5 text-[11px] rounded-md transition-colors ${
                    config.flipLegs
                      ? 'bg-purple-600/80 text-white'
                      : 'bg-surface-raised text-content-secondary hover:text-content'
                  }`}
                  title={t('survey.corridor.flip-legs-tooltip')}
                >
                  {t('survey.grid.flip-legs')}
                </button>
                <button
                  onClick={() => setInvertPath(!config.invertPath)}
                  className={`flex-1 px-2 py-1.5 text-[11px] rounded-md transition-colors ${
                    config.invertPath
                      ? 'bg-purple-600/80 text-white'
                      : 'bg-surface-raised text-content-secondary hover:text-content'
                  }`}
                  title={t('survey.corridor.invert-path-tooltip')}
                >
                  {t('survey.grid.invert-path')}
                </button>
              </div>

              <p className="text-[10px] text-content-tertiary leading-snug">
                {t('survey.corridor.draw-note')}
              </p>
            </div>
          </Section>
        )}

        {/* Ground path — manual / mower mode only. Picks how the rover moves
            between lines: zigzag (skid-steer) vs reverse (Ackermann). */}
        {isManualCamera && (
          <Section title={t('survey.section.path')}>
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
                    title={svText(t, opt.descriptionKey, opt.description)}
                  >
                    {svText(t, opt.labelKey, opt.label)}
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-[10px] text-content-tertiary leading-snug">
              {(config.groundPattern ?? 'boustrophedon') === 'reverse-alternating'
                ? t('survey.ground.reverse-note')
                : t('survey.ground.zigzag-note')}
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
            title={t('survey.advanced.tooltip')}
          >
            <span>{t('survey.advanced.title')}</span>
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
                <Section title={t('survey.section.overlap')}>
                  <div className="space-y-2">
                    <SliderInput label={t('survey.overlap.front')} value={config.frontOverlap} onChange={setFrontOverlap} min={10} max={95} step={1} unit="%" />
                    <SliderInput label={t('survey.overlap.side')} value={config.sideOverlap} onChange={setSideOverlap} min={10} max={99} step={1} unit="%" />
                  </div>
                </Section>
              )}

              {externalEngine && config.pattern !== 'circular' && config.pattern !== 'corridor' && (
                <Section title={t('survey.section.grid')}>
                  <div className="space-y-2">
                    <SliderInput label={t('survey.grid.margin')} value={config.margin ?? 0} onChange={setMargin} min={-50} max={50} step={1} unit="m" />
                    <p className="text-[10px] text-content-tertiary leading-snug -mt-1">
                      {t('survey.grid.engine-margin-note')}
                    </p>
                    <p className="text-[10px] text-content-tertiary leading-snug">
                      {t('survey.grid.external-engine-note', {
                        engine: activeGenerator?.displayName ?? t('survey.grid.the-engine'),
                      })}
                    </p>
                  </div>
                </Section>
              )}

              {!externalEngine && config.pattern !== 'circular' && config.pattern !== 'corridor' && (
                <Section title={t('survey.section.grid')}>
                  <div className="space-y-2">
                    <SliderInput label={t('survey.grid.angle')} value={config.gridAngle} onChange={setGridAngle} min={0} max={359} step={1} unit="°" />
                    {!isManualCamera && (
                      <>
                        <SliderInput label={t('survey.grid.overshoot')} value={config.overshoot} onChange={setOvershoot} min={0} max={100} step={5} unit="m" />
                        <SliderInput label={t('survey.grid.lead-in')} value={config.leadIn ?? 0} onChange={setLeadIn} min={0} max={300} step={10} unit="m" />
                      </>
                    )}
                    <SliderInput label={t('survey.grid.margin')} value={config.margin ?? 0} onChange={setMargin} min={-50} max={50} step={1} unit="m" />
                    <p className="text-[10px] text-content-tertiary leading-snug -mt-1">
                      {t('survey.grid.margin-note')}
                    </p>
                    {!isManualCamera && (
                      <div className="flex items-center gap-2 pt-1">
                        <span className="text-xs text-content-secondary w-14 flex-shrink-0">{t('survey.grid.turns')}</span>
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
                                ? t('survey.grid.turns-plane-tooltip')
                                : t('survey.grid.turns-copter-tooltip')}
                            >
                              {mode === 'plane' ? t('survey.mode.plane') : t('survey.mode.copter')}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-xs text-content-secondary w-14 flex-shrink-0">{t('survey.grid.start')}</span>
                      <div className="flex gap-1 flex-1">
                        <button
                          onClick={() => setInvertPath(!config.invertPath)}
                          className={`flex-1 px-1.5 py-1 text-[10px] rounded-md transition-colors ${
                            config.invertPath
                              ? 'bg-purple-600/80 text-white'
                              : 'bg-surface-raised text-content-secondary hover:text-content'
                          }`}
                          title={t('survey.grid.invert-path-tooltip')}
                        >
                          {t('survey.grid.invert-path')}
                        </button>
                        <button
                          onClick={() => setFlipLegs(!config.flipLegs)}
                          className={`flex-1 px-1.5 py-1 text-[10px] rounded-md transition-colors ${
                            config.flipLegs
                              ? 'bg-purple-600/80 text-white'
                              : 'bg-surface-raised text-content-secondary hover:text-content'
                          }`}
                          title={t('survey.grid.flip-legs-tooltip')}
                        >
                          {t('survey.grid.flip-legs')}
                        </button>
                      </div>
                    </div>
                    <p className="text-[10px] text-content-tertiary leading-snug -mt-1">
                      {t('survey.grid.start-note')}
                    </p>
                  </div>
                </Section>
              )}

              {!externalEngine && !isManualCamera && (config.pattern === 'grid' || config.pattern === 'crosshatch') && (
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs text-content-secondary" title={t('survey.advanced.camera-off-tooltip')}>{t('survey.advanced.camera-off')}</span>
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
                  <span className="text-xs text-content-secondary">{t('survey.advanced.show-footprints')}</span>
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
          {sourceBehind && source && (
            <div className="mb-1.5 flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1.5">
              <span className="flex-1 text-[11px] text-amber-300 leading-snug">
                {t('survey.source.stale', {
                  name: source.name,
                  latest: latestRevision,
                  built: source.revision,
                })}
              </span>
              <button
                onClick={() => void reloadSavedArea()}
                className="px-2 py-1 rounded-md text-[11px] font-medium bg-amber-500/20 text-amber-200 hover:bg-amber-500/30 transition-colors"
              >
                {t('survey.action.reload')}
              </button>
            </div>
          )}
          {editingGroupId ? (
            polygonEditMode ? (
              <div className="space-y-1.5">
                <div className="text-[11px] text-center text-amber-300">
                  {t('survey.edit-polygon.note')}
                  {pendingRecompute ? ` ${t('survey.edit-polygon.pending')}` : ''}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => exitPolygonEdit(true)}
                    className="flex-1 py-2 rounded-lg text-sm font-medium bg-purple-600 hover:bg-purple-500 text-white transition-colors"
                    title={t('survey.edit-polygon.done-tooltip')}
                  >
                    {pendingRecompute ? t('survey.edit-polygon.done-recompute') : t('survey.action.done')}
                  </button>
                  <button
                    onClick={() => exitPolygonEdit(false)}
                    className="px-3 py-2 rounded-lg text-sm font-medium bg-surface-raised text-content hover:text-white hover:bg-surface-input transition-colors"
                    title={t('survey.edit-polygon.cancel-tooltip')}
                  >
                    {t('survey.action.cancel')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={enterPolygonEdit}
                  disabled={geometryLocked}
                  className={
                    'flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ' +
                    (geometryLocked
                      ? 'bg-surface-raised text-content-tertiary border-subtle cursor-not-allowed'
                      : 'bg-surface-raised text-content hover:text-purple-300 border-purple-500/30')
                  }
                  title={geometryLocked
                    ? t('survey.edit-polygon.locked-tooltip')
                    : t('survey.edit-polygon.edit-tooltip')}
                >
                  {t('survey.edit-polygon.edit')}
                </button>
                <button
                  onClick={() => setGeometryLocked(!geometryLocked)}
                  data-tip={geometryLocked
                    ? t('survey.edit-polygon.unlock-tip')
                    : t('survey.edit-polygon.lock-tip')}
                  className={
                    'px-3 py-2 rounded-lg transition-colors ' +
                    (geometryLocked
                      ? 'bg-amber-500/15 text-amber-500 border border-amber-500/40'
                      : 'bg-surface-raised text-content-secondary hover:text-content hover:bg-surface-input border border-transparent')
                  }
                >
                  {geometryLocked ? <Lock className="w-4 h-4" /> : <LockOpen className="w-4 h-4" />}
                </button>
                {libraryEnabled && <button
                  onClick={handleSaveArea}
                  disabled={areaSaveState === 'saving'}
                  data-tip={areaSaveState === 'error'
                    ? t('survey.save-area.error-tip')
                    : t('survey.save-area.save-tip')}
                  className={
                    'px-3 py-2 rounded-lg transition-colors border ' +
                    (areaSaveState === 'saved'
                      ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/40'
                      : areaSaveState === 'error'
                        ? 'bg-red-500/15 text-red-400 border-red-500/40'
                        : 'bg-surface-raised text-content-secondary hover:text-content hover:bg-surface-input border-transparent')
                  }
                >
                  <Save className="w-4 h-4" />
                </button>}
                <button
                  onClick={deactivateSurvey}
                  className="px-3 py-2 rounded-lg text-sm font-medium bg-surface-raised text-content hover:text-white hover:bg-surface-input transition-colors"
                  title={t('survey.finish-editing-tooltip')}
                >
                  {t('survey.action.close')}
                </button>
              </div>
            )
          ) : (
            <div className="space-y-1.5">
              <button
                onClick={handleInsertSurvey}
                disabled={generating}
                className={`w-full py-2 rounded-lg text-sm font-medium transition-colors ${
                  insertSuccess
                    ? 'bg-emerald-600 text-white'
                    : generating
                      ? 'bg-purple-600/40 text-white/60 cursor-wait'
                      : 'bg-purple-600 hover:bg-purple-500 text-white'
                }`}
              >
                {insertSuccess
                  ? t('survey.insert.inserted', { n: result.waypoints.length })
                  : generating
                    ? t('survey.insert.computing')
                    : t('survey.insert.button', { n: result.waypoints.length })}
              </button>
              {!isManualCamera && estimateBatteryCount(result.stats.flightTime, config.enduranceMinutes ?? 20) > 1 && (
                config.pattern === 'corridor' ? (
                  <div className="space-y-1">
                    <button
                      onClick={() => handleSplitIntoFlights('sections')}
                      className="w-full py-1.5 rounded-lg text-xs font-medium bg-surface-raised text-content hover:text-purple-300 transition-colors"
                      title={t('survey.split.route-tooltip')}
                    >
                      {t('survey.split.route', { n: corridorSectionCount })}
                    </button>
                    <div className="flex items-center gap-2 px-0.5">
                      <label className="text-[10px] text-content-tertiary whitespace-nowrap">{t('survey.split.section-length')}</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={sectionLengthDraft}
                        placeholder={(autoSectionLengthM / 1000).toFixed(1)}
                        onChange={(e) => setSectionLengthDraft(e.target.value)}
                        onBlur={() => {
                          const km = Number(sectionLengthDraft.replace(',', '.'));
                          // Empty means auto, which is the whole point of being
                          // able to clear it.
                          setCorridorSectionLength(
                            sectionLengthDraft.trim() !== '' && Number.isFinite(km) && km > 0 ? km * 1000 : null,
                          );
                        }}
                        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                        className="w-16 rounded bg-surface-input px-1.5 py-0.5 text-right text-[11px] text-content"
                      />
                      <span className="text-[10px] text-content-tertiary">km</span>
                      {config.corridorSectionLengthM ? (
                        <button
                          onClick={() => setCorridorSectionLength(null)}
                          className="ml-auto text-[10px] text-content-tertiary hover:text-content"
                        >
                          {t('survey.common.auto')}
                        </button>
                      ) : (
                        <span className="ml-auto text-[10px] text-content-tertiary">{t('survey.split.from-endurance')}</span>
                      )}
                    </div>
                    <button
                      onClick={() => handleSplitIntoFlights('lines')}
                      className="w-full py-1.5 rounded-lg text-xs font-medium bg-surface-raised text-content-secondary hover:text-purple-300 transition-colors"
                      title={t('survey.split.lines-tooltip')}
                    >
                      {t('survey.split.by-lines')}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => handleSplitIntoFlights()}
                    className="w-full py-1.5 rounded-lg text-xs font-medium bg-surface-raised text-content hover:text-purple-300 transition-colors"
                    title={t('survey.split.flights-tooltip')}
                  >
                    {t('survey.split.into-flights', {
                      n: estimateBatteryCount(result.stats.flightTime, config.enduranceMinutes ?? 20),
                    })}
                  </button>
                )
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- Sub-components ---

/**
 * Render one declarative engine parameter (module generator configFields).
 * Number fields reuse the SliderInput look; booleans and selects match the
 * panel's existing control styling.
 */
function EngineParamControl({
  field,
  value,
  onChange,
}: {
  field: GeneratorConfigField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (field.type === 'number') {
    const current = typeof value === 'number' ? value : field.default;
    return (
      <div>
        <SliderInput
          label={field.label}
          value={current}
          onChange={onChange}
          min={field.min ?? 0}
          max={field.max ?? Math.max(field.default * 10, 1)}
          step={field.step ?? 1}
          unit={field.unit ?? ''}
        />
        {field.description && (
          <p className="text-[10px] text-content-tertiary leading-snug mt-0.5">{field.description}</p>
        )}
      </div>
    );
  }
  if (field.type === 'boolean') {
    const current = typeof value === 'boolean' ? value : field.default;
    return (
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={current}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 w-3.5 h-3.5 rounded border-subtle bg-surface-input accent-teal-600 cursor-pointer"
        />
        <span className="text-[11px] text-content-secondary leading-snug">
          <span className="text-content">{field.label}</span>
          {field.description ? ` - ${field.description}` : ''}
        </span>
      </label>
    );
  }
  const current = typeof value === 'string' ? value : field.default;
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-content-secondary w-20 flex-shrink-0" title={field.description}>
        {field.label}
      </span>
      <div className="flex gap-1 flex-1">
        {field.options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`flex-1 px-2 py-1 text-[11px] rounded-md transition-colors ${
              current === opt.value
                ? 'bg-teal-600/80 text-white'
                : 'bg-surface-raised text-content-secondary hover:text-content'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-medium text-content-secondary uppercase tracking-wider mb-1.5">{title}</div>
      {children}
    </div>
  );
}

/** One look for every number box in this panel. */
const NUMBER_FIELD_CLASS =
  'w-10 px-1 py-0.5 text-xs text-right tabular-nums font-medium bg-surface-input border border-subtle rounded text-content focus:outline-none focus:border-purple-500';

function SliderInput({
  label, value, onChange, min, max, step, unit,
}: {
  label: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step: number; unit: string;
}) {
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
        <DraftNumberField
          value={value}
          onCommit={onChange}
          min={min}
          max={max}
          step={step}
          aria-label={label}
          className={NUMBER_FIELD_CLASS}
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
        <DraftNumberField
          value={roundedDisplayValue}
          onCommit={commitDisplay}
          aria-label={label}
          className={NUMBER_FIELD_CLASS}
          min={min}
          max={max}
          step={step}
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
        <DraftNumberField
          value={roundedDisplayValue}
          onCommit={commitDisplay}
          aria-label={label}
          className={NUMBER_FIELD_CLASS}
          min={min}
          max={max}
          step={step}
        />
        <span className="text-[10px] text-content-tertiary w-5">{unit}</span>
      </div>
    </div>
  );
}

// Keeps a string draft while focused so partial input (typing "4" on the way
// to "4000" in a min-100 field) never snaps back mid-keystroke. Clamps and
// commits on blur/Enter, Escape reverts.
function NumberInput({
  label, value, onChange, min, max, step,
}: {
  label: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step: number;
}) {
  const [draft, setDraft] = useState(() => String(value));
  const [focused, setFocused] = useState(false);
  const skipBlurCommitRef = useRef(false);

  useEffect(() => {
    if (!focused) setDraft(String(value));
  }, [value, focused]);

  return (
    <div>
      <label className="text-[10px] text-content-secondary">{label}</label>
      <input
        type="number"
        value={draft}
        onFocus={() => setFocused(true)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setFocused(false);
          if (skipBlurCommitRef.current) {
            skipBlurCommitRef.current = false;
            setDraft(String(value));
            return;
          }
          const parsed = Number(draft);
          if (draft.trim() === '' || !Number.isFinite(parsed)) {
            setDraft(String(value));
            return;
          }
          const clamped = Math.min(max, Math.max(min, parsed));
          setDraft(String(clamped));
          if (clamped !== value) onChange(clamped);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.currentTarget.blur();
          } else if (e.key === 'Escape') {
            skipBlurCommitRef.current = true;
            e.currentTarget.blur();
          }
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
  presets: SurveyPresetView[];
  selectedId: string | null;
  onSelect: (preset: SurveyPreset) => void;
  onDelete: (id: string) => void;
}) {
  const { t } = useTranslation('views');
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
        title={t('survey.preset.pick-tooltip')}
      >
        <span className="truncate">
          {selected ? selected.name : t('survey.preset.pick-template')}
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
                    {tag === 'Custom'
                      ? t('survey.preset.group.saved')
                      : tag === 'Flying'
                        ? t('survey.preset.group.flying')
                        : t('survey.preset.group.ground')}
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
                        <div className="text-[10px] text-content-tertiary leading-snug mt-0.5">{svText(t, p.descriptionKey, p.description)}</div>
                      </button>
                      {p.isUserDefined && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onDelete(p.id); }}
                          className="opacity-0 group-hover:opacity-100 px-2 text-content-tertiary hover:text-red-400 transition-opacity"
                          title={t('survey.preset.delete-tooltip')}
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
