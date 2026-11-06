import type { ComponentType } from 'react';
import type { ModuleManifest, MountPointName } from './manifest.js';

export interface PtyCreateOptions {
  shell: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
}

// --- Survey generator extension point -------------------------------------
// Structural mirror of the host's survey generator registry types
// (apps/desktop .../survey/generator-registry.ts). Kept loose on the config /
// result shapes so the SDK does not depend on renderer types; the host casts
// at the registration boundary.

export interface SurveyGeneratorCapabilities {
  /** Generator can take interior boundaries (no-fly zones) inside the ROI. */
  supportsHoles: boolean;
  /** Generator can take a separate workspace polygon (allowed flight area). */
  supportsWorkspace: boolean;
  /** Generator's track width / line spacing requires camera + overlap settings. */
  requiresCamera: boolean;
  /** Generator runs asynchronously (e.g. remote API call). */
  isAsync: boolean;
  /** Generator hits a network resource and is subject to remote failure modes. */
  isRemote: boolean;
  /**
   * Generator plans a whole fleet in one call: given `config.fleet` (one
   * `{ key, label?, speed?, enduranceMinutes?, start? }` per vehicle) it
   * returns `fleetMissions` (one `{ vehicleKey, waypoints, subPolygon?,
   * stats?, warnings? }` per vehicle) on the result. Without it the host
   * splits the single plan itself.
   */
  supportsFleet?: boolean;
}

export type SurveyGeneratorConfigField =
  | {
      type: 'number';
      id: string;
      label: string;
      default: number;
      min?: number;
      max?: number;
      step?: number;
      unit?: string;
      description?: string;
    }
  | {
      type: 'boolean';
      id: string;
      label: string;
      default: boolean;
      description?: string;
    }
  | {
      type: 'select';
      id: string;
      label: string;
      default: string;
      options: Array<{ value: string; label: string }>;
      description?: string;
    };

/**
 * A survey coverage engine contributed by a module. `generate` receives the
 * host's SurveyConfig (polygon / holes / workspace as {lat,lng}[] rings,
 * camera + overlap + speed fields, and `engineParams` holding this
 * generator's declared configFields values) and must resolve to the host's
 * SurveyResult shape: `{ waypoints, photoPositions, footprints, stats,
 * warnings?, generatorResult? }`.
 */
export interface SurveyGeneratorRegistration {
  /** Stable reverse-DNS id, serialized into mission files. */
  id: string;
  version: string;
  displayName: string;
  description: string;
  capabilities: SurveyGeneratorCapabilities;
  configFields?: SurveyGeneratorConfigField[];
  generate(config: unknown): unknown | Promise<unknown>;
}


// --- Mission workspace panels ---------------------------------------------
// The mission planner is a dock of real panels (map, waypoints, altitude
// profile, survey). A module that belongs BESIDE the map - anything the pilot
// edits while watching the map react - registers one of these rather than a
// floating window, and gets a proper tab the pilot can dock, resize and
// close like any other.

export interface MissionPanelRegistration {
  /** Stable id within this module. */
  id: string;
  /** Tab title. Keep it short: it sits in a tab strip. */
  title: string;
  component: unknown;
  /** Open the tab as soon as the module loads. Default false. */
  openOnLoad?: boolean;
}

// --- Vehicle proposals ----------------------------------------------------
// A module NEVER writes to the aircraft. It proposes, the host shows the
// pilot what would be written and by whom, the host performs the write, and
// the host reports back what the vehicle accepted.
//
// A module holding the write path could skip the dialog, by accident or
// otherwise, and a dialog that can be skipped is decoration. That is why
// there is no `write` here and no manifest permission to grant: the pilot is
// the permission.

export interface FenceProposal {
  /** Shown to the pilot, so they know which boundary this is. */
  name: string;
  /** Inclusion polygon the aircraft must stay within. Replaces any held. */
  inclusion?: MapPoint[];
  /** Exclusion polygons appended to those the pilot already holds. */
  exclusions?: Array<{ name: string; points: MapPoint[] }>;
  /** Why the module is asking, in the pilot's words. */
  reason: string;
}

/** Waypoints a module asks the host to add to the planned mission. The pilot sees and applies them. */
export interface MissionProposal {
  /** Shown to the pilot, so they know what these legs are. */
  name: string;
  /** Why the module is asking, in the pilot's words. */
  reason: string;
  /** 'append' adds after the last item; 'replace' swaps the whole mission for these. Default 'append'. */
  mode?: 'append' | 'replace';
  items: Array<{
    lat: number;
    lng: number;
    /** Metres, in `frame`. */
    altitude: number;
    /** 'relative' to home (default) or 'asl'. */
    frame?: 'relative' | 'asl';
  }>;
}

/** A place a module asks the aircraft to land at. The pilot confirms with the target on the map. */
export interface LandingProposal {
  name: string;
  reason: string;
  at: MapPoint;
  /** Height above home to fly there at before descending. */
  transitAltRelM: number;
}

export interface ProposalResult {
  /** False when the pilot declined, or when nothing could be written. */
  accepted: boolean;
  /** What the vehicle confirmed it stored. Absent when nothing was sent. */
  pointsAccepted?: number;
  /** How many exclusion polygons were written. Absent when none were proposed. */
  exclusionsAccepted?: number;
  /** Set when the write was attempted and failed. */
  error?: string;
}

/** Fence storage on the vehicle; ArduPilot keeps a few hundred bytes, 8 per vertex plus 2 per polygon. */
export interface FenceBudget {
  /** Bytes of fence storage on this vehicle class. */
  capacityBytes: number;
  /** Bytes the fence currently held would take. */
  usedBytes: number;
  bytesPerVertex: 8;
  bytesPerPolygon: 2;
}

// --- Terrain and tile sources -------------------------------------------
// Module tiles served by the host: a DEM overriding elevation inside a footprint, or a raster overlay.

export interface TileSourceRegistration {
  /** Stable id within this module. Re-registering the same id replaces it. */
  id: string;
  name: string;
  /** 'dem': Terrarium PNG heights, MSL metres, composited over the host DEM. 'raster': RGBA PNG for a map layer. */
  kind: 'dem' | 'raster';
  /** Lon/lat ring. Outside it the host's own tiles apply. */
  footprint: MapPoint[];
  /** Absolute folder holding `{z}/{x}/{y}.png`. */
  tileRoot: string;
  minZoom: number;
  maxZoom: number;
  /** Among overlapping DEM sources the higher priority wins. Default 0. */
  priority?: number;
  /** Bumped by the module when tiles on disk changed, so caches refresh. */
  version?: number;
}

/** How a scene model's origin altitude is read. */
export type SceneAltitudeMode = 'amsl' | 'agl' | 'clamp';

export type SceneName = 'svt' | 'mission3d' | 'sim' | 'logs';

export interface SceneMeshRegistration {
  id: string;
  name: string;
  /**
   * Absolute path of a glTF (.glb, or .gltf with its files beside it) whose axes are x east,
   * y up, z south, metres. Draco, KTX2 and Meshopt compression load. Exactly one of glb, tileset or pointCloud.
   */
  glb?: string;
  /** Absolute path of a 3D Tiles tileset.json, streamed with LOD and placed by its own root transform. */
  tileset?: string;
  /**
   * Absolute path of a .ply point cloud in the same local frame as glb (x east, y up, z south, metres
   * about origin), with optional uchar red/green/blue vertex colours.
   */
  pointCloud?: string;
  /** Point size in screen pixels for a point cloud. Default 2. */
  pointSizePx?: number;
  /** Where the model origin sits; altMsl is EGM96 metres. A tileset uses it only as its nominal centre. */
  origin: { lat: number; lng: number; altMsl: number };
  /** Rotation about the vertical axis, degrees clockwise from north. Default 0. */
  yawDeg?: number;
  /** Nose up about the east axis after yaw, degrees. Default 0. */
  pitchDeg?: number;
  /** Right side down about the north axis after pitch, degrees. Default 0. */
  rollDeg?: number;
  /** Uniform scale. Default 1. */
  scale?: number;
  /** 'amsl' (default) uses altMsl as is, 'agl' adds altMsl to the ground under the origin, 'clamp' sits on the ground. Never below the ground in any mode. */
  altitudeMode?: SceneAltitudeMode;
  /** WGS84 outer rings the model covers: procedural OSM buildings inside them are hidden. Without them, the model's bounding radius is used. */
  footprints?: Array<Array<{ lat: number; lng: number }>>;
  /** Which scenes show it. Default all. */
  scenes?: SceneName[];
  version?: number;
}

// --- Alerts extension point -----------------------------------------------
// A module says something the pilot must see. It goes into the host's own
// message stream, at the host's severities, so a module alert looks and
// sorts like every other alert rather than inventing its own surface.
//
// Advisory only. Nothing here changes what the aircraft does.

export type ModuleAlertSeverity = 'info' | 'notice' | 'caution' | 'warning' | 'critical';

export interface ModuleAlert {
  /**
   * Stable id for this alert WITHIN the module. Raising the same id again
   * updates it in place rather than stacking a second copy, which is what
   * lets a live readout ("18 s to the boundary") update without flooding.
   */
  id: string;
  severity: ModuleAlertSeverity;
  message: string;
}

// --- Map layer extension point --------------------------------------------
// A module contributes DECLARATIVE features and the host draws them. The host
// owns the map library, the layer control and the z-order, for the same reason
// it owns the panel dock: two modules drawing straight onto the map would
// fight over stacking and neither could be turned off independently.
//
// Nothing here can change what the aircraft does. A layer is drawing only.

/** WGS84 degrees, the same shape the survey seam uses for rings. */
export interface MapPoint {
  lat: number;
  lng: number;
}

export interface MapPolygonFeature {
  kind: 'polygon';
  /** Outer ring. Closing point optional; the host closes it. */
  points: MapPoint[];
  /** Rings cut out of the outer one. */
  holes?: MapPoint[][];
  /** CSS colour. Required: a feature with no stroke is invisible. */
  stroke: string;
  strokeWidth?: number;
  /** Dash pattern in pixels, for a fill that must not read as solid ground. */
  dash?: number[];
  fill?: string;
  /** 0..1. Kept separate from `fill` so a colour can be reused at two weights. */
  fillOpacity?: number;
}

export interface MapPolylineFeature {
  kind: 'polyline';
  points: MapPoint[];
  stroke: string;
  strokeWidth?: number;
  dash?: number[];
}

export interface MapMarkerFeature {
  kind: 'marker';
  at: MapPoint;
  /** Host-drawn glyph, so markers from different modules stay consistent. */
  icon: 'dot' | 'takeoff' | 'land' | 'home' | 'warning' | 'flag';
  color: string;
  /** Short label under the glyph. Long strings are truncated, not wrapped. */
  label?: string;
}

/** Plain text on the map with a dark outline, for grid references and names. Not clickable. */
export interface MapTextFeature {
  kind: 'text';
  at: MapPoint;
  text: string;
  color: string;
  /** Font size in px, 9 to 20. Default 11. */
  size?: number;
  /** Which side of the text sits on `at`. Default 'center'. */
  anchor?: 'center' | 'left' | 'right' | 'top' | 'bottom';
  /** Draw on a small solid card instead of with an outline, for measurement readouts. */
  chip?: boolean;
}

/**
 * Material measured against a base, drawn by the host the way the Locus app shows a volume: the surface
 * inside the outline tinted (stockpile above the base, pit below, stronger with depth), contour lines of
 * the height above the base and a band sweeping up through it in 3D, the base as a translucent floor.
 */
export interface MapVolumeFeature {
  kind: 'volume';
  outline: MapPoint[];
  /** Surface height (m MSL) at each outline point. */
  top: number[];
  /** Base height (m MSL) under each outline point. */
  floor: number[];
  /** Regular grid inside the outline: cell centre, surface height (m MSL), height above the base (m). */
  cells: Array<{ lat: number; lng: number; h: number; d: number }>;
  /** Cell edge (m). */
  cellM: number;
  stockpileColor?: string;
  pitColor?: string;
  /** The sweeping band. Off anyway when the system asks for reduced motion. Default true. */
  animate?: boolean;
}

export type MapFeature =
  | MapPolygonFeature
  | MapPolylineFeature
  | MapMarkerFeature
  | MapTextFeature
  | MapVolumeFeature;

/** A way to write positions, offered in the host's coordinate format setting next to Decimal and DMS. */
export interface CoordinateFormatRegistration {
  /** Stable id within this module. */
  id: string;
  /** Name in the setting, e.g. "MGRS". Called when shown, so it can follow the app language. */
  name(): string;
  /** Text for a position, e.g. "32T NT 12345 67890", at one of `precisions` (or your default). */
  format(lat: number, lon: number, precision?: number): string;
  /** Detail levels the pilot can pick in the setting, e.g. MGRS 1 m / 10 m / 100 m. */
  precisions?: Array<{ value: number; name(): string }>;
  defaultPrecision?: number;
  /** A typed or pasted position, or null when the text is not in this format. */
  parse(text: string): { lat: number; lon: number } | null;
}

/** What the map currently shows, for layers that draw only what is in view (grids, labels). */
/** A display form of a cargo map instrument, chosen per instrument from its config popover. */
export interface MapInstrumentVariantRegistration {
  /** Persisted key, unique within the instrument. */
  id: string;
  /** Key in this module's own i18n resources. */
  labelKey: string;
  component: ComponentType;
  /** This variant draws a round dial, so a docked group shapes around it. */
  round?: boolean;
  /** Small icon for the display picker, 20 x 20 px. A dot when omitted. */
  glyph?: ComponentType;
}

/**
 * A floating instrument on the telemetry map, contributed by a cargo. It lives
 * in the host's Instruments catalog, layer, docked groups and saved layouts
 * exactly like a built-in: the pilot drags, resizes, dims, hides and docks it.
 * Every label is a key in the module's own i18n resources (host.i18n), so it
 * follows the app language.
 */
export interface MapInstrumentRegistration {
  /** Stable id within this module; the host prefixes it with the module slug. */
  id: string;
  labelKey: string;
  /** Shown on first use without the pilot adding it from the catalog. Default false. */
  defaultVisible?: boolean;
  /** The default face. Render your own card; the host adds the chrome (drag, gear, grip). */
  component: ComponentType;
  /** What the display picker calls the default face. The instrument's own label when omitted. */
  defaultLabelKey?: string;
  /** Icon of the default face in the display picker, 20 x 20 px. */
  defaultGlyph?: ComponentType;
  /** Optional numeric readout alternative. */
  numericComponent?: ComponentType;
  /** Further display forms offered beside the default and numeric ones. */
  variants?: MapInstrumentVariantRegistration[];
  /** The default face is a round dial. */
  round?: boolean;
  /** Vehicle kinds this instrument is for; absent means every one. */
  profiles?: ('air' | 'ground')[];
  /**
   * The instrument's own settings: a data source, a range, a unit. The host
   * opens it in a dialog of its own from a button in the gear popover (which
   * stays about layout: display form, opacity, hide), and the cargo can open
   * it itself with `host.map.openInstrumentSettings`, e.g. from an empty state.
   */
  settings?: ComponentType;
  /** Dialog width in px. Default 440. */
  settingsWidth?: number;
}

export interface MapView {
  north: number;
  south: number;
  east: number;
  west: number;
  zoom: number;
}

export interface MapLayerRegistration {
  /** Stable id within this module. Re-registering the same id replaces it. */
  id: string;
  /** Shown in the host's layer control. */
  name: string;
  /** Whether it starts switched on. The pilot's choice wins afterwards. */
  defaultVisible?: boolean;
  /**
   * Draw order between module layers, low first. The host keeps every module
   * layer under its own mission and vehicle drawing regardless, so a module
   * cannot hide the aircraft.
   */
  order?: number;
  /** A raster tile source this module registered on the main side, drawn under the features. */
  tiles?: { sourceId: string; opacity?: number };
  /** Current features. Called when the host redraws, so keep it cheap. `view` is what the map shows. */
  features(view?: MapView): MapFeature[];
  /**
   * Tell the host the features changed. Return an unsubscribe. Without this
   * the layer is redrawn only when the map itself changes, which is right for
   * static geometry and wrong for anything live.
   */
  subscribe?(onChange: () => void): () => void;
}

// --- HUD overlay extension point ------------------------------------------
// Geometry of the first-party fighter HUD's SVG viewBox, so a `cameraOverlay`
// module can draw reticles (pippers, steering lines) in the SAME coordinate
// space and have them line up with the pitch ladder. A module renders its own
// absolutely-positioned SVG using this viewBox + preserveAspectRatio
// 'xMidYMid meet' and the `scale` group, then places symbols at
// `centerX + azDeg * pxPerDeg`, `centerY + pitchDeg * pxPerDeg`. Live attitude
// / velocity come from `telemetry`; this is pure geometry.

export interface HudProjection {
  /** viewBox width / height the HUD is drawn in (SVG user units). */
  viewBoxW: number;
  viewBoxH: number;
  /** Boresight (screen centre) in viewBox units. */
  centerX: number;
  centerY: number;
  /** viewBox units per degree of pitch / azimuth. */
  pxPerDeg: number;
  /** Overall scale multiplier applied to the fixed instrument cluster. */
  scale: number;
  /** Resolved HUD symbology colour (hex), so a reticle matches the HUD. */
  color: string;
  /** HUD line-weight multiplier, so stroke widths match. */
  lineWeight: number;
}

// --- OSD element extension point ------------------------------------------
// The character-cell OSD (rendered into the flight controller's DisplayPort /
// MSP font buffer). A module contributes an element type; the host lists it in
// the OSD Designer palette and calls `render` when composing the buffer.

/** Minimal writer over the host's OSD character buffer (host adapts its real
 *  buffer to this). Coordinates are cell columns / rows. */
export interface OsdCharBuffer {
  drawString(x: number, y: number, str: string): void;
  setChar(x: number, y: number, code: number): void;
}

/** Flight values passed to a HUD instrument's render(), a documented subset of
 *  what the HUD itself draws. Demo values in the designer, live on the camera. */
export interface HudValueSnapshot {
  roll: number;
  pitch: number;
  heading: number;
  airspeed: number;
  groundspeed: number;
  altitude: number;
  vario: number;
  throttle: number;
  vx?: number;
  vy?: number;
  vz?: number;
  lat?: number;
  lon?: number;
}

/** A mission waypoint, for instruments that target the flight plan. */
export interface HudMissionWaypoint {
  seq?: number;
  latitude?: number;
  longitude?: number;
}

/** A guided "go here" target, if one is set. */
export interface HudCommandTarget {
  type?: string;
  lat: number;
  lon: number;
}

/** Everything a HUD instrument needs to draw, in the HUD's own coordinate space. */
export interface HudInstrumentContext {
  projection: HudProjection;
  values: HudValueSnapshot;
  mission: HudMissionWaypoint[];
  commandTarget: HudCommandTarget | null;
}

/** A toggleable HUD instrument contributed by a module (see host.hud). */
export interface HudInstrumentRegistration {
  /** Stable id; reverse-DNS prefix recommended so it can't collide. */
  id: string;
  /** Label shown in the HUD Instruments list. */
  label: string;
  /**
   * Draw the instrument into the HUD. Return SVG elements (e.g. a <g>) laid out
   * in the projection's viewBox; the host wraps them in the HUD's <svg> so they
   * align with the built-in symbology. Called wherever the HUD renders - the
   * live camera overlay AND the OSD Tool designer preview - so the instrument
   * behaves like a first-party one. Return type is opaque (a React node).
   */
  render?(ctx: HudInstrumentContext): unknown;
}

export interface OsdElementRegistration {
  /** Stable id serialized into saved OSD layouts. Must NOT collide with a
   *  built-in element id; using the module's reverse-DNS prefix is recommended. */
  id: string;
  name: string;
  /** Palette grouping (host categories: 'general' | 'attitude' | 'mission' | …). */
  category: string;
  description?: string;
  /** Footprint in character cells, for palette preview + bounds. */
  size: { width: number; height: number };
  /** Default placement + whether it starts enabled on a fresh layout. */
  defaultPosition?: { x: number; y: number; enabled: boolean };
  previewText?: string;
  /**
   * Draw the element into the char buffer at cell (x, y). `values` is the
   * host's live-telemetry snapshot (fields: latitude, longitude, altitude,
   * speed, heading, targetLat, targetLon, …). The module computes whatever it
   * needs from `values` plus its own state and writes cells via `buffer`.
   */
  render(buffer: OsdCharBuffer, x: number, y: number, values: unknown): void;
}

// --- Module panel (dock) extension point -----------------------------------
// A single host-owned dock arbitrates the corner so modules don't collide:
// each module contributes a titled panel, the host renders one collision-free
// tray of launcher chips and owns positioning + open/close chrome. This
// replaces the free-positioned `floatingOverlay` for module settings/controls.

export interface ModulePanelRegistration {
  /** Stable, module-scoped id. */
  id: string;
  /** Shown on the launcher chip and the panel header. */
  title: string;
  /** Optional short text tag (2-3 chars) for the chip. No emoji. */
  badge?: string;
  /**
   * How much room the panel needs. 'compact' (default) opens in the dock
   * dropdown - right for small settings forms. 'large' opens in a resizable,
   * draggable floating window - right for interactive UIs (a chat, a terminal).
   */
  size?: 'compact' | 'large';
  /** The panel BODY only - the host provides the chip, frame, header, close. */
  component: ComponentType;
}

/**
 * A panel in the pilot's workspace grid (the dockview layout the Map, Vision
 * and Messages panels live in). It appears in the Workspace dialog's Add
 * panel list, docks, splits, pops out and is saved in layouts like a built-in.
 */
export interface WorkspacePanelRegistration {
  /** Stable id within this module; the host prefixes it with the module slug. */
  id: string;
  /** Tab title. Called when the grid renders, so it follows the app language. */
  title(): string;
  icon?: ComponentType<{ className?: string }>;
  /** The panel body; it fills the tab. */
  component: ComponentType;
}

/** Body of the nav view this cargo unlocks (e.g. 'vault'); the host keeps the rail entry and gating. */
export interface ModuleViewRegistration {
  viewId: string;
  component: ComponentType;
}

// ── Fleet vault (requires the 'vault' manifest permission) ──────

export interface VaultStatusInfo {
  initialized: boolean;
  commitCount: number;
  /** Snapshots are pushed to the remote automatically */
  autoSync: boolean;
  /** An online remote (GitHub or custom) is connected and configured */
  backupConfigured: boolean;
  lastSyncAt?: number;
}

export interface VaultUnitInfo {
  uid: string;
  name: string;
  vehicleType?: string;
  sitl?: boolean;
  lastSnapshotAt?: number;
  paramCount?: number;
  /** Other board ids filed under this unit (identity scheme change, swapped FC) */
  aliases?: string[];
}

export interface VaultSiteInfo {
  site: string;
  hasBoundary: boolean;
  missions: string[];
}

export interface VaultDiffRow {
  id: string;
  snapshotValue: number;
  /** null = the connected vehicle doesn't report this param */
  currentValue: number | null;
  calibration: boolean;
}

/** An opened parameter snapshot compared against the live vehicle */
export interface VaultSnapshotDiff {
  oid: string;
  uid: string;
  changed: VaultDiffRow[];
  missingOnVehicle: VaultDiffRow[];
  sameCount: number;
  totalInSnapshot: number;
  liveAvailable: boolean;
  /** Param download still running: the comparison would be misleading */
  liveLoading: boolean;
  snapshotFirmware?: string;
  /** May this snapshot be written to the connected vehicle? The host enforces it on restore too. */
  restore: {
    targetMatches: boolean;
    firmwareMatches: boolean;
    ownerName: string;
    liveFirmware?: string;
  };
}

/** Everything a vault workspace UI renders; the host keeps it current. */
export interface VaultWorkspaceState {
  status: (VaultStatusInfo & { github: { connected: boolean; login?: string; repo?: string; mode: 'github' | 'custom' } }) | null;
  units: VaultUnitInfo[];
  sites: VaultSiteInfo[];
  history: VaultHistoryEntryInfo[];
  /** Live parameter count of the connected vehicle (0 = not loaded yet) */
  paramCount: number;
  /** Unit picked under "Working on", overriding automatic matching */
  unitOverride: string | null;
  snapshotBusy: boolean;
  syncBusy: boolean;
  lastError: string | null;
  lastNotice: string | null;
  diff: VaultSnapshotDiff | null;
  diffLoading: boolean;
  restoreBusy: boolean;
  restoreProgress: { done: number; total: number } | null;
}

export interface VaultHistoryEntryInfo {
  oid: string;
  message: string;
  timestamp: number;
  /** Repo-relative paths this snapshot touched */
  files: string[];
}

/** Identity of the vehicle currently on the link, in vault terms */
export interface VehicleIdentity {
  uid: string;
  name: string;
  sitl: boolean;
  /** True when the user picked this unit manually ("Working on") */
  overridden?: boolean;
}


// ── Production line (requires the 'production' manifest permission) ──
// Every USB autopilot plugged into the station becomes a bay with its own
// link, so boards are prepared, calibrated and judged in parallel. The host
// owns the links, writes the golden only behind its own consent dialog, judges
// QA and records the result: a module drives and renders, it cannot forge a pass.

export type ProductionCalibrationType = 'accel-level' | 'accel-quick' | 'accel-6point' | 'compass' | 'gyro';

export interface ProductionRulesInfo {
  requiredCalibrations: ProductionCalibrationType[];
  allowMarginal: boolean;
  requirePersistence: boolean;
  /** Names that may differ from the golden; trailing * = prefix. */
  ignoreParams: string[];
  requireSensorsHealthy: boolean;
  /** Prepare wipes the board to firmware defaults first. */
  resetParams: boolean;
  /** Prepare starts by itself when a board is plugged into a bay assigned to this model (once the model is armed). */
  autoPrepare: boolean;
}

export interface ProductionModelInfo {
  id: string;
  name: string;
  vehicleType?: string;
  firmware?: string;
  firmwareVersion?: string;
  boardId?: string;
  paramCount: number;
  createdAt: number;
  updatedAt: number;
  sourceUnit?: string;
  /** Set when an .apj is pinned: Prepare flashes it onto any board running something else. */
  firmwareFile?: string;
  firmwareSha256?: string;
  firmwareBoardId?: number;
  rules: ProductionRulesInfo;
}

export type BayPhase =
  | 'connecting' | 'identifying' | 'loading-params' | 'ready' | 'writing'
  | 'calibrating' | 'rebooting' | 'resetting' | 'flashing' | 'lost' | 'error';

export interface CalibrationRecordInfo {
  type: string;
  verdict: string;
  summary: string;
  completedAt: number;
  written: Record<string, number>;
  persistence: null | { state: string; summary: string; mismatched: string[]; checkedAt: number };
}

export interface BayCalibrationInfo {
  type: ProductionCalibrationType;
  progress: number;
  statusText: string;
  /** 6-point: pose the autopilot waits for (0 level, 1 left, 2 right, 3 nose down, 4 nose up, 5 inverted). */
  currentPosition?: number;
  positionStatus?: boolean[];
  compassProgress?: number[];
  awaitingPosition: boolean;
}

export interface QaConfigDeltaInfo {
  id: string;
  expected: number;
  actual: number | null;
}

/**
 * `id`: 'firmware' | 'board' | 'config' | 'cal:<type>' | 'sensors' | 'serial' | 'identity'.
 * `code` is a stable machine code (e.g. 'calNeedsReboot'); translate it in the module.
 */
export interface QaCheckInfo {
  id: string;
  status: 'pass' | 'fail' | 'skip';
  code: string;
  vars?: Record<string, string | number>;
}

export interface QaReportInfo {
  passed: boolean;
  checks: QaCheckInfo[];
  configDeltas: QaConfigDeltaInfo[];
  evaluatedAt: number;
}

export interface BayInfo {
  id: string;
  /** Serial port path, or tcp:host:port for a simulator bench. */
  port: string;
  phase: BayPhase;
  phaseDetail?: string;
  progress?: number;
  /** Hardware identity; null when the board reports none (cannot be certified). */
  boardUid: string | null;
  sitl: boolean;
  boardId?: string;
  firmware?: 'ardupilot' | 'px4';
  firmwareVersion?: string;
  vehicleType?: string;
  paramCount: number;
  paramTotal: number;
  sensors: { present: number; enabled: number; health: number } | null;
  calibration: BayCalibrationInfo | null;
  lastCalResult?: { type: ProductionCalibrationType; success: boolean; error?: string; rebootRequired?: boolean };
  records: CalibrationRecordInfo[];
  qa?: QaReportInfo;
  modelId?: string;
  lastStatusText?: string;
  error?: string;
  updatedAt: number;
}

export interface PrepareResultInfo {
  ok: boolean;
  flashed: boolean;
  reset: boolean;
  written: number;
  missing: string[];
  failed: string[];
  error?: string;
}

export interface ProductionRunInfo {
  id: string;
  passed: boolean;
  serial: string;
  unitUid: string;
  modelId: string;
  operator: string;
  station: string;
  at: number;
  failed: string[];
  notes?: string;
}

export type ProductionHostView = 'calibration' | 'firmware' | 'parameters' | 'vault';

// --- Config cards ---------------------------------------------------------
// A module adds a card to an existing configuration screen. The host owns the
// slot's position; the module supplies the card body.

/**
 * `notify`: ArduPilot configuration, Sensors, Status LED, below the built-in LED controls.
 * `gps`: ArduPilot configuration, Sensors, below the GPS wiring card.
 * `hardware`: ArduPilot configuration, Sensors, Hardware, below the detected parts.
 */
export type ConfigCardSlot = 'notify' | 'gps' | 'hardware';

/** A whole tab of its own on the ArduPilot configuration screen. */
export interface ConfigTabRegistration {
  /** Stable id within this module. Re-registering the same id replaces it. */
  id: string;
  /** Tab label. Called when the tab bar renders, so it follows the app language. */
  title(): string;
  /** Tooltip on the tab. */
  description?(): string;
  icon?: ComponentType<{ className?: string }>;
  /** Vehicle kinds that get the tab; every ArduPilot vehicle when omitted. */
  vehicles?: Array<'copter' | 'plane' | 'rover'>;
  /** Put the tab inside one of the host's dropdowns instead of the tab bar. Falls back to the bar when that vehicle has no such group. */
  group?: 'tuning' | 'rc' | 'outputs' | 'safety' | 'hardware' | 'links' | 'storage';
  /** Order among module tabs, low first. They sit after the host's own tabs. */
  order?: number;
  component: ComponentType;
}

/** Where a setup entry is listed in Add hardware. */
export type HardwareSetupCategory =
  | 'rangefinder' | 'depth' | 'airspeed' | 'proximity' | 'flow' | 'gps' | 'telemetry'
  | 'compass' | 'esc' | 'power' | 'lighting' | 'receiver' | 'datalink' | 'autopilot' | 'other';

/** A product in the host's Add hardware dialog that hands over to this module's own setup. */
export interface HardwareSetupEntry {
  id: string;
  category: HardwareSetupCategory;
  /** Official product name, shown as is. */
  name: string;
  /** Shown as a badge on the tile, e.g. your brand. */
  vendor?: string;
  /** One line on what it is for, already translated. */
  description?: string;
  connection?: 'serial' | 'i2c' | 'can' | 'usb' | 'network';
  /** The dialog closes, then this runs: open your setup for this product. */
  open(): void;
}

export interface ConfigCardRegistration {
  /** Stable id within this module. Re-registering the same id replaces it. */
  id: string;
  slot: ConfigCardSlot;
  /** Order among module cards in the same slot, low first. */
  order?: number;
  component: ComponentType;
}

// --- Hardware catalog -----------------------------------------------------
// A module describes products it knows. The host matches them against what it
// detects on the vehicle and shows official names, kit and links in the
// Hardware tab and on DroneCAN node cards.

export type HardwareCategory = 'autopilot' | 'gnss' | 'compass' | 'lighting' | 'esc' | 'receiver' | 'datalink' | 'power' | 'other';

export interface HardwareMatch {
  /** DroneCAN node name from GetNodeInfo. A trailing `*` matches a prefix. */
  dronecanNodeName?: string;
  /** ArduPilot APJ board id reported in AUTOPILOT_VERSION. */
  boardId?: number;
  /** USB serial device. Shared bridge chips (CP210x, CH340) need `manufacturer` to tell products apart. */
  usb?: { vendorId: number; productId: number; manufacturer?: string };
}

export interface BoardPortLabel {
  /** SERIALx index. */
  serial: number;
  /** Connector name printed on the board, e.g. "GPS" or "TELEM1". */
  label: string;
  note?: string;
}

export type CanBusDiagnosis = 'healthy' | 'no-ack' | 'bus-off' | 'rx-errors' | 'idle';

export interface CanBusHealthInfo {
  bitrate: number | null;
  diagnosis: CanBusDiagnosis;
  /** Counter changes over the measurement window (tx_success, tx_timedout, rx_received, num_busoff_err ...). */
  deltas: Record<string, number>;
  intervalMs: number;
}

export interface HardwareProduct {
  /** Stable id within this module. */
  id: string;
  vendor: string;
  /** Official product name. */
  name: string;
  /** Kit this part ships in, if any. */
  kit?: string;
  category: HardwareCategory;
  /** https URL or a data: URL. */
  imageUrl?: string;
  /** Product documentation. Opened in the system browser. */
  docsUrl?: string;
  match: HardwareMatch;
}

export interface DetectedHardware {
  source: 'flight-controller' | 'dronecan';
  /** What the vehicle reported (board name or DroneCAN node name). */
  reportedName: string;
  nodeId?: number;
  boardId?: number;
  /** The catalog entry that matched, from any loaded module. */
  product?: HardwareProduct & { moduleSlug: string };
}

// --- DroneCAN -------------------------------------------------------------
// Read and configure DroneCAN nodes through the flight controller (ArduPilot
// MAV_CMD_CAN_FORWARD). Node-level writes need the 'dronecan' permission.

export interface DroneCanNodeInfo {
  nodeId: number;
  /** 0 ok, 1 warning, 2 error, 3 critical. */
  health: number;
  /** 0 operational, 1 initialization, 2 maintenance, 3 software update, 7 offline. */
  mode: number;
  uptimeSec: number;
  online: boolean;
  name?: string;
  softwareVersion?: string;
  hardwareVersion?: string;
  uniqueId?: string;
}

export type DroneCanParamValue =
  | { type: 'empty' }
  | { type: 'integer'; value: number }
  | { type: 'real'; value: number }
  | { type: 'boolean'; value: boolean }
  | { type: 'string'; value: string };

export interface DroneCanParamInfo {
  index: number;
  name: string;
  value: DroneCanParamValue;
  defaultValue: DroneCanParamValue;
  min?: number;
  max?: number;
}

export interface DroneCanParamChange {
  name: string;
  value: DroneCanParamValue;
}

export interface DroneCanProposalResult {
  accepted: boolean;
  /** Values the node confirmed. */
  written: DroneCanParamInfo[];
  failed: Array<{ name: string; error: string }>;
  /** True when the pilot also saved on the node and it confirmed. */
  saved: boolean;
  error?: string;
}

/** What a module knows about one node parameter. Overrides the host's AP_Periph docs field by field. */
export interface DroneCanParamDoc {
  displayName?: string;
  description?: string;
  /** Enum labels by value; the host shows a picker instead of a number box. */
  values?: Record<number, string>;
  units?: string;
  min?: number;
  max?: number;
  rebootRequired?: boolean;
  /** Writing this can brick or disconnect the node; the host flags it. */
  danger?: boolean;
}

/**
 * Teach the DroneCAN tab about a node: a panel shown above its parameter table
 * and parameter docs. Matched on the GetNodeInfo name; a trailing `*` matches a prefix.
 */
export interface DroneCanNodeProfile {
  /** Stable id within this module. Re-registering the same id replaces it. */
  id: string;
  match: string;
  /** Rendered in the node detail, above the parameters. */
  panel?: ComponentType<{ nodeId: number }>;
  /** Called on render, so labels can come from host.i18n and follow the language. */
  params?: () => Record<string, DroneCanParamDoc>;
}

// --- Parameter proposals --------------------------------------------------

export interface ParamChange {
  name: string;
  value: number;
  /** Shown next to the change in the review dialog. */
  reason?: string;
}

export interface ParamProposalResult {
  /** True when the pilot applied and every change was written. */
  accepted: boolean;
  applied?: number;
  failed?: string[];
  rebootRequired?: string[];
  /** Changes the host refused before showing the dialog (unknown, read-only, protected). */
  rejected: Array<{ name: string; reason: string }>;
  /** Why nothing or not everything was written. */
  error?: string;
}

// --- Vehicle setup ---------------------------------------------------------
// Mirrors apps/desktop/src/shared/vehicle-setup/types.ts (the SDK cannot import desktop code).

export type SetupVehicle = 'copter' | 'heli' | 'plane' | 'vtol' | 'rover' | 'boat' | 'sub';
/** found = already set on the board; needs-pilot = only the pilot can do it (calibration, direction checks). */
export type SetupStepState = 'done' | 'found' | 'needs-pilot' | 'todo';

export interface SetupStepStatus {
  id: string;
  state: SetupStepState;
  titleKey: string;
  blockers: string[];
}

export interface SetupStatus {
  vehicle: SetupVehicle;
  firmware: string;
  steps: SetupStepStatus[];
  /** Live PreArm refusals with the wizard step that fixes each, when known. */
  prearm: { text: string; stepId: string | null }[];
}

export type SetupSuggestionKind = 'tune' | 'airspeed' | 'battery';

export interface SetupSuggestion {
  kind: SetupSuggestionKind;
  inputs: Record<string, number | string>;
  changes: { name: string; value: number; reason: string }[];
  source: string;
}

// --- Firmware sources -----------------------------------------------------

export interface FirmwareSourceRegistration {
  /** Stable id within this module. */
  id: string;
  /** Button label next to the built-in sources on the Firmware screen. */
  name: string;
  /**
   * Shown in place of the file picker when the source is selected. It
   * obtains a firmware file (typically through the module's main process)
   * and hands it over with `host.firmware.useFile`. The host flashes it.
   */
  component: ComponentType;
}

// --- Vehicle templates ----------------------------------------------------

export type VehicleTemplateType = 'copter' | 'plane' | 'vtol' | 'rover' | 'boat' | 'sub';

export interface VehicleTemplateRegistration {
  /** Globally unique; prefix it with your module slug. */
  slug: string;
  name: string;
  description: string;
  vehicleType: VehicleTemplateType;
  category: 'multirotor' | 'fixed-wing' | 'vtol' | 'rover' | 'boat' | 'sub';
  /** Starting values for the vehicle profile form (host VehicleProfile fields). */
  defaults?: Record<string, unknown>;
  /** Parameters this template sets for a profile. Shown and reviewed before writing. */
  params(profile: unknown): Array<{ name: string; value: number; reason: string; requiresReboot?: boolean }>;
  /** Extra parameters only for SITL. */
  simParams?(profile: unknown): Array<{ name: string; value: number; reason: string }>;
}

export interface TitleBarItemProps {
  /** Any vehicle armed: anything that opens an overlay should stay inert meanwhile. */
  anyVehicleArmed: boolean;
}

/**
 * A quiet item in the top bar, in the free space between the app title and the status chips
 * (host.titleBar). It stays visible in every theme and while armed, so keep it calm and small.
 * The slot shrinks first and clips, never pushing the chips: measure your own width to shorten or hide.
 */
export interface TitleBarItemRegistration {
  id: string;
  component: ComponentType<TitleBarItemProps>;
  /** Lower sits closer to the title. Default 0. */
  order?: number;
}

/**
 * A theme a cargo adds next to the built-in dark and light (host.theme).
 *
 * The host adds `className` to <html> while the theme is active, on top of the
 * built-in token set named by `base`, and injects `css`. Scope every rule in
 * `css` under `.${className}` so nothing reaches the other themes. Bundle fonts
 * as data: URLs inside `css`; a cargo has no other path for asset files.
 *
 * Hooks the host exposes to theme CSS:
 * - `html[data-view='<viewId>']` for per-view treatments (telemetry, parameters, ...).
 * - `.nav-rail-short`: a caption inside every rail button, hidden unless a theme shows it.
 * - `.app-header-cap`: an empty block at the start of the top bar, hidden unless a theme shows it.
 * - `.theme-frame` on the work-area grid while `frame` is set (rail, aside and main are its children).
 * - `.app-tooltip`, `.app-console`, `.app-toast`: the hover tooltip, the message console and the activity toast.
 * - Primitive hooks on controls across every screen, unstyled by core:
 *   `[data-ui='tabs'] > [data-ui='tab']`, `[data-ui='segmented'] > [data-ui='segment']`,
 *   `[data-ui='button'][data-variant='primary|secondary|ghost|danger']`, `[data-ui='icon-button']`,
 *   `[data-ui='chip']`, `[data-ui='option']` (large selectable cards), `[data-ui='input']`, and
 *   `[data-ui='card'][data-status='pass|warn|fail|info']`. The selected one carries `[data-active='true']`.
 */
export interface ThemeRegistration {
  /** Unique within this cargo. */
  id: string;
  /** Key in this cargo's i18n resources: the name in Settings > Theme. */
  label: string;
  /** Key in this cargo's i18n resources: the hint under the picker while active. */
  description?: string;
  /** The built-in token set underneath. Callers that pick dark or light assets get this. */
  base: 'dark' | 'light';
  /** Added to <html> while active. */
  className: string;
  /** Injected while active, removed when another theme is chosen. */
  css: string;
  /**
   * Accent colours, in order. Controls whose colour arrives as an inline hex
   * (slider tracks with a paletteIndex) take these instead, so CSS need not reach them.
   * Semantic colours (green, red, amber) are never remapped.
   */
  palette?: string[];
  /** Icon for the theme toggle on the rail. */
  icon?: ComponentType<{ className?: string }>;
  /** Frame around the work area while active: bars above and below rail, sidebar and view. */
  frame?: { top?: ComponentType; bottom?: ComponentType };
  /** Behind the welcome page while active, sized to it. */
  welcomeBackground?: ComponentType;
  /** Behind the map tiles while active, sized to the map. */
  mapBackground?: ComponentType;
  /** Opened from Settings > Theme in a floating dialog. */
  settings?: ComponentType;
  /** Mounted under the top bar while the cargo is loaded, whichever theme is active (an introduction, a dedication). Hidden while any vehicle is armed. */
  banner?: ComponentType;
  /** Mounted over the view area while the cargo is loaded, whichever theme is active (a switch-in animation). Unmounted while any vehicle is armed. */
  overlay?: ComponentType;
  /** A rail utility button while the cargo is loaded. Give the button the `nav-rail-util` class. */
  railUtility?: ComponentType;
  /** Shown in Settings > About while the cargo is loaded. */
  aboutCard?: ComponentType;
  /** True while the banner or overlay holds the pilot's attention; the host holds tour prompts back. */
  claimsAttention?: () => boolean;
}

export interface RendererHostApi {
  moduleSlug: string;
  telemetry: {
    getSnapshot(): unknown;
    subscribe(listener: (s: unknown) => void): () => void;
  };
  connection: {
    getState(): unknown;
    subscribe(listener: (s: unknown) => void): () => void;
  };
  view: {
    getCurrent(): string;
    subscribe(listener: (v: string) => void): () => void;
    /** The host's short name for a view in the pilot's language (the rail caption); the current view when omitted. */
    label(viewId?: string): string;
  };
  params: {
    getAll(): Promise<unknown[]>;
    get(name: string): Promise<unknown>;
    /**
     * Same as proposing one change: the pilot sees it in the review dialog
     * first. Resolves once written; rejects if declined or the write failed.
     */
    set(name: string, value: number): Promise<void>;
    /**
     * Show proposed parameter writes in the host's review dialog. Nothing is
     * written unless the pilot applies; the host does the write. Prefer this
     * over `params.set`.
     */
    propose(changes: ParamChange[], reason: string): Promise<ParamProposalResult>;
    /**
     * Make sure the full parameter set is loaded, downloading it if needed.
     * `getAll`/`get` only see what the host already has, which after connect
     * can be a partial set until the Parameters screen fetched the rest.
     * Resolves false when there is no vehicle or the download did not finish.
     */
    ensureLoaded(timeoutMs?: number): Promise<boolean>;
  };
  /**
   * Quick setup wizard, for guiding a pilot through a new vehicle. Nothing here
   * writes to the vehicle: suggestions go through `params.propose`. Missing on
   * hosts older than the wizard, so feature-detect `host.setup`.
   */
  setup: {
    /** Null when no ArduPilot vehicle is connected. */
    getStatus(): Promise<SetupStatus | null>;
    /** Opens Quick setup at a step id from `getStatus`; false for an unknown id. */
    openStep(stepId: string): Promise<boolean>;
    /**
     * Starting values for this vehicle. Inputs default to the saved profile;
     * `inputs` overrides them. Rejects naming what is missing (tune: propIn,
     * cells, chemistry; airspeed: stall; battery: cells, chemistry).
     */
    suggest(kind: SetupSuggestionKind, inputs?: Record<string, number | string>): Promise<SetupSuggestion>;
    /** The saved physical profile for the connected vehicle, else the active one; null if none. */
    getProfile(): Promise<Record<string, unknown> | null>;
  };
  /**
   * Read-only access to the flight log open in the Log Explorer, for modules
   * that reason about a past flight (crash analysis, tuning review). The tool
   * definitions and executor mirror the host's own AI log analysis, so a module
   * can run a Claude tool-use loop over the log without shipping a parser.
   */
  logs: {
    /** The log currently open in the Log Explorer, or null if none is loaded. */
    getCurrent(): { name: string; path: string | null; messageTypes: number } | null;
    /** Claude tool definitions for querying the loaded log. */
    tools(): unknown[];
    /** Run a log query tool by name against the loaded log; throws if none is open. */
    callTool(name: string, input: Record<string, unknown>): unknown;
  };
  pty: {
    create(opts: PtyCreateOptions): Promise<string>;
    write(id: string, data: string): Promise<void>;
    resize(id: string, cols: number, rows: number): Promise<void>;
    kill(id: string): Promise<void>;
    onData(id: string, cb: (d: string) => void): () => void;
    onExit(id: string, cb: (code: number) => void): () => void;
  };
  invoke(channel: string, data: unknown): Promise<unknown>;
  /** Subscribe to events the module's main process pushes via `MainHostApi.emit`. */
  on(channel: string, cb: (data: unknown) => void): () => void;
  log(level: 'info' | 'warn' | 'error', ...args: unknown[]): void;
  registerMountPoint(name: MountPointName, component: ComponentType): void;
  /**
   * Fleet vault access (snapshots, history, sync). Requires the 'vault'
   * manifest permission; every method rejects without it. The vault engine
   * and its setup UI (GitHub connect, restore) stay host-owned - modules can
   * read history, take snapshots and trigger sync, not manage credentials.
   */
  vault: {
    status(): Promise<VaultStatusInfo>;
    listUnits(): Promise<VaultUnitInfo[]>;
    history(limit?: number): Promise<VaultHistoryEntryInfo[]>;
    /** Read a file from the vault (current, or at a history entry's oid) */
    readFile(path: string, oid?: string): Promise<string | null>;
    /** Snapshot the connected vehicle's parameters (host identity rules apply) */
    snapshotParams(note?: string): Promise<{ success: boolean; changed?: boolean; error?: string }>;
    /** Snapshot under a fresh minted identity (no unique board UID, or wrong auto-match). `name` seeds the unit label. */
    snapshotAsNewVehicle(name?: string, note?: string): Promise<{ success: boolean; error?: string }>;
    sync(): Promise<{ success: boolean; error?: string }>;
    /** Workspace state for a full vault UI; `subscribe` fires on every change. */
    getState(): VaultWorkspaceState;
    subscribe(listener: (state: VaultWorkspaceState) => void): () => void;
    refresh(): Promise<void>;
    snapshotMission(site: string, missionName: string): Promise<boolean>;
    snapshotArea(site: string): Promise<boolean>;
    renameUnit(uid: string, name: string): Promise<boolean>;
    /** Remove a vehicle from the vault; its snapshots stay in the history */
    deleteUnit(uid: string): Promise<boolean>;
    /** File the connected vehicle's board id under an existing unit */
    linkUnit(unitUid: string, aliasUid: string): Promise<boolean>;
    setUnitOverride(uid: string | null): void;
    openSnapshot(oid: string, uid: string): Promise<void>;
    closeSnapshot(): void;
    /** Write the open snapshot's changed params to the vehicle (host checks owner and firmware) */
    restoreSnapshot(includeCalibration: boolean): Promise<{ applied: number; failed: number }>;
    setAutoSync(on: boolean): Promise<void>;
    clearMessages(): void;
    openFolder(): void;
    /** Opens the host's backup setup; credentials never pass through a module */
    openBackupSetup(): void;
  };
  /**
   * Production line station. Requires the 'production' manifest permission.
   * Records land in the fleet vault (models/, units/<uid>/birth.json, production/runs/).
   */
  production: {
    /** Start watching USB for autopilots (each becomes a bay). Call when the station view opens. */
    startBays(): Promise<BayInfo[]>;
    /** Close every bay and release the ports. Bays keep running while the operator looks at other views. */
    stopBays(): Promise<void>;
    isStationRunning(): Promise<boolean>;
    getBays(): BayInfo[];
    subscribeBays(listener: (bays: BayInfo[]) => void): () => void;
    /** A simulator or network bench as a bay, e.g. "127.0.0.1:5760". */
    addSimulatorBay(endpoint: string): Promise<string>;
    /** `ignore` keeps that USB port out of the station until restoreIgnoredPorts(). */
    removeBay(bayId: string, ignore?: boolean): Promise<void>;
    restoreIgnoredPorts(): Promise<void>;
    setBayModel(bayId: string, modelId: string | null): Promise<void>;
    setModelForAllBays(modelId: string): Promise<void>;
    /** Station name stamped on every run (defaults to the computer name). */
    getStation(): Promise<string>;
    setStation(name: string): Promise<string>;
    listModels(): Promise<ProductionModelInfo[]>;
    /**
     * Save a full configuration as a model's golden: a bay, the vehicle on the app's main connection,
     * a Fleet Vault vehicle's latest snapshot, or a .param file the operator picks (null if cancelled).
     */
    captureGolden(source: { bayId: string } | 'connected' | { vaultUnit: string } | 'file', name: string): Promise<ProductionModelInfo | null>;
    updateRules(modelId: string, rules: ProductionRulesInfo): Promise<ProductionModelInfo | null>;
    /** Remove a model (recoverable in vault history). Certificates already issued are kept. */
    deleteModel(modelId: string): Promise<void>;
    /** Host file picker for the model's .apj; null when the operator cancels. */
    attachFirmware(modelId: string): Promise<ProductionModelInfo | null>;
    previewGolden(bayId: string, modelId: string): Promise<{ deltas: QaConfigDeltaInfo[]; armed: boolean }>;
    /** Host consent dialog that clears this model's golden for every bay until the app restarts. Needed for autoPrepare. */
    armModel(modelId: string, bayId: string): Promise<boolean>;
    /** Flash if needed, reset, write the golden through reboots until the board matches. Asks consent unless armed. */
    prepare(bayId: string, modelId: string): Promise<PrepareResultInfo>;
    flash(bayId: string, modelId: string): Promise<{ success: boolean; error?: string }>;
    resetToDefaults(bayId: string): Promise<boolean>;
    /** Reboot; calibration persistence is re-checked when the board is back. */
    reboot(bayId: string): Promise<boolean>;
    startCalibration(bayId: string, type: ProductionCalibrationType): Promise<{ success: boolean; error?: string }>;
    /** 6-point: confirm the board is held in `position` (from BayCalibrationInfo.currentPosition). */
    confirmCalibrationPosition(bayId: string, position: number): Promise<{ success: boolean; error?: string }>;
    cancelCalibration(bayId: string): Promise<void>;
    runQa(bayId: string, modelId: string, serial: string): Promise<QaReportInfo>;
    /** Run QA and record the outcome. A pass writes the unit's birth certificate. */
    submit(bayId: string, modelId: string, serial: string, operator: string, notes?: string): Promise<{ report: QaReportInfo; run: ProductionRunInfo }>;
    listRuns(limit?: number): Promise<ProductionRunInfo[]>;
    /** Fires after a golden, certificate or run was written to the vault. */
    onRecordsChanged(listener: () => void): () => void;
    openHostView(view: ProductionHostView): void;
  };
  /**
   * Which vehicle the app currently attributes work to (auto-detected or
   * user-overridden). Null while disconnected or unidentified.
   */
  vehicleIdentity: {
    get(): VehicleIdentity | null;
    subscribe(listener: (identity: VehicleIdentity | null) => void): () => void;
  };
  /** Host lifecycle events modules can react to */
  events: {
    /** Fires after parameters were successfully written to flash */
    onParamsFlashed(listener: (info: { paramCount: number }) => void): () => void;
  };
  /**
   * Contribute a panel to the host-owned module dock (one collision-free tray
   * the host renders in a corner). The module supplies only the panel body; the
   * host owns the launcher chip, placement, and open/close chrome. Prefer this
   * over a raw `floatingOverlay` for module settings/controls.
   */
  panels: {
    register(reg: ModulePanelRegistration): void;
    /** Remove a panel this module registered. Other modules' ids are ignored. */
    unregister(id: string): void;
  };
  /** Panels for the pilot's workspace grid, next to Map, Vision and Messages. */
  workspace: {
    registerPanel(reg: WorkspacePanelRegistration): void;
    /** Remove a panel this module registered. Other modules' ids are ignored. */
    unregisterPanel(id: string): void;
  };
  /** Fill the nav view this cargo unlocks. Throws for a view another cargo owns. */
  views: {
    register(reg: ModuleViewRegistration): void;
    unregister(viewId: string): void;
  };
  /**
   * HUD overlay geometry for `cameraOverlay` modules. `getProjection()` returns
   * null when the fighter HUD isn't currently active (the module should draw
   * nothing); `subscribe` fires on activation / config (scale) changes.
   */
  hud: {
    getProjection(): HudProjection | null;
    subscribe(listener: (p: HudProjection | null) => void): () => void;
    /**
     * Contribute a toggleable instrument to the HUD overlay's Instruments list,
     * alongside the built-ins. The user's checkbox drives its on/off state; read
     * it back with isInstrumentEnabled() from your cameraOverlay component and
     * draw only when enabled. The row appears only while this module is loaded,
     * so it never clutters the HUD for users without the module.
     */
    registerInstrument(reg: HudInstrumentRegistration): void;
    /** Remove an instrument this module registered. Other modules' ids are ignored. */
    unregisterInstrument(id: string): void;
    /** Current on/off state of a registered instrument (false if unknown). */
    isInstrumentEnabled(id: string): boolean;
  };
  /**
   * Contribute a character-cell OSD element. It appears in the OSD Designer
   * palette alongside built-ins. Registering an id this module already
   * registered replaces it.
   */
  osd: {
    registerElement(reg: OsdElementRegistration): void;
    /** Remove an element this module registered. Other modules' ids are ignored. */
    unregisterElement(id: string): void;
  };
  /**
   * Read-only mission waypoints (host MissionItem shape: `{ seq, latitude,
   * longitude, command, … }`), for target selection. `subscribe` fires on
   * mission edits / uploads.
   */
  mission: {
    getWaypoints(): unknown[];
    /**
     * The planned home, which relative altitudes count from. ArduDeck keeps it apart from the
     * waypoints (item 0 is the first mission item, not home). `altMsl` is null when home has no
     * altitude of its own; it then sits on the ground at that point.
     */
    getHome?(): { lat: number; lng: number; altMsl: number | null } | null;
    /** Fires on mission edits, uploads and home changes. */
    subscribe(listener: (waypoints: unknown[]) => void): () => void;
  };
  /**
   * Read-only active map command target for the primary vehicle (the guided
   * "move here" goto / orbit centre), or null when idle.
   */
  commandTarget: {
    get(): unknown;
    subscribe(listener: (target: unknown) => void): () => void;
  };
  /**
   * Draw on the live map. Registration only: the host renders the features,
   * owns the layer control, and never lets a module layer cover the vehicle
   * or the mission.
   */
  /**
   * Tell the pilot something. Goes into the host's message stream; raising an
   * id again replaces that alert rather than stacking another.
   */
  /**
   * Ask the pilot to put something on the aircraft. The host renders the
   * dialog and performs the write; a module cannot bypass either.
   */
  /**
   * Contribute a panel to the mission planning workspace, tabbed alongside
   * Waypoints and Survey. The right home for anything edited while watching
   * the map, which a floating window cannot be.
   */
  missionWorkspace: {
    registerPanel(reg: MissionPanelRegistration): void;
    unregisterPanel(id: string): void;
    /** Bring this module's panel to the front, opening it if it is closed. */
    openPanel(id: string): void;
  };
  vehicle: {
    proposeFence(proposal: FenceProposal): Promise<ProposalResult>;
    /** Fence storage on the connected vehicle, so a proposal can be cut to fit first. */
    fenceBudget(): Promise<FenceBudget>;
    /** Add waypoints to the planned mission. The host shows them and writes nothing until the pilot applies. */
    proposeMission(proposal: MissionProposal): Promise<ProposalResult>;
    /**
     * Fly to a point and land there. The host confirms with the pilot, flies there in Guided
     * at `transitAltRelM`, then switches to Land on arrival. Copters only, armed and in the air.
     */
    proposeLanding(proposal: LandingProposal): Promise<ProposalResult>;
  };
  /** Host file dialogs. The pilot picks; the module gets a path or null. */
  files: {
    pickFolder(title?: string): Promise<string | null>;
  };
  /**
   * The host's built-in ArduPilot SITL, driven by a cargo that brings the physics (Gazebo). Missing
   * on hosts older than the Gazebo cargo, so feature-detect `host.sitl`.
   */
  sitl: {
    /**
     * Start SITL with its physics coming from an external process over the JSON FDM link.
     * Refused while the Trainer holds the physics port or a vehicle is armed.
     */
    startExternal(req: SitlExternalStartRequest): Promise<SitlStartResult>;
    stop(): Promise<void>;
    getStatus(): SitlHostStatus;
    subscribe(listener: (s: SitlHostStatus) => void): () => void;
  };
  /**
   * Video feeds a cargo adds to the host's camera views, under the vehicle the pilot has selected.
   * Missing on older hosts, so feature-detect `host.camera`.
   */
  camera: {
    registerStream(reg: CameraStreamRegistration): void;
    /** Remove a stream this cargo registered. Other cargos' ids are ignored. */
    unregisterStream(id: string): void;
  };
  /** Ground elevation, metres AMSL. Null where the host has no data. */
  terrain: {
    elevationAt(lat: number, lng: number): Promise<number | null>;
    /** Batched: one request for the set, not one per point. */
    elevationsAt(points: { lat: number; lng: number }[]): Promise<(number | null)[]>;
  };
  alerts: {
    raise(alert: ModuleAlert): void;
    /** Withdraw an alert this module raised. */
    clear(id: string): void;
  };
  map: {
    registerLayer(reg: MapLayerRegistration): void;
    /** Remove a layer this module registered. Other modules' ids are ignored. */
    unregisterLayer(id: string): void;
    /** Put an instrument on the telemetry map, next to the built-in gauges. Re-registering an id replaces it. */
    registerInstrument(reg: MapInstrumentRegistration): void;
    /** Remove an instrument this module registered. Other modules' ids are ignored. */
    unregisterInstrument(id: string): void;
    /** Open the settings dialog of an instrument this module registered. */
    openInstrumentSettings(id: string): void;
    /**
     * Ask the pilot to draw an area. The host owns the interaction: clicks
     * place corners, a double click closes the ring, Escape cancels.
     * Resolves with the ring, or null if they backed out. With `initial` it
     * starts from those points, which the pilot can drag, so a shape can be edited.
     */
    pickPolygon(prompt?: string, initial?: MapPoint[]): Promise<MapPoint[] | null>;
    /** Ask the pilot for a line of two or more points. Same gestures as `pickPolygon`; the ring is not closed. */
    pickPath(prompt?: string, initial?: MapPoint[]): Promise<MapPoint[] | null>;
    /**
     * Ask the pilot for one point: the first click resolves, Escape cancels.
     * With `initial`, it starts there and waits for Done, so an existing point can be moved.
     */
    pickPoint(prompt?: string, initial?: MapPoint): Promise<MapPoint | null>;
    /** Centre the telemetry map on a point (the pilot's follow mode is turned off). */
    centerOn(point: MapPoint, zoom?: number): void;
  };
  /**
   * Translations for this module's own text. Ship every language you support;
   * the host falls back to English. Keys may be nested objects.
   */
  i18n: {
    addResources(resources: Record<string, Record<string, unknown>>): void;
    /** Translate a key from your resources, with {{placeholders}} and `count` plurals (key_one / key_other). */
    t(key: string, vars?: Record<string, unknown>): string;
    /** Active app language code, e.g. 'en' or 'de'. */
    language(): string;
    /** Called after the pilot switched language, so rendered text can follow. */
    subscribe(listener: () => void): () => void;
  };
  /** Themes next to the built-in dark and light. Unloading the cargo falls the pilot back to dark. */
  /** Items in the top bar between the title and the status chips. */
  titleBar: {
    register(reg: TitleBarItemRegistration): void;
    /** Remove an item this cargo registered. Other cargos' ids are ignored. */
    unregister(id: string): void;
  };
  theme: {
    register(reg: ThemeRegistration): void;
    unregister(id: string): void;
    /** Replace parts of a registered theme, e.g. regenerated `css` after a setting changed. */
    update(id: string, patch: Partial<Omit<ThemeRegistration, 'id'>>): void;
    /** Whether one of this cargo's themes is the active one. */
    isActive(id: string): boolean;
    /** Make one of this cargo's themes the active one. */
    activate(id: string): void;
    /** Called whenever the active theme changes. */
    subscribe(listener: () => void): () => void;
  };
  /** Positions in other notations: what you register appears in the host's coordinate format setting. */
  coordinates: {
    registerFormat(reg: CoordinateFormatRegistration): void;
    unregisterFormat(id: string): void;
    /** The format positions are shown in: 'decimal', 'dms', one of yours by its id, or another cargo's ('other'). */
    current(): string;
    /** Switch the pilot's coordinate format: 'decimal', 'dms' or one of your format ids. */
    select(id: string): void;
    subscribe(listener: (current: string) => void): () => void;
  };
  /** Add a card to an existing configuration screen. */
  config: {
    registerCard(reg: ConfigCardRegistration): void;
    /** Add a tab to the ArduPilot configuration screen (not shown for PX4 or INAV). */
    registerTab(reg: ConfigTabRegistration): void;
    unregisterTab(id: string): void;
    /** Remove a card this module registered. Other modules' ids are ignored. */
    unregisterCard(id: string): void;
  };
  hardware: {
    /** Add or replace this module's product catalog. */
    registerProducts(products: HardwareProduct[]): void;
    unregisterProducts(): void;
    /** What the host currently detects, with catalog matches from every module. */
    getDetected(): DetectedHardware[];
    /** Name the serial connectors of an autopilot (APJ board id) in the Serial Ports tab. */
    registerBoardPorts(boardId: number, ports: BoardPortLabel[]): void;
    subscribe(listener: (detected: DetectedHardware[]) => void): () => void;
    /** Add or replace this module's entries in the Add hardware dialog. */
    registerSetups(entries: HardwareSetupEntry[]): void;
    unregisterSetups(): void;
  };
  dronecan: {
    /**
     * Keep the bus monitored while you need it. Starts CAN forwarding on the
     * first DroneCAN port if nothing else has; call the returned function to
     * release. Monitoring stops when the last holder releases.
     */
    acquire(): () => void;
    getNodes(): DroneCanNodeInfo[];
    subscribe(listener: (nodes: DroneCanNodeInfo[]) => void): () => void;
    listParams(nodeId: number): Promise<DroneCanParamInfo[]>;
    /** Health of the first DroneCAN port from the FC's CAN statistics, or null when unavailable. Takes ~2 s on first call. */
    getBusStats(): Promise<CanBusHealthInfo | null>;
    /**
     * Show node parameter writes in the host's DroneCAN review dialog. The
     * pilot applies (optionally saving on the node) or cancels; the host
     * writes. Needs the 'dronecan' permission.
     */
    proposeParams(nodeId: number, changes: DroneCanParamChange[], options?: { reason?: string; saveByDefault?: boolean }): Promise<DroneCanProposalResult>;
    /** Needs the 'dronecan' permission. */
    restartNode(nodeId: number): Promise<boolean>;
    /** Add a panel and parameter docs for matching nodes in the DroneCAN tab. */
    registerNodeProfile(profile: DroneCanNodeProfile): void;
    unregisterNodeProfile(id: string): void;
  };
  firmware: {
    registerSource(reg: FirmwareSourceRegistration): void;
    unregisterSource(id: string): void;
    /** Hand a firmware file to the Firmware screen; the pilot still presses Flash. */
    useFile(path: string): void;
    /** Board the Firmware screen detected, if any. */
    getDetectedBoard(): { name: string; target: string; mcu?: string; apjBoardId?: number } | null;
  };
  vehicleTemplates: {
    register(reg: VehicleTemplateRegistration): void;
    unregister(slug: string): void;
  };
  survey: {
    /**
     * Contribute a coverage engine to the survey planner. It appears next to
     * the built-in patterns in the survey UI; the id must NOT use the
     * reserved `builtin.` prefix. Registering an id this module already
     * registered replaces it.
     */
    registerGenerator(reg: SurveyGeneratorRegistration): void;
    /** Remove a generator this module registered. Other modules' ids are ignored. */
    unregisterGenerator(id: string): void;
  };
}

export type VehicleClass = 'copter' | 'plane' | 'other';

/** What the safety gate sees for the commanded vehicle. Steering needs connected, ardupilot, armed and guided. */
export interface GuidedState {
  connected: boolean;
  sysid: number | null;
  armed: boolean;
  guided: boolean;
  vehicleClass: VehicleClass;
  ardupilot: boolean;
}

/**
 * A MAV_CMD for the commanded vehicle. Sent as COMMAND_INT when latitude and
 * longitude are given, else COMMAND_LONG. Only camera, gimbal and Guided
 * steering commands are allowed; steering ones need the vehicle armed in Guided.
 */
export interface VehicleCommandRequest {
  command: number;
  /** param1..param7 (COMMAND_INT uses param1..param4) */
  params?: number[];
  latitude?: number;
  longitude?: number;
  altitude?: number;
  /** MAV_FRAME for COMMAND_INT, default 6 (global, relative altitude) */
  frame?: number;
  targetComponent?: number;
  /** Resolve once sent, without waiting for COMMAND_ACK */
  noAck?: boolean;
}

export interface VehicleCommandResult {
  ok: boolean;
  /** MAV_RESULT from the vehicle's COMMAND_ACK */
  result?: number;
  error?: string;
}

/**
 * Guided steering. Velocities are metres per second in the aircraft's own frame
 * (forward, right, down) with yaw rate in rad/s. A copter stops on its own about
 * 3 s after the last one. Position targets use altitude relative to home.
 */
export type VehicleSetpoint =
  | { kind: 'velocityBody'; forward: number; right: number; down: number; yawRate: number }
  | { kind: 'positionGlobal'; latitude: number; longitude: number; altitude: number };

export interface VehicleSetpointResult {
  ok: boolean;
  error?: string;
}

export interface MavlinkFrame {
  msgid: number;
  sysid: number;
  compid: number;
  payload: Uint8Array;
}

export interface CameraStreamInfo {
  sourceId: string;
  /** Loopback RTSP URL of the live feed (TCP only). */
  rtspUrl: string;
}

// --- External physics, camera streams and programs (Gazebo cargo) ----------

/** Where the built-in ArduPilot SITL takes its flight physics from instead of simulating them itself. */
export interface ExternalPhysics {
  /** ArduPilot's JSON FDM link: SITL sends servo outputs to `host` and reads the state back. */
  kind: 'json';
  host: string;
  /** UDP 9002 is the only port ArduPilot's JSON backend uses for instance 0; anything else is refused. */
  port?: number;
}

export interface SitlExternalStartRequest {
  vehicleType: 'copter' | 'plane' | 'rover' | 'sub';
  /** SITL frame name the parameters are written for (quad, plane, rover...). Defaults per vehicle type. */
  model?: string;
  physics: ExternalPhysics;
  /** Parameter files loaded after the host's own frame defaults, later files win. */
  extraDefaultsFiles?: string[];
  /** Single parameters written on top of everything else. */
  extraParams?: Record<string, number>;
  /** Take-off point; the pilot's saved SITL home when omitted. */
  home?: { lat: number; lng: number; alt: number; heading: number };
}

export interface SitlStartResult {
  success: boolean;
  /** The SITL command line, for the cargo's own log. */
  command?: string;
  error?: string;
}

export interface SitlHostStatus {
  running: boolean;
  starting: boolean;
  /** Set while the running SITL takes its physics from outside; null for built-in or ArduDeck physics. */
  external: ExternalPhysics | null;
  vehicleType: string | null;
  error: string | null;
}

/** A live video feed a cargo adds to the host's camera views. */
export interface CameraStreamRegistration {
  /** Unique within the cargo; the host prefixes the slug. */
  id: string;
  label: string;
  /** `udp://host:port` the feed arrives on. */
  url: string;
  /** Set when the feed is RTP (payload 96..98) rather than an MPEG-TS or raw elementary stream. */
  rtpCodec?: 'h264' | 'h265';
  hfovDeg?: number;
  vfovDeg?: number;
}

export interface ProcessRunRequest {
  /** Absolute path or a name on the PATH. */
  command: string;
  args: string[];
  cwd?: string;
  /** Merged over the host's environment. */
  env?: Record<string, string>;
  /** One line shown to the pilot in the prompt, saying why the cargo starts this program. */
  reason: string;
}

export interface ProcessHandle {
  pid: number;
  onOutput(cb: (line: string, stream: 'stdout' | 'stderr') => void): () => void;
  onExit(cb: (code: number | null, signal: string | null) => void): () => void;
  /** SIGTERM by default; the process tree on Windows. */
  kill(signal?: 'SIGTERM' | 'SIGKILL'): void;
}

// --- Lua scripts on the flight controller ----------------------------------

export interface ScriptInstallRequest {
  /** File name under /APM/scripts/, e.g. `my_script.lua`. */
  filename: string;
  /** The Lua source, written byte for byte. */
  source: string;
  /** Raise SCR_HEAP_SIZE to at least this many bytes when it is lower. */
  minHeap?: number;
  /** A parameter the script adds at boot; the install waits for it to prove the script runs. */
  expectParam?: string;
}

export type ScriptInstallProgress =
  | { phase: 'checking' }
  | { phase: 'configuring'; param: string; value: number }
  | { phase: 'uploading'; written: number; total: number }
  | { phase: 'rebooting' }
  | { phase: 'verifying' };

export type ScriptInstallResult =
  | { status: 'installed' }
  /** The board will not take files over the link: the user copies it to `targetPath` on the SD card. */
  | { status: 'manual'; targetPath: string; reason: string }
  | { status: 'error'; message: string };

export interface MainHostApi {
  moduleSlug: string;
  dataDir: string;
  readData(key: string): Promise<string | undefined>;
  writeData(key: string, value: string): Promise<void>;
  /**
   * Encrypted-at-rest storage for secrets (e.g. API keys), backed by the OS
   * keychain via Electron safeStorage. Falls back to plaintext with a warning
   * if OS encryption is unavailable. Prefer this over writeData for secrets.
   */
  secureRead(key: string): Promise<string | undefined>;
  secureWrite(key: string, value: string): Promise<void>;
  log(level: 'info' | 'warn' | 'error', ...args: unknown[]): void;
  /** Push an event to the module's renderer (subscribe with `RendererHostApi.on`). For streaming. */
  emit(channel: string, data: unknown): void;
  onRendererMessage(
    channel: string,
    handler: (data: unknown) => unknown | Promise<unknown>,
  ): () => void;
  /**
   * Command and steer the vehicle the pilot has selected. Needs the
   * 'vehicleControl' permission. The host refuses anything that moves the
   * aircraft unless it is an ArduPilot vehicle, armed and in Guided, so the
   * pilot's mode switch always wins.
   */
  vehicle: {
    getGuidedState(): GuidedState;
    command(req: VehicleCommandRequest): Promise<VehicleCommandResult>;
    setpoint(sp: VehicleSetpoint): Promise<VehicleSetpointResult>;
  };
  /** Raw frames from the vehicle link. Pass null to receive every message. */
  mavlink: {
    subscribe(msgIds: number[] | null, listener: (frame: MavlinkFrame) => void): () => void;
  };
  /** Live video feeds the host is relaying. */
  camera: {
    listStreams(): Promise<CameraStreamInfo[]>;
  };
  /**
   * Start a program on this computer (a simulator, a bridge). Needs the 'pty' permission, the one
   * that already lets a cargo open a terminal. The pilot is asked before the first start of each
   * command line and can allow it for good; a refusal rejects. Missing on older hosts.
   */
  process: {
    run(req: ProcessRunRequest): Promise<ProcessHandle>;
  };
  /** Map tiles this module serves (DEM override or raster overlay). */
  tiles: {
    register(reg: TileSourceRegistration): void;
    unregister(id: string): void;
  };
  /** Textured meshes for the synthetic vision and 3D mission scenes. */
  scene: {
    registerMesh(reg: SceneMeshRegistration): void;
    unregisterMesh(id: string): void;
  };
  /**
   * Put a Lua script on the connected ArduPilot. Needs the 'scripts' permission.
   * Turns scripting on, uploads, reboots (the host restarts SITL itself) and, with
   * `expectParam`, waits until the script has started. Refuses while armed.
   */
  scripts: {
    install(req: ScriptInstallRequest, onProgress?: (p: ScriptInstallProgress) => void): Promise<ScriptInstallResult>;
    /** Let the user save the script to a file, for copying to the SD card by hand. Resolves to the saved path. */
    saveCopy(filename: string, source: string): Promise<string | null>;
  };
}

export interface ModuleMainExports {
  activate?: (host: MainHostApi) => unknown | Promise<unknown>;
  deactivate?: () => void | Promise<void>;
}

export interface ModuleRendererExports {
  activate?: (host: RendererHostApi) => unknown | Promise<unknown>;
  deactivate?: () => void | Promise<void>;
}

export interface LoadedModuleInfo {
  slug: string;
  manifest: ModuleManifest;
  installPath: string;
}
