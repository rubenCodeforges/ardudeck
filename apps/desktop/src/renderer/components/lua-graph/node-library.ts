/**
 * Node library — defines every available node type for the Lua Graph Editor.
 */
import type { NodeDefinition, PortDefinition } from './lua-graph-types';

// ── Sensors ─────────────────────────────────────────────────────

const sensorNodes: NodeDefinition[] = [
  {
    type: 'sensor-gps',
    label: 'GPS Position', labelKey: 'lua.auto.gps-position',
    description: 'Current GPS coordinates from the flight controller', descriptionKey: 'lua.auto.current-gps-coordinates-from-the-flight-controller',
    category: 'sensors',
    inputs: [],
    outputs: [
      { id: 'lat', label: 'Latitude', type: 'number', direction: 'output' },
      { id: 'lng', label: 'Longitude', type: 'number', direction: 'output' },
      { id: 'alt', label: 'Altitude (m)', type: 'number', direction: 'output' },
    ],
    properties: [],
    luaTemplate: 'gps:location(0)',
  },
  {
    type: 'sensor-baro-alt',
    label: 'Baro Altitude', labelKey: 'lua.auto.baro-altitude',
    description: 'Barometric altitude in meters', descriptionKey: 'lua.auto.barometric-altitude-in-meters',
    category: 'sensors',
    inputs: [],
    outputs: [
      { id: 'alt_m', label: 'Altitude (m)', type: 'number', direction: 'output' },
    ],
    properties: [],
    luaTemplate: 'baro:get_altitude()',
  },
  {
    type: 'sensor-battery',
    label: 'Battery', labelKey: 'lua.auto.battery',
    description: 'Battery voltage, current, and remaining percentage', descriptionKey: 'lua.auto.battery-voltage-current-and-remaining-percentage',
    category: 'sensors',
    inputs: [],
    outputs: [
      { id: 'voltage', label: 'Voltage', type: 'number', direction: 'output' },
      { id: 'current', label: 'Current (A)', type: 'number', direction: 'output' },
      { id: 'remaining_pct', label: 'Remaining %', type: 'number', direction: 'output' },
    ],
    properties: [
      { id: 'instance', label: 'Battery Instance', type: 'number', defaultValue: 0, min: 0, max: 3 },
    ],
    luaTemplate: 'battery',
  },
  {
    type: 'sensor-airspeed',
    label: 'Airspeed', labelKey: 'lua.auto.airspeed',
    description: 'Measured airspeed in m/s', descriptionKey: 'lua.auto.measured-airspeed-in-m-s',
    category: 'sensors',
    inputs: [],
    outputs: [
      { id: 'airspeed_ms', label: 'Airspeed (m/s)', type: 'number', direction: 'output' },
    ],
    properties: [],
    luaTemplate: 'ahrs:airspeed_estimate()',
  },
  {
    type: 'sensor-rc-channel',
    label: 'RC Channel', labelKey: 'lua.auto.rc-channel',
    description: 'Read a specific RC channel value (1-16)', descriptionKey: 'lua.auto.read-a-specific-rc-channel-value-1-16',
    category: 'sensors',
    inputs: [],
    outputs: [
      { id: 'value_us', label: 'Value (us)', type: 'number', direction: 'output' },
    ],
    properties: [
      { id: 'channel', label: 'Channel', type: 'channel', defaultValue: 1, min: 1, max: 16 },
    ],
    luaTemplate: 'rc:get_pwm(CH)',
  },
  {
    type: 'sensor-rangefinder',
    label: 'Rangefinder', labelKey: 'lua.auto.rangefinder',
    description: 'Rangefinder distance in meters', descriptionKey: 'lua.auto.rangefinder-distance-in-meters',
    category: 'sensors',
    inputs: [],
    outputs: [
      { id: 'distance_m', label: 'Distance (m)', type: 'number', direction: 'output' },
    ],
    properties: [
      { id: 'instance', label: 'Instance', type: 'number', defaultValue: 0, min: 0, max: 3 },
    ],
    luaTemplate: 'rangefinder:distance_cm(INST) / 100.0',
  },
  {
    type: 'sensor-attitude',
    label: 'Attitude', labelKey: 'lua.auto.attitude',
    description: 'Current vehicle attitude (roll, pitch, yaw) in degrees', descriptionKey: 'lua.auto.current-vehicle-attitude-roll-pitch-yaw-in-degrees',
    category: 'sensors',
    inputs: [],
    outputs: [
      { id: 'roll', label: 'Roll (deg)', type: 'number', direction: 'output' },
      { id: 'pitch', label: 'Pitch (deg)', type: 'number', direction: 'output' },
      { id: 'yaw', label: 'Yaw (deg)', type: 'number', direction: 'output' },
    ],
    properties: [],
    luaTemplate: 'ahrs:get_roll/pitch/yaw()',
  },
  {
    type: 'sensor-groundspeed',
    label: 'Ground Speed', labelKey: 'lua.auto.ground-speed',
    description: 'GPS ground speed in m/s', descriptionKey: 'lua.auto.gps-ground-speed-in-m-s',
    category: 'sensors',
    inputs: [],
    outputs: [
      { id: 'speed_ms', label: 'Speed (m/s)', type: 'number', direction: 'output' },
    ],
    properties: [],
    luaTemplate: 'ahrs:groundspeed_vector()',
  },
  {
    type: 'sensor-rc-aux-switch',
    label: 'RC Aux Switch', labelKey: 'lua.auto.rc-aux-switch',
    description: 'Read an RC aux switch position (Low / Mid / High)', descriptionKey: 'lua.auto.read-an-rc-aux-switch-position-low-mid-high',
    category: 'sensors',
    inputs: [],
    outputs: [
      { id: 'state', label: 'State (0-2)', type: 'number', direction: 'output' },
      { id: 'is_high', label: 'Is High', type: 'boolean', direction: 'output' },
      { id: 'is_mid', label: 'Is Mid', type: 'boolean', direction: 'output' },
      { id: 'is_low', label: 'Is Low', type: 'boolean', direction: 'output' },
    ],
    properties: [
      { id: 'aux_fn', label: 'Aux Function', type: 'number', defaultValue: 300, min: 0, max: 999 },
    ],
    luaTemplate: 'rc:get_aux_cached(FN)',
  },
  {
    type: 'sensor-rangefinder-orient',
    label: 'Rangefinder (Oriented)', labelKey: 'lua.auto.rangefinder-oriented',
    description: 'Rangefinder distance with orientation (e.g. 25 = downward for boats)', descriptionKey: 'lua.auto.rangefinder-distance-with-orientation-e-g-25-downward-for-bo',
    category: 'sensors',
    inputs: [],
    outputs: [
      { id: 'distance_m', label: 'Distance (m)', type: 'number', direction: 'output' },
    ],
    properties: [
      {
        id: 'orientation', label: 'Orientation', type: 'select', defaultValue: 25,
        options: [
          { label: '0 Forward', value: 0 },
          { label: '25 Down', value: 25 },
          { label: '24 Up', value: 24 },
        ],
      },
    ],
    luaTemplate: 'rangefinder:distance_cm_orient(ORIENT) / 100.0',
  },
  {
    type: 'sensor-flight-mode',
    label: 'Flight Mode', labelKey: 'lua.auto.flight-mode',
    description: 'Current flight mode number from the vehicle', descriptionKey: 'lua.auto.current-flight-mode-number-from-the-vehicle',
    category: 'sensors',
    inputs: [],
    outputs: [
      { id: 'mode_num', label: 'Mode Number', type: 'number', direction: 'output' },
    ],
    properties: [],
    luaTemplate: 'vehicle:get_mode()',
  },
  {
    type: 'sensor-armed',
    label: 'Armed State', labelKey: 'lua.auto.armed-state',
    description: 'Whether the vehicle is currently armed', descriptionKey: 'lua.auto.whether-the-vehicle-is-currently-armed',
    category: 'sensors',
    inputs: [],
    outputs: [
      { id: 'is_armed', label: 'Is Armed', type: 'boolean', direction: 'output' },
    ],
    properties: [],
    luaTemplate: 'arming:is_armed()',
  },
  {
    type: 'sensor-gps-status',
    label: 'GPS Status', labelKey: 'lua.auto.gps-status',
    description: 'GPS fix type and satellite count', descriptionKey: 'lua.auto.gps-fix-type-and-satellite-count',
    category: 'sensors',
    inputs: [],
    outputs: [
      { id: 'fix_type', label: 'Fix Type (0-6)', type: 'number', direction: 'output' },
      { id: 'num_sats', label: 'Satellites', type: 'number', direction: 'output' },
      { id: 'has_3d_fix', label: 'Has 3D Fix', type: 'boolean', direction: 'output' },
    ],
    properties: [
      { id: 'instance', label: 'GPS Instance', type: 'number', defaultValue: 0, min: 0, max: 1 },
    ],
    luaTemplate: 'gps:status(INST)',
  },
  {
    type: 'sensor-home',
    label: 'Home Position', labelKey: 'lua.auto.home-position',
    description: 'Home location coordinates and altitude. Exposes both float components and a Location object for chaining into location-math nodes.', descriptionKey: 'lua.auto.home-location-coordinates-and-altitude-exposes-both-float-co',
    category: 'sensors',
    inputs: [],
    outputs: [
      { id: 'location', label: 'Location', type: 'any', direction: 'output' },
      { id: 'lat', label: 'Latitude', type: 'number', direction: 'output' },
      { id: 'lng', label: 'Longitude', type: 'number', direction: 'output' },
      { id: 'alt', label: 'Altitude (m)', type: 'number', direction: 'output' },
    ],
    properties: [],
    luaTemplate: 'ahrs:get_home()',
  },
  {
    type: 'sensor-ahrs-location',
    label: 'AHRS Location', labelKey: 'lua.auto.ahrs-location',
    description: 'Live vehicle location from AHRS (a Location object - lat/lng/alt as one value)', descriptionKey: 'lua.auto.live-vehicle-location-from-ahrs-a-location-object-lat-lng-al',
    category: 'sensors',
    inputs: [],
    outputs: [
      { id: 'location', label: 'Location', type: 'any', direction: 'output' },
    ],
    properties: [],
    luaTemplate: 'ahrs:get_location()',
  },
  {
    type: 'sensor-named-float',
    label: 'Read Named Float', labelKey: 'lua.auto.read-named-float',
    description: 'Read a NAMED_VALUE_FLOAT published by another script or the GCS', descriptionKey: 'lua.auto.read-a-named-value-float-published-by-another-script-or-the-',
    category: 'sensors',
    inputs: [],
    outputs: [
      { id: 'value', label: 'Value', type: 'number', direction: 'output' },
      { id: 'fresh', label: 'Fresh', type: 'boolean', direction: 'output' },
    ],
    properties: [
      { id: 'name', label: 'Name (max 10 chars)', type: 'string', defaultValue: 'AD_HB' },
    ],
  },
  {
    type: 'sensor-velocity-ned',
    label: 'Velocity NED', labelKey: 'lua.auto.velocity-ned',
    description: 'Vehicle velocity in North/East/Down frame (m/s)', descriptionKey: 'lua.auto.vehicle-velocity-in-north-east-down-frame-m-s',
    category: 'sensors',
    inputs: [],
    outputs: [
      { id: 'vel_n', label: 'North (m/s)', type: 'number', direction: 'output' },
      { id: 'vel_e', label: 'East (m/s)', type: 'number', direction: 'output' },
      { id: 'vel_d', label: 'Down (m/s)', type: 'number', direction: 'output' },
    ],
    properties: [],
    luaTemplate: 'ahrs:get_velocity_NED()',
  },
  {
    type: 'sensor-wind',
    label: 'Wind Estimate', labelKey: 'lua.auto.wind-estimate',
    description: 'Estimated wind speed and direction', descriptionKey: 'lua.auto.estimated-wind-speed-and-direction',
    category: 'sensors',
    inputs: [],
    outputs: [
      { id: 'speed_ms', label: 'Speed (m/s)', type: 'number', direction: 'output' },
      { id: 'dir_deg', label: 'Direction (deg)', type: 'number', direction: 'output' },
    ],
    properties: [],
    luaTemplate: 'ahrs:wind_estimate()',
  },
  {
    type: 'sensor-param-get',
    label: 'Read Parameter', labelKey: 'lua.auto.read-parameter',
    description: 'Read a flight controller parameter live (e.g. CAM1_TRIGG_DIST). Returns 0 if the parameter does not exist.', descriptionKey: 'lua.auto.read-a-flight-controller-parameter-live-e-g-cam1-trigg-dist-',
    category: 'sensors',
    inputs: [],
    outputs: [
      { id: 'value', label: 'Value', type: 'number', direction: 'output' },
    ],
    properties: [
      { id: 'param_name', label: 'Parameter Name', type: 'string', defaultValue: 'CAM1_TRIGG_DIST' },
    ],
    luaTemplate: 'param:get(NAME)',
  },
  {
    type: 'sensor-gpio-read',
    label: 'Read GPIO Pin', labelKey: 'lua.auto.read-gpio-pin',
    description: 'Read the digital level of a GPIO pin. Wire a Pin input to set it from a parameter, or use the Pin property. Polled once per tick: pulses shorter than the run interval are missed, use Pulse Input (interrupt) for those.', descriptionKey: 'lua.auto.read-the-digital-level-of-a-gpio-pin-wire-a-pin-input-to-set',
    category: 'sensors',
    inputs: [
      { id: 'pin', label: 'Pin', type: 'number', direction: 'input' },
    ],
    outputs: [
      { id: 'level', label: 'Level (0/1)', type: 'number', direction: 'output' },
      { id: 'is_high', label: 'Is High', type: 'boolean', direction: 'output' },
    ],
    properties: [
      { id: 'pin', label: 'Pin (fallback)', type: 'number', defaultValue: 54, min: 0, max: 255 },
    ],
    luaTemplate: 'gpio:read(PIN)',
  },
  {
    type: 'sensor-pwm-pulse',
    label: 'Pulse Input (interrupt)', labelKey: 'lua.auto.pulse-input-interrupt',
    description: 'Catch short pulses (e.g. a 1-2 ms camera hotshoe pulse) on a GPIO pin via hardware interrupt. The pulse width is latched between ticks, so slow polling still sees it. The pin needs SERVOx_FUNCTION = -1 and must not be shared with CAM1_FEEDBAK_PIN (whoever attaches first owns the interrupt).', descriptionKey: 'lua.auto.catch-short-pulses-e-g-a-1-2-ms-camera-hotshoe-pulse-on-a-gp',
    category: 'sensors',
    inputs: [],
    outputs: [
      { id: 'pulse_seen', label: 'Pulse Seen', type: 'boolean', direction: 'output' },
      { id: 'width_us', label: 'Width (us)', type: 'number', direction: 'output' },
      { id: 'ok', label: 'Pin OK', type: 'boolean', direction: 'output' },
    ],
    properties: [
      { id: 'pin', label: 'Pin', type: 'number', defaultValue: 54, min: 0, max: 255 },
    ],
    luaTemplate: 'PWMSource():get_pwm_us()',
  },
  {
    type: 'sensor-current-waypoint',
    label: 'Current Waypoint', labelKey: 'lua.auto.current-waypoint',
    description: 'The active mission navigation waypoint index and command id.', descriptionKey: 'lua.auto.the-active-mission-navigation-waypoint-index-and-command-id',
    category: 'sensors',
    inputs: [],
    outputs: [
      { id: 'index', label: 'Index', type: 'number', direction: 'output' },
      { id: 'nav_id', label: 'Command ID', type: 'number', direction: 'output' },
    ],
    properties: [],
    luaTemplate: 'mission:get_current_nav_index()',
  },
];

// ── Logic ───────────────────────────────────────────────────────

const logicNodes: NodeDefinition[] = [
  {
    type: 'logic-compare',
    label: 'Compare', labelKey: 'lua.auto.compare',
    description: 'Compare two numbers with a selected operator', descriptionKey: 'lua.auto.compare-two-numbers-with-a-selected-operator',
    category: 'logic',
    inputs: [
      { id: 'a', label: 'A', type: 'number', direction: 'input', defaultValue: 0 },
      { id: 'b', label: 'B', type: 'number', direction: 'input', defaultValue: 0 },
    ],
    outputs: [
      { id: 'result', label: 'Result', type: 'boolean', direction: 'output' },
    ],
    properties: [
      {
        id: 'operator', label: 'Operator', type: 'select', defaultValue: '>',
        options: [
          { label: '> Greater than', value: '>' },
          { label: '< Less than', value: '<' },
          { label: '== Equal to', value: '==' },
          { label: '!= Not equal to', value: '~=' },
          { label: '>= Greater or equal', value: '>=' },
          { label: '<= Less or equal', value: '<=' },
        ],
      },
    ],
  },
  {
    type: 'logic-if-else',
    label: 'If / Else', labelKey: 'lua.auto.if-else',
    description: 'Branch execution based on a boolean condition', descriptionKey: 'lua.auto.branch-execution-based-on-a-boolean-condition',
    category: 'logic',
    inputs: [
      { id: 'condition', label: 'Condition', type: 'boolean', direction: 'input' },
    ],
    outputs: [
      { id: 'true_out', label: 'True', type: 'boolean', direction: 'output' },
      { id: 'false_out', label: 'False', type: 'boolean', direction: 'output' },
    ],
    properties: [],
  },
  {
    type: 'logic-and',
    label: 'AND',
    description: 'Logical AND: true only if both inputs are true', descriptionKey: 'lua.auto.logical-and-true-only-if-both-inputs-are-true',
    category: 'logic',
    inputs: [
      { id: 'a', label: 'A', type: 'boolean', direction: 'input' },
      { id: 'b', label: 'B', type: 'boolean', direction: 'input' },
    ],
    outputs: [
      { id: 'result', label: 'Result', type: 'boolean', direction: 'output' },
    ],
    properties: [],
  },
  {
    type: 'logic-or',
    label: 'OR',
    description: 'Logical OR: true if either input is true', descriptionKey: 'lua.auto.logical-or-true-if-either-input-is-true',
    category: 'logic',
    inputs: [
      { id: 'a', label: 'A', type: 'boolean', direction: 'input' },
      { id: 'b', label: 'B', type: 'boolean', direction: 'input' },
    ],
    outputs: [
      { id: 'result', label: 'Result', type: 'boolean', direction: 'output' },
    ],
    properties: [],
  },
  {
    type: 'logic-not',
    label: 'NOT',
    description: 'Invert a boolean value', descriptionKey: 'lua.auto.invert-a-boolean-value',
    category: 'logic',
    inputs: [
      { id: 'input', label: 'Input', type: 'boolean', direction: 'input' },
    ],
    outputs: [
      { id: 'result', label: 'Result', type: 'boolean', direction: 'output' },
    ],
    properties: [],
  },
  {
    type: 'logic-range-check',
    label: 'Range Check', labelKey: 'lua.auto.range-check',
    description: 'Check if a value is within a min/max range', descriptionKey: 'lua.auto.check-if-a-value-is-within-a-min-max-range',
    category: 'logic',
    inputs: [
      { id: 'value', label: 'Value', type: 'number', direction: 'input' },
    ],
    outputs: [
      { id: 'in_range', label: 'In Range', type: 'boolean', direction: 'output' },
    ],
    properties: [
      { id: 'min', label: 'Min', type: 'number', defaultValue: 0 },
      { id: 'max', label: 'Max', type: 'number', defaultValue: 100 },
    ],
  },
  {
    type: 'logic-switch',
    label: 'Switch', labelKey: 'lua.auto.switch',
    description: 'Multi-branch based on a numeric value', descriptionKey: 'lua.auto.multi-branch-based-on-a-numeric-value',
    category: 'logic',
    inputs: [
      { id: 'value', label: 'Value', type: 'number', direction: 'input' },
    ],
    outputs: [
      { id: 'case_0', label: 'Case 0', type: 'boolean', direction: 'output' },
      { id: 'case_1', label: 'Case 1', type: 'boolean', direction: 'output' },
      { id: 'case_2', label: 'Case 2', type: 'boolean', direction: 'output' },
      { id: 'default', label: 'Default', type: 'boolean', direction: 'output' },
    ],
    properties: [
      { id: 'case0_val', label: 'Case 0 Value', type: 'number', defaultValue: 0 },
      { id: 'case1_val', label: 'Case 1 Value', type: 'number', defaultValue: 1 },
      { id: 'case2_val', label: 'Case 2 Value', type: 'number', defaultValue: 2 },
    ],
  },
];

// ── Math ────────────────────────────────────────────────────────

const mathNodes: NodeDefinition[] = [
  {
    type: 'math-add',
    label: 'Add', labelKey: 'lua.auto.add',
    description: 'Add two numbers (A + B)', descriptionKey: 'lua.auto.add-two-numbers-a-b',
    category: 'math',
    inputs: [
      { id: 'a', label: 'A', type: 'number', direction: 'input', defaultValue: 0 },
      { id: 'b', label: 'B', type: 'number', direction: 'input', defaultValue: 0 },
    ],
    outputs: [{ id: 'result', label: 'Result', type: 'number', direction: 'output' }],
    properties: [],
  },
  {
    type: 'math-subtract',
    label: 'Subtract', labelKey: 'lua.auto.subtract',
    description: 'Subtract two numbers (A - B)', descriptionKey: 'lua.auto.subtract-two-numbers-a-b',
    category: 'math',
    inputs: [
      { id: 'a', label: 'A', type: 'number', direction: 'input', defaultValue: 0 },
      { id: 'b', label: 'B', type: 'number', direction: 'input', defaultValue: 0 },
    ],
    outputs: [{ id: 'result', label: 'Result', type: 'number', direction: 'output' }],
    properties: [],
  },
  {
    type: 'math-multiply',
    label: 'Multiply', labelKey: 'lua.auto.multiply',
    description: 'Multiply two numbers (A * B)', descriptionKey: 'lua.auto.multiply-two-numbers-a-b',
    category: 'math',
    inputs: [
      { id: 'a', label: 'A', type: 'number', direction: 'input', defaultValue: 0 },
      { id: 'b', label: 'B', type: 'number', direction: 'input', defaultValue: 0 },
    ],
    outputs: [{ id: 'result', label: 'Result', type: 'number', direction: 'output' }],
    properties: [],
  },
  {
    type: 'math-divide',
    label: 'Divide', labelKey: 'lua.auto.divide',
    description: 'Divide two numbers (A / B) with zero-division protection', descriptionKey: 'lua.auto.divide-two-numbers-a-b-with-zero-division-protection',
    category: 'math',
    inputs: [
      { id: 'a', label: 'A', type: 'number', direction: 'input', defaultValue: 0 },
      { id: 'b', label: 'B', type: 'number', direction: 'input', defaultValue: 1 },
    ],
    outputs: [{ id: 'result', label: 'Result', type: 'number', direction: 'output' }],
    properties: [],
  },
  {
    type: 'math-clamp',
    label: 'Clamp', labelKey: 'lua.auto.clamp',
    description: 'Constrain a value to a min/max range', descriptionKey: 'lua.auto.constrain-a-value-to-a-min-max-range',
    category: 'math',
    inputs: [
      { id: 'value', label: 'Value', type: 'number', direction: 'input', defaultValue: 0 },
    ],
    outputs: [{ id: 'result', label: 'Result', type: 'number', direction: 'output' }],
    properties: [
      { id: 'min', label: 'Min', type: 'number', defaultValue: 0 },
      { id: 'max', label: 'Max', type: 'number', defaultValue: 100 },
    ],
  },
  {
    type: 'math-map-range',
    label: 'Map Range', labelKey: 'lua.auto.map-range',
    description: 'Linear interpolation from one range to another', descriptionKey: 'lua.auto.linear-interpolation-from-one-range-to-another',
    category: 'math',
    inputs: [
      { id: 'value', label: 'Value', type: 'number', direction: 'input', defaultValue: 0 },
    ],
    outputs: [{ id: 'result', label: 'Result', type: 'number', direction: 'output' }],
    properties: [
      { id: 'in_min', label: 'Input Min', type: 'number', defaultValue: 0 },
      { id: 'in_max', label: 'Input Max', type: 'number', defaultValue: 100 },
      { id: 'out_min', label: 'Output Min', type: 'number', defaultValue: 0 },
      { id: 'out_max', label: 'Output Max', type: 'number', defaultValue: 1 },
    ],
  },
  {
    type: 'math-abs',
    label: 'Abs', labelKey: 'lua.auto.abs',
    description: 'Absolute value of a number', descriptionKey: 'lua.auto.absolute-value-of-a-number',
    category: 'math',
    inputs: [
      { id: 'value', label: 'Value', type: 'number', direction: 'input', defaultValue: 0 },
    ],
    outputs: [{ id: 'result', label: 'Result', type: 'number', direction: 'output' }],
    properties: [],
  },
  {
    type: 'math-min',
    label: 'Min', labelKey: 'lua.auto.min',
    description: 'Minimum of two values', descriptionKey: 'lua.auto.minimum-of-two-values',
    category: 'math',
    inputs: [
      { id: 'a', label: 'A', type: 'number', direction: 'input', defaultValue: 0 },
      { id: 'b', label: 'B', type: 'number', direction: 'input', defaultValue: 0 },
    ],
    outputs: [{ id: 'result', label: 'Result', type: 'number', direction: 'output' }],
    properties: [],
  },
  {
    type: 'math-max',
    label: 'Max', labelKey: 'lua.auto.max',
    description: 'Maximum of two values', descriptionKey: 'lua.auto.maximum-of-two-values',
    category: 'math',
    inputs: [
      { id: 'a', label: 'A', type: 'number', direction: 'input', defaultValue: 0 },
      { id: 'b', label: 'B', type: 'number', direction: 'input', defaultValue: 0 },
    ],
    outputs: [{ id: 'result', label: 'Result', type: 'number', direction: 'output' }],
    properties: [],
  },
  // ── Location math (work with AHRS Location objects) ──
  {
    type: 'math-location-bearing',
    label: 'Bearing A→B', labelKey: 'lua.auto.bearing-a-b',
    description: 'Compass bearing in degrees from Location A to Location B (0=North, 90=East)', descriptionKey: 'lua.auto.compass-bearing-in-degrees-from-location-a-to-location-b-0-n',
    category: 'math',
    inputs: [
      { id: 'from', label: 'From', type: 'any', direction: 'input' },
      { id: 'to', label: 'To', type: 'any', direction: 'input' },
    ],
    outputs: [{ id: 'bearing_deg', label: 'Bearing (°)', type: 'number', direction: 'output' }],
    properties: [],
    luaTemplate: 'math.deg(FROM:get_bearing(TO))',
  },
  {
    type: 'math-location-distance',
    label: 'Distance A→B', labelKey: 'lua.auto.distance-a-b',
    description: 'Horizontal distance in metres between two Locations', descriptionKey: 'lua.auto.horizontal-distance-in-metres-between-two-locations',
    category: 'math',
    inputs: [
      { id: 'a', label: 'A', type: 'any', direction: 'input' },
      { id: 'b', label: 'B', type: 'any', direction: 'input' },
    ],
    outputs: [{ id: 'distance_m', label: 'Distance (m)', type: 'number', direction: 'output' }],
    properties: [],
    luaTemplate: 'A:get_distance(B)',
  },
  {
    type: 'math-location-offset',
    label: 'Offset Location', labelKey: 'lua.auto.offset-location',
    description: 'Project a Location forward by bearing (deg) + distance (m). Returns new Location.', descriptionKey: 'lua.auto.project-a-location-forward-by-bearing-deg-distance-m-returns',
    category: 'math',
    inputs: [
      { id: 'from', label: 'From', type: 'any', direction: 'input' },
      { id: 'bearing_deg', label: 'Bearing (°)', type: 'number', direction: 'input', defaultValue: 0 },
      { id: 'distance_m', label: 'Distance (m)', type: 'number', direction: 'input', defaultValue: 0 },
    ],
    outputs: [{ id: 'location', label: 'Location', type: 'any', direction: 'output' }],
    properties: [],
    luaTemplate: 'FROM:copy():offset_bearing(BEARING, DISTANCE)',
  },
];

// ── Actions ─────────────────────────────────────────────────────

const actionNodes: NodeDefinition[] = [
  {
    type: 'action-gcs-text',
    label: 'Send GCS Text', labelKey: 'lua.auto.send-gcs-text',
    description: 'Display a message on the ground control station', descriptionKey: 'lua.auto.display-a-message-on-the-ground-control-station',
    category: 'actions',
    inputs: [
      { id: 'trigger', label: 'Trigger', type: 'boolean', direction: 'input' },
    ],
    outputs: [],
    properties: [
      { id: 'message', label: 'Message', type: 'string', defaultValue: 'Hello from Lua!' },
      {
        id: 'severity', label: 'Severity', type: 'select', defaultValue: 6,
        options: [
          { label: 'Emergency', value: 0 },
          { label: 'Alert', value: 1 },
          { label: 'Critical', value: 2 },
          { label: 'Error', value: 3 },
          { label: 'Warning', value: 4 },
          { label: 'Notice', value: 5 },
          { label: 'Info', value: 6 },
          { label: 'Debug', value: 7 },
        ],
      },
    ],
    luaTemplate: 'gcs:send_text(SEV, MSG)',
  },
  {
    type: 'action-set-servo',
    label: 'Set Servo', labelKey: 'lua.auto.set-servo',
    description: 'Set a servo output to a specific PWM value', descriptionKey: 'lua.auto.set-a-servo-output-to-a-specific-pwm-value',
    category: 'actions',
    inputs: [
      { id: 'trigger', label: 'Trigger', type: 'boolean', direction: 'input' },
      { id: 'pwm', label: 'PWM', type: 'number', direction: 'input', defaultValue: 1500 },
    ],
    outputs: [],
    properties: [
      { id: 'servo_num', label: 'Servo Number', type: 'number', defaultValue: 1, min: 1, max: 16 },
    ],
    luaTemplate: 'SRV_Channels:set_output_pwm(CH, PWM)',
  },
  {
    type: 'action-set-mode',
    label: 'Set Flight Mode', labelKey: 'lua.auto.set-flight-mode',
    description: 'Request a flight mode change', descriptionKey: 'lua.auto.request-a-flight-mode-change',
    category: 'actions',
    inputs: [
      { id: 'trigger', label: 'Trigger', type: 'boolean', direction: 'input' },
    ],
    outputs: [],
    properties: [
      { id: 'mode_num', label: 'Mode Number', type: 'number', defaultValue: 0, min: 0, max: 30 },
    ],
    luaTemplate: 'vehicle:set_mode(MODE)',
  },
  {
    type: 'action-set-param',
    label: 'Set Parameter', labelKey: 'lua.auto.set-parameter',
    description: 'Change a flight controller parameter value', descriptionKey: 'lua.auto.change-a-flight-controller-parameter-value',
    category: 'actions',
    inputs: [
      { id: 'trigger', label: 'Trigger', type: 'boolean', direction: 'input' },
      { id: 'value', label: 'Value', type: 'number', direction: 'input', defaultValue: 0 },
    ],
    outputs: [],
    properties: [
      { id: 'param_name', label: 'Parameter Name', type: 'string', defaultValue: 'RC1_MIN' },
    ],
    luaTemplate: 'param:set(NAME, VAL)',
  },
  {
    type: 'action-relay',
    label: 'Trigger Relay', labelKey: 'lua.auto.trigger-relay',
    description: 'Toggle a relay on or off', descriptionKey: 'lua.auto.toggle-a-relay-on-or-off',
    category: 'actions',
    inputs: [
      { id: 'trigger', label: 'Trigger', type: 'boolean', direction: 'input' },
    ],
    outputs: [],
    properties: [
      { id: 'relay_num', label: 'Relay Number', type: 'number', defaultValue: 0, min: 0, max: 5 },
      {
        id: 'state', label: 'State', type: 'select', defaultValue: 1,
        options: [{ label: 'ON', value: 1 }, { label: 'OFF', value: 0 }],
      },
    ],
    luaTemplate: 'relay:on/off(NUM)',
  },
  {
    type: 'action-log-to-file',
    label: 'Log to File', labelKey: 'lua.auto.log-to-file',
    description: 'Append a line of data to a CSV/text file on the SD card', descriptionKey: 'lua.auto.append-a-line-of-data-to-a-csv-text-file-on-the-sd-card',
    category: 'actions',
    inputs: [
      { id: 'trigger', label: 'Trigger', type: 'boolean', direction: 'input' },
      { id: 'value1', label: 'Value 1', type: 'any', direction: 'input' },
      { id: 'value2', label: 'Value 2', type: 'any', direction: 'input' },
      { id: 'value3', label: 'Value 3', type: 'any', direction: 'input' },
    ],
    outputs: [],
    properties: [
      { id: 'filename', label: 'File Name', type: 'string', defaultValue: 'log.csv' },
      {
        id: 'separator', label: 'Separator', type: 'select', defaultValue: ',',
        options: [
          { label: 'Comma (CSV)', value: ',' },
          { label: 'Semicolon', value: ';' },
          { label: 'Tab', value: '\t' },
        ],
      },
    ],
    luaTemplate: 'io.open/write/close',
  },
  {
    type: 'action-set-led',
    label: 'Set LED', labelKey: 'lua.auto.set-led',
    description: 'Control NeoPixel / ProfiLED colors', descriptionKey: 'lua.auto.control-neopixel-profiled-colors',
    category: 'actions',
    inputs: [
      { id: 'trigger', label: 'Trigger', type: 'boolean', direction: 'input' },
      { id: 'r', label: 'Red', type: 'number', direction: 'input', defaultValue: 0 },
      { id: 'g', label: 'Green', type: 'number', direction: 'input', defaultValue: 0 },
      { id: 'b', label: 'Blue', type: 'number', direction: 'input', defaultValue: 0 },
    ],
    outputs: [],
    properties: [
      { id: 'instance', label: 'LED Instance', type: 'number', defaultValue: 0, min: 0, max: 15 },
    ],
    luaTemplate: 'serialLED:set_RGB(INST, LED, R, G, B)',
  },
  {
    type: 'action-play-tune',
    label: 'Play Tune', labelKey: 'lua.auto.play-tune',
    description: 'Play a tone/melody on the buzzer (MML notation)', descriptionKey: 'lua.auto.play-a-tone-melody-on-the-buzzer-mml-notation',
    category: 'actions',
    inputs: [
      { id: 'trigger', label: 'Trigger', type: 'boolean', direction: 'input' },
    ],
    outputs: [],
    properties: [
      { id: 'tune', label: 'Tune (MML)', type: 'string', defaultValue: 'MFT200L4O5CDE' },
    ],
    luaTemplate: 'notify:play_tune(TUNE)',
  },
  {
    type: 'action-set-waypoint',
    label: 'Jump to Waypoint', labelKey: 'lua.auto.jump-to-waypoint',
    description: 'Set the current mission command index (jump to a waypoint)', descriptionKey: 'lua.auto.set-the-current-mission-command-index-jump-to-a-waypoint',
    category: 'actions',
    inputs: [
      { id: 'trigger', label: 'Trigger', type: 'boolean', direction: 'input' },
    ],
    outputs: [],
    properties: [
      { id: 'cmd_idx', label: 'Waypoint Index', type: 'number', defaultValue: 1, min: 0, max: 999 },
    ],
    luaTemplate: 'mission:set_current_cmd(IDX)',
  },
  // ── FC-side script primitives (added for the script-installer graph) ──
  {
    type: 'action-set-target-location',
    label: 'Set Target Location', labelKey: 'lua.auto.set-target-location',
    description: 'Issue a GUIDED-mode position target. Vehicle ignores it when not in GUIDED.', descriptionKey: 'lua.auto.issue-a-guided-mode-position-target-vehicle-ignores-it-when-',
    category: 'actions',
    inputs: [
      { id: 'trigger', label: 'Trigger', type: 'boolean', direction: 'input' },
      { id: 'location', label: 'Location', type: 'any', direction: 'input' },
    ],
    outputs: [],
    properties: [],
    luaTemplate: 'vehicle:set_target_location(LOCATION)',
  },
  {
    type: 'action-publish-named-float',
    label: 'Publish Named Float', labelKey: 'lua.auto.publish-named-float',
    description: 'Send a NAMED_VALUE_FLOAT (max 10 char name) over MAVLink. Used for heartbeats and lightweight pub/sub.', descriptionKey: 'lua.auto.send-a-named-value-float-max-10-char-name-over-mavlink-used-',
    category: 'actions',
    inputs: [
      { id: 'trigger', label: 'Trigger', type: 'boolean', direction: 'input' },
      { id: 'value', label: 'Value', type: 'number', direction: 'input', defaultValue: 0 },
    ],
    outputs: [],
    properties: [
      { id: 'name', label: 'Name (max 10 chars)', type: 'string', defaultValue: 'AD_HB' },
    ],
    luaTemplate: 'gcs:send_named_float("NAME", VALUE)',
  },
  {
    type: 'action-mavlink-on-user-cmd',
    label: 'On MAV_CMD_USER_*', labelKey: 'lua.auto.on-mav-cmd-user',
    description: 'Receive a MAVLink user command (MAV_CMD_USER_1..5) sent from the GCS. Carries 4 floats + lat/lon/alt.', descriptionKey: 'lua.auto.receive-a-mavlink-user-command-mav-cmd-user-1-5-sent-from-th',
    category: 'actions',
    inputs: [],
    outputs: [
      { id: 'trigger', label: 'On Cmd', type: 'boolean', direction: 'output' },
      { id: 'param1', label: 'param1', type: 'number', direction: 'output' },
      { id: 'param2', label: 'param2', type: 'number', direction: 'output' },
      { id: 'param3', label: 'param3', type: 'number', direction: 'output' },
      { id: 'param4', label: 'param4', type: 'number', direction: 'output' },
      { id: 'location', label: 'Location', type: 'any', direction: 'output' },
    ],
    properties: [
      {
        id: 'cmd_id', label: 'MAV_CMD ID', type: 'select', defaultValue: 31010,
        options: [
          { label: 'USER_1 (31010)', value: 31010 },
          { label: 'USER_2 (31011)', value: 31011 },
          { label: 'USER_3 (31012)', value: 31012 },
          { label: 'USER_4 (31013)', value: 31013 },
          { label: 'USER_5 (31014)', value: 31014 },
        ],
      },
    ],
  },
  {
    type: 'action-serial-write',
    label: 'Serial Write', labelKey: 'lua.auto.serial-write',
    description: 'Write a string out a scripting serial port. Set an unused SERIALx_PROTOCOL to 28 (Scripting); Instance picks the Nth such port.', descriptionKey: 'lua.auto.write-a-string-out-a-scripting-serial-port-set-an-unused-ser',
    category: 'actions',
    inputs: [
      { id: 'trigger', label: 'Trigger', type: 'boolean', direction: 'input' },
      { id: 'data', label: 'Data', type: 'any', direction: 'input' },
    ],
    outputs: [],
    properties: [
      { id: 'instance', label: 'Scripting Serial Instance', type: 'number', defaultValue: 0, min: 0, max: 3 },
      {
        id: 'baud', label: 'Baud Rate', type: 'select', defaultValue: 57600,
        options: [
          { label: '9600', value: 9600 },
          { label: '19200', value: 19200 },
          { label: '38400', value: 38400 },
          { label: '57600', value: 57600 },
          { label: '115200', value: 115200 },
          { label: '230400', value: 230400 },
          { label: '460800', value: 460800 },
          { label: '921600', value: 921600 },
        ],
      },
      {
        id: 'line_ending', label: 'Line Ending', type: 'select', defaultValue: 'none',
        options: [
          { label: 'None', value: 'none' },
          { label: 'Newline (\\n)', value: 'lf' },
          { label: 'CRLF (\\r\\n)', value: 'crlf' },
        ],
      },
    ],
    luaTemplate: 'port:write(byte)',
  },
  {
    type: 'action-socket-send',
    label: 'Network Send', labelKey: 'lua.auto.network-send',
    description: 'Send a string over UDP or TCP via the flight controller network stack. Needs a board with networking and NET_ENABLE = 1 (ArduPilot 4.5+).', descriptionKey: 'lua.auto.send-a-string-over-udp-or-tcp-via-the-flight-controller-netw',
    category: 'actions',
    inputs: [
      { id: 'trigger', label: 'Trigger', type: 'boolean', direction: 'input' },
      { id: 'data', label: 'Data', type: 'any', direction: 'input' },
    ],
    outputs: [],
    properties: [
      {
        id: 'protocol', label: 'Protocol', type: 'select', defaultValue: 'udp',
        options: [
          { label: 'UDP', value: 'udp' },
          { label: 'TCP', value: 'tcp' },
        ],
      },
      { id: 'ip', label: 'Destination IP', type: 'string', defaultValue: '192.168.1.10' },
      { id: 'port', label: 'Destination Port', type: 'number', defaultValue: 14550, min: 1, max: 65535 },
    ],
    luaTemplate: 'sock:send(data, #data)',
  },
];

// ── Timing ──────────────────────────────────────────────────────

const timingNodes: NodeDefinition[] = [
  {
    type: 'timing-run-every',
    label: 'Run Every', labelKey: 'lua.auto.run-every',
    description: 'Execute downstream at a fixed interval (independent timer)', descriptionKey: 'lua.auto.execute-downstream-at-a-fixed-interval-independent-timer',
    category: 'timing',
    inputs: [
      { id: 'trigger', label: 'Trigger', type: 'boolean', direction: 'input' },
    ],
    outputs: [
      { id: 'flow', label: 'Flow', type: 'boolean', direction: 'output' },
    ],
    properties: [
      { id: 'interval_ms', label: 'Interval (ms)', type: 'number', defaultValue: 5000, min: 100, max: 60000, step: 100 },
    ],
  },
  {
    type: 'timing-debounce',
    label: 'Debounce', labelKey: 'lua.auto.debounce',
    description: 'Suppress rapid changes: only pass through after value is stable', descriptionKey: 'lua.auto.suppress-rapid-changes-only-pass-through-after-value-is-stab',
    category: 'timing',
    inputs: [
      { id: 'input', label: 'Input', type: 'boolean', direction: 'input' },
    ],
    outputs: [
      { id: 'output', label: 'Output', type: 'boolean', direction: 'output' },
    ],
    properties: [
      { id: 'delay_ms', label: 'Delay (ms)', type: 'number', defaultValue: 500, min: 50, max: 10000 },
    ],
  },
  {
    type: 'timing-on-change',
    label: 'On Change', labelKey: 'lua.auto.on-change',
    description: 'Trigger when a value changes from its previous value', descriptionKey: 'lua.auto.trigger-when-a-value-changes-from-its-previous-value',
    category: 'timing',
    inputs: [
      { id: 'value', label: 'Value', type: 'number', direction: 'input' },
    ],
    outputs: [
      { id: 'changed', label: 'Changed', type: 'boolean', direction: 'output' },
    ],
    properties: [],
  },
  {
    type: 'timing-rising-edge',
    label: 'Rising Edge', labelKey: 'lua.auto.rising-edge',
    description: 'Fires once when input transitions from false to true', descriptionKey: 'lua.auto.fires-once-when-input-transitions-from-false-to-true',
    category: 'timing',
    inputs: [
      { id: 'input', label: 'Input', type: 'boolean', direction: 'input' },
    ],
    outputs: [
      { id: 'triggered', label: 'Triggered', type: 'boolean', direction: 'output' },
    ],
    properties: [],
  },
  {
    type: 'timing-falling-edge',
    label: 'Falling Edge', labelKey: 'lua.auto.falling-edge',
    description: 'Fires once when input transitions from true to false', descriptionKey: 'lua.auto.fires-once-when-input-transitions-from-true-to-false',
    category: 'timing',
    inputs: [
      { id: 'input', label: 'Input', type: 'boolean', direction: 'input' },
    ],
    outputs: [
      { id: 'triggered', label: 'Triggered', type: 'boolean', direction: 'output' },
    ],
    properties: [],
  },
  {
    type: 'timing-watchdog',
    label: 'Watchdog Timer', labelKey: 'lua.auto.watchdog-timer',
    description: 'Outputs Expired if no Kick is received within the timeout. The timer resets on every Kick, and holds reset while Enable is false.', descriptionKey: 'lua.auto.outputs-expired-if-no-kick-is-received-within-the-timeout-th',
    category: 'timing',
    inputs: [
      { id: 'kick', label: 'Kick', type: 'boolean', direction: 'input' },
      { id: 'enable', label: 'Enable', type: 'boolean', direction: 'input', defaultValue: true },
    ],
    outputs: [
      { id: 'expired', label: 'Expired', type: 'boolean', direction: 'output' },
    ],
    properties: [
      { id: 'timeout_ms', label: 'Timeout (ms)', type: 'number', defaultValue: 3000, min: 100, max: 120000, step: 100 },
    ],
  },
  {
    type: 'timing-latch',
    label: 'Latch / Toggle', labelKey: 'lua.auto.latch-toggle',
    description: 'Set/Reset flip-flop: Set turns output on, Reset turns it off', descriptionKey: 'lua.auto.set-reset-flip-flop-set-turns-output-on-reset-turns-it-off',
    category: 'timing',
    inputs: [
      { id: 'set', label: 'Set', type: 'boolean', direction: 'input' },
      { id: 'reset', label: 'Reset', type: 'boolean', direction: 'input' },
    ],
    outputs: [
      { id: 'state', label: 'State', type: 'boolean', direction: 'output' },
    ],
    properties: [],
  },
];

// ── Variables ───────────────────────────────────────────────────

const variableNodes: NodeDefinition[] = [
  {
    type: 'var-constant',
    label: 'Constant', labelKey: 'lua.auto.constant',
    description: 'A fixed value (number, string, or boolean)', descriptionKey: 'lua.auto.a-fixed-value-number-string-or-boolean',
    category: 'variables',
    inputs: [],
    outputs: [
      { id: 'value', label: 'Value', type: 'any', direction: 'output' },
    ],
    properties: [
      {
        id: 'type', label: 'Type', type: 'select', defaultValue: 'number',
        options: [
          { label: 'Number', value: 'number' },
          { label: 'String', value: 'string' },
          { label: 'Boolean', value: 'boolean' },
        ],
      },
      { id: 'value', label: 'Value', type: 'string', defaultValue: '0' },
    ],
  },
  {
    type: 'var-get',
    label: 'Get Variable', labelKey: 'lua.auto.get-variable',
    description: 'Read a named variable', descriptionKey: 'lua.auto.read-a-named-variable',
    category: 'variables',
    inputs: [],
    outputs: [
      { id: 'value', label: 'Value', type: 'any', direction: 'output' },
    ],
    properties: [
      { id: 'name', label: 'Variable Name', type: 'string', defaultValue: 'myVar' },
    ],
  },
  {
    type: 'var-set',
    label: 'Set Variable', labelKey: 'lua.auto.set-variable',
    description: 'Write a named variable', descriptionKey: 'lua.auto.write-a-named-variable',
    category: 'variables',
    inputs: [
      { id: 'trigger', label: 'Trigger', type: 'boolean', direction: 'input' },
      { id: 'value', label: 'Value', type: 'any', direction: 'input' },
    ],
    outputs: [],
    properties: [
      { id: 'name', label: 'Variable Name', type: 'string', defaultValue: 'myVar' },
    ],
  },
];

// ── Flow ────────────────────────────────────────────────────────

const flowNodes: NodeDefinition[] = [
  {
    type: 'flow-custom-lua',
    label: 'Custom Lua', labelKey: 'lua.auto.custom-lua',
    description: 'Inline your own Lua snippet. Input pins arrive as local variables named after the pins; end the snippet with "return <output pins>" to feed downstream nodes.', descriptionKey: 'lua.auto.inline-your-own-lua-snippet-input-pins-arrive-as-local-varia',
    category: 'flow',
    // Ports are derived per-instance from the pin properties, see getEffectivePorts
    inputs: [],
    outputs: [],
    properties: [
      { id: 'inputs', label: 'Input pins (comma separated)', type: 'string', defaultValue: '' },
      { id: 'outputs', label: 'Output pins (comma separated)', type: 'string', defaultValue: '' },
      { id: 'code', label: 'Lua code', type: 'code', defaultValue: '-- inputs are locals named after your input pins\n-- return values in output pin order' },
    ],
  },
  {
    type: 'flow-comment',
    label: 'Comment', labelKey: 'lua.auto.comment',
    description: 'A text comment for documentation purposes, no effect on code', descriptionKey: 'lua.auto.a-text-comment-for-documentation-purposes-no-effect-on-code',
    category: 'flow',
    inputs: [],
    outputs: [],
    properties: [
      { id: 'text', label: 'Comment', type: 'string', defaultValue: 'Add a description here...' },
    ],
  },
];

// ── Registry ────────────────────────────────────────────────────

export const NODE_LIBRARY: NodeDefinition[] = [
  ...sensorNodes,
  ...logicNodes,
  ...mathNodes,
  ...actionNodes,
  ...timingNodes,
  ...variableNodes,
  ...flowNodes,
];

/** Lookup map: type → definition */
const definitionMap = new Map<string, NodeDefinition>();
for (const def of NODE_LIBRARY) {
  definitionMap.set(def.type, def);
}

export function getNodeDefinition(type: string): NodeDefinition | undefined {
  return definitionMap.get(type);
}

/** Get all nodes in a given category */
export function getNodesByCategory(category: string): NodeDefinition[] {
  return NODE_LIBRARY.filter((n) => n.category === category);
}

// ── Dynamic ports (Custom Lua) ──────────────────────────────────

const LUA_KEYWORDS = new Set([
  'and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function',
  'goto', 'if', 'in', 'local', 'nil', 'not', 'or', 'repeat', 'return',
  'then', 'true', 'until', 'while',
]);

/** Parse a comma-separated pin list into unique valid Lua identifiers */
export function parseCustomPins(raw: string): string[] {
  const seen = new Set<string>();
  const pins: string[] = [];
  for (const part of raw.split(',')) {
    let name = part.trim().replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]/, '_$&');
    if (LUA_KEYWORDS.has(name)) name = `${name}_`;
    if (!name || seen.has(name)) continue;
    seen.add(name);
    pins.push(name);
  }
  return pins;
}

/**
 * Ports for a node instance. Static for every node except Custom Lua, whose
 * pins come from its own pin-list properties.
 */
export function getEffectivePorts(
  def: NodeDefinition,
  propertyValues: Record<string, number | boolean | string>,
): { inputs: PortDefinition[]; outputs: PortDefinition[] } {
  if (def.type !== 'flow-custom-lua') {
    return { inputs: def.inputs, outputs: def.outputs };
  }
  const toPorts = (raw: unknown, direction: PortDefinition['direction']): PortDefinition[] =>
    parseCustomPins(String(raw ?? '')).map((name) => ({
      id: name,
      label: name,
      type: 'any' as const,
      direction,
    }));
  return {
    inputs: toPorts(propertyValues['inputs'], 'input'),
    outputs: toPorts(propertyValues['outputs'], 'output'),
  };
}
