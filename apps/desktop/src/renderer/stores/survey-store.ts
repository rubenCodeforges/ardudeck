import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { LatLng, SurveyConfig, SurveyResult, SurveyPattern, AltitudeReference, GroundPattern, CorridorMode } from '../components/survey/survey-types';
import { DEFAULT_SURVEY_CONFIG } from '../components/survey/survey-types';
import type { CameraPreset } from '../components/survey/survey-types';
// Importing the generators barrel triggers self-registration of every
// built-in generator against the registry. Survey-store then dispatches
// via `getSurveyGenerator(id)` instead of a hardcoded switch.
import '../components/survey/generators';
import { getSurveyGenerator, patternToGeneratorId, resolveGeneratorId } from '../components/survey/generator-registry';
import { surveyToMissionItems } from '../components/survey/mission-builder';
import { computeTerrainFollowAltitudes } from '../components/survey/survey-terrain-follow';
import { calculateAltitudeForGSD } from '../components/survey/survey-stats';
import { simplifyPolygon } from '../components/survey/geo-math';
import { runWithActivity } from './activity-store';
import { parseGisArea } from '../../shared/gis-area-import';
import { computeSurveyGroupSignature } from '../components/survey/survey-group-signature';
import { useSettingsStore } from './settings-store';
import { useMissionStore } from './mission-store';
import { MAV_CMD } from '../../shared/mission-types';
import { isSurveyGroup, createSurveyGroup, GROUP_COLOR_PALETTE, type SurveyGroup } from '../../shared/mission-group-types';

type DrawMode = 'none' | 'polygon' | 'branch';

// A recompute is "heavy" (worth a progress indicator + a yielded frame so it
// paints) when the polygon is dense or the last result was large. Cheap edits
// recompute inline so there's no spinner flash.
function recomputeIsHeavy(polygon: LatLng[] | null, result: SurveyResult | null): boolean {
  return (polygon?.length ?? 0) > 500 || (result?.waypoints?.length ?? 0) > 2000;
}

// Debounce so dragging a slider regenerates once when you stop, not on every
// pixel - the "recompute on release" behavior without per-slider handlers.
let recomputeTimer: ReturnType<typeof setTimeout> | null = null;
const RECOMPUTE_DEBOUNCE_MS = 350;

interface SurveyStore {
  // Drawing state
  drawMode: DrawMode;
  drawingVertices: LatLng[];

  // Survey state
  polygon: LatLng[] | null;
  config: Omit<SurveyConfig, 'polygon'>;
  result: SurveyResult | null;
  showFootprints: boolean;
  isActive: boolean;
  /** True while an async (remote) generator is computing. */
  generating: boolean;
  /** Last generator failure, user-facing. Cleared on the next successful run. */
  generatorError: string | null;

  /**
   * When non-null, the survey panel is editing a previously-inserted
   * SurveyGroup. Vertex / config edits no longer just update the draft —
   * they also mutate the SurveyGroup's polygon + config and regenerate
   * its WPs in place, so the mission stays in sync with what the user is
   * seeing on the map.
   *
   * Set automatically after a successful Insert, and when the user picks
   * an existing SurveyGroup via the "Edit" affordance on the table.
   * Cleared by clearSurvey() and when the panel exits.
   */
  editingGroupId: string | null;

  // Drawing actions
  startDrawing: () => void;
  addVertex: (lat: number, lng: number) => void;
  completePolygon: () => void;
  cancelDrawing: () => void;
  /** Begin drawing a branch centerline on the current corridor (map clicks). */
  startBranchDraw: () => void;
  /** Finish the in-progress branch and add it to the corridor's config. */
  completeBranch: () => void;
  /** Remove all branches from the current corridor config. */
  clearCorridorBranches: () => void;

  /**
   * Load a boundary (e.g. a map guide) into the survey draft and open the
   * panel, without committing anything. Generation runs with the current
   * config/engine; the user reviews and Inserts as usual.
   */
  loadDraftFromPolygon: (polygon: LatLng[], holes?: LatLng[][]) => void;
  /**
   * Link the survey panel to a previously-committed SurveyGroup so further
   * edits write through to it.
   */
  setEditingGroupId: (id: string | null) => void;
  /**
   * Load an existing SurveyGroup back into the survey draft for editing.
   * Sets polygon/config/result from the group, marks the panel active, and
   * sets editingGroupId so future edits mutate the group in place.
   */
  loadFromGroup: (group: {
    id: string;
    polygon: Array<{ lat: number; lng: number }>;
    config: Record<string, unknown>;
  }) => void;

  // Config actions
  setPattern: (pattern: SurveyPattern) => void;
  /**
   * Select a module-supplied generator (registry id), or null to return to
   * the built-in pattern generators. Seeds engineParams with the generator's
   * declared field defaults for any key not already set.
   */
  setGeneratorId: (id: string | null) => void;
  /** Set one engine parameter (declared via the generator's configFields). */
  setEngineParam: (id: string, value: unknown) => void;
  setAltitude: (altitude: number) => void;
  setSpeed: (speed: number) => void;
  setFrontOverlap: (overlap: number) => void;
  setSideOverlap: (overlap: number) => void;
  setCamera: (camera: CameraPreset) => void;
  setGridAngle: (angle: number) => void;
  setOvershoot: (overshoot: number) => void;
  setMargin: (margin: number) => void;
  setCameraOffOutside: (v: boolean) => void;
  setGridMode: (mode: 'plane' | 'copter') => void;
  setAltitudeReference: (ref: AltitudeReference) => void;
  /** Toggle continuous DEM terrain-follow (bakes ground+AGL per waypoint). */
  setTerrainFollow: (on: boolean) => void;
  setShowFootprints: (show: boolean) => void;
  setGroundPattern: (pattern: GroundPattern) => void;
  setSpiralDirection: (direction: 'inward' | 'outward') => void;
  setPerimeterPasses: (passes: number) => void;
  setPlanBy: (mode: 'altitude' | 'gsd') => void;
  /** Set a target GSD (cm/px); back-solves altitude from the current camera. */
  setGsd: (gsd: number) => void;
  setEnduranceMinutes: (minutes: number) => void;
  /** Crosshatch second-pass altitude offset, % of relative altitude. */
  setCrossGridAltitudeOffset: (percent: number) => void;
  // Corridor pattern tuning
  setCorridorWidth: (meters: number) => void;
  setCorridorStrips: (count: number) => void;
  setCorridorMode: (mode: CorridorMode) => void;
  setCorridorSideOffset: (meters: number) => void;
  setMaxTurnAngle: (degrees: number) => void;
  setFlipLegs: (flip: boolean) => void;
  setInvertPath: (invert: boolean) => void;

  // Polygon editing
  updateVertex: (index: number, lat: number, lng: number) => void;
  removeVertex: (index: number) => void;
  /** Move a vertex of a corridor branch centerline (live edit). */
  updateBranchVertex: (branchIndex: number, vertexIndex: number, lat: number, lng: number) => void;
  /** Delete a vertex of a corridor branch (drops the branch if it would fall below 2 points). */
  removeBranchVertex: (branchIndex: number, vertexIndex: number) => void;

  /**
   * Explicit polygon-edit mode. While active, vertex edits mutate only the
   * polygon (cheap) and mark the waypoints stale (`pendingRecompute`) instead of
   * regenerating on every drag - essential for large imported boundaries. Done
   * (commit=true) regenerates once; Cancel (commit=false) reverts to the
   * snapshot taken on enter.
   */
  polygonEditMode: boolean;
  pendingRecompute: boolean;
  /** Polygon snapshot captured on enterPolygonEdit, used to revert on Cancel. */
  editSnapshot: LatLng[] | null;
  enterPolygonEdit: () => void;
  exitPolygonEdit: (commit: boolean) => void;

  /**
   * Regenerate the preview/mission. `immediate` runs now (used by discrete
   * actions and Done); otherwise it debounces so a dragged slider regenerates
   * once on release. Heavy recomputes show a progress indicator.
   */
  requestRecompute: (opts?: { immediate?: boolean }) => void;

  // Survey actions
  /**
   * Regenerate the preview from the current polygon/config. When editing a
   * committed group it also syncs the regenerated WPs back into the mission,
   * UNLESS `sync: false` — used when merely opening a group for edit, so that
   * just entering edit mode doesn't overwrite committed altitudes (e.g. terrain
   * auto-adjust) before the user has changed anything.
   */
  generateSurvey: (opts?: { sync?: boolean }) => Promise<void>;
  /**
   * Import a survey boundary from a GIS file (KML/KMZ/GeoJSON) via the main
   * process, load the first area's outer ring into the draft, and generate.
   * Returns a small result so the UI can report success/empty/error.
   */
  importArea: () => Promise<{ ok: boolean; areaCount: number; error?: string }>;
  clearSurvey: () => void;
  activateSurvey: () => void;
  deactivateSurvey: () => void;

  // Preset application — overlays a preset's config slice + (optional) camera
  // onto the current config in a single store update. Only the fields the
  // preset specifies are overwritten; gridAngle and polygon are preserved.
  applyPresetConfig: (
    partial: Partial<Omit<SurveyConfig, 'polygon' | 'gridAngle'>>,
    camera?: CameraPreset,
  ) => void;

  /**
   * Turn one polygon (plus optional holes) into a persistent SurveyGroup added
   * to the mission, using the same pipeline as importArea. The polygon is
   * simplified, waypoints are generated with the current config, and the group
   * is committed via addGroupsWithItems. The new group is then opened in the
   * survey panel (loadFromGroup) so the user can tune it immediately.
   * Returns the new group id, or null if generation produced no waypoints.
   */
  addSurveyAreaFromPolygon: (
    polygon: LatLng[],
    opts?: { holes?: LatLng[][]; name?: string },
  ) => Promise<string | null>;

  /**
   * Turn multiple polygons (each with optional holes) into persistent SurveyGroups
   * added to the mission in a single atomic addGroupsWithItems call (one undo step).
   * Polygons with fewer than 3 points are silently skipped. The first created group
   * is opened in the survey panel for immediate tuning. Returns the array of created
   * group ids (may be shorter than input if some areas produced no waypoints).
   */
  addSurveyAreasFromPolygons: (
    areas: Array<{
      polygon: LatLng[];
      holes?: LatLng[][];
      name?: string;
      /** Per-area config overrides (e.g. corridor pattern + width) merged over the current config. */
      configOverride?: Partial<Omit<SurveyConfig, 'polygon' | 'holes'>>;
    }>,
  ) => Promise<string[]>;
}

/**
 * Dispatch config through the registered generator. Async generators (remote
 * engines like TOPAS) are awaited; their errors propagate to the caller,
 * which owns the `generating` / `generatorError` store state.
 */
async function runGenerator(config: SurveyConfig): Promise<SurveyResult | null> {
  // Corridors are an open centerline (>= 2 points); every other pattern is a
  // closed area (>= 3 points).
  const minPoints = config.pattern === 'corridor' ? 2 : 3;
  if (config.polygon.length < minPoints) return null;

  const id = resolveGeneratorId(config);
  const reg = getSurveyGenerator(id) ?? getSurveyGenerator('builtin.grid');
  if (!reg) return null;
  return await reg.generate(config);
}

/** Whether the config's resolved generator is async (shows a busy state). */
function generatorIsAsync(config: Pick<SurveyConfig, 'pattern' | 'generatorId'>): boolean {
  return getSurveyGenerator(resolveGeneratorId(config))?.capabilities.isAsync ?? false;
}

/**
 * Shared helper: given a raw polygon + holes, simplify them, run the survey
 * generator with the provided config, and return a {group, items} entry ready
 * for addGroupsWithItems. Returns null when the generator produces no waypoints.
 *
 * Both importArea (batches N entries) and addSurveyAreaFromPolygon (single
 * entry) call this so the polygon simplification, generator dispatch, group
 * construction, and signature logic live in exactly one place.
 */
async function buildSurveyGroupEntry(
  rawPolygon: LatLng[],
  rawHoles: LatLng[][],
  config: Omit<SurveyConfig, 'polygon'>,
  name: string,
  colorIndex: number,
  simplifyToleranceM: number,
): Promise<{ group: SurveyGroup; items: ReturnType<typeof surveyToMissionItems> } | null> {
  const polygon = simplifyPolygon(rawPolygon, simplifyToleranceM);
  const holes = rawHoles.map((ring) => simplifyPolygon(ring, simplifyToleranceM));
  // Holes flow through config so the generator can carve them out, and onto
  // the group so the map draws them as cutouts.
  const fullConfig: SurveyConfig = { ...config, polygon, holes };
  const result = await runGenerator(fullConfig);
  if (!result || result.waypoints.length === 0) return null;
  const items = surveyToMissionItems(result, fullConfig);
  const generatorId = resolveGeneratorId(fullConfig);
  const reg = getSurveyGenerator(generatorId);
  const group = createSurveyGroup({
    name,
    generatorId,
    generatorVersion: reg?.version ?? '1.0.0',
    polygon,
    holes: holes.length > 0 ? holes : undefined,
    workspace: fullConfig.workspace,
    config: fullConfig as unknown as Record<string, unknown>,
    color: GROUP_COLOR_PALETTE[colorIndex % GROUP_COLOR_PALETTE.length]!,
  });
  group.generatorResult = result.generatorResult ?? null;
  group.lastGeneratedSignature = computeSurveyGroupSignature(group);
  group.lastGeneratedAt = Date.now();
  return { group, items };
}

/**
 * Push a freshly-generated result through to the live-linked SurveyGroup so the
 * committed mission tracks the on-screen draft. Extracted so both the synchronous
 * generate path and the async terrain-follow pass re-sync identically.
 */
function syncResultToEditingGroup(
  editingGroupId: string,
  polygon: LatLng[],
  fullConfig: SurveyConfig,
  result: SurveyResult,
): void {
  let items = surveyToMissionItems(result, fullConfig);
  const missionStore = useMissionStore.getState();
  const externalTakeoff = missionStore.missionItems.some(
    (it) => it.command === MAV_CMD.NAV_TAKEOFF && it.groupId !== editingGroupId,
  );
  if (externalTakeoff && items[0]?.command === MAV_CMD.NAV_TAKEOFF) {
    items = items.slice(1);
  }
  const currentGroup = missionStore.groups.find((g) => g.id === editingGroupId);
  if (currentGroup && isSurveyGroup(currentGroup)) {
    const probe: SurveyGroup = {
      ...currentGroup,
      polygon: polygon.map((p) => ({ lat: p.lat, lng: p.lng })),
      config: fullConfig as unknown as Record<string, unknown>,
    };
    const signature = computeSurveyGroupSignature(probe);
    missionStore.syncSurveyGroupFromDraft(
      editingGroupId,
      probe.polygon,
      probe.config,
      items,
      signature,
      result.generatorResult,
    );
  }
}

// Monotonic token so a slow async generator or terrain fetch from an earlier
// config can't clobber a newer generate (the classic async-race guard).
let generationSeq = 0;

// Module-level flag — true after the initial hydration from settings, used to
// suppress the persistence subscriber during the very first applyPresetConfig
// call (otherwise we'd save the hydrated config back to itself before any
// user change, which is harmless but noisy).
let isHydratingFromSettings = false;

export const useSurveyStore = create<SurveyStore>()(subscribeWithSelector((set, get) => ({
  drawMode: 'none',
  drawingVertices: [],
  polygon: null,
  config: { ...DEFAULT_SURVEY_CONFIG },
  result: null,
  showFootprints: false,
  isActive: false,
  generating: false,
  generatorError: null,
  editingGroupId: null,
  polygonEditMode: false,
  pendingRecompute: false,
  editSnapshot: null,

  startDrawing: () => {
    set({ drawMode: 'polygon', drawingVertices: [], polygon: null, result: null });
  },

  addVertex: (lat, lng) => {
    set((s) => ({ drawingVertices: [...s.drawingVertices, { lat, lng }] }));
  },

  completePolygon: () => {
    const { drawingVertices } = get();
    if (drawingVertices.length < 3) return;

    const polygon = [...drawingVertices];
    set({ drawMode: 'none', drawingVertices: [], polygon });
    // Generation runs through the shared path so async (remote) generators
    // get the same busy/error handling as config edits.
    void get().generateSurvey();
  },

  cancelDrawing: () => {
    set({ drawMode: 'none', drawingVertices: [] });
  },

  startBranchDraw: () => {
    // Only meaningful for a corridor survey; a branch is another centerline.
    if (get().config.pattern !== 'corridor') return;
    set({ drawMode: 'branch', drawingVertices: [] });
  },

  completeBranch: () => {
    const { drawingVertices, config } = get();
    if (drawingVertices.length < 2) { set({ drawMode: 'none', drawingVertices: [] }); return; }
    const branches = [...(config.corridorBranches ?? []), [...drawingVertices]];
    set({ config: { ...config, corridorBranches: branches }, drawMode: 'none', drawingVertices: [] });
    get().requestRecompute({ immediate: true });
  },

  clearCorridorBranches: () => {
    const { config } = get();
    if (!config.corridorBranches || config.corridorBranches.length === 0) return;
    const { corridorBranches: _omit, ...rest } = config;
    set({ config: rest });
    get().requestRecompute({ immediate: true });
  },

  setPattern: (pattern) => {
    // Picking a built-in pattern always leaves module-generator mode; the two
    // are mutually exclusive engine choices in the UI.
    const { generatorId: _drop, ...rest } = get().config;
    set({ config: { ...rest, pattern } });
    get().requestRecompute({ immediate: true });
  },

  setGeneratorId: (id) => {
    const { generatorId: _drop, ...rest } = get().config;
    if (!id) {
      set({ config: rest });
    } else {
      // Seed declared engine-param defaults so the generator sees a complete
      // value set on first run; user-set values survive re-selection.
      const fields = getSurveyGenerator(id)?.configFields ?? [];
      const engineParams = { ...(rest.engineParams ?? {}) };
      for (const f of fields) {
        if (!(f.id in engineParams)) engineParams[f.id] = f.default;
      }
      set({ config: { ...rest, generatorId: id, engineParams } });
    }
    get().requestRecompute({ immediate: true });
  },

  setEngineParam: (id, value) => {
    const { config } = get();
    set({ config: { ...config, engineParams: { ...(config.engineParams ?? {}), [id]: value } } });
    get().requestRecompute();
  },

  setAltitude: (altitude) => {
    set({ config: { ...get().config, altitude } });
    get().requestRecompute();
  },

  setSpeed: (speed) => {
    set({ config: { ...get().config, speed } });
    get().requestRecompute();
  },

  setFrontOverlap: (frontOverlap) => {
    set({ config: { ...get().config, frontOverlap } });
    get().requestRecompute();
  },

  setSideOverlap: (sideOverlap) => {
    set({ config: { ...get().config, sideOverlap } });
    get().requestRecompute();
  },

  setCamera: (camera) => {
    set({ config: { ...get().config, camera } });
    get().requestRecompute({ immediate: true });
  },

  setGridAngle: (gridAngle) => {
    set({ config: { ...get().config, gridAngle } });
    get().requestRecompute();
  },

  setOvershoot: (overshoot) => {
    set({ config: { ...get().config, overshoot } });
    get().requestRecompute();
  },

  setMargin: (margin) => {
    set({ config: { ...get().config, margin } });
    get().requestRecompute();
  },

  setCameraOffOutside: (cameraOffOutside) => {
    set({ config: { ...get().config, cameraOffOutside } });
    // Geometry is unchanged; recompute only so a live-linked committed group
    // re-emits its mission items with the new camera triggering.
    get().requestRecompute();
  },

  setGridMode: (gridMode) => {
    set({ config: { ...get().config, gridMode } });
    get().requestRecompute();
  },

  setAltitudeReference: (altitudeReference) => {
    set({ config: { ...get().config, altitudeReference } });
    // Geometry is unchanged, but the reference decides the MAVLink frame the
    // mission items are materialized with (relative/terrain/ASL), and the
    // altitude profile + collision check read that frame (#106). Regenerate so
    // the switch is reflected immediately instead of on the next unrelated edit.
    get().requestRecompute({ immediate: true });
  },

  setTerrainFollow: (terrainFollow) => {
    set({ config: { ...get().config, terrainFollow } });
    // Turning it on triggers the async DEM bake; turning it off must regenerate
    // so the baked altitudes are dropped back to the flat config value.
    get().requestRecompute({ immediate: true });
  },

  setShowFootprints: (showFootprints) => {
    set({ showFootprints });
  },

  setGroundPattern: (groundPattern) => {
    set({ config: { ...get().config, groundPattern } });
    // No regeneration needed — the waypoint geometry is identical between
    // boustrophedon and reverse-alternating. Only mission-builder reads this
    // when materializing the mission (to insert DO_SET_REVERSE between lines).
  },

  setSpiralDirection: (spiralDirection) => {
    set({ config: { ...get().config, spiralDirection } });
    get().requestRecompute({ immediate: true });
  },

  setPerimeterPasses: (perimeterPasses) => {
    // Clamp at the same range the generator enforces so the slider/UI can't
    // push past what's geometrically sensible.
    const clamped = Math.max(1, Math.min(5, Math.round(perimeterPasses)));
    set({ config: { ...get().config, perimeterPasses: clamped } });
    get().requestRecompute();
  },

  setPlanBy: (planBy) => {
    set({ config: { ...get().config, planBy } });
  },

  setGsd: (gsd) => {
    const { config } = get();
    const { camera } = config;
    const altitude = calculateAltitudeForGSD(
      camera.sensorWidth,
      camera.focalLength,
      camera.imageWidth,
      gsd,
    );
    // Clamp to the same range as the altitude slider so a wild GSD can't drive
    // the aircraft past sane limits.
    const clamped = Math.max(10, Math.min(500, Math.round(altitude)));
    set({ config: { ...config, altitude: clamped } });
    get().requestRecompute();
  },

  setEnduranceMinutes: (enduranceMinutes) => {
    set({ config: { ...get().config, enduranceMinutes: Math.max(1, Math.round(enduranceMinutes)) } });
  },

  setCrossGridAltitudeOffset: (percent) => {
    const clamped = Math.max(0, Math.min(100, Math.round(percent)));
    set({ config: { ...get().config, crossGridAltitudeOffset: clamped } });
    get().requestRecompute();
  },

  setCorridorWidth: (meters) => {
    const clamped = Math.max(1, Math.min(2000, Math.round(meters)));
    set({ config: { ...get().config, corridorWidth: clamped } });
    get().requestRecompute();
  },

  setCorridorStrips: (count) => {
    // 0 = auto (derive from width / line spacing). Cap so a typo can't spawn
    // tens of thousands of waypoints.
    const clamped = Math.max(0, Math.min(40, Math.round(count)));
    set({ config: { ...get().config, corridorStrips: clamped } });
    get().requestRecompute();
  },

  setCorridorMode: (corridorMode) => {
    set({ config: { ...get().config, corridorMode } });
    get().requestRecompute({ immediate: true });
  },

  setCorridorSideOffset: (meters) => {
    set({ config: { ...get().config, corridorSideOffset: Math.round(meters) } });
    get().requestRecompute();
  },

  setMaxTurnAngle: (degrees) => {
    const clamped = Math.max(1, Math.min(90, Math.round(degrees)));
    set({ config: { ...get().config, maxTurnAngle: clamped } });
    get().requestRecompute();
  },

  setFlipLegs: (flipLegs) => {
    set({ config: { ...get().config, flipLegs } });
    get().requestRecompute({ immediate: true });
  },

  setInvertPath: (invertPath) => {
    set({ config: { ...get().config, invertPath } });
    get().requestRecompute({ immediate: true });
  },

  updateVertex: (index, lat, lng) => {
    const { polygon, polygonEditMode } = get();
    if (!polygon) return;
    const newPolygon = [...polygon];
    newPolygon[index] = { lat, lng };
    set({ polygon: newPolygon });
    // In edit mode just move the point and mark waypoints stale; Done recomputes.
    if (polygonEditMode) set({ pendingRecompute: true });
    else get().requestRecompute({ immediate: true });
  },

  removeVertex: (index) => {
    const { polygon, polygonEditMode } = get();
    if (!polygon || polygon.length <= 3) return; // Need at least 3 vertices
    const newPolygon = polygon.filter((_, i) => i !== index);
    set({ polygon: newPolygon });
    if (polygonEditMode) set({ pendingRecompute: true });
    else get().requestRecompute({ immediate: true });
  },

  updateBranchVertex: (branchIndex, vertexIndex, lat, lng) => {
    const { config, polygonEditMode } = get();
    const branches = config.corridorBranches;
    const line = branches?.[branchIndex];
    if (!branches || !line) return;
    const newLine = line.map((p, i) => (i === vertexIndex ? { lat, lng } : p));
    const next = branches.map((b, bi) => (bi === branchIndex ? newLine : b));
    set({ config: { ...config, corridorBranches: next } });
    if (polygonEditMode) set({ pendingRecompute: true });
    else get().requestRecompute({ immediate: true });
  },

  removeBranchVertex: (branchIndex, vertexIndex) => {
    const { config, polygonEditMode } = get();
    const branches = config.corridorBranches;
    const line = branches?.[branchIndex];
    if (!branches || !line) return;
    let next: LatLng[][];
    if (line.length <= 2) {
      next = branches.filter((_, bi) => bi !== branchIndex); // would degenerate -> drop branch
    } else {
      const nl = line.filter((_, i) => i !== vertexIndex);
      next = branches.map((b, bi) => (bi === branchIndex ? nl : b));
    }
    if (next.length > 0) {
      set({ config: { ...config, corridorBranches: next } });
    } else {
      const { corridorBranches: _omit, ...rest } = config;
      set({ config: rest });
    }
    if (polygonEditMode) set({ pendingRecompute: true });
    else get().requestRecompute({ immediate: true });
  },

  enterPolygonEdit: () => {
    const { polygon } = get();
    set({
      polygonEditMode: true,
      pendingRecompute: false,
      editSnapshot: polygon ? polygon.map((p) => ({ ...p })) : null,
    });
  },

  exitPolygonEdit: (commit) => {
    if (recomputeTimer) { clearTimeout(recomputeTimer); recomputeTimer = null; }
    if (!commit) {
      // Cancel: restore the polygon captured on enter.
      const snap = get().editSnapshot;
      set({
        polygonEditMode: false,
        pendingRecompute: false,
        editSnapshot: null,
        ...(snap ? { polygon: snap } : {}),
      });
      return;
    }
    const dirty = get().pendingRecompute;
    set({ polygonEditMode: false, pendingRecompute: false, editSnapshot: null });
    if (dirty) get().requestRecompute({ immediate: true });
  },

  requestRecompute: (opts) => {
    if (recomputeTimer) { clearTimeout(recomputeTimer); recomputeTimer = null; }
    const run = () => {
      const { polygon, result } = get();
      if (recomputeIsHeavy(polygon, result)) {
        const count = result?.waypoints?.length ?? 0;
        const label = count > 0 ? `Recomputing ${count.toLocaleString()} waypoints...` : 'Generating waypoints...';
        void runWithActivity(label, () => get().generateSurvey());
      } else {
        get().generateSurvey();
      }
    };
    if (opts?.immediate) run();
    else recomputeTimer = setTimeout(() => { recomputeTimer = null; run(); }, RECOMPUTE_DEBOUNCE_MS);
  },

  generateSurvey: async (opts) => {
    const sync = opts?.sync ?? true;
    const { polygon, config, editingGroupId } = get();
    // Corridors are an open centerline (2+ points); area patterns need a ring (3+).
    const minPoints = config.pattern === 'corridor' ? 2 : 3;
    if (!polygon || polygon.length < minPoints) return;

    const fullConfig: SurveyConfig = { ...config, polygon };
    // A new generation supersedes any in-flight async generate or terrain fetch.
    const seq = ++generationSeq;
    // Only async (remote) generators get the busy state; flipping it for the
    // instant built-ins would flash the indicator on every slider tick.
    const isAsync = generatorIsAsync(fullConfig);
    if (isAsync) set({ generating: true });

    let result: SurveyResult | null;
    try {
      result = await runGenerator(fullConfig);
    } catch (err) {
      // Stale failures stay silent - a newer generation owns the UI state.
      if (seq === generationSeq) {
        set({
          generating: false,
          generatorError: err instanceof Error ? err.message : String(err),
        });
      }
      return;
    }
    if (seq !== generationSeq) return;
    set({ result, generating: false, generatorError: null });
    if (!result) return;
    // Const alias so the narrowed type survives into the closures below.
    const generated = result;

    // Live-edit sync: when the survey panel is editing an existing
    // SurveyGroup, push the regenerated polygon/config/items through to
    // mission-store so the committed mission tracks the on-screen draft.
    // Without this, vertex edits update the preview but leave the
    // previously-inserted WPs stale. Skipped on initial open (sync: false) so
    // opening a group for edit doesn't clobber its committed altitudes.
    if (sync && editingGroupId) {
      syncResultToEditingGroup(editingGroupId, polygon, fullConfig, generated);
    }

    // Continuous terrain-follow: sample the DEM at every waypoint and bake
    // ground+AGL absolute altitudes. Runs after the synchronous path so the
    // preview appears instantly, then refines once elevations resolve. Cached +
    // batched, so a slider that doesn't move waypoints is a pure cache hit.
    if (config.terrainFollow && generated.waypoints.length > 0) {
      void (async () => {
        const outcome = await computeTerrainFollowAltitudes(generated, fullConfig);
        // Stale guard: a newer generate ran while we were fetching.
        if (seq !== generationSeq || !outcome) return;
        const current = get().result;
        if (current !== generated) return;
        const terrainResult: SurveyResult = { ...generated, altitudes: outcome.altitudes };
        set({ result: terrainResult });
        if (get().editingGroupId === editingGroupId && editingGroupId) {
          syncResultToEditingGroup(editingGroupId, polygon, fullConfig, terrainResult);
        }
      })();
    }
  },

  importArea: async () => {
    const api = window.electronAPI;
    if (!api?.importSurveyArea) return { ok: false, areaCount: 0, error: 'Import not available' };
    const res = await api.importSurveyArea();
    if (!res.success) {
      // A user cancel isn't an error worth shouting about.
      return { ok: false, areaCount: 0, error: res.error === 'Cancelled' ? undefined : res.error };
    }
    if (!res.content || !res.format) return { ok: false, areaCount: 0, error: 'Empty file' };
    const areas = parseGisArea(res.content, res.format);
    if (areas.length === 0) {
      return { ok: false, areaCount: 0, error: 'No polygon boundary found in the file' };
    }

    // The file defines the areas, so import creates one survey group per
    // polygon directly - no "draw a polygon first" step. Each is generated with
    // the current config; the first is opened in the panel for live tuning, the
    // rest sit on the map ready to edit. (Inner rings are parsed as holes but
    // the generators don't subtract them yet.)
    const { config } = get();
    const missionStore = useMissionStore.getState();
    const simplifyToleranceM = useSettingsStore.getState().surveyPerformance.importSimplifyToleranceM;
    const baseCount = missionStore.groups.filter(isSurveyGroup).length;

    const entries: Array<{ group: SurveyGroup; items: ReturnType<typeof surveyToMissionItems> }> = [];
    try {
      await runWithActivity('Importing survey - generating waypoints...', async () => {
        for (const [i, area] of areas.entries()) {
          // GIS boundaries are often digitized at sub-meter resolution (thousands of
          // vertices). Survey line spacing is tens of meters, so that detail is
          // wasted - and every vertex becomes a draggable marker plus per-edge work
          // in scan-line clipping, which is what makes large-KML import lag. Reduce
          // to a ~1 m tolerance: visually identical, orders of magnitude fewer points.
          const rawPolygon = area.polygon.map((p) => ({ lat: p.lat, lng: p.lng }));
          const rawHoles = area.holes.map((ring) =>
            ring.map((p) => ({ lat: p.lat, lng: p.lng })),
          );
          const entry = await buildSurveyGroupEntry(
            rawPolygon,
            rawHoles,
            config,
            `Imported ${baseCount + i + 1}`,
            baseCount + i,
            simplifyToleranceM,
          );
          if (entry) entries.push(entry);
        }
      });
    } catch (err) {
      // A remote generator failing mid-import shouldn't look like "no polygons".
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, areaCount: 0, error: `Generator failed: ${message}` };
    }

    if (entries.length === 0) {
      return { ok: false, areaCount: 0, error: 'Could not generate a survey from the imported area(s)' };
    }

    const ids = missionStore.addGroupsWithItems(entries);
    // Open the first imported area in the panel for editing/tuning.
    const first = entries[0]!.group;
    get().loadFromGroup({ id: ids[0]!, polygon: first.polygon, config: first.config });
    // Fly the map to what we just imported instead of leaving it wherever it was.
    missionStore.fitMapToMission();
    return { ok: true, areaCount: entries.length };
  },

  clearSurvey: () => {
    // Invalidate any in-flight async generation so a late resolve can't
    // repopulate the cleared draft.
    generationSeq += 1;
    set({
      drawMode: 'none',
      drawingVertices: [],
      polygon: null,
      result: null,
      isActive: false,
      generating: false,
      generatorError: null,
      editingGroupId: null,
    });
  },

  activateSurvey: () => {
    set({ isActive: true });
  },

  deactivateSurvey: () => {
    generationSeq += 1;
    set({
      isActive: false,
      drawMode: 'none',
      drawingVertices: [],
      polygon: null,
      result: null,
      generating: false,
      generatorError: null,
      editingGroupId: null,
    });
  },

  loadDraftFromPolygon: (polygon, holes) => {
    if (polygon.length < 3) return;
    const { config } = get();
    generationSeq += 1;
    set({
      drawMode: 'none',
      drawingVertices: [],
      polygon: polygon.map((p) => ({ lat: p.lat, lng: p.lng })),
      config: { ...config, holes: (holes ?? []).filter((h) => h.length >= 3) },
      result: null,
      isActive: true,
      editingGroupId: null,
      generating: false,
      generatorError: null,
    });
    get().requestRecompute({ immediate: true });
  },

  setEditingGroupId: (id) => {
    set({ editingGroupId: id });
  },

  loadFromGroup: (group) => {
    // Hydrate the draft from a previously-committed SurveyGroup so the user
    // can resume editing it. The polygon shape is normalized to LatLng,
    // and the generator-specific config is restored under the panel's
    // SurveyConfig shape (polygon stripped). isActive is set so the panel
    // surfaces; editingGroupId is set so future generateSurvey calls
    // write through.
    const rawConfig = group.config as Record<string, unknown>;
    const { polygon: _ignored, ...configWithoutPolygon } = rawConfig as {
      polygon?: unknown;
      [k: string]: unknown;
    };
    const config = {
      ...DEFAULT_SURVEY_CONFIG,
      ...(configWithoutPolygon as Partial<typeof DEFAULT_SURVEY_CONFIG>),
    };
    const polygon: LatLng[] = group.polygon.map((p) => ({
      lat: p.lat,
      lng: p.lng,
    }));
    set({
      drawMode: 'none',
      drawingVertices: [],
      polygon,
      config,
      isActive: true,
      editingGroupId: group.id,
    });
    // Build the preview only - do NOT sync, or merely opening a group would
    // overwrite its committed WPs (e.g. terrain-adjusted altitudes) before the
    // user edits anything. Subsequent vertex/config changes sync as normal.
    // Opening a large group regenerates a big preview; show progress.
    void runWithActivity('Loading survey...', () => get().generateSurvey({ sync: false }));
  },

  addSurveyAreaFromPolygon: async (polygon, opts) => {
    if (polygon.length < 3) return null;
    const { config } = get();
    const missionStore = useMissionStore.getState();
    const simplifyToleranceM = useSettingsStore.getState().surveyPerformance.importSimplifyToleranceM;
    const baseCount = missionStore.groups.filter(isSurveyGroup).length;
    const holes = opts?.holes ?? [];
    const name = opts?.name ?? `Survey ${baseCount + 1}`;
    let entry: Awaited<ReturnType<typeof buildSurveyGroupEntry>>;
    try {
      entry = await buildSurveyGroupEntry(
        polygon,
        holes,
        config,
        name,
        baseCount,
        simplifyToleranceM,
      );
    } catch (err) {
      set({ generatorError: err instanceof Error ? err.message : String(err) });
      return null;
    }
    if (!entry) return null;
    const ids = missionStore.addGroupsWithItems([entry]);
    const id = ids[0];
    if (!id) return null;
    get().loadFromGroup({ id, polygon: entry.group.polygon, config: entry.group.config });
    return id;
  },

  addSurveyAreasFromPolygons: async (areas) => {
    if (areas.length === 0) return [];
    const { config } = get();
    const missionStore = useMissionStore.getState();
    const simplifyToleranceM = useSettingsStore.getState().surveyPerformance.importSimplifyToleranceM;
    const baseCount = missionStore.groups.filter(isSurveyGroup).length;

    const entries: Array<{ group: SurveyGroup; items: ReturnType<typeof surveyToMissionItems> }> = [];
    for (const [i, area] of areas.entries()) {
      const areaConfig = area.configOverride ? { ...config, ...area.configOverride } : config;
      // Corridors are open centerlines (>= 2 points); areas are closed (>= 3).
      const minPoints = areaConfig.pattern === 'corridor' ? 2 : 3;
      if (area.polygon.length < minPoints) continue;
      const name = area.name ?? `Survey ${baseCount + entries.length + 1}`;
      try {
        const entry = await buildSurveyGroupEntry(
          area.polygon,
          area.holes ?? [],
          areaConfig,
          name,
          baseCount + i,
          simplifyToleranceM,
        );
        if (entry) entries.push(entry);
      } catch (err) {
        // One failing area (e.g. remote engine rejecting its polygon) doesn't
        // sink the batch; surface the failure and keep going.
        set({ generatorError: err instanceof Error ? err.message : String(err) });
      }
    }

    if (entries.length === 0) return [];

    const ids = missionStore.addGroupsWithItems(entries);
    const firstId = ids[0];
    const firstEntry = entries[0];
    if (firstId && firstEntry) {
      get().loadFromGroup({ id: firstId, polygon: firstEntry.group.polygon, config: firstEntry.group.config });
    }
    return ids;
  },

  applyPresetConfig: (partial, camera) => {
    const current = get().config;
    // Merge — preset wins on keys it sets, current stays for everything else.
    // Camera is only replaced when the preset explicitly provides one (e.g.
    // Mower template flips into Manual mode); otherwise the user's chosen
    // camera survives a template switch.
    const nextConfig = {
      ...current,
      ...partial,
      ...(camera ? { camera } : {}),
    };
    set({ config: nextConfig });
    // Regenerate so the map updates immediately.
    get().requestRecompute({ immediate: true });
  },

})));

// Persistence: any change to the survey config is serialized and pushed to
// settings-store, which auto-saves it via the existing electron-store flow.
// We strip the polygon (scene-specific, not worth carrying across sessions —
// loading a saved polygon on a different map location would be confusing).
useSurveyStore.subscribe(
  (state) => state.config,
  (config) => {
    if (isHydratingFromSettings) return;
    // corridorBranches are world-space centerlines tied to a specific corridor —
    // scene-specific like the polygon, so strip them too. Persisting them would
    // wrongly graft old branches onto a freshly drawn corridor next session.
    const { corridorBranches: _scene, ...persistable } = config as unknown as Record<string, unknown>;
    useSettingsStore.getState().setSurveySavedConfig(persistable);
  },
);

// Shared hydration helper — applies saved config over the defaults without
// triggering the persistence subscriber above.
function applySavedConfig(saved: Record<string, unknown>) {
  isHydratingFromSettings = true;
  try {
    const merged = { ...DEFAULT_SURVEY_CONFIG, ...(saved as Partial<typeof DEFAULT_SURVEY_CONFIG>) };
    useSurveyStore.setState({ config: merged });
  } finally {
    isHydratingFromSettings = false;
  }
}

// Hydration: when settings finishes loading (single false→true transition of
// _isInitialized) and a saved config exists, apply it.
useSettingsStore.subscribe(
  (state) => state._isInitialized,
  (init, prev) => {
    if (!init || prev) return;
    const saved = useSettingsStore.getState().surveySavedConfig;
    if (saved) applySavedConfig(saved);
  },
);

// HMR / late-import safety: if settings finished loading before this module
// attached its subscriber, hydrate immediately from the current snapshot.
if (useSettingsStore.getState()._isInitialized) {
  const saved = useSettingsStore.getState().surveySavedConfig;
  if (saved) applySavedConfig(saved);
}
