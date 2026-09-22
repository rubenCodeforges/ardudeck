import type { SurveyAirframe, SurveyLaunch, SurveyStart, SurveyFinish } from './survey-vehicle';
/**
 * Survey Grid Planner Types
 * Types and interfaces for photogrammetry survey planning
 */

export type SurveyPattern = 'grid' | 'crosshatch' | 'circular' | 'spiral' | 'perimeter-fill' | 'corridor' | 'panorama';

/**
 * Corridor flight strategy.
 * - 'plane': fixed-wing. Strips get end overshoot and sharp centerline bends
 *   get racetrack turn waypoints (see {@link SurveyConfig.maxTurnAngle}) so the
 *   aircraft has room to turn without stalling.
 * - 'copter': multirotor. Turns on the spot, so no overshoot and no turn loops.
 */
export type CorridorMode = 'plane' | 'copter';

/**
 * Ground-vehicle path pattern. Only meaningful in manual / mower mode
 * (camera.manualCorridorWidth set). Camera flights always use the standard
 * boustrophedon path; the rover may need to avoid U-turns.
 * - boustrophedon: zigzag, rover turns 180° at each line end (skid-steer friendly)
 * - reverse-alternating: rover drives forward on odd lines and in reverse on
 *   even lines, jogging perpendicular between them. Inserts MAV_CMD.DO_SET_REVERSE
 *   between line pairs. Needed for Ackermann/car-like mowers that can't turn in place.
 */
export type GroundPattern = 'boustrophedon' | 'reverse-alternating';

/** Order the parallel strips of a corridor are flown in. */
export type StripOrderMode = 'auto' | 'sequential';

/**
 * Altitude reference frame for survey waypoints.
 * - 'relative': Altitude relative to home position (GLOBAL_RELATIVE_ALT)
 * - 'asl': Altitude above mean sea level (GLOBAL)
 * - 'terrain': Altitude relative to terrain at each point (GLOBAL_TERRAIN_ALT)
 */
export type AltitudeReference = 'relative' | 'asl' | 'terrain';

export interface CameraPreset {
  name: string;
  sensorWidth: number;   // mm
  sensorHeight: number;  // mm
  imageWidth: number;     // pixels
  imageHeight: number;    // pixels
  focalLength: number;    // mm
  /**
   * When set (>0), bypasses camera-based footprint calculation and uses this
   * value as the survey corridor width directly. Intended for non-camera use
   * cases (e.g. ArduRover lawnmower defining lines by cutting deck width).
   */
  manualCorridorWidth?: number;  // meters
}

export interface LatLng {
  lat: number;
  lng: number;
}

export interface SurveyConfig {
  polygon: LatLng[];
  /** Optional no-fly holes inside the polygon (e.g. imported from KML inner rings). */
  holes?: LatLng[][];
  /**
   * Optional allowed-flight-area polygon (may exceed the ROI, e.g. room for
   * turn maneuvers outside the surveyed boundary). Only consumed by
   * generators declaring `supportsWorkspace`.
   */
  workspace?: LatLng[];
  /**
   * Registry id of a module-supplied generator driving this survey. When
   * unset (all built-in patterns), the generator is derived from `pattern`
   * via `patternToGeneratorId`. Resolved through `resolveGeneratorId`.
   */
  generatorId?: string;
  /**
   * Values for the active generator's declared `configFields`, keyed by
   * field id. Opaque to the host UI beyond rendering the declared controls;
   * persists with the group config like every other field.
   */
  engineParams?: Record<string, unknown>;
  pattern: SurveyPattern;
  altitude: number;          // meters AGL
  speed: number;             // m/s
  frontOverlap: number;      // % (60-90)
  sideOverlap: number;       // % (20-99)
  camera: CameraPreset;
  gridAngle: number;         // degrees, 0=north-south lines
  overshoot: number;         // meters past polygon edge for turns
  /**
   * Buffer applied to the polygon before generating the grid, in meters.
   * Positive grows the surveyed area outward (so footprints cover past the
   * boundary); negative shrinks it inward (keep the flight lines inside).
   * 0 = use the polygon as drawn. Grid/crosshatch only.
   */
  margin?: number;
  /**
   * Camera/aircraft only. When true, the camera triggers only along the scan
   * lines inside the boundary and is switched off during the turn-arounds (the
   * deadhead segments outside the polygon). When false (default) a single
   * trigger distance runs for the whole flight. Grid/crosshatch only.
   */
  cameraOffOutside?: boolean;
  /**
   * Grid/crosshatch turn strategy.
   * - 'copter' (default): lines connect directly; the vehicle turns on the spot.
   * - 'plane': fixed-wing. At each turn the SHORTER line end is extended so both
   *   ends of the turn share an offset, letting the aircraft fly a clean 180°
   *   racetrack turn into the next line instead of an asymmetric cut.
   */
  gridMode?: CorridorMode;
  altitudeReference: AltitudeReference;
  /**
   * Continuous DEM terrain-follow. When true, the planner samples ground
   * elevation (Open-Meteo DEM) at every generated waypoint and bakes an
   * absolute (MSL) altitude of `ground + altitude` into each one, so the
   * vehicle holds a constant height above ground for the whole flight without
   * relying on an onboard terrain database. Waypoints emit in the GLOBAL (ASL)
   * frame. This is distinct from `altitudeReference: 'terrain'`, which delegates
   * following to the flight controller's own terrain data via
   * GLOBAL_TERRAIN_ALT. Baking is the more portable option for vehicles with no
   * terrain tiles loaded.
   */
  terrainFollow?: boolean;
  /** Ground-vehicle path pattern. Only consumed in manual / mower mode. */
  groundPattern?: GroundPattern;
  /** Spiral direction (only used when pattern === 'spiral'). */
  spiralDirection?: 'inward' | 'outward';
  /** Number of perimeter passes before the grid fill (only used when pattern === 'perimeter-fill'). */
  perimeterPasses?: number;
  /**
   * Which value the operator drives directly. 'altitude' is the classic slider;
   * 'gsd' lets them type a target ground sample distance and back-solves the
   * altitude. Altitude stays the single source of truth either way.
   */
  planBy?: 'altitude' | 'gsd';
  /** Usable flight minutes per battery (reserve already accounted for). Drives the battery-count readout and, later, sortie splitting. */
  enduranceMinutes?: number;
  /**
   * Crosshatch only. Height offset for the SECOND (perpendicular) pass,
   * expressed as a percentage of the relative flight altitude (e.g. 30 = the
   * second pass flies 30% higher). Flying the two crosshatch directions at two
   * different altitudes improves photogrammetric 3D reconstruction. 0 = both
   * passes at the same altitude (classic crosshatch).
   */
  crossGridAltitudeOffset?: number;

  // --- Corridor pattern (linear surveys: roads, rail, power lines, pipelines) ---
  /**
   * Corridor only. The drawn polygon is treated as an open CENTERLINE (the line
   * the corridor follows), not a closed area. These fields tune the swath.
   */
  /** Total corridor swath width in meters. Strip count is derived from this and the line spacing unless `corridorStrips` overrides it. */
  corridorWidth?: number;
  /**
   * Explicit number of parallel flight strips. When >0 this overrides the
   * width-derived count, so the operator can force an even or odd strip count
   * (an odd count puts one strip on the centerline; even straddles it).
   */
  corridorStrips?: number;
  /**
   * Length of one flight's stretch along the centreline, in meters. When >0 it
   * overrides the endurance estimate when splitting along the route: the pilot
   * who knows what they can actually fly sets the distance directly.
   */
  corridorSectionLengthM?: number;
  /** Fixed-wing vs multirotor turn strategy. */
  corridorMode?: CorridorMode;
  /** Airframe the survey is planned for; 'auto' follows the connected vehicle. */
  airframe?: SurveyAirframe;
  /** How the mission starts and ends; 'auto' follows the airframe. */
  launch?: SurveyLaunch;
  /** Whether the mission opens with a takeoff item. */
  start?: SurveyStart;
  /**
   * What the mission does after the last line. 'none' leaves the survey open
   * so a second survey, or hand-placed waypoints, can follow it in one mission.
   */
  finish?: SurveyFinish;
  /** Lateral shift of the whole strip bundle off the centerline, in meters (e.g. to bias coverage to one side of a road). */
  corridorSideOffset?: number;
  /**
   * Corridor only. Additional centerlines that branch off the main one (roads
   * that fork, power-line spurs, river tributaries). The main centerline is
   * `polygon`; each entry here is a further open centerline that shares the
   * corridor's width/overlap/camera settings. Every centerline is generated with
   * the same strip algorithm and flown in sequence (main, then each branch).
   * Junctions are visual only; overlap at a fork is accepted, as in every other
   * corridor tool (which instead force you to manage separate routes by hand).
   */
  corridorBranches?: LatLng[][];
  /**
   * Plane only. Centerline bends sharper than this (degrees of heading change)
   * get racetrack turn waypoints so the aircraft overshoots and re-enters the
   * next leg aligned instead of cutting the corner.
   */
  maxTurnAngle?: number;
  /** Bank the plan assumes when working out the aircraft's turn radius. */
  planBankDeg?: number;
  /**
   * Cruise airspeed the turns are sized around, m/s. Read from the vehicle's
   * AIRSPEED_CRUISE when one is connected; a survey speed below it is a
   * camera-trigger speed the aircraft will not actually fly.
   */
  planAirspeed?: number;
  /**
   * Which order the parallel strips are flown in.
   * - 'auto' (default): skip strips so each 180° turn has room for the
   *   aircraft's turn diameter, e.g. 1, 3, 5 then 2, 4.
   * - 'sequential': 1, 2, 3 in order, whether the turn fits or not.
   */
  stripOrder?: StripOrderMode;
  /** Reverse the order the strips are flown in (start from the far side). */
  flipLegs?: boolean;
  /** Reverse the travel direction along the centerline. */
  invertPath?: boolean;

  /**
   * Panorama only. The drawn line is the SUBJECT to capture (a shoreline,
   * cliff, building frontage). The flight path is derived: offset to one side
   * at `panoramaStandoff` meters, flown once, camera yawed at the subject the
   * whole way. 'left'/'right' = which side of the line (in drawing direction)
   * the AIRCRAFT flies on.
   */
  panoramaSide?: 'left' | 'right';
  /** Horizontal distance (m) from the subject line to the flight path. */
  panoramaStandoff?: number;
  /**
   * Panorama only. User-dragged tangent handles per anchor index (meters
   * east/north relative to the anchor). Anchors absent here use the smooth
   * auto tangent. Indices are remapped by insert/remove vertex operations.
   */
  panoramaTangents?: Record<number, { inX: number; inY: number; outX: number; outY: number }>;
}

export interface SurveyResult {
  waypoints: LatLng[];
  /**
   * Optional per-waypoint altitude (meters, in the config's altitude frame),
   * aligned 1:1 with `waypoints`. When absent, every waypoint uses
   * `config.altitude`. Used by patterns that fly at more than one height, e.g.
   * crosshatch with a second-pass altitude offset.
   */
  altitudes?: number[];
  /**
   * Optional per-waypoint absolute camera heading (degrees, 0-360), aligned
   * 1:1 with `waypoints`. The mission builder emits a CONDITION_YAW after each
   * waypoint so the camera holds on the subject (panorama pattern).
   */
  waypointYaws?: number[];
  /**
   * Index into `waypoints` where each flown line begins, in flight order. Lets
   * the map number the lines 1, 2, 3 so the pilot can see which one is flown
   * when, which matters once the strips are not flown in their drawn order.
   */
  legStarts?: number[];
  /**
   * Optional per-waypoint look-at target on the subject, aligned 1:1 with
   * `waypoints`. When present the mission builder emits ROI commands so the
   * aircraft tracks the target continuously (smooth camera), instead of the
   * stepwise CONDITION_YAW fallback used when only `waypointYaws` is set.
   */
  waypointLookAts?: LatLng[];
  photoPositions: LatLng[];
  footprints: LatLng[][];
  stats: SurveyStats;
  /**
   * Non-fatal advisories from the generator (e.g. a remote engine reporting
   * the mission exceeds battery endurance). Shown in the panel; the result
   * is still usable.
   */
  warnings?: string[];
  /**
   * Generator-specific extras carried onto `SurveyGroup.generatorResult`
   * (e.g. TOPAS decomposition cells / tracks / metrics). Opaque to the host.
   */
  generatorResult?: unknown;
}

export interface SurveyStats {
  gsd: number;               // cm/px
  flightDistance: number;     // meters
  flightTime: number;        // seconds
  photoCount: number;
  lineCount: number;
  areaCovered: number;       // sq meters (polygon area)
  footprintWidth: number;    // meters (single image ground width)
  footprintHeight: number;   // meters (single image ground height)
  lineSpacing: number;       // meters
  photoSpacing: number;      // meters
}

export const DEFAULT_SURVEY_CONFIG: Omit<SurveyConfig, 'polygon'> = {
  pattern: 'grid',
  altitude: 80,
  speed: 5,
  frontOverlap: 75,
  sideOverlap: 60,
  camera: {
    name: 'DJI Mavic 3E',
    sensorWidth: 17.3,
    sensorHeight: 13,
    imageWidth: 5280,
    imageHeight: 3956,
    focalLength: 12.3,
  },
  gridAngle: 0,
  overshoot: 20,
  margin: 0,
  cameraOffOutside: false,
  gridMode: 'copter',
  altitudeReference: 'relative',
  terrainFollow: false,
  groundPattern: 'boustrophedon',
  spiralDirection: 'inward',
  perimeterPasses: 2,
  planBy: 'altitude',
  enduranceMinutes: 20,
  panoramaSide: 'right',
  panoramaStandoff: 30,
  crossGridAltitudeOffset: 0,
  corridorWidth: 60,
  corridorStrips: 0,
  corridorMode: 'plane',
  airframe: 'auto',
  launch: 'auto',
  start: 'takeoff',
  finish: 'rtl',
  corridorSideOffset: 0,
  maxTurnAngle: 15,
  planBankDeg: 30,
  stripOrder: 'auto',
  flipLegs: false,
  invertPath: false,
};
/**
 * A survey is inserted as a complete flight, always. Whether it runs on into
 * the next one is decided afterwards, per group, in the waypoint list: it is
 * never inherited from the last draft, which is how two surveys ended up
 * silently connected.
 */
export function asOwnFlight(config: SurveyConfig): SurveyConfig {
  const finish = config.finish === 'land' ? 'land' : 'rtl';
  return config.finish === finish ? config : { ...config, finish };
}
