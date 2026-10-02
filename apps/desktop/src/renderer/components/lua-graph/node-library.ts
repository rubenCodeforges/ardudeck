/**
 * Node library — defines every available node type for the Lua Graph Editor.
 */
import type { NodeDefinition, PortDefinition } from './lua-graph-types';

// ── Sensors ─────────────────────────────────────────────────────

const sensorNodes: NodeDefinition[] = [
  {
    type: 'sensor-gps',
    label: 'GPS Position', // i18n-exempt
    description: 'Current GPS coordinates from the flight controller', // i18n-exempt
    category: 'sensors',
    inputs: [],
    outputs: [
      { id: 'lat', label: 'Latitude', type: 'number', direction: 'output' }, // i18n-exempt
      { id: 'lng', label: 'Longitude', type: 'number', direction: 'output' }, // i18n-exempt
      { id: 'alt', label: 'Altitude (m)', type: 'number', direction: 'output' }, // i18n-exempt
    ],
    properties: [],
    luaTemplate: 'gps:location(0)',
  },
  {
    type: 'sensor-baro-alt',
    label: 'Baro Altitude', // i18n-exempt
    description: 'Barometric altitude in meters', // i18n-exempt
    category: 'sensors',
    inputs: [],
    outputs: [
      { id: 'alt_m', label: 'Altitude (m)', type: 'number', direction: 'output' }, // i18n-exempt
    ],
    properties: [],
    luaTemplate: 'baro:get_altitude()',
  },
  {
    type: 'sensor-battery',
    label: 'Battery', // i18n-exempt
    description: 'Battery voltage, current, and remaining percentage', // i18n-exempt
    category: 'sensors',
    inputs: [],
    outputs: [
      { id: 'voltage', label: 'Voltage', type: 'number', direction: 'output' }, // i18n-exempt
      { id: 'current', label: 'Current (A)', type: 'number', direction: 'output' }, // i18n-exempt
      { id: 'remaining_pct', label: 'Remaining %', type: 'number', direction: 'output' }, // i18n-exempt
    ],
    properties: [
      { id: 'instance', label: 'Battery Instance', type: 'number', defaultValue: 0, min: 0, max: 3 }, // i18n-exempt
    ],
    luaTemplate: 'battery',
  },
  {
    type: 'sensor-airspeed',
    label: 'Airspeed', // i18n-exempt
    description: 'Measured airspeed in m/s', // i18n-exempt
    category: 'sensors',
    inputs: [],
    outputs: [
      { id: 'airspeed_ms', label: 'Airspeed (m/s)', type: 'number', direction: 'output' }, // i18n-exempt
    ],
    properties: [],
    luaTemplate: 'ahrs:airspeed_estimate()',
  },
  {
    type: 'sensor-rc-channel',
    label: 'RC Channel', // i18n-exempt
    description: 'Read a specific RC channel value (1-16)', // i18n-exempt
    category: 'sensors',
    inputs: [],
    outputs: [
      { id: 'value_us', label: 'Value (us)', type: 'number', direction: 'output' }, // i18n-exempt
    ],
    properties: [
      { id: 'channel', label: 'Channel', type: 'channel', defaultValue: 1, min: 1, max: 16 }, // i18n-exempt
    ],
    luaTemplate: 'rc:get_pwm(CH)',
  },
  {
    type: 'sensor-rangefinder',
    label: 'Rangefinder', // i18n-exempt
    description: 'Rangefinder distance in meters', // i18n-exempt
    category: 'sensors',
    inputs: [],
    outputs: [
      { id: 'distance_m', label: 'Distance (m)', type: 'number', direction: 'output' }, // i18n-exempt
    ],
    properties: [
      { id: 'instance', label: 'Instance', type: 'number', defaultValue: 0, min: 0, max: 3 }, // i18n-exempt
    ],
    luaTemplate: 'rangefinder:distance_cm(INST) / 100.0',
  },
  {
    type: 'sensor-attitude',
    label: 'Attitude', // i18n-exempt
    description: 'Current vehicle attitude (roll, pitch, yaw) in degrees', // i18n-exempt
    category: 'sensors',
    inputs: [],
    outputs: [
      { id: 'roll', label: 'Roll (deg)', type: 'number', direction: 'output' }, // i18n-exempt
      { id: 'pitch', label: 'Pitch (deg)', type: 'number', direction: 'output' }, // i18n-exempt
      { id: 'yaw', label: 'Yaw (deg)', type: 'number', direction: 'output' }, // i18n-exempt
    ],
    properties: [],
    luaTemplate: 'ahrs:get_roll/pitch/yaw()',
  },
  {
    type: 'sensor-groundspeed',
    label: 'Ground Speed', // i18n-exempt
    description: 'GPS ground speed in m/s', // i18n-exempt
    category: 'sensors',
    inputs: [],
    outputs: [
      { id: 'speed_ms', label: 'Speed (m/s)', type: 'number', direction: 'output' }, // i18n-exempt
    ],
    properties: [],
    luaTemplate: 'ahrs:groundspeed_vector()',
  },
  {
    type: 'sensor-rc-aux-switch',
    label: 'RC Aux Switch', // i18n-exempt
    description: 'Read an RC aux switch position (Low / Mid / High)', // i18n-exempt
    category: 'sensors',
    inputs: [],
    outputs: [
      { id: 'state', label: 'State (0-2)', type: 'number', direction: 'output' }, // i18n-exempt
      { id: 'is_high', label: 'Is High', type: 'boolean', direction: 'output' }, // i18n-exempt
      { id: 'is_mid', label: 'Is Mid', type: 'boolean', direction: 'output' }, // i18n-exempt
      { id: 'is_low', label: 'Is Low', type: 'boolean', direction: 'output' }, // i18n-exempt
    ],
    properties: [
      { id: 'aux_fn', label: 'Aux Function', type: 'number', defaultValue: 300, min: 0, max: 999 }, // i18n-exempt
    ],
    luaTemplate: 'rc:get_aux_cached(FN)',
  },
  {
    type: 'sensor-rangefinder-orient',
    label: 'Rangefinder (Oriented)', // i18n-exempt
    description: 'Rangefinder distance with orientation (e.g. 25 = downward for boats)', // i18n-exempt
    category: 'sensors',
    inputs: [],
    outputs: [
      { id: 'distance_m', label: 'Distance (m)', type: 'number', direction: 'output' }, // i18n-exempt
    ],
    properties: [
      {
        id: 'orientation', label: 'Orientation', type: 'select', defaultValue: 25, // i18n-exempt
        options: [
          { label: '0 Forward', value: 0 }, // i18n-exempt
          { label: '25 Down', value: 25 }, // i18n-exempt
          { label: '24 Up', value: 24 },
        ],
      },
    ],
    luaTemplate: 'rangefinder:distance_cm_orient(ORIENT) / 100.0',
  },
  {
    type: 'sensor-flight-mode',
    label: 'Flight Mode', // i18n-exempt
    description: 'Current flight mode number from the vehicle', // i18n-exempt
    category: 'sensors',
    inputs: [],
    outputs: [
      { id: 'mode_num', label: 'Mode Number', type: 'number', direction: 'output' }, // i18n-exempt
    ],
    properties: [],
    luaTemplate: 'vehicle:get_mode()',
  },
  {
    type: 'sensor-armed',
    label: 'Armed State', // i18n-exempt
    description: 'Whether the vehicle is currently armed', // i18n-exempt
    category: 'sensors',
    inputs: [],
    outputs: [
      { id: 'is_armed', label: 'Is Armed', type: 'boolean', direction: 'output' }, // i18n-exempt
    ],
    properties: [],
    luaTemplate: 'arming:is_armed()',
  },
  {
    type: 'sensor-gps-status',
    label: 'GPS Status', // i18n-exempt
    description: 'GPS fix type and satellite count', // i18n-exempt
    category: 'sensors',
    inputs: [],
    outputs: [
      { id: 'fix_type', label: 'Fix Type (0-6)', type: 'number', direction: 'output' }, // i18n-exempt
      { id: 'num_sats', label: 'Satellites', type: 'number', direction: 'output' }, // i18n-exempt
      { id: 'has_3d_fix', label: 'Has 3D Fix', type: 'boolean', direction: 'output' }, // i18n-exempt
    ],
    properties: [
      { id: 'instance', label: 'GPS Instance', type: 'number', defaultValue: 0, min: 0, max: 1 }, // i18n-exempt
    ],
    luaTemplate: 'gps:status(INST)',
  },
  {
    type: 'sensor-home',
    label: 'Home Position', // i18n-exempt
    description: 'Home location coordinates and altitude. Exposes both float components and a Location object for chaining into location-math nodes.', // i18n-exempt
    category: 'sensors',
    inputs: [],
    outputs: [
      { id: 'location', label: 'Location', type: 'any', direction: 'output' }, // i18n-exempt
      { id: 'lat', label: 'Latitude', type: 'number', direction: 'output' }, // i18n-exempt
      { id: 'lng', label: 'Longitude', type: 'number', direction: 'output' }, // i18n-exempt
      { id: 'alt', label: 'Altitude (m)', type: 'number', direction: 'output' }, // i18n-exempt
    ],
    properties: [],
    luaTemplate: 'ahrs:get_home()',
  },
  {
    type: 'sensor-ahrs-location',
    label: 'AHRS Location', // i18n-exempt
    description: 'Live vehicle location from AHRS (a Location object - lat/lng/alt as one value)', // i18n-exempt
    category: 'sensors',
    inputs: [],
    outputs: [
      { id: 'location', label: 'Location', type: 'any', direction: 'output' }, // i18n-exempt
    ],
    properties: [],
    luaTemplate: 'ahrs:get_location()',
  },
  {
    type: 'sensor-named-float',
    label: 'Read Named Float', // i18n-exempt
    description: 'Read a NAMED_VALUE_FLOAT published by another script or the GCS', // i18n-exempt
    category: 'sensors',
    inputs: [],
    outputs: [
      { id: 'value', label: 'Value', type: 'number', direction: 'output' }, // i18n-exempt
      { id: 'fresh', label: 'Fresh', type: 'boolean', direction: 'output' }, // i18n-exempt
    ],
    properties: [
      { id: 'name', label: 'Name (max 10 chars)', type: 'string', defaultValue: 'AD_HB' }, // i18n-exempt
    ],
  },
  {
    type: 'sensor-velocity-ned',
    label: 'Velocity NED', // i18n-exempt
    description: 'Vehicle velocity in North/East/Down frame (m/s)', // i18n-exempt
    category: 'sensors',
    inputs: [],
    outputs: [
      { id: 'vel_n', label: 'North (m/s)', type: 'number', direction: 'output' }, // i18n-exempt
      { id: 'vel_e', label: 'East (m/s)', type: 'number', direction: 'output' }, // i18n-exempt
      { id: 'vel_d', label: 'Down (m/s)', type: 'number', direction: 'output' }, // i18n-exempt
    ],
    properties: [],
    luaTemplate: 'ahrs:get_velocity_NED()',
  },
  {
    type: 'sensor-wind',
    label: 'Wind Estimate', // i18n-exempt
    description: 'Estimated wind speed and direction', // i18n-exempt
    category: 'sensors',
    inputs: [],
    outputs: [
      { id: 'speed_ms', label: 'Speed (m/s)', type: 'number', direction: 'output' }, // i18n-exempt
      { id: 'dir_deg', label: 'Direction (deg)', type: 'number', direction: 'output' }, // i18n-exempt
    ],
    properties: [],
    luaTemplate: 'ahrs:wind_estimate()',
  },
  {
    type: 'sensor-param-get',
    label: 'Read Parameter', // i18n-exempt
    description: 'Read a flight controller parameter live (e.g. CAM1_TRIGG_DIST). Returns 0 if the parameter does not exist.', // i18n-exempt
    category: 'sensors',
    inputs: [],
    outputs: [
      { id: 'value', label: 'Value', type: 'number', direction: 'output' }, // i18n-exempt
    ],
    properties: [
      { id: 'param_name', label: 'Parameter Name', type: 'string', defaultValue: 'CAM1_TRIGG_DIST' }, // i18n-exempt
    ],
    luaTemplate: 'param:get(NAME)',
  },
  {
    type: 'sensor-gpio-read',
    label: 'Read GPIO Pin', // i18n-exempt
    description: 'Read the digital level of a GPIO pin. Wire a Pin input to set it from a parameter, or use the Pin property. Polled once per tick: pulses shorter than the run interval are missed, use Pulse Input (interrupt) for those.', // i18n-exempt
    category: 'sensors',
    inputs: [
      { id: 'pin', label: 'Pin', type: 'number', direction: 'input' }, // i18n-exempt
    ],
    outputs: [
      { id: 'level', label: 'Level (0/1)', type: 'number', direction: 'output' }, // i18n-exempt
      { id: 'is_high', label: 'Is High', type: 'boolean', direction: 'output' }, // i18n-exempt
    ],
    properties: [
      { id: 'pin', label: 'Pin (fallback)', type: 'number', defaultValue: 54, min: 0, max: 255 }, // i18n-exempt
    ],
    luaTemplate: 'gpio:read(PIN)',
  },
  {
    type: 'sensor-pwm-pulse',
    label: 'Pulse Input (interrupt)', // i18n-exempt
    description: 'Catch short pulses (e.g. a 1-2 ms camera hotshoe pulse) on a GPIO pin via hardware interrupt. The pulse width is latched between ticks, so slow polling still sees it. The pin needs SERVOx_FUNCTION = -1 and must not be shared with CAM1_FEEDBAK_PIN (whoever attaches first owns the interrupt).', // i18n-exempt
    category: 'sensors',
    inputs: [],
    outputs: [
      { id: 'pulse_seen', label: 'Pulse Seen', type: 'boolean', direction: 'output' }, // i18n-exempt
      { id: 'width_us', label: 'Width (us)', type: 'number', direction: 'output' }, // i18n-exempt
      { id: 'ok', label: 'Pin OK', type: 'boolean', direction: 'output' }, // i18n-exempt
    ],
    properties: [
      { id: 'pin', label: 'Pin', type: 'number', defaultValue: 54, min: 0, max: 255 }, // i18n-exempt
    ],
    luaTemplate: 'PWMSource():get_pwm_us()',
  },
  {
    type: 'sensor-current-waypoint',
    label: 'Current Waypoint', // i18n-exempt
    description: 'The active mission navigation waypoint index and command id.', // i18n-exempt
    category: 'sensors',
    inputs: [],
    outputs: [
      { id: 'index', label: 'Index', type: 'number', direction: 'output' }, // i18n-exempt
      { id: 'nav_id', label: 'Command ID', type: 'number', direction: 'output' }, // i18n-exempt
    ],
    properties: [],
    luaTemplate: 'mission:get_current_nav_index()',
  },
];

// ── Logic ───────────────────────────────────────────────────────

const logicNodes: NodeDefinition[] = [
  {
    type: 'logic-compare',
    label: 'Compare', // i18n-exempt
    description: 'Compare two numbers with a selected operator', // i18n-exempt
    category: 'logic',
    inputs: [
      { id: 'a', label: 'A', type: 'number', direction: 'input', defaultValue: 0 },
      { id: 'b', label: 'B', type: 'number', direction: 'input', defaultValue: 0 },
    ],
    outputs: [
      { id: 'result', label: 'Result', type: 'boolean', direction: 'output' }, // i18n-exempt
    ],
    properties: [
      {
        id: 'operator', label: 'Operator', type: 'select', defaultValue: '>', // i18n-exempt
        options: [
          { label: '> Greater than', value: '>' }, // i18n-exempt
          { label: '< Less than', value: '<' }, // i18n-exempt
          { label: '== Equal to', value: '==' }, // i18n-exempt
          { label: '!= Not equal to', value: '~=' }, // i18n-exempt
          { label: '>= Greater or equal', value: '>=' }, // i18n-exempt
          { label: '<= Less or equal', value: '<=' }, // i18n-exempt
        ],
      },
    ],
  },
  {
    type: 'logic-if-else',
    label: 'If / Else', // i18n-exempt
    description: 'Branch execution based on a boolean condition', // i18n-exempt
    category: 'logic',
    inputs: [
      { id: 'condition', label: 'Condition', type: 'boolean', direction: 'input' }, // i18n-exempt
    ],
    outputs: [
      { id: 'true_out', label: 'True', type: 'boolean', direction: 'output' }, // i18n-exempt
      { id: 'false_out', label: 'False', type: 'boolean', direction: 'output' }, // i18n-exempt
    ],
    properties: [],
  },
  {
    type: 'logic-and',
    label: 'AND',
    description: 'Logical AND: true only if both inputs are true', // i18n-exempt
    category: 'logic',
    inputs: [
      { id: 'a', label: 'A', type: 'boolean', direction: 'input' },
      { id: 'b', label: 'B', type: 'boolean', direction: 'input' },
    ],
    outputs: [
      { id: 'result', label: 'Result', type: 'boolean', direction: 'output' }, // i18n-exempt
    ],
    properties: [],
  },
  {
    type: 'logic-or',
    label: 'OR',
    description: 'Logical OR: true if either input is true', // i18n-exempt
    category: 'logic',
    inputs: [
      { id: 'a', label: 'A', type: 'boolean', direction: 'input' },
      { id: 'b', label: 'B', type: 'boolean', direction: 'input' },
    ],
    outputs: [
      { id: 'result', label: 'Result', type: 'boolean', direction: 'output' }, // i18n-exempt
    ],
    properties: [],
  },
  {
    type: 'logic-not',
    label: 'NOT',
    description: 'Invert a boolean value', // i18n-exempt
    category: 'logic',
    inputs: [
      { id: 'input', label: 'Input', type: 'boolean', direction: 'input' }, // i18n-exempt
    ],
    outputs: [
      { id: 'result', label: 'Result', type: 'boolean', direction: 'output' }, // i18n-exempt
    ],
    properties: [],
  },
  {
    type: 'logic-range-check',
    label: 'Range Check', // i18n-exempt
    description: 'Check if a value is within a min/max range', // i18n-exempt
    category: 'logic',
    inputs: [
      { id: 'value', label: 'Value', type: 'number', direction: 'input' }, // i18n-exempt
    ],
    outputs: [
      { id: 'in_range', label: 'In Range', type: 'boolean', direction: 'output' }, // i18n-exempt
    ],
    properties: [
      { id: 'min', label: 'Min', type: 'number', defaultValue: 0 }, // i18n-exempt
      { id: 'max', label: 'Max', type: 'number', defaultValue: 100 }, // i18n-exempt
    ],
  },
  {
    type: 'logic-switch',
    label: 'Switch', // i18n-exempt
    description: 'Multi-branch based on a numeric value', // i18n-exempt
    category: 'logic',
    inputs: [
      { id: 'value', label: 'Value', type: 'number', direction: 'input' }, // i18n-exempt
    ],
    outputs: [
      { id: 'case_0', label: 'Case 0', type: 'boolean', direction: 'output' }, // i18n-exempt
      { id: 'case_1', label: 'Case 1', type: 'boolean', direction: 'output' }, // i18n-exempt
      { id: 'case_2', label: 'Case 2', type: 'boolean', direction: 'output' }, // i18n-exempt
      { id: 'default', label: 'Default', type: 'boolean', direction: 'output' }, // i18n-exempt
    ],
    properties: [
      { id: 'case0_val', label: 'Case 0 Value', type: 'number', defaultValue: 0 }, // i18n-exempt
      { id: 'case1_val', label: 'Case 1 Value', type: 'number', defaultValue: 1 }, // i18n-exempt
      { id: 'case2_val', label: 'Case 2 Value', type: 'number', defaultValue: 2 }, // i18n-exempt
    ],
  },
];

// ── Math ────────────────────────────────────────────────────────

const mathNodes: NodeDefinition[] = [
  {
    type: 'math-add',
    label: 'Add', // i18n-exempt
    description: 'Add two numbers (A + B)', // i18n-exempt
    category: 'math',
    inputs: [
      { id: 'a', label: 'A', type: 'number', direction: 'input', defaultValue: 0 },
      { id: 'b', label: 'B', type: 'number', direction: 'input', defaultValue: 0 },
    ],
    outputs: [{ id: 'result', label: 'Result', type: 'number', direction: 'output' }], // i18n-exempt
    properties: [],
  },
  {
    type: 'math-subtract',
    label: 'Subtract', // i18n-exempt
    description: 'Subtract two numbers (A - B)', // i18n-exempt
    category: 'math',
    inputs: [
      { id: 'a', label: 'A', type: 'number', direction: 'input', defaultValue: 0 },
      { id: 'b', label: 'B', type: 'number', direction: 'input', defaultValue: 0 },
    ],
    outputs: [{ id: 'result', label: 'Result', type: 'number', direction: 'output' }], // i18n-exempt
    properties: [],
  },
  {
    type: 'math-multiply',
    label: 'Multiply', // i18n-exempt
    description: 'Multiply two numbers (A * B)', // i18n-exempt
    category: 'math',
    inputs: [
      { id: 'a', label: 'A', type: 'number', direction: 'input', defaultValue: 0 },
      { id: 'b', label: 'B', type: 'number', direction: 'input', defaultValue: 0 },
    ],
    outputs: [{ id: 'result', label: 'Result', type: 'number', direction: 'output' }], // i18n-exempt
    properties: [],
  },
  {
    type: 'math-divide',
    label: 'Divide', // i18n-exempt
    description: 'Divide two numbers (A / B) with zero-division protection', // i18n-exempt
    category: 'math',
    inputs: [
      { id: 'a', label: 'A', type: 'number', direction: 'input', defaultValue: 0 },
      { id: 'b', label: 'B', type: 'number', direction: 'input', defaultValue: 1 },
    ],
    outputs: [{ id: 'result', label: 'Result', type: 'number', direction: 'output' }], // i18n-exempt
    properties: [],
  },
  {
    type: 'math-clamp',
    label: 'Clamp', // i18n-exempt
    description: 'Constrain a value to a min/max range', // i18n-exempt
    category: 'math',
    inputs: [
      { id: 'value', label: 'Value', type: 'number', direction: 'input', defaultValue: 0 }, // i18n-exempt
    ],
    outputs: [{ id: 'result', label: 'Result', type: 'number', direction: 'output' }], // i18n-exempt
    properties: [
      { id: 'min', label: 'Min', type: 'number', defaultValue: 0 }, // i18n-exempt
      { id: 'max', label: 'Max', type: 'number', defaultValue: 100 }, // i18n-exempt
    ],
  },
  {
    type: 'math-map-range',
    label: 'Map Range', // i18n-exempt
    description: 'Linear interpolation from one range to another', // i18n-exempt
    category: 'math',
    inputs: [
      { id: 'value', label: 'Value', type: 'number', direction: 'input', defaultValue: 0 }, // i18n-exempt
    ],
    outputs: [{ id: 'result', label: 'Result', type: 'number', direction: 'output' }], // i18n-exempt
    properties: [
      { id: 'in_min', label: 'Input Min', type: 'number', defaultValue: 0 }, // i18n-exempt
      { id: 'in_max', label: 'Input Max', type: 'number', defaultValue: 100 }, // i18n-exempt
      { id: 'out_min', label: 'Output Min', type: 'number', defaultValue: 0 }, // i18n-exempt
      { id: 'out_max', label: 'Output Max', type: 'number', defaultValue: 1 }, // i18n-exempt
    ],
  },
  {
    type: 'math-abs',
    label: 'Abs', // i18n-exempt
    description: 'Absolute value of a number', // i18n-exempt
    category: 'math',
    inputs: [
      { id: 'value', label: 'Value', type: 'number', direction: 'input', defaultValue: 0 }, // i18n-exempt
    ],
    outputs: [{ id: 'result', label: 'Result', type: 'number', direction: 'output' }], // i18n-exempt
    properties: [],
  },
  {
    type: 'math-min',
    label: 'Min', // i18n-exempt
    description: 'Minimum of two values', // i18n-exempt
    category: 'math',
    inputs: [
      { id: 'a', label: 'A', type: 'number', direction: 'input', defaultValue: 0 },
      { id: 'b', label: 'B', type: 'number', direction: 'input', defaultValue: 0 },
    ],
    outputs: [{ id: 'result', label: 'Result', type: 'number', direction: 'output' }], // i18n-exempt
    properties: [],
  },
  {
    type: 'math-max',
    label: 'Max', // i18n-exempt
    description: 'Maximum of two values', // i18n-exempt
    category: 'math',
    inputs: [
      { id: 'a', label: 'A', type: 'number', direction: 'input', defaultValue: 0 },
      { id: 'b', label: 'B', type: 'number', direction: 'input', defaultValue: 0 },
    ],
    outputs: [{ id: 'result', label: 'Result', type: 'number', direction: 'output' }], // i18n-exempt
    properties: [],
  },
  // ── Location math (work with AHRS Location objects) ──
  {
    type: 'math-location-bearing',
    label: 'Bearing A→B', // i18n-exempt
    description: 'Compass bearing in degrees from Location A to Location B (0=North, 90=East)', // i18n-exempt
    category: 'math',
    inputs: [
      { id: 'from', label: 'From', type: 'any', direction: 'input' }, // i18n-exempt
      { id: 'to', label: 'To', type: 'any', direction: 'input' }, // i18n-exempt
    ],
    outputs: [{ id: 'bearing_deg', label: 'Bearing (°)', type: 'number', direction: 'output' }], // i18n-exempt
    properties: [],
    luaTemplate: 'math.deg(FROM:get_bearing(TO))',
  },
  {
    type: 'math-location-distance',
    label: 'Distance A→B', // i18n-exempt
    description: 'Horizontal distance in metres between two Locations', // i18n-exempt
    category: 'math',
    inputs: [
      { id: 'a', label: 'A', type: 'any', direction: 'input' },
      { id: 'b', label: 'B', type: 'any', direction: 'input' },
    ],
    outputs: [{ id: 'distance_m', label: 'Distance (m)', type: 'number', direction: 'output' }], // i18n-exempt
    properties: [],
    luaTemplate: 'A:get_distance(B)',
  },
  {
    type: 'math-location-offset',
    label: 'Offset Location', // i18n-exempt
    description: 'Project a Location forward by bearing (deg) + distance (m). Returns new Location.', // i18n-exempt
    category: 'math',
    inputs: [
      { id: 'from', label: 'From', type: 'any', direction: 'input' }, // i18n-exempt
      { id: 'bearing_deg', label: 'Bearing (°)', type: 'number', direction: 'input', defaultValue: 0 }, // i18n-exempt
      { id: 'distance_m', label: 'Distance (m)', type: 'number', direction: 'input', defaultValue: 0 }, // i18n-exempt
    ],
    outputs: [{ id: 'location', label: 'Location', type: 'any', direction: 'output' }], // i18n-exempt
    properties: [],
    luaTemplate: 'FROM:copy():offset_bearing(BEARING, DISTANCE)',
  },
];

// ── Actions ─────────────────────────────────────────────────────

const actionNodes: NodeDefinition[] = [
  {
    type: 'action-gcs-text',
    label: 'Send GCS Text', // i18n-exempt
    description: 'Display a message on the ground control station', // i18n-exempt
    category: 'actions',
    inputs: [
      { id: 'trigger', label: 'Trigger', type: 'boolean', direction: 'input' }, // i18n-exempt
    ],
    outputs: [],
    properties: [
      { id: 'message', label: 'Message', type: 'string', defaultValue: 'Hello from Lua!' }, // i18n-exempt
      {
        id: 'severity', label: 'Severity', type: 'select', defaultValue: 6, // i18n-exempt
        options: [
          { label: 'Emergency', value: 0 }, // i18n-exempt
          { label: 'Alert', value: 1 }, // i18n-exempt
          { label: 'Critical', value: 2 }, // i18n-exempt
          { label: 'Error', value: 3 }, // i18n-exempt
          { label: 'Warning', value: 4 }, // i18n-exempt
          { label: 'Notice', value: 5 }, // i18n-exempt
          { label: 'Info', value: 6 }, // i18n-exempt
          { label: 'Debug', value: 7 }, // i18n-exempt
        ],
      },
    ],
    luaTemplate: 'gcs:send_text(SEV, MSG)',
  },
  {
    type: 'action-set-servo',
    label: 'Set Servo', // i18n-exempt
    description: 'Set a servo output to a specific PWM value', // i18n-exempt
    category: 'actions',
    inputs: [
      { id: 'trigger', label: 'Trigger', type: 'boolean', direction: 'input' }, // i18n-exempt
      { id: 'pwm', label: 'PWM', type: 'number', direction: 'input', defaultValue: 1500 },
    ],
    outputs: [],
    properties: [
      { id: 'servo_num', label: 'Servo Number', type: 'number', defaultValue: 1, min: 1, max: 16 }, // i18n-exempt
    ],
    luaTemplate: 'SRV_Channels:set_output_pwm(CH, PWM)',
  },
  {
    type: 'action-set-mode',
    label: 'Set Flight Mode', // i18n-exempt
    description: 'Request a flight mode change', // i18n-exempt
    category: 'actions',
    inputs: [
      { id: 'trigger', label: 'Trigger', type: 'boolean', direction: 'input' }, // i18n-exempt
    ],
    outputs: [],
    properties: [
      { id: 'mode_num', label: 'Mode Number', type: 'number', defaultValue: 0, min: 0, max: 30 }, // i18n-exempt
    ],
    luaTemplate: 'vehicle:set_mode(MODE)',
  },
  {
    type: 'action-set-param',
    label: 'Set Parameter', // i18n-exempt
    description: 'Change a flight controller parameter value', // i18n-exempt
    category: 'actions',
    inputs: [
      { id: 'trigger', label: 'Trigger', type: 'boolean', direction: 'input' }, // i18n-exempt
      { id: 'value', label: 'Value', type: 'number', direction: 'input', defaultValue: 0 }, // i18n-exempt
    ],
    outputs: [],
    properties: [
      { id: 'param_name', label: 'Parameter Name', type: 'string', defaultValue: 'RC1_MIN' }, // i18n-exempt
    ],
    luaTemplate: 'param:set(NAME, VAL)',
  },
  {
    type: 'action-relay',
    label: 'Trigger Relay', // i18n-exempt
    description: 'Toggle a relay on or off', // i18n-exempt
    category: 'actions',
    inputs: [
      { id: 'trigger', label: 'Trigger', type: 'boolean', direction: 'input' }, // i18n-exempt
    ],
    outputs: [],
    properties: [
      { id: 'relay_num', label: 'Relay Number', type: 'number', defaultValue: 0, min: 0, max: 5 }, // i18n-exempt
      {
        id: 'state', label: 'State', type: 'select', defaultValue: 1, // i18n-exempt
        options: [{ label: 'ON', value: 1 }, { label: 'OFF', value: 0 }],
      },
    ],
    luaTemplate: 'relay:on/off(NUM)',
  },
  {
    type: 'action-log-to-file',
    label: 'Log to File', // i18n-exempt
    description: 'Append a line of data to a CSV/text file on the SD card', // i18n-exempt
    category: 'actions',
    inputs: [
      { id: 'trigger', label: 'Trigger', type: 'boolean', direction: 'input' }, // i18n-exempt
      { id: 'value1', label: 'Value 1', type: 'any', direction: 'input' }, // i18n-exempt
      { id: 'value2', label: 'Value 2', type: 'any', direction: 'input' }, // i18n-exempt
      { id: 'value3', label: 'Value 3', type: 'any', direction: 'input' }, // i18n-exempt
    ],
    outputs: [],
    properties: [
      { id: 'filename', label: 'File Name', type: 'string', defaultValue: 'log.csv' }, // i18n-exempt
      {
        id: 'separator', label: 'Separator', type: 'select', defaultValue: ',', // i18n-exempt
        options: [
          { label: 'Comma (CSV)', value: ',' }, // i18n-exempt
          { label: 'Semicolon', value: ';' }, // i18n-exempt
          { label: 'Tab', value: '\t' }, // i18n-exempt
        ],
      },
    ],
    luaTemplate: 'io.open/write/close',
  },
  {
    type: 'action-set-led',
    label: 'Set LED', // i18n-exempt
    description: 'Control NeoPixel / ProfiLED colors', // i18n-exempt
    category: 'actions',
    inputs: [
      { id: 'trigger', label: 'Trigger', type: 'boolean', direction: 'input' }, // i18n-exempt
      { id: 'r', label: 'Red', type: 'number', direction: 'input', defaultValue: 0 }, // i18n-exempt
      { id: 'g', label: 'Green', type: 'number', direction: 'input', defaultValue: 0 }, // i18n-exempt
      { id: 'b', label: 'Blue', type: 'number', direction: 'input', defaultValue: 0 }, // i18n-exempt
    ],
    outputs: [],
    properties: [
      { id: 'instance', label: 'LED Instance', type: 'number', defaultValue: 0, min: 0, max: 15 }, // i18n-exempt
    ],
    luaTemplate: 'serialLED:set_RGB(INST, LED, R, G, B)',
  },
  {
    type: 'action-play-tune',
    label: 'Play Tune', // i18n-exempt
    description: 'Play a tone/melody on the buzzer (MML notation)', // i18n-exempt
    category: 'actions',
    inputs: [
      { id: 'trigger', label: 'Trigger', type: 'boolean', direction: 'input' }, // i18n-exempt
    ],
    outputs: [],
    properties: [
      { id: 'tune', label: 'Tune (MML)', type: 'string', defaultValue: 'MFT200L4O5CDE' }, // i18n-exempt
    ],
    luaTemplate: 'notify:play_tune(TUNE)',
  },
  {
    type: 'action-set-waypoint',
    label: 'Jump to Waypoint', // i18n-exempt
    description: 'Set the current mission command index (jump to a waypoint)', // i18n-exempt
    category: 'actions',
    inputs: [
      { id: 'trigger', label: 'Trigger', type: 'boolean', direction: 'input' }, // i18n-exempt
    ],
    outputs: [],
    properties: [
      { id: 'cmd_idx', label: 'Waypoint Index', type: 'number', defaultValue: 1, min: 0, max: 999 }, // i18n-exempt
    ],
    luaTemplate: 'mission:set_current_cmd(IDX)',
  },
  // ── FC-side script primitives (added for the script-installer graph) ──
  {
    type: 'action-set-target-location',
    label: 'Set Target Location', // i18n-exempt
    description: 'Issue a GUIDED-mode position target. Vehicle ignores it when not in GUIDED.', // i18n-exempt
    category: 'actions',
    inputs: [
      { id: 'trigger', label: 'Trigger', type: 'boolean', direction: 'input' }, // i18n-exempt
      { id: 'location', label: 'Location', type: 'any', direction: 'input' }, // i18n-exempt
    ],
    outputs: [],
    properties: [],
    luaTemplate: 'vehicle:set_target_location(LOCATION)',
  },
  {
    type: 'action-publish-named-float',
    label: 'Publish Named Float', // i18n-exempt
    description: 'Send a NAMED_VALUE_FLOAT (max 10 char name) over MAVLink. Used for heartbeats and lightweight pub/sub.', // i18n-exempt
    category: 'actions',
    inputs: [
      { id: 'trigger', label: 'Trigger', type: 'boolean', direction: 'input' }, // i18n-exempt
      { id: 'value', label: 'Value', type: 'number', direction: 'input', defaultValue: 0 }, // i18n-exempt
    ],
    outputs: [],
    properties: [
      { id: 'name', label: 'Name (max 10 chars)', type: 'string', defaultValue: 'AD_HB' }, // i18n-exempt
    ],
    luaTemplate: 'gcs:send_named_float("NAME", VALUE)',
  },
  {
    type: 'action-mavlink-on-user-cmd',
    label: 'On MAV_CMD_USER_*', // i18n-exempt
    description: 'Receive a MAVLink user command (MAV_CMD_USER_1..5) sent from the GCS. Carries 4 floats + lat/lon/alt.', // i18n-exempt
    category: 'actions',
    inputs: [],
    outputs: [
      { id: 'trigger', label: 'On Cmd', type: 'boolean', direction: 'output' }, // i18n-exempt
      { id: 'param1', label: 'param1', type: 'number', direction: 'output' },
      { id: 'param2', label: 'param2', type: 'number', direction: 'output' },
      { id: 'param3', label: 'param3', type: 'number', direction: 'output' },
      { id: 'param4', label: 'param4', type: 'number', direction: 'output' },
      { id: 'location', label: 'Location', type: 'any', direction: 'output' }, // i18n-exempt
    ],
    properties: [
      {
        id: 'cmd_id', label: 'MAV_CMD ID', type: 'select', defaultValue: 31010, // i18n-exempt
        options: [
          { label: 'USER_1 (31010)', value: 31010 }, // i18n-exempt
          { label: 'USER_2 (31011)', value: 31011 }, // i18n-exempt
          { label: 'USER_3 (31012)', value: 31012 }, // i18n-exempt
          { label: 'USER_4 (31013)', value: 31013 }, // i18n-exempt
          { label: 'USER_5 (31014)', value: 31014 }, // i18n-exempt
        ],
      },
    ],
  },
  {
    type: 'action-serial-write',
    label: 'Serial Write', // i18n-exempt
    description: 'Write a string out a scripting serial port. Set an unused SERIALx_PROTOCOL to 28 (Scripting); Instance picks the Nth such port.', // i18n-exempt
    category: 'actions',
    inputs: [
      { id: 'trigger', label: 'Trigger', type: 'boolean', direction: 'input' }, // i18n-exempt
      { id: 'data', label: 'Data', type: 'any', direction: 'input' }, // i18n-exempt
    ],
    outputs: [],
    properties: [
      { id: 'instance', label: 'Scripting Serial Instance', type: 'number', defaultValue: 0, min: 0, max: 3 }, // i18n-exempt
      {
        id: 'baud', label: 'Baud Rate', type: 'select', defaultValue: 57600, // i18n-exempt
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
        id: 'line_ending', label: 'Line Ending', type: 'select', defaultValue: 'none', // i18n-exempt
        options: [
          { label: 'None', value: 'none' }, // i18n-exempt
          { label: 'Newline (\\n)', value: 'lf' }, // i18n-exempt
          { label: 'CRLF (\\r\\n)', value: 'crlf' }, // i18n-exempt
        ],
      },
    ],
    luaTemplate: 'port:write(byte)',
  },
  {
    type: 'action-socket-send',
    label: 'Network Send', // i18n-exempt
    description: 'Send a string over UDP or TCP via the flight controller network stack. Needs a board with networking and NET_ENABLE = 1 (ArduPilot 4.5+).', // i18n-exempt
    category: 'actions',
    inputs: [
      { id: 'trigger', label: 'Trigger', type: 'boolean', direction: 'input' }, // i18n-exempt
      { id: 'data', label: 'Data', type: 'any', direction: 'input' }, // i18n-exempt
    ],
    outputs: [],
    properties: [
      {
        id: 'protocol', label: 'Protocol', type: 'select', defaultValue: 'udp', // i18n-exempt
        options: [
          { label: 'UDP', value: 'udp' },
          { label: 'TCP', value: 'tcp' },
        ],
      },
      { id: 'ip', label: 'Destination IP', type: 'string', defaultValue: '192.168.1.10' }, // i18n-exempt
      { id: 'port', label: 'Destination Port', type: 'number', defaultValue: 14550, min: 1, max: 65535 }, // i18n-exempt
    ],
    luaTemplate: 'sock:send(data, #data)',
  },
];

// ── Timing ──────────────────────────────────────────────────────

const timingNodes: NodeDefinition[] = [
  {
    type: 'timing-run-every',
    label: 'Run Every', // i18n-exempt
    description: 'Execute downstream at a fixed interval (independent timer)', // i18n-exempt
    category: 'timing',
    inputs: [
      { id: 'trigger', label: 'Trigger', type: 'boolean', direction: 'input' }, // i18n-exempt
    ],
    outputs: [
      { id: 'flow', label: 'Flow', type: 'boolean', direction: 'output' }, // i18n-exempt
    ],
    properties: [
      { id: 'interval_ms', label: 'Interval (ms)', type: 'number', defaultValue: 5000, min: 100, max: 60000, step: 100 }, // i18n-exempt
    ],
  },
  {
    type: 'timing-debounce',
    label: 'Debounce', // i18n-exempt
    description: 'Suppress rapid changes: only pass through after value is stable', // i18n-exempt
    category: 'timing',
    inputs: [
      { id: 'input', label: 'Input', type: 'boolean', direction: 'input' }, // i18n-exempt
    ],
    outputs: [
      { id: 'output', label: 'Output', type: 'boolean', direction: 'output' }, // i18n-exempt
    ],
    properties: [
      { id: 'delay_ms', label: 'Delay (ms)', type: 'number', defaultValue: 500, min: 50, max: 10000 }, // i18n-exempt
    ],
  },
  {
    type: 'timing-on-change',
    label: 'On Change', // i18n-exempt
    description: 'Trigger when a value changes from its previous value', // i18n-exempt
    category: 'timing',
    inputs: [
      { id: 'value', label: 'Value', type: 'number', direction: 'input' }, // i18n-exempt
    ],
    outputs: [
      { id: 'changed', label: 'Changed', type: 'boolean', direction: 'output' }, // i18n-exempt
    ],
    properties: [],
  },
  {
    type: 'timing-rising-edge',
    label: 'Rising Edge', // i18n-exempt
    description: 'Fires once when input transitions from false to true', // i18n-exempt
    category: 'timing',
    inputs: [
      { id: 'input', label: 'Input', type: 'boolean', direction: 'input' }, // i18n-exempt
    ],
    outputs: [
      { id: 'triggered', label: 'Triggered', type: 'boolean', direction: 'output' }, // i18n-exempt
    ],
    properties: [],
  },
  {
    type: 'timing-falling-edge',
    label: 'Falling Edge', // i18n-exempt
    description: 'Fires once when input transitions from true to false', // i18n-exempt
    category: 'timing',
    inputs: [
      { id: 'input', label: 'Input', type: 'boolean', direction: 'input' }, // i18n-exempt
    ],
    outputs: [
      { id: 'triggered', label: 'Triggered', type: 'boolean', direction: 'output' }, // i18n-exempt
    ],
    properties: [],
  },
  {
    type: 'timing-watchdog',
    label: 'Watchdog Timer', // i18n-exempt
    description: 'Outputs Expired if no Kick is received within the timeout. The timer resets on every Kick, and holds reset while Enable is false.', // i18n-exempt
    category: 'timing',
    inputs: [
      { id: 'kick', label: 'Kick', type: 'boolean', direction: 'input' }, // i18n-exempt
      { id: 'enable', label: 'Enable', type: 'boolean', direction: 'input', defaultValue: true }, // i18n-exempt
    ],
    outputs: [
      { id: 'expired', label: 'Expired', type: 'boolean', direction: 'output' }, // i18n-exempt
    ],
    properties: [
      { id: 'timeout_ms', label: 'Timeout (ms)', type: 'number', defaultValue: 3000, min: 100, max: 120000, step: 100 }, // i18n-exempt
    ],
  },
  {
    type: 'timing-latch',
    label: 'Latch / Toggle', // i18n-exempt
    description: 'Set/Reset flip-flop: Set turns output on, Reset turns it off', // i18n-exempt
    category: 'timing',
    inputs: [
      { id: 'set', label: 'Set', type: 'boolean', direction: 'input' }, // i18n-exempt
      { id: 'reset', label: 'Reset', type: 'boolean', direction: 'input' }, // i18n-exempt
    ],
    outputs: [
      { id: 'state', label: 'State', type: 'boolean', direction: 'output' }, // i18n-exempt
    ],
    properties: [],
  },
];

// ── Variables ───────────────────────────────────────────────────

const variableNodes: NodeDefinition[] = [
  {
    type: 'var-constant',
    label: 'Constant', // i18n-exempt
    description: 'A fixed value (number, string, or boolean)', // i18n-exempt
    category: 'variables',
    inputs: [],
    outputs: [
      { id: 'value', label: 'Value', type: 'any', direction: 'output' }, // i18n-exempt
    ],
    properties: [
      {
        id: 'type', label: 'Type', type: 'select', defaultValue: 'number', // i18n-exempt
        options: [
          { label: 'Number', value: 'number' }, // i18n-exempt
          { label: 'String', value: 'string' }, // i18n-exempt
          { label: 'Boolean', value: 'boolean' }, // i18n-exempt
        ],
      },
      { id: 'value', label: 'Value', type: 'string', defaultValue: '0' }, // i18n-exempt
    ],
  },
  {
    type: 'var-get',
    label: 'Get Variable',
    description: 'Read a named variable', // i18n-exempt
    category: 'variables',
    inputs: [],
    outputs: [
      { id: 'value', label: 'Value', type: 'any', direction: 'output' }, // i18n-exempt
    ],
    properties: [
      { id: 'name', label: 'Variable Name', type: 'string', defaultValue: 'myVar' }, // i18n-exempt
    ],
  },
  {
    type: 'var-set',
    label: 'Set Variable', // i18n-exempt
    description: 'Write a named variable', // i18n-exempt
    category: 'variables',
    inputs: [
      { id: 'trigger', label: 'Trigger', type: 'boolean', direction: 'input' }, // i18n-exempt
      { id: 'value', label: 'Value', type: 'any', direction: 'input' }, // i18n-exempt
    ],
    outputs: [],
    properties: [
      { id: 'name', label: 'Variable Name', type: 'string', defaultValue: 'myVar' }, // i18n-exempt
    ],
  },
];

// ── Flow ────────────────────────────────────────────────────────

const flowNodes: NodeDefinition[] = [
  {
    type: 'flow-custom-lua',
    label: 'Custom Lua', // i18n-exempt
    description: 'Inline your own Lua snippet. Input pins arrive as local variables named after the pins; end the snippet with "return <output pins>" to feed downstream nodes.', // i18n-exempt
    category: 'flow',
    // Ports are derived per-instance from the pin properties, see getEffectivePorts
    inputs: [],
    outputs: [],
    properties: [
      { id: 'inputs', label: 'Input pins (comma separated)', type: 'string', defaultValue: '' }, // i18n-exempt
      { id: 'outputs', label: 'Output pins (comma separated)', type: 'string', defaultValue: '' }, // i18n-exempt
      { id: 'code', label: 'Lua code', type: 'code', defaultValue: '-- inputs are locals named after your input pins\n-- return values in output pin order' }, // i18n-exempt
    ],
  },
  {
    type: 'flow-comment',
    label: 'Comment', // i18n-exempt
    description: 'A text comment for documentation purposes, no effect on code', // i18n-exempt
    category: 'flow',
    inputs: [],
    outputs: [],
    properties: [
      { id: 'text', label: 'Comment', type: 'string', defaultValue: 'Add a description here...' }, // i18n-exempt
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
