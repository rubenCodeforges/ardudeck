/** Shapes shared between the Trainer's main-process module and its renderer view. */

/** A Trainer running on its own with its own SITL, as announced in `~/.ardudeck/trainer-live.json`. */
export interface TrainerLive {
  pid: number;
  trainerVersion: string | null;
  vehicle: string | null;
  region: string | null;
  /** Always loopback. */
  host: string;
  port: number;
  handoverSupported: boolean;
}

export interface TrainerStatus {
  /**
   * Whether the Trainer surfaces belong on screen at all.
   *
   * The cargo, OR an explicit local path. The override is there because the cargo cannot be
   * installed before it is published, and a feature that can only be tested once it ships is a
   * feature that ships untested.
   */
  available: boolean;
  installed: boolean;
  /** How it will be started, for the diagnostics line. Null when not installed. */
  kind: 'app' | 'binary' | 'checkout' | null;
  path: string | null;
  /** Every place looked. Shown when nothing was found, so this never fails silently. */
  searched: string[];
  home: { lat: number; lon: number; altM?: number | null; headingDeg?: number | null } | null;
  canLaunch: boolean;
  /** Why not, in words a pilot can act on. Null when it can. */
  reason: string | null;
}

/**
 * Sky, light and wind for one flight.
 *
 * Deliberately partial and loosely typed: the Trainer sanitises it and fills anything absent,
 * so this side names only the fields it actually offers. Copying the full shape across would be
 * a second definition of it in a second repository.
 */
export interface TrainerConditions {
  time?: string;
  weatherMode?: 'live' | 'preset';
  preset?: string;
  windMode?: 'live' | 'preset';
  windMs?: number;
  /** Where the wind comes FROM, the convention every pilot and forecast uses. */
  windFromDeg?: number;
  gust?: string;
}

/** What the view can override for one flight. Everything absent stays the Trainer's own. */
export interface TrainerLaunchInput {
  region?: string | null;
  camera?: { kind: string; tiltDeg?: number; lensFovDeg?: number } | null;
  conditions?: TrainerConditions | null;
  stream?: { enabled: boolean; port?: number } | null;
  fullscreen?: boolean;
}

/** A region as the picker needs it. Mirrors the Trainer's `TrainerCatalogueRegion`. */
export interface TrainerRegion {
  name: string;
  displayName: string;
  ready: boolean;
  missing: string[];
  home: { lat: number; lon: number } | null;
  extentKm: { width: number; height: number } | null;
  sizeBytes: number | null;
  metersPerTexel: number | null;
  elevationM: { min: number; max: number } | null;
  imageryDate: string | null;
  /** A 480 px JPEG of the region's own aerial imagery, as a data URL. */
  thumbnail: string | null;
}

/** What a launch could choose from, answered by the Trainer itself. */
export interface TrainerCatalogue {
  regions: TrainerRegion[];
  cameras: { id: string; kind: string; name: string; tiltDeg: number; lensFovDeg: number }[];
  /** The camera KINDS, whether or not the pilot already owns one of each. */
  cameraKinds: {
    kind: string;
    label: string;
    blurb: string;
    flyable: boolean;
    stabilised: boolean;
    tiltDefaultDeg: number;
    tiltLabel: string;
    tiltMinDeg: number;
    tiltMaxDeg: number;
    lenses: number[];
    defaultLensFovDeg: number;
  }[];
  weather: { id: string; label: string; hint: string; cover: number }[];
  /** `dayFraction` is null for "now", which means read the clock at the flying place. */
  times: { id: string; label: string; hint: string; dayFraction: number | null }[];
  gusts: { id: string; label: string; hint: string }[];
  /** Orthophoto detail levels. THE knob for how long a bake takes. */
  details: { id: string; label: string; hint: string }[];
  windMaxMs: number;
  /** What a new region may be, so the inputs here cannot offer the unbuildable. */
  limits: {
    resMinM: number;
    resMaxM: number;
    resDefaultM: number;
    sideMinKm: number;
    sideMaxKm: number;
    areaMaxKm2: number;
  };
  errors: string[];
}

/** A region to build: a centre and a side length, not a box. The Trainer squares it up. */
export interface TrainerBakeRequest {
  name: string;
  centre: { lat: number; lon: number };
  sideKm: number;
  metersPerTexel: number;
  detail?: string;
  superRes?: boolean;
  /** Build from a Locus survey instead of open data: its surface, bare earth and orthophoto. */
  locus?: TrainerLocusSource;
}

/** A Locus survey export the Trainer can bake a region from. */
export interface TrainerLocusSource {
  /** `<output>/ardudeck`, the export folder with manifest.json. */
  exportDir: string;
  /** Absolute paths to the GeoTIFFs the export was made from. */
  dsm: string;
  dtm?: string;
  ortho?: string;
  /** 'EGM96', 'ellipsoid' or another geoid name, as the export says. */
  vertical: string;
  cellM: number;
}

export interface TrainerLocusSurvey {
  name: string;
  output: string;
  updated: string;
  centre: { lat: number; lon: number };
  /** Side of the square that covers the footprint, km. */
  sideKm: number;
  source: TrainerLocusSource;
}

/**
 * One step of a bake, as it happens.
 *
 * `label` and `fraction` arrive already resolved. The table mapping a pipeline step to player
 * words lives in the Trainer, and a copy here would be a second one to keep in step: that table
 * has already drifted once, and the symptom was a progress bar that stood still for minutes.
 */
export interface TrainerBakeProgress {
  kind: 'progress';
  /** The pipeline's own token, e.g. `2b`. Diagnostics only. */
  step: string | null;
  label: string;
  fraction: number;
  line: string;
  /** Written with a carriage return: it REPLACES its predecessor rather than following it. */
  transient: boolean;
}

export interface TrainerBakeDone {
  kind: 'done';
  ok: boolean;
  regionName?: string;
  error?: string;
}
