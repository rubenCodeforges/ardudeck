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
    set(name: string, value: number): Promise<void>;
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
  map: {
    registerLayer(reg: MapLayerRegistration): void;
    /** Remove a layer this module registered. Other modules' ids are ignored. */
    unregisterLayer(id: string): void;
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
