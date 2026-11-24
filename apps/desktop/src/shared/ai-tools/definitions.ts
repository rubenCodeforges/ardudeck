// Single source for MCP, the dev test server, cargos (host.aiTools) and the website docs. Descriptions are public text.
import { z } from 'zod';

/** read: looks only. propose: the pilot reviews it in a dialog first. planner: changes the plan or map, never the vehicle. view: moves the app. */
export type AiToolEffect = 'read' | 'propose' | 'planner' | 'view';

export interface AiToolDefinition {
  name: string;
  description: string;
  effect: AiToolEffect;
  input: z.ZodRawShape;
  /** How long a caller waits; review dialogs wait for the pilot. */
  timeoutMs: number;
}

const READ_MS = 70_000;
const REVIEW_MS = 11 * 60_000;

const point = z.object({ lat: z.number().describe('Latitude, degrees'), lng: z.number().describe('Longitude, degrees') });
const pattern = z.enum(['grid', 'crosshatch', 'circular', 'spiral', 'perimeter-fill', 'corridor', 'panorama']);

const surveySettings = {
  pattern: pattern.optional().describe('Default grid. corridor and panorama take an open line'),
  altitudeM: z.number().optional().describe('Metres above home'),
  gsdCm: z.number().optional().describe('Target ground sample distance in cm per pixel; the altitude is worked out from the camera'),
  speedMs: z.number().optional(),
  frontOverlap: z.number().optional().describe('Percent'),
  sideOverlap: z.number().optional().describe('Percent'),
  gridAngle: z.number().optional().describe('Line direction in degrees, 0 = north-south'),
  camera: z.string().optional().describe('Camera preset name, e.g. "DJI Mavic 3E"; an unknown name returns the list'),
  corridorWidthM: z.number().optional().describe('Corridor pattern only'),
  lineSpacingM: z.number().optional().describe('Fixed line spacing for a sensor that is not a camera (LiDAR, magnetometer); no photos are planned'),
  manualCorridorWidthM: z.number().optional().describe('Fixed swath width with no camera (mower deck, spray boom)'),
  terrainFollow: z.boolean().optional().describe('Hold the height above the ground under each waypoint'),
  enduranceMinutes: z.number().optional().describe('Usable flight time per battery pack, for the pack count in the estimate'),
  generatorId: z.string().optional().describe('A survey engine from list_survey_options (cargo engines included); default is the built-in pattern'),
  engineParams: z.record(z.string(), z.unknown()).optional().describe("Values for that engine's settings"),
  advanced: z.record(z.string(), z.unknown()).optional().describe('Any other survey panel setting by key, e.g. {"altitudeReference":"terrain","margin":10}; list_survey_options lists the keys'),
};

export const AI_TOOLS: AiToolDefinition[] = [
  // --- Vehicle ---
  {
    name: 'get_vehicle_snapshot',
    effect: 'read',
    timeoutMs: READ_MS,
    description: 'What the connected vehicle is doing now: connection, vehicle type, attitude, position, GPS, battery, flight mode and whether it is armed.',
    input: {},
  },
  {
    name: 'get_recent_messages',
    effect: 'read',
    timeoutMs: READ_MS,
    description: 'The latest text messages from the vehicle (pre-arm failures, errors, calibration results, mode changes), oldest first.',
    input: { limit: z.number().optional().describe('How many, default 30') },
  },

  // --- Parameters ---
  {
    name: 'get_parameter',
    effect: 'read',
    timeoutMs: READ_MS,
    description: 'Read one vehicle parameter by its exact name, e.g. ATC_ANG_RLL_P.',
    input: { name: z.string() },
  },
  {
    name: 'list_parameters',
    effect: 'read',
    timeoutMs: READ_MS,
    description: 'List vehicle parameters by name prefix (e.g. "SERVO") and/or a word in the name. Returns at most `limit` (default 50).',
    input: {
      prefix: z.string().optional(),
      search: z.string().optional(),
      limit: z.number().optional(),
    },
  },
  {
    name: 'propose_parameters',
    effect: 'propose',
    timeoutMs: REVIEW_MS,
    description:
      'Suggest parameter changes. The pilot sees them in a review dialog and nothing is written unless they click Apply. Waits for their decision and returns what was applied, rejected or cancelled, and which changes need a reboot. Refused while the vehicle is armed. A few identity parameters (FRAME_CLASS, FRAME_TYPE, MOT_PWM_TYPE, COMPASS_ORIENT, BRD_TYPE) are never accepted. Wiring changes (SERVOn_FUNCTION, SERVOn_REVERSED, Q_ENABLE, Q_FRAME_*, AHRS_ORIENTATION) are marked, and afterwards the pilot should run the matching check in Quick setup (see open_setup_step). Not for arming, mode changes or anything in flight.',
    input: {
      reason: z.string().describe('One line shown to the pilot: why these changes'),
      changes: z.array(z.object({
        name: z.string().describe('Exact parameter name'),
        value: z.number(),
        reason: z.string().optional().describe('Short note shown next to this change'),
      })).min(1),
    },
  },

  // --- Setup ---
  {
    name: 'get_setup_status',
    effect: 'read',
    timeoutMs: READ_MS,
    description:
      'How far the setup of the connected vehicle is: vehicle type and firmware, the Quick setup steps with a state for each (done, found on board, needs pilot, to do), and the current pre-arm problems with the step that fixes each. Start here when helping with a new build.',
    input: {},
  },
  {
    name: 'open_setup_step',
    effect: 'view',
    timeoutMs: READ_MS,
    description:
      'Open Quick setup at a step (an id from get_setup_status) so the pilot can do it: frame, outputs, board orientation, calibration, motor or control surface checks. Changes only what ArduDeck shows; writes nothing to the vehicle.',
    input: { stepId: z.string().describe('Step id from get_setup_status') },
  },
  {
    name: 'suggest_setup_values',
    effect: 'read',
    timeoutMs: READ_MS,
    description:
      'Starting values ArduDeck works out for this vehicle from its saved profile and parameters: "tune" (first rate and filter values), "airspeed" (limits from the stall speed, planes) or "battery" (voltage thresholds from cell count and chemistry). Pass `inputs` to fill gaps (tune: propIn, cells, chemistry lipo|lipohv|liion; airspeed: stall in m/s; battery: cells, chemistry, capacity in mAh). Nothing is written: hand the result to propose_parameters.',
    input: {
      kind: z.enum(['tune', 'airspeed', 'battery']),
      inputs: z.record(z.string(), z.union([z.number(), z.string()])).optional(),
    },
  },
  {
    name: 'get_vehicle_profile',
    effect: 'read',
    timeoutMs: READ_MS,
    description: 'The physical details the pilot saved for this vehicle (type, weight, battery, frame or prop size, wingspan, stall speed). Null when none is saved.',
    input: {},
  },
  {
    name: 'set_vehicle_profile',
    effect: 'planner',
    timeoutMs: READ_MS,
    description:
      'Create (no id) or update (with id) a vehicle profile in ArduDeck, the one the Flight Info panel uses for cruise speed and endurance. Stays on this computer; nothing is written to a vehicle. Endurance = battery energy x 80% / average power; pass avgPowerW when known, otherwise ArduDeck estimates it from weight, props, KV and ESC.',
    input: {
      id: z.string().optional(),
      name: z.string(),
      type: z.enum(['copter', 'plane', 'vtol']),
      weightG: z.number().describe('All-up weight with battery and payload, grams'),
      batteryCells: z.number().describe('Cells in series, e.g. 12 for 12S'),
      batteryCapacityMah: z.number().describe('Total capacity flown at once, mAh (add parallel packs)'),
      batteryChemistry: z.enum(['lipo', 'lihv', 'lion', 'life']).optional(),
      motorCount: z.number().optional(),
      frameSizeMm: z.number().optional().describe('Motor to motor diagonal'),
      propSize: z.string().optional().describe('Inches, diameter x pitch, e.g. "28x9.2"'),
      motorKv: z.number().optional(),
      escRatingA: z.number().optional().describe('Continuous amps per ESC'),
      wingspanMm: z.number().optional(),
      wingAreaCm2: z.number().optional(),
      maxSpeedMs: z.number().optional(),
      avgPowerW: z.number().optional().describe('Average power in flight, W; replaces the estimate'),
      cruiseSpeedMs: z.number().optional().describe('Replaces the cruise speed estimate'),
      notes: z.string().optional(),
      activate: z.boolean().optional().describe('Make it the active profile'),
    },
  },

  // --- Flight logs ---
  {
    name: 'get_flight_log',
    effect: 'read',
    timeoutMs: READ_MS,
    description: "The flight log open in ArduDeck's Log Explorer (name, number of message types) and the queries you can run on it. Null when no log is open.",
    input: {},
  },
  {
    name: 'query_flight_log',
    effect: 'read',
    timeoutMs: READ_MS,
    description: 'Run one of the queries listed by get_flight_log on the open log, e.g. statistics of a field or samples of a message type.',
    input: {
      query: z.string().describe('Query name from get_flight_log'),
      input: z.record(z.string(), z.unknown()).optional(),
    },
  },

  // --- Mission planner ---
  {
    name: 'get_mission',
    effect: 'read',
    timeoutMs: READ_MS,
    description:
      'The plan in the mission planner: home, groups (manual, survey, imported) and every item with command, position, altitude and frame, plus a fence summary. This is the planner, which can differ from what the vehicle holds.',
    input: {},
  },
  {
    name: 'propose_mission',
    effect: 'propose',
    timeoutMs: REVIEW_MS,
    description:
      'Suggest waypoints for the mission planner. The pilot reviews them in a dialog; accepted items become their own group. Nothing is uploaded to the vehicle: the pilot uploads from the planner. Refused while armed. Altitudes are metres above home unless frame is "asl".',
    input: {
      name: z.string().describe('Group name shown to the pilot'),
      reason: z.string().describe('Why, in one sentence, shown to the pilot'),
      mode: z.enum(['append', 'replace']).optional().describe('append (default) adds after the current plan; replace swaps the whole plan'),
      items: z.array(point.extend({
        altitude: z.number().describe('Metres'),
        frame: z.enum(['relative', 'asl']).optional(),
        command: z.enum(['waypoint', 'takeoff', 'land', 'loiter_time']).optional().describe('Default waypoint'),
        holdSeconds: z.number().optional().describe('Hold time at a waypoint or loiter_time duration'),
      })).min(1),
      returnToLaunch: z.boolean().optional().describe('Add a return-to-launch at the end'),
    },
  },
  {
    name: 'propose_survey',
    effect: 'propose',
    timeoutMs: REVIEW_MS,
    description:
      "Plan a survey with ArduDeck's own survey planner and ask the pilot to accept it. ArduDeck plans the flight lines first, so the review dialog shows the real path and the waypoint count, and the pilot can still adjust the survey group afterwards; nothing is uploaded. Give the area as polygon, or as around {radiusM} for a square centred on the vehicle (planning home without a GPS fix) or on around.lat/lng. maxWaypoints caps the mission items: ArduDeck turns the lines, then climbs (up to 120 m, only when you did not set altitudeM or gsdCm) until it fits, reports what it changed in adjusted, and refuses with the closest plan when it cannot. previewOnly returns the same plan and estimate without asking the pilot, to compare options. Returns waypoints, altitude and an estimate: area, lines, spacing, distance, flight time, photos, ground resolution and battery packs. Refused while armed.",
    input: {
      name: z.string(),
      reason: z.string(),
      polygon: z.array(point).min(2).optional().describe('Boundary corners in order (3 or more), or the centre line for a corridor (2 or more). Leave out when using around'),
      around: z.object({
        radiusM: z.number().describe('Half the side of the square, metres'),
        lat: z.number().optional().describe('Centre; default is the vehicle'),
        lng: z.number().optional(),
      }).optional().describe('A square survey area centred on the vehicle or a given point, instead of polygon'),
      maxWaypoints: z.number().int().positive().optional().describe('Most mission items the survey may add'),
      previewOnly: z.boolean().optional().describe('Plan and return the estimate without asking the pilot or changing the mission'),
      ...surveySettings,
    },
  },
  {
    name: 'survey_area',
    effect: 'propose',
    timeoutMs: REVIEW_MS,
    description: 'Suggest a survey over a guide on the map (its outline, or its line as a corridor), with the same settings, maxWaypoints, previewOnly, review dialog and estimate as propose_survey.',
    input: {
      id: z.string().describe('Guide id from list_areas'),
      name: z.string().optional(),
      reason: z.string().optional(),
      maxWaypoints: z.number().int().positive().optional().describe('Most mission items the survey may add'),
      previewOnly: z.boolean().optional().describe('Plan and return the estimate without asking the pilot or changing the mission'),
      ...surveySettings,
    },
  },
  {
    name: 'list_survey_options',
    effect: 'read',
    timeoutMs: READ_MS,
    description: "Everything propose_survey accepts: patterns, altitude references, camera presets, survey engines with their settings (cargo engines included), the advanced setting keys and the survey panel's current settings.",
    input: {},
  },
  {
    name: 'fit_mission',
    effect: 'propose',
    timeoutMs: REVIEW_MS,
    description:
      'Make a mission fit a flight controller with little mission storage, the same three fixes ArduDeck offers when an upload is refused for space. "terrain": surveys switch to flight controller terrain following (waypoints only at line ends). "split": the largest survey becomes one flight group per battery. "sd": suggests BRD_SD_MISSION=64 (about 4,369 items on the SD card) through the parameter review; reboot after. Nothing is uploaded. Refused while armed.',
    input: { method: z.enum(['terrain', 'split', 'sd']) },
  },
  {
    name: 'set_home',
    effect: 'planner',
    timeoutMs: READ_MS,
    description:
      'Set the planned take-off point in the mission planner. Its altitude is the ground height there unless altAslM is given. Planner only: the flight controller sets its own home when it arms.',
    input: {
      lat: z.number(),
      lng: z.number(),
      altAslM: z.number().optional().describe('Ground altitude above sea level at the take-off point; looked up when left out'),
    },
  },
  {
    name: 'get_flight_estimate',
    effect: 'read',
    timeoutMs: READ_MS,
    description:
      'The Flight Info figures for the planned mission with the active vehicle profile: distance, flight time in still air, endurance, battery packs, reserve on the last pack, total climb. speedMs replaces the profile cruise speed, enduranceMinutes the profile endurance.',
    input: {
      speedMs: z.number().optional(),
      enduranceMinutes: z.number().optional(),
    },
  },
  {
    name: 'propose_fence',
    effect: 'propose',
    timeoutMs: REVIEW_MS,
    description:
      'Suggest a geofence. The pilot reviews it in a dialog; if accepted, the inclusion area replaces the current one, exclusion areas are added, and the fence is uploaded to the vehicle. Refused while armed.',
    input: {
      name: z.string(),
      reason: z.string(),
      inclusion: z.array(point).min(3).optional(),
      exclusions: z.array(z.object({ name: z.string(), points: z.array(point).min(3) })).optional(),
    },
  },

  // --- Map guides ---
  {
    name: 'draw_area',
    effect: 'planner',
    timeoutMs: READ_MS,
    description:
      "Draw (no id) or update (with id) a guide on the mission map: an outline, a line or a set of points with a name, a role and an optional colour. Guides are managed in the planner's Guides tab. Planner only; nothing reaches a vehicle. bufferM grows an outline outward, e.g. a survey margin around a target.",
    input: {
      id: z.string().optional(),
      name: z.string(),
      kind: z.enum(['area', 'interest', 'nofly', 'takeoff', 'poi', 'note']).describe('area: a plain boundary; interest: something to look at; nofly; takeoff: take-off or landing site; poi: points of interest; note: a reference'),
      geometry: z.enum(['polygon', 'line', 'point']),
      points: z.array(point).min(1).describe('Outline (3 or more, not closed), line (2 or more), or the points of a point set'),
      pointLabels: z.array(z.string()).optional().describe('A label for each point of a point set'),
      bufferM: z.number().optional().describe('Outline only: grow outward by this many metres'),
      color: z.string().optional().describe('CSS colour; defaults to the colour of the role'),
      notes: z.string().optional().describe('Source or remark, shown in the legend'),
    },
  },
  {
    name: 'list_areas',
    effect: 'read',
    timeoutMs: READ_MS,
    description: 'The guides on the mission map (imported, drawn, from AI or cargos) with their points and size.',
    input: {},
  },
  {
    name: 'delete_area',
    effect: 'planner',
    timeoutMs: READ_MS,
    description: 'Remove a guide from the mission map by id.',
    input: { id: z.string() },
  },

  // --- App ---
  {
    name: 'open_view',
    effect: 'view',
    timeoutMs: READ_MS,
    description: 'Switch ArduDeck to a screen, e.g. "telemetry", "mission", "parameters", "calibration", "logs". Writes nothing to the vehicle.',
    input: { view: z.string() },
  },
];

export function findAiTool(name: string): AiToolDefinition | undefined {
  return AI_TOOLS.find((t) => t.name === name);
}

/** JSON Schema of a tool's input, for the Anthropic API, MCP clients and the website docs. */
export function aiToolInputSchema(tool: AiToolDefinition): Record<string, unknown> {
  const schema = z.toJSONSchema(z.object(tool.input)) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
}

/** Plain data for the website and for cargos: name, description, effect, input schema. */
export function describeAiTools(): Array<{ name: string; description: string; effect: AiToolEffect; inputSchema: Record<string, unknown> }> {
  return AI_TOOLS.map((t) => ({ name: t.name, description: t.description, effect: t.effect, inputSchema: aiToolInputSchema(t) }));
}
