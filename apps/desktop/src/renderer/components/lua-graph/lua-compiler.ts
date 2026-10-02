/**
 * Lua Compiler — converts a node graph into ArduPilot-compatible Lua script.
 *
 * Pipeline: Graph → Topological Sort → Variable Assignment → Code Generation
 */
import type { Node, Edge } from '@xyflow/react';
import type { GraphNodeData, GraphEdgeData } from './lua-graph-types';
import { getNodeDefinition, parseCustomPins } from './node-library';
import { t } from '../../../shared/i18n/index.js';

// ── Types ───────────────────────────────────────────────────────

interface CompileContext {
  /** Map node+port → Lua variable name */
  varMap: Map<string, string>;
  /** Lines of code emitted so far */
  lines: string[];
  /** Indentation level */
  indent: number;
  /** Variables that need state tracking between runs */
  stateVars: Map<string, string>;
  /** Named user variables (Get/Set Variable nodes) */
  userVars: Set<string>;
  /** Timing entry interval */
  entryInterval: number;
  /** Counter for generating unique variable names */
  varCounter: number;
  /**
   * Code emitted at module scope between the state vars and the update()
   * function definition. Used by nodes that need one-time setup (e.g. the
   * MAV_CMD_USER_x receiver registers MAVLink rx hooks at script load time,
   * not on every update tick).
   */
  prelude: string[];
  /**
   * Per-node MAVLink USER_x receiver registrations. We collect them while
   * compiling node bodies and emit ONE shared receive loop at the start of
   * update() so messages aren't consumed by the wrong node's drain loop.
   */
  mavlinkRxNodes: Array<{
    cmdId: number;
    triggerVar: string;
    p1Var: string; p2Var: string; p3Var: string; p4Var: string;
    locVar: string;
  }>;
}

export interface CompileResult {
  success: boolean;
  code: string;
  errors: string[];
  nodeCount: number;
  estimatedMemoryBytes: number;
}

// ── Helpers ─────────────────────────────────────────────────────

function varKey(nodeId: string, portId: string): string {
  return `${nodeId}::${portId}`;
}

function sanitizeVarName(s: string): string {
  return s.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]/, '_$&');
}

function emit(ctx: CompileContext, line: string) {
  const pad = '  '.repeat(ctx.indent);
  ctx.lines.push(pad + line);
}

function emitBlank(ctx: CompileContext) {
  ctx.lines.push('');
}

function nextVar(ctx: CompileContext, hint: string): string {
  ctx.varCounter += 1;
  return `${sanitizeVarName(hint)}_${ctx.varCounter}`;
}

// ── Topological Sort ────────────────────────────────────────────

function topoSort(
  nodes: Node<GraphNodeData>[],
  edges: Edge<GraphEdgeData>[],
): { sorted: Node<GraphNodeData>[]; errors: string[] } {
  const errors: string[] = [];
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Build adjacency: for each node, which nodes feed into it
  const inDegree = new Map<string, number>();
  const downstream = new Map<string, string[]>(); // source → targets
  for (const n of nodes) {
    inDegree.set(n.id, 0);
    downstream.set(n.id, []);
  }

  for (const e of edges) {
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
    downstream.get(e.source)?.push(e.target);
  }

  // Kahn's algorithm
  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const sorted: Node<GraphNodeData>[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const node = nodeMap.get(id);
    if (node) sorted.push(node);
    for (const targetId of downstream.get(id) ?? []) {
      const newDeg = (inDegree.get(targetId) ?? 1) - 1;
      inDegree.set(targetId, newDeg);
      if (newDeg === 0) queue.push(targetId);
    }
  }

  if (sorted.length !== nodes.length) {
    errors.push(t('lua-graph:luaCompiler.cycle'));
  }

  return { sorted, errors };
}

// ── Code Generation per Node ────────────────────────────────────

function resolveInput(
  ctx: CompileContext,
  nodeId: string,
  portId: string,
  edges: Edge<GraphEdgeData>[],
  defaultVal: string,
): string {
  // Find edge leading into this port
  const edge = edges.find((e) => e.target === nodeId && e.targetHandle === portId);
  if (edge) {
    const key = varKey(edge.source, edge.sourceHandle ?? '');
    return ctx.varMap.get(key) ?? defaultVal;
  }
  return defaultVal;
}

function compileNode(
  node: Node<GraphNodeData>,
  edges: Edge<GraphEdgeData>[],
  ctx: CompileContext,
) {
  const def = getNodeDefinition(node.data.definitionType);
  if (!def) return;

  const props = node.data.propertyValues;
  const type = node.data.definitionType;

  // Helper to get property or default
  const prop = (id: string): number | boolean | string => {
    const val = props[id];
    const propDef = def.properties.find((p) => p.id === id);
    return val ?? propDef?.defaultValue ?? 0;
  };

  // Helper to resolve an input or fall back to property/default
  const input = (portId: string, fallback: string): string => {
    return resolveInput(ctx, node.id, portId, edges, fallback);
  };

  // Assign output variables
  const setOutput = (portId: string, expr: string) => {
    const varName = nextVar(ctx, portId);
    ctx.varMap.set(varKey(node.id, portId), varName);
    emit(ctx, `local ${varName} = ${expr}`);
  };

  // ── Sensors ─────────────────────────────────────────────

  if (type === 'sensor-gps') {
    const locVar = nextVar(ctx, 'gps_loc');
    emit(ctx, `local ${locVar} = ahrs:get_location()`);
    const latVar = nextVar(ctx, 'lat');
    const lngVar = nextVar(ctx, 'lng');
    const altVar = nextVar(ctx, 'alt');
    emit(ctx, `local ${latVar} = ${locVar} and ${locVar}:lat() * 1.0e-7 or 0`);
    emit(ctx, `local ${lngVar} = ${locVar} and ${locVar}:lng() * 1.0e-7 or 0`);
    emit(ctx, `local ${altVar} = ${locVar} and ${locVar}:alt() * 0.01 or 0`);
    ctx.varMap.set(varKey(node.id, 'lat'), latVar);
    ctx.varMap.set(varKey(node.id, 'lng'), lngVar);
    ctx.varMap.set(varKey(node.id, 'alt'), altVar);
    return;
  }

  if (type === 'sensor-baro-alt') {
    setOutput('alt_m', 'baro:get_altitude()');
    return;
  }

  if (type === 'sensor-battery') {
    const inst = String(prop('instance'));
    setOutput('voltage', `battery:voltage(${inst})`);
    setOutput('current', `battery:current_amps(${inst})`);
    setOutput('remaining_pct', `battery:capacity_remaining_pct(${inst})`);
    return;
  }

  if (type === 'sensor-airspeed') {
    const v = nextVar(ctx, 'airspeed');
    emit(ctx, `local ${v} = ahrs:airspeed_estimate()`);
    emit(ctx, `${v} = ${v} or 0`);
    ctx.varMap.set(varKey(node.id, 'airspeed_ms'), v);
    return;
  }

  if (type === 'sensor-rc-channel') {
    const ch = String(prop('channel'));
    setOutput('value_us', `rc:get_pwm(${ch})`);
    return;
  }

  if (type === 'sensor-rangefinder') {
    const inst = String(prop('instance'));
    setOutput('distance_m', `rangefinder:distance_cm(${inst}) / 100.0`);
    return;
  }

  if (type === 'sensor-attitude') {
    setOutput('roll', 'math.deg(ahrs:get_roll())');
    setOutput('pitch', 'math.deg(ahrs:get_pitch())');
    setOutput('yaw', 'math.deg(ahrs:get_yaw())');
    return;
  }

  if (type === 'sensor-groundspeed') {
    const v = nextVar(ctx, 'gs_vec');
    emit(ctx, `local ${v} = ahrs:groundspeed_vector()`);
    setOutput('speed_ms', `${v} and ${v}:length() or 0`);
    return;
  }

  if (type === 'sensor-rc-aux-switch') {
    const fn = String(prop('aux_fn'));
    const stateVar = nextVar(ctx, 'aux_sw');
    emit(ctx, `local ${stateVar} = rc:get_aux_cached(${fn}) or 0`);
    ctx.varMap.set(varKey(node.id, 'state'), stateVar);
    ctx.varMap.set(varKey(node.id, 'is_high'), `(${stateVar} == 2)`);
    ctx.varMap.set(varKey(node.id, 'is_mid'), `(${stateVar} == 1)`);
    ctx.varMap.set(varKey(node.id, 'is_low'), `(${stateVar} == 0)`);
    return;
  }

  if (type === 'sensor-rangefinder-orient') {
    const orient = String(prop('orientation'));
    const distVar = nextVar(ctx, 'rf_dist');
    emit(ctx, `local ${distVar} = rangefinder:distance_cm_orient(${orient})`);
    emit(ctx, `${distVar} = ${distVar} and (${distVar} / 100.0) or -1`);
    ctx.varMap.set(varKey(node.id, 'distance_m'), distVar);
    return;
  }

  if (type === 'sensor-flight-mode') {
    setOutput('mode_num', 'vehicle:get_mode()');
    return;
  }

  if (type === 'sensor-armed') {
    setOutput('is_armed', 'arming:is_armed()');
    return;
  }

  if (type === 'sensor-gps-status') {
    const inst = String(prop('instance'));
    const fixVar = nextVar(ctx, 'gps_fix');
    emit(ctx, `local ${fixVar} = gps:status(${inst})`);
    ctx.varMap.set(varKey(node.id, 'fix_type'), fixVar);
    setOutput('num_sats', `gps:num_sats(${inst})`);
    ctx.varMap.set(varKey(node.id, 'has_3d_fix'), `(${fixVar} >= 3)`);
    return;
  }

  if (type === 'sensor-home') {
    const locVar = nextVar(ctx, 'home_loc');
    emit(ctx, `local ${locVar} = ahrs:get_home()`);
    const latVar = nextVar(ctx, 'home_lat');
    const lngVar = nextVar(ctx, 'home_lng');
    const altVar = nextVar(ctx, 'home_alt');
    emit(ctx, `local ${latVar} = ${locVar} and ${locVar}:lat() * 1.0e-7 or 0`);
    emit(ctx, `local ${lngVar} = ${locVar} and ${locVar}:lng() * 1.0e-7 or 0`);
    emit(ctx, `local ${altVar} = ${locVar} and ${locVar}:alt() * 0.01 or 0`);
    ctx.varMap.set(varKey(node.id, 'location'), locVar);
    ctx.varMap.set(varKey(node.id, 'lat'), latVar);
    ctx.varMap.set(varKey(node.id, 'lng'), lngVar);
    ctx.varMap.set(varKey(node.id, 'alt'), altVar);
    return;
  }

  if (type === 'sensor-velocity-ned') {
    const vecVar = nextVar(ctx, 'vel_ned');
    emit(ctx, `local ${vecVar} = ahrs:get_velocity_NED()`);
    const nVar = nextVar(ctx, 'vel_n');
    const eVar = nextVar(ctx, 'vel_e');
    const dVar = nextVar(ctx, 'vel_d');
    emit(ctx, `local ${nVar} = ${vecVar} and ${vecVar}:x() or 0`);
    emit(ctx, `local ${eVar} = ${vecVar} and ${vecVar}:y() or 0`);
    emit(ctx, `local ${dVar} = ${vecVar} and ${vecVar}:z() or 0`);
    ctx.varMap.set(varKey(node.id, 'vel_n'), nVar);
    ctx.varMap.set(varKey(node.id, 'vel_e'), eVar);
    ctx.varMap.set(varKey(node.id, 'vel_d'), dVar);
    return;
  }

  if (type === 'sensor-ahrs-location') {
    // Location_ud is a single object containing lat/lng/alt; downstream Location
    // math nodes operate on it directly. nil is possible if AHRS not ready.
    const v = nextVar(ctx, 'ahrs_loc');
    emit(ctx, `local ${v} = ahrs:get_location()`);
    ctx.varMap.set(varKey(node.id, 'location'), v);
    return;
  }

  if (type === 'sensor-named-float') {
    // ArduPilot Lua doesn't have a built-in NAMED_VALUE_FLOAT subscriber, so
    // we fake one by parsing inbound MAVLink messages. For now this returns
    // 0/false (placeholder); a future iteration could wire this through the
    // mavlink:receive_chan path. Marking the output 'fresh=false' so any
    // downstream logic gates on actual data arrival.
    const valVar = nextVar(ctx, 'nf_val');
    const freshVar = nextVar(ctx, 'nf_fresh');
    emit(ctx, `-- Read Named Float "${String(prop('name'))}" - subscriber not yet implemented`);
    emit(ctx, `local ${valVar} = 0`);
    emit(ctx, `local ${freshVar} = false`);
    ctx.varMap.set(varKey(node.id, 'value'), valVar);
    ctx.varMap.set(varKey(node.id, 'fresh'), freshVar);
    return;
  }

  if (type === 'sensor-param-get') {
    const name = String(prop('param_name'));
    setOutput('value', `(param:get("${name.replace(/"/g, '\\"')}") or 0)`);
    return;
  }

  if (type === 'sensor-gpio-read') {
    // Pin can come from a wired input or fall back to the static property.
    // gpio:read needs an integer pin and returns a BOOLEAN on real firmware
    // (older docs suggest 0/1), so normalize both shapes to 0/1.
    const pinExpr = input('pin', String(prop('pin')));
    const pinVar = nextVar(ctx, 'gpio_pin');
    const lvlVar = nextVar(ctx, 'gpio_lvl');
    emit(ctx, `local ${pinVar} = ${pinExpr}`);
    emit(ctx, `local ${lvlVar} = 0`);
    emit(ctx, `if ${pinVar} and ${pinVar} >= 0 then`);
    emit(ctx, `  local _raw = gpio:read(math.floor(${pinVar}))`);
    emit(ctx, `  if _raw == true or _raw == 1 then ${lvlVar} = 1 end`);
    emit(ctx, `end`);
    ctx.varMap.set(varKey(node.id, 'level'), lvlVar);
    ctx.varMap.set(varKey(node.id, 'is_high'), `(${lvlVar} == 1)`);
    return;
  }

  if (type === 'sensor-pwm-pulse') {
    // PWMSource attaches a hardware interrupt and latches the last pulse
    // width; get_pwm_us returns it once, then reads 0 until the next pulse.
    // set_pin must run once at script load, so it lives in the prelude.
    const pin = Math.floor(Number(prop('pin')) || 0);
    const idSuffix = sanitizeVarName(node.id);
    const srcVar = `_pwm_src_${idSuffix}`;
    const okVar = `_pwm_ok_${idSuffix}`;
    ctx.prelude.push(`-- Pulse input on pin ${pin} (hardware interrupt via PWMSource)`);
    ctx.prelude.push(`local ${srcVar} = PWMSource()`);
    ctx.prelude.push(`local ${okVar} = ${srcVar}:set_pin(${pin})`);
    ctx.prelude.push(`if not ${okVar} then gcs:send_text(3, 'Pulse input: pin ${pin} not usable (SERVOx_FUNCTION = -1?)') end`);
    const widthVar = nextVar(ctx, 'pulse_width');
    emit(ctx, `local ${widthVar} = 0`);
    emit(ctx, `if ${okVar} then ${widthVar} = ${srcVar}:get_pwm_us() or 0 end`);
    ctx.varMap.set(varKey(node.id, 'width_us'), widthVar);
    ctx.varMap.set(varKey(node.id, 'pulse_seen'), `(${widthVar} > 0)`);
    ctx.varMap.set(varKey(node.id, 'ok'), okVar);
    return;
  }

  if (type === 'sensor-current-waypoint') {
    setOutput('index', '(mission:get_current_nav_index() or 0)');
    setOutput('nav_id', '(mission:get_current_nav_id() or 0)');
    return;
  }

  if (type === 'sensor-wind') {
    const vecVar = nextVar(ctx, 'wind_vec');
    emit(ctx, `local ${vecVar} = ahrs:wind_estimate()`);
    const speedVar = nextVar(ctx, 'wind_spd');
    const dirVar = nextVar(ctx, 'wind_dir');
    emit(ctx, `local ${speedVar} = ${vecVar} and ${vecVar}:length() or 0`);
    emit(ctx, `local ${dirVar} = ${vecVar} and math.deg(math.atan(${vecVar}:y(), ${vecVar}:x())) or 0`);
    emit(ctx, `if ${dirVar} < 0 then ${dirVar} = ${dirVar} + 360 end`);
    ctx.varMap.set(varKey(node.id, 'speed_ms'), speedVar);
    ctx.varMap.set(varKey(node.id, 'dir_deg'), dirVar);
    return;
  }

  // ── Logic ───────────────────────────────────────────────

  if (type === 'logic-compare') {
    const a = input('a', '0');
    const b = input('b', '0');
    let op = String(prop('operator'));
    // Lua uses ~= for not-equal
    if (op === '!=') op = '~=';
    setOutput('result', `(${a} ${op} ${b})`);
    return;
  }

  if (type === 'logic-if-else') {
    const cond = input('condition', 'false');
    setOutput('true_out', `(${cond} == true)`);
    setOutput('false_out', `(${cond} ~= true)`);
    return;
  }

  if (type === 'logic-and') {
    const a = input('a', 'false');
    const b = input('b', 'false');
    setOutput('result', `(${a} and ${b})`);
    return;
  }

  if (type === 'logic-or') {
    const a = input('a', 'false');
    const b = input('b', 'false');
    setOutput('result', `(${a} or ${b})`);
    return;
  }

  if (type === 'logic-not') {
    const v = input('input', 'false');
    setOutput('result', `(not ${v})`);
    return;
  }

  if (type === 'logic-range-check') {
    const v = input('value', '0');
    const min = String(prop('min'));
    const max = String(prop('max'));
    setOutput('in_range', `(${v} >= ${min} and ${v} <= ${max})`);
    return;
  }

  if (type === 'logic-switch') {
    const v = input('value', '0');
    const c0 = String(prop('case0_val'));
    const c1 = String(prop('case1_val'));
    const c2 = String(prop('case2_val'));
    setOutput('case_0', `(${v} == ${c0})`);
    setOutput('case_1', `(${v} == ${c1})`);
    setOutput('case_2', `(${v} == ${c2})`);
    setOutput('default', `(${v} ~= ${c0} and ${v} ~= ${c1} and ${v} ~= ${c2})`);
    return;
  }

  // ── Math ────────────────────────────────────────────────

  if (type === 'math-add') {
    setOutput('result', `(${input('a', '0')} + ${input('b', '0')})`);
    return;
  }
  if (type === 'math-subtract') {
    setOutput('result', `(${input('a', '0')} - ${input('b', '0')})`);
    return;
  }
  if (type === 'math-multiply') {
    setOutput('result', `(${input('a', '0')} * ${input('b', '0')})`);
    return;
  }
  if (type === 'math-divide') {
    const b = input('b', '1');
    setOutput('result', `(${b} ~= 0 and (${input('a', '0')} / ${b}) or 0)`);
    return;
  }
  if (type === 'math-clamp') {
    const v = input('value', '0');
    const min = String(prop('min'));
    const max = String(prop('max'));
    setOutput('result', `math.max(${min}, math.min(${max}, ${v}))`);
    return;
  }
  if (type === 'math-map-range') {
    const v = input('value', '0');
    const iMin = String(prop('in_min'));
    const iMax = String(prop('in_max'));
    const oMin = String(prop('out_min'));
    const oMax = String(prop('out_max'));
    setOutput(
      'result',
      `(${oMin} + (${v} - ${iMin}) * (${oMax} - ${oMin}) / (${iMax} - ${iMin}))`,
    );
    return;
  }
  if (type === 'math-abs') {
    setOutput('result', `math.abs(${input('value', '0')})`);
    return;
  }
  if (type === 'math-min') {
    setOutput('result', `math.min(${input('a', '0')}, ${input('b', '0')})`);
    return;
  }
  if (type === 'math-max') {
    setOutput('result', `math.max(${input('a', '0')}, ${input('b', '0')})`);
    return;
  }

  // ── Location math (operate on Location_ud objects) ──────

  if (type === 'math-location-bearing') {
    const from = input('from', 'nil');
    const to = input('to', 'nil');
    setOutput('bearing_deg', `((${from} and ${to}) and math.deg(${from}:get_bearing(${to})) or 0)`);
    return;
  }

  if (type === 'math-location-distance') {
    const a = input('a', 'nil');
    const b = input('b', 'nil');
    setOutput('distance_m', `((${a} and ${b}) and ${a}:get_distance(${b}) or 0)`);
    return;
  }

  if (type === 'math-location-offset') {
    // Offsets a copy of `from` by bearing/distance, returning a new Location.
    // Returns nil if `from` is nil so downstream nil-checks still work.
    const from = input('from', 'nil');
    const bearing = input('bearing_deg', '0');
    const distance = input('distance_m', '0');
    const v = nextVar(ctx, 'loc_offset');
    emit(ctx, `local ${v} = nil`);
    emit(ctx, `if ${from} then`);
    ctx.indent += 1;
    emit(ctx, `${v} = ${from}:copy()`);
    emit(ctx, `${v}:offset_bearing(${bearing}, ${distance})`);
    ctx.indent -= 1;
    emit(ctx, 'end');
    ctx.varMap.set(varKey(node.id, 'location'), v);
    return;
  }

  // ── Actions ─────────────────────────────────────────────

  if (type === 'action-gcs-text') {
    const trigger = input('trigger', 'true');
    const sev = String(prop('severity'));
    const msg = String(prop('message'));
    // An optional wired value gets appended to the message (e.g. a waypoint
    // number). Left unconnected, the message is a plain static string.
    const hasValue = edges.some((e) => e.target === node.id && e.targetHandle === 'value');
    const textExpr = hasValue
      ? `"${msg.replace(/"/g, '\\"')}" .. tostring(${input('value', '""')})`
      : `"${msg.replace(/"/g, '\\"')}"`;
    emit(ctx, `if ${trigger} then`);
    ctx.indent += 1;
    emit(ctx, `gcs:send_text(${sev}, ${textExpr})`);
    ctx.indent -= 1;
    emit(ctx, 'end');
    return;
  }

  if (type === 'action-set-servo') {
    const trigger = input('trigger', 'true');
    const pwm = input('pwm', '1500');
    const servoNum = String(prop('servo_num'));
    emit(ctx, `if ${trigger} then`);
    ctx.indent += 1;
    emit(ctx, `SRV_Channels:set_output_pwm(${servoNum}, ${pwm})`);
    ctx.indent -= 1;
    emit(ctx, 'end');
    return;
  }

  if (type === 'action-set-mode') {
    const trigger = input('trigger', 'true');
    const mode = String(prop('mode_num'));
    emit(ctx, `if ${trigger} then`);
    ctx.indent += 1;
    emit(ctx, `vehicle:set_mode(${mode})`);
    ctx.indent -= 1;
    emit(ctx, 'end');
    return;
  }

  if (type === 'action-set-param') {
    const trigger = input('trigger', 'true');
    const val = input('value', '0');
    const name = String(prop('param_name'));
    emit(ctx, `if ${trigger} then`);
    ctx.indent += 1;
    emit(ctx, `param:set_and_save("${name}", ${val})`);
    ctx.indent -= 1;
    emit(ctx, 'end');
    return;
  }

  if (type === 'action-relay') {
    const trigger = input('trigger', 'true');
    const relayNum = String(prop('relay_num'));
    const state = String(prop('state'));
    emit(ctx, `if ${trigger} then`);
    ctx.indent += 1;
    emit(ctx, state === '1' ? `relay:on(${relayNum})` : `relay:off(${relayNum})`);
    ctx.indent -= 1;
    emit(ctx, 'end');
    return;
  }

  if (type === 'action-log-to-file') {
    const trigger = input('trigger', 'true');
    const v1 = input('value1', '""');
    const v2 = input('value2', '""');
    const v3 = input('value3', '""');
    const filename = String(prop('filename'));
    const sep = String(prop('separator'));
    const sepLua = sep === '\t' ? '\\t' : sep;
    emit(ctx, `if ${trigger} then`);
    ctx.indent += 1;
    emit(ctx, `local _f = io.open("${filename.replace(/"/g, '\\"')}", "a")`);
    emit(ctx, 'if _f then');
    ctx.indent += 1;
    emit(ctx, `_f:write(tostring(${v1}) .. "${sepLua}" .. tostring(${v2}) .. "${sepLua}" .. tostring(${v3}) .. "\\n")`);
    emit(ctx, '_f:close()');
    ctx.indent -= 1;
    emit(ctx, 'end');
    ctx.indent -= 1;
    emit(ctx, 'end');
    return;
  }

  if (type === 'action-set-led') {
    const trigger = input('trigger', 'true');
    const r = input('r', '0');
    const g = input('g', '0');
    const b = input('b', '0');
    const inst = String(prop('instance'));
    emit(ctx, `if ${trigger} then`);
    ctx.indent += 1;
    emit(ctx, `serialLED:set_RGB(${inst}, -1, ${r}, ${g}, ${b})`);
    emit(ctx, 'serialLED:send()');
    ctx.indent -= 1;
    emit(ctx, 'end');
    return;
  }

  if (type === 'action-play-tune') {
    const trigger = input('trigger', 'true');
    const tune = String(prop('tune'));
    emit(ctx, `if ${trigger} then`);
    ctx.indent += 1;
    emit(ctx, `notify:play_tune("${tune.replace(/"/g, '\\"')}")`);
    ctx.indent -= 1;
    emit(ctx, 'end');
    return;
  }

  if (type === 'action-set-waypoint') {
    const trigger = input('trigger', 'true');
    const idx = String(prop('cmd_idx'));
    emit(ctx, `if ${trigger} then`);
    ctx.indent += 1;
    emit(ctx, `mission:set_current_cmd(${idx})`);
    ctx.indent -= 1;
    emit(ctx, 'end');
    return;
  }

  // ── FC-side script primitives ───────────────────────────

  if (type === 'action-set-target-location') {
    // Push a GUIDED-mode position target. nil-checks the location so a missing
    // upstream sensor doesn't crash the script.
    const trigger = input('trigger', 'true');
    const loc = input('location', 'nil');
    emit(ctx, `if ${trigger} and ${loc} then`);
    ctx.indent += 1;
    emit(ctx, `vehicle:set_target_location(${loc})`);
    ctx.indent -= 1;
    emit(ctx, 'end');
    return;
  }

  if (type === 'action-publish-named-float') {
    // gcs:send_named_float(name, value). Name capped at 10 chars by MAVLink.
    const trigger = input('trigger', 'true');
    const val = input('value', '0');
    const name = String(prop('name')).slice(0, 10);
    emit(ctx, `if ${trigger} then`);
    ctx.indent += 1;
    emit(ctx, `gcs:send_named_float("${name.replace(/"/g, '\\"')}", ${val})`);
    ctx.indent -= 1;
    emit(ctx, 'end');
    return;
  }

  if (type === 'action-mavlink-on-user-cmd') {
    // Receiver for MAV_CMD_USER_x. Three things have to happen:
    //   1. Module-scope: mavlink:init + register_rx_msgid (once per script)
    //   2. Module-scope: mavlink:block_command(cmd_id) per registered cmd
    //      (without this, ArduPilot auto-acks UNSUPPORTED before scripts see)
    //   3. update body: drain the rx queue, dispatch to per-node state vars
    // We emit (1)+(2) via the ctx.prelude lines; (3) is emitted as a SHARED
    // loop at the start of update() by compileGraph, so multiple receiver
    // nodes share one drain pass and don't steal each other's messages.
    const cmdId = Number(prop('cmd_id')) || 31010;
    const idSuffix = sanitizeVarName(node.id);
    const triggerVar = `_mlu_trig_${idSuffix}`;
    const p1Var = `_mlu_p1_${idSuffix}`;
    const p2Var = `_mlu_p2_${idSuffix}`;
    const p3Var = `_mlu_p3_${idSuffix}`;
    const p4Var = `_mlu_p4_${idSuffix}`;
    const locVar = `_mlu_loc_${idSuffix}`;
    ctx.stateVars.set(triggerVar, 'false');
    ctx.stateVars.set(p1Var, '0');
    ctx.stateVars.set(p2Var, '0');
    ctx.stateVars.set(p3Var, '0');
    ctx.stateVars.set(p4Var, '0');
    ctx.stateVars.set(locVar, 'nil');
    ctx.mavlinkRxNodes.push({
      cmdId, triggerVar, p1Var, p2Var, p3Var, p4Var, locVar,
    });
    ctx.varMap.set(varKey(node.id, 'trigger'),  triggerVar);
    ctx.varMap.set(varKey(node.id, 'param1'),   p1Var);
    ctx.varMap.set(varKey(node.id, 'param2'),   p2Var);
    ctx.varMap.set(varKey(node.id, 'param3'),   p3Var);
    ctx.varMap.set(varKey(node.id, 'param4'),   p4Var);
    ctx.varMap.set(varKey(node.id, 'location'), locVar);
    return;
  }

  if (type === 'action-serial-write') {
    // Scripting serial: user sets an unused SERIALx_PROTOCOL to 28, then
    // find_serial(N) grabs the Nth such port. begin() must run once at load.
    const inst = Math.floor(Number(prop('instance')) || 0);
    const baud = Number(prop('baud')) || 57600;
    const ending = String(prop('line_ending'));
    const portVar = `_ser_${sanitizeVarName(node.id)}`;
    ctx.prelude.push(`-- Serial output: scripting serial instance ${inst} (SERIALx_PROTOCOL = 28)`);
    ctx.prelude.push(`local ${portVar} = serial:find_serial(${inst})`);
    ctx.prelude.push(`if ${portVar} then ${portVar}:begin(${baud}) else gcs:send_text(3, 'Lua: scripting serial ${inst} not found (set a SERIALx_PROTOCOL to 28)') end`);

    const trigger = input('trigger', 'true');
    const data = input('data', '""');
    const suffix = ending === 'lf' ? ' .. "\\n"' : ending === 'crlf' ? ' .. "\\r\\n"' : '';
    const plVar = nextVar(ctx, 'ser_payload');
    emit(ctx, `if ${trigger} and ${portVar} then`);
    ctx.indent += 1;
    emit(ctx, `local ${plVar} = tostring(${data})${suffix}`);
    emit(ctx, `for _i = 1, #${plVar} do ${portVar}:write(${plVar}:byte(_i)) end`);
    ctx.indent -= 1;
    emit(ctx, 'end');
    return;
  }

  if (type === 'action-socket-send') {
    // Socket(1) = UDP datagram, Socket(0) = TCP stream. Connect lazily on
    // first trigger (pcall-guarded: Socket is nil on boards without
    // networking, and TCP connect can fail until the link is up).
    const proto = String(prop('protocol'));
    const ip = String(prop('ip')).replace(/"/g, '\\"');
    const port = Math.floor(Number(prop('port')) || 14550);
    const sockVar = `_sock_${sanitizeVarName(node.id)}`;
    ctx.stateVars.set(sockVar, 'nil');

    const trigger = input('trigger', 'true');
    const data = input('data', '""');
    const plVar = nextVar(ctx, 'net_payload');
    emit(ctx, `-- Network send ${proto}://${ip}:${port} (needs NET_ENABLE = 1)`);
    emit(ctx, `if ${trigger} then`);
    ctx.indent += 1;
    emit(ctx, `if not ${sockVar} then`);
    ctx.indent += 1;
    emit(ctx, 'pcall(function()');
    ctx.indent += 1;
    emit(ctx, `local _s = Socket(${proto === 'tcp' ? 0 : 1})`);
    emit(ctx, `if _s and _s:connect("${ip}", ${port}) then ${sockVar} = _s end`);
    ctx.indent -= 1;
    emit(ctx, 'end)');
    ctx.indent -= 1;
    emit(ctx, 'end');
    emit(ctx, `if ${sockVar} then`);
    ctx.indent += 1;
    emit(ctx, `local ${plVar} = tostring(${data})`);
    emit(ctx, `${sockVar}:send(${plVar}, #${plVar})`);
    ctx.indent -= 1;
    emit(ctx, 'end');
    ctx.indent -= 1;
    emit(ctx, 'end');
    return;
  }

  // ── Timing ──────────────────────────────────────────────

  if (type === 'timing-run-every') {
    const timerVar = `_timer_${sanitizeVarName(node.id)}`;
    const intervalMs = Number(prop('interval_ms')) || 5000;
    ctx.stateVars.set(timerVar, '0');
    const trigger = input('trigger', 'true');
    emit(ctx, `${timerVar} = ${timerVar} + ${ctx.entryInterval}`);
    const shouldRun = nextVar(ctx, 'should_run');
    emit(ctx, `local ${shouldRun} = ${trigger} and ${timerVar} >= ${intervalMs}`);
    emit(ctx, `if ${shouldRun} then ${timerVar} = 0 end`);
    ctx.varMap.set(varKey(node.id, 'flow'), shouldRun);
    return;
  }

  if (type === 'timing-debounce') {
    const inp = input('input', 'false');
    const stableVar = `_debounce_${sanitizeVarName(node.id)}`;
    const counterVar = `_debounce_cnt_${sanitizeVarName(node.id)}`;
    const delayMs = Number(prop('delay_ms')) || 500;
    const ticks = Math.max(1, Math.round(delayMs / ctx.entryInterval));
    ctx.stateVars.set(stableVar, 'false');
    ctx.stateVars.set(counterVar, '0');
    emit(ctx, `if ${inp} then`);
    ctx.indent += 1;
    emit(ctx, `${counterVar} = ${counterVar} + 1`);
    ctx.indent -= 1;
    emit(ctx, 'else');
    ctx.indent += 1;
    emit(ctx, `${counterVar} = 0`);
    ctx.indent -= 1;
    emit(ctx, 'end');
    emit(ctx, `${stableVar} = ${counterVar} >= ${ticks}`);
    ctx.varMap.set(varKey(node.id, 'output'), stableVar);
    return;
  }

  if (type === 'timing-on-change') {
    const val = input('value', '0');
    const prevVar = `_prev_${sanitizeVarName(node.id)}`;
    ctx.stateVars.set(prevVar, 'nil');
    const changedVar = nextVar(ctx, 'changed');
    emit(ctx, `local ${changedVar} = (${prevVar} ~= nil and ${prevVar} ~= ${val})`);
    emit(ctx, `${prevVar} = ${val}`);
    ctx.varMap.set(varKey(node.id, 'changed'), changedVar);
    return;
  }

  if (type === 'timing-rising-edge') {
    const inp = input('input', 'false');
    const prevVar = `_edge_${sanitizeVarName(node.id)}`;
    ctx.stateVars.set(prevVar, 'false');
    const trigVar = nextVar(ctx, 'edge_trig');
    emit(ctx, `local ${trigVar} = (${inp} and not ${prevVar})`);
    emit(ctx, `${prevVar} = ${inp}`);
    ctx.varMap.set(varKey(node.id, 'triggered'), trigVar);
    return;
  }

  if (type === 'timing-falling-edge') {
    const inp = input('input', 'false');
    const prevVar = `_fedge_${sanitizeVarName(node.id)}`;
    ctx.stateVars.set(prevVar, 'true');
    const trigVar = nextVar(ctx, 'fedge_trig');
    emit(ctx, `local ${trigVar} = (not ${inp} and ${prevVar})`);
    emit(ctx, `${prevVar} = ${inp}`);
    ctx.varMap.set(varKey(node.id, 'triggered'), trigVar);
    return;
  }

  if (type === 'timing-watchdog') {
    // Time since the last kick. Resets to 0 on a kick, accumulates the entry
    // interval otherwise, and holds at 0 while disabled so re-enabling starts
    // fresh (no immediate false expiry).
    const kick = input('kick', 'false');
    const enable = input('enable', 'true');
    const timeoutMs = Number(prop('timeout_ms')) || 3000;
    const timerVar = `_wd_${sanitizeVarName(node.id)}`;
    ctx.stateVars.set(timerVar, '0');
    const expiredVar = nextVar(ctx, 'wd_expired');
    emit(ctx, `local ${expiredVar} = false`);
    emit(ctx, `if ${enable} then`);
    ctx.indent += 1;
    emit(ctx, `if ${kick} then ${timerVar} = 0 else ${timerVar} = ${timerVar} + ${ctx.entryInterval} end`);
    emit(ctx, `${expiredVar} = (${timerVar} >= ${timeoutMs})`);
    ctx.indent -= 1;
    emit(ctx, 'else');
    ctx.indent += 1;
    emit(ctx, `${timerVar} = 0`);
    ctx.indent -= 1;
    emit(ctx, 'end');
    ctx.varMap.set(varKey(node.id, 'expired'), expiredVar);
    return;
  }

  if (type === 'timing-latch') {
    const setIn = input('set', 'false');
    const resetIn = input('reset', 'false');
    const stateVar = `_latch_${sanitizeVarName(node.id)}`;
    ctx.stateVars.set(stateVar, 'false');
    emit(ctx, `if ${resetIn} then ${stateVar} = false end`);
    emit(ctx, `if ${setIn} then ${stateVar} = true end`);
    ctx.varMap.set(varKey(node.id, 'state'), stateVar);
    return;
  }

  // ── Variables ───────────────────────────────────────────

  if (type === 'var-constant') {
    const valType = String(prop('type'));
    const rawVal = String(prop('value'));
    let luaVal = rawVal;
    if (valType === 'string') luaVal = `"${rawVal.replace(/"/g, '\\"')}"`;
    if (valType === 'boolean') luaVal = rawVal === 'true' ? 'true' : 'false';
    ctx.varMap.set(varKey(node.id, 'value'), luaVal);
    return;
  }

  if (type === 'var-get') {
    const name = sanitizeVarName(String(prop('name')));
    ctx.userVars.add(name);
    ctx.varMap.set(varKey(node.id, 'value'), name);
    return;
  }

  if (type === 'var-set') {
    const trigger = input('trigger', 'true');
    const val = input('value', '0');
    const name = sanitizeVarName(String(prop('name')));
    ctx.userVars.add(name);
    emit(ctx, `if ${trigger} then`);
    ctx.indent += 1;
    emit(ctx, `${name} = ${val}`);
    ctx.indent -= 1;
    emit(ctx, 'end');
    return;
  }

  // ── Flow (Comment nodes produce Lua comments) ───────────

  if (type === 'flow-comment') {
    const text = String(prop('text'));
    emit(ctx, `-- ${text}`);
    return;
  }

  if (type === 'flow-custom-lua') {
    // User snippet inlined as an immediately-invoked function: input pins
    // become arguments (so names can't collide across nodes), the snippet's
    // return values land in the output pin variables.
    const inputPins = parseCustomPins(String(prop('inputs')));
    const outputPins = parseCustomPins(String(prop('outputs')));
    const code = String(prop('code'));
    const argExprs = inputPins.map((pin) => input(pin, 'nil'));

    const outVars = outputPins.map((pin) => {
      const v = nextVar(ctx, pin);
      ctx.varMap.set(varKey(node.id, pin), v);
      return v;
    });

    emit(ctx, `-- Custom Lua: ${node.data.label}`);
    const assign = outVars.length > 0 ? `local ${outVars.join(', ')} = ` : 'local _ = ';
    emit(ctx, `${assign}(function(${inputPins.join(', ')})`);
    ctx.indent += 1;
    for (const line of code.split('\n')) {
      emit(ctx, line);
    }
    ctx.indent -= 1;
    emit(ctx, `end)(${argExprs.join(', ')})`);
    return;
  }
}

// ── Main Compiler ───────────────────────────────────────────────

export function compileGraph(
  nodes: Node<GraphNodeData>[],
  edges: Edge<GraphEdgeData>[],
  graphName: string,
  runIntervalMs = 1000,
): CompileResult {
  if (nodes.length === 0) {
    return { success: true, code: '-- Empty graph\n', errors: [], nodeCount: 0, estimatedMemoryBytes: 0 };
  }

  const { sorted, errors: sortErrors } = topoSort(nodes, edges);

  if (sortErrors.length > 0) {
    return { success: false, code: '', errors: sortErrors, nodeCount: nodes.length, estimatedMemoryBytes: 0 };
  }

  const ctx: CompileContext = {
    varMap: new Map(),
    lines: [],
    indent: 0,
    stateVars: new Map(),
    userVars: new Set(),
    entryInterval: runIntervalMs,
    varCounter: 0,
    prelude: [],
    mavlinkRxNodes: [],
  };

  // Generate body code into a separate buffer
  const bodyCtx: CompileContext = { ...ctx, lines: [], indent: 1 };

  for (const node of sorted) {
    compileNode(node, edges, bodyCtx);
  }

  // If any MAVLink USER_x receiver nodes were registered, build:
  //   - Module-scope init prelude (once: init + register + block_command per cmd)
  //   - A shared receive loop INSERTED at the start of the update body, so a
  //     single drain pass dispatches to every registered cmd_id (otherwise the
  //     first node's loop would steal messages destined for other nodes).
  if (bodyCtx.mavlinkRxNodes.length > 0) {
    const distinctCmdIds = Array.from(new Set(bodyCtx.mavlinkRxNodes.map(n => n.cmdId)));
    bodyCtx.prelude.push('-- MAV_CMD_USER_x receiver setup (once at script load)');
    bodyCtx.prelude.push('pcall(function()');
    bodyCtx.prelude.push('  mavlink:init(10, 4)');
    bodyCtx.prelude.push('  mavlink:register_rx_msgid(75)  -- COMMAND_INT');
    for (const cmd of distinctCmdIds) {
      bodyCtx.prelude.push(`  mavlink:block_command(${cmd})`);
    }
    bodyCtx.prelude.push('end)');

    // Build the shared rx-drain loop. Resets all triggers to false first so
    // a tick without messages doesn't keep firing the previous trigger.
    const rxLines: string[] = [];
    rxLines.push('  -- MAVLink USER_x dispatch (drain queue, route to nodes)');
    for (const n of bodyCtx.mavlinkRxNodes) {
      rxLines.push(`  ${n.triggerVar} = false`);
    }
    rxLines.push('  while true do');
    rxLines.push('    local _msg = mavlink:receive_chan()');
    rxLines.push('    if _msg == nil then break end');
    rxLines.push('    if #_msg >= 42 then');
    rxLines.push('      local _ok, _p1, _p2, _p3, _p4, _x, _y, _z, _cmd =');
    rxLines.push("        pcall(string.unpack, '<ffffiifH', _msg, 13)");
    rxLines.push('      if _ok then');
    for (const n of bodyCtx.mavlinkRxNodes) {
      rxLines.push(`        if _cmd == ${n.cmdId} then`);
      rxLines.push(`          ${n.triggerVar} = true`);
      rxLines.push(`          ${n.p1Var}, ${n.p2Var}, ${n.p3Var}, ${n.p4Var} = _p1, _p2, _p3, _p4`);
      rxLines.push(`          ${n.locVar} = Location()`);
      rxLines.push(`          ${n.locVar}:lat(_x); ${n.locVar}:lng(_y)`);
      rxLines.push(`          ${n.locVar}:alt(math.floor(_z * 100)); ${n.locVar}:relative_alt(true)`);
      rxLines.push('        end');
    }
    rxLines.push('      end');
    rxLines.push('    end');
    rxLines.push('  end');
    // Prepend the rx loop to body so per-node logic sees fresh trigger values.
    bodyCtx.lines = [...rxLines, ...bodyCtx.lines];
  }

  // Now assemble the full script
  const out: string[] = [];
  out.push(`-- ${graphName}`);
  out.push('-- Generated by ArduDeck Lua Graph Editor');
  out.push('');

  // State variables (must come before the prelude — prelude may reference them)
  if (bodyCtx.stateVars.size > 0 || bodyCtx.userVars.size > 0) {
    for (const name of bodyCtx.userVars) {
      out.push(`local ${name} = nil`);
    }
    for (const [name, init] of bodyCtx.stateVars) {
      out.push(`local ${name} = ${init}`);
    }
    out.push('');
  }

  // Prelude (one-time setup like mavlink:init)
  if (bodyCtx.prelude.length > 0) {
    out.push(...bodyCtx.prelude);
    out.push('');
  }

  // update() function
  out.push('function update()');
  out.push(...bodyCtx.lines);
  out.push('');
  out.push(`  return update, ${ctx.entryInterval}`);
  out.push('end');
  out.push('');
  out.push('return update()');
  out.push('');

  const code = out.join('\n');
  const estimatedMemoryBytes = code.length * 2; // rough estimate

  return {
    success: true,
    code,
    errors: [],
    nodeCount: nodes.length,
    estimatedMemoryBytes,
  };
}
