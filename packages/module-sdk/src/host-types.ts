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
  /** Inclusion polygon the aircraft must stay within. */
  inclusion: MapPoint[];
  /** Why the module is asking, in the pilot's words. */
  reason: string;
}

export interface ProposalResult {
  /** False when the pilot declined, or when nothing could be written. */
  accepted: boolean;
  /** What the vehicle confirmed it stored. Absent when nothing was sent. */
  pointsAccepted?: number;
  /** Set when the write was attempted and failed. */
  error?: string;
}

// --- Terrain --------------------------------------------------------------

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

export type MapFeature =
  | MapPolygonFeature
  | MapPolylineFeature
  | MapMarkerFeature;

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
  /** Current features. Called when the host redraws, so keep it cheap. */
  features(): MapFeature[];
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


// --- Config cards ---------------------------------------------------------
// A module adds a card to an existing configuration screen. The host owns the
// slot's position; the module supplies the card body.

/**
 * `notify`: ArduPilot configuration, Sensors, Status LED, below the built-in LED controls.
 * `gps`: ArduPilot configuration, Sensors, below the GPS wiring card.
 * `hardware`: ArduPilot configuration, Sensors, Hardware, below the detected parts.
 */
export type ConfigCardSlot = 'notify' | 'gps' | 'hardware';

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
    /**
     * Ask the pilot to draw an area. The host owns the interaction: clicks
     * place corners, a double click closes the ring, Escape cancels.
     * Resolves with the ring, or null if they backed out.
     */
    pickPolygon(prompt?: string): Promise<MapPoint[] | null>;
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
  };
  /** Add a card to an existing configuration screen. */
  config: {
    registerCard(reg: ConfigCardRegistration): void;
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
