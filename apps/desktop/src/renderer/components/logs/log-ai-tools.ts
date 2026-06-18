// On-demand log access for the AI flight-log analyst.
//
// Instead of dumping the whole log into the prompt (logs are huge), the model
// is given tools to discover and query the parsed log, and the renderer runs an
// agentic loop: ask Claude → it requests data via a tool → we execute the tool
// against the in-memory ParsedLog → feed the result back → repeat until Claude
// returns prose. The HTTP call is proxied through main (`logAiClaudeTool`) so
// the API key stays in the main process; everything else happens here, where
// the log lives.

import type { ParsedLog } from '../../stores/log-store';

type LogMsg = { type: string; timeUs: number; fields: Record<string, number | string> };

/** Round to a compact-but-faithful precision so tool payloads stay small. */
function r(x: number): number {
  if (!Number.isFinite(x)) return x;
  const a = Math.abs(x);
  if (a !== 0 && (a < 1e-4 || a >= 1e6)) return Number(x.toPrecision(5));
  return Math.round(x * 1e4) / 1e4;
}

function durationS(log: ParsedLog): number {
  return r((log.timeRange.endUs - log.timeRange.startUs) / 1_000_000);
}

/** Filter messages to a [startS, endS] window measured in seconds from log start. */
function windowFilter(msgs: LogMsg[], log: ParsedLog, startS?: number, endS?: number): LogMsg[] {
  if (startS == null && endS == null) return msgs;
  const base = log.timeRange.startUs;
  const lo = startS != null ? base + startS * 1_000_000 : -Infinity;
  const hi = endS != null ? base + endS * 1_000_000 : Infinity;
  return msgs.filter((m) => m.timeUs >= lo && m.timeUs <= hi);
}

export function listMessageTypes(log: ParsedLog): Array<{ type: string; count: number; fields: string[] }> {
  const out: Array<{ type: string; count: number; fields: string[] }> = [];
  for (const [type, msgs] of Object.entries(log.messages)) {
    const first = msgs[0];
    if (!first) continue;
    out.push({ type, count: msgs.length, fields: Object.keys(first.fields) });
  }
  out.sort((a, b) => b.count - a.count);
  return out;
}

export function getFieldStats(
  log: ParsedLog,
  type: string,
  fields?: string[],
  startS?: number,
  endS?: number,
): unknown {
  const all = log.messages[type];
  if (!all) return { error: `No messages of type "${type}". Call list_message_types to see what's available.` };
  const msgs = windowFilter(all, log, startS, endS);
  if (!msgs.length) return { type, note: 'No messages in the requested time window.' };

  const want = fields && fields.length ? fields : Object.keys(msgs[0]!.fields);
  const stats: Record<string, unknown> = {};
  for (const f of want) {
    const vals: number[] = [];
    let first: number | undefined;
    let last: number | undefined;
    for (const m of msgs) {
      const v = m.fields[f];
      if (typeof v === 'number' && Number.isFinite(v)) {
        if (first === undefined) first = v;
        last = v;
        vals.push(v);
      }
    }
    if (!vals.length) {
      stats[f] = { note: 'no numeric samples (non-numeric or missing field)' };
      continue;
    }
    const n = vals.length;
    const mean = vals.reduce((s, x) => s + x, 0) / n;
    const variance = vals.reduce((s, x) => s + (x - mean) ** 2, 0) / n;
    let min = vals[0]!;
    let max = vals[0]!;
    for (const x of vals) {
      if (x < min) min = x;
      if (x > max) max = x;
    }
    stats[f] = {
      count: n,
      min: r(min),
      max: r(max),
      mean: r(mean),
      stddev: r(Math.sqrt(variance)),
      first: r(first!),
      last: r(last!),
    };
  }
  return { type, window: { startS: startS ?? 0, endS: endS ?? durationS(log) }, stats };
}

export function readSamples(
  log: ParsedLog,
  type: string,
  fields?: string[],
  startS?: number,
  endS?: number,
  maxPoints = 200,
): unknown {
  const all = log.messages[type];
  if (!all) return { error: `No messages of type "${type}". Call list_message_types to see what's available.` };
  const msgs = windowFilter(all, log, startS, endS);
  if (!msgs.length) return { type, note: 'No messages in the requested time window.' };

  const cap = Math.min(Math.max(Math.floor(maxPoints) || 200, 1), 500);
  const stride = Math.max(1, Math.ceil(msgs.length / cap));
  const want = fields && fields.length ? fields : Object.keys(msgs[0]!.fields);
  const base = log.timeRange.startUs;

  const points: Array<Record<string, number | string>> = [];
  for (let i = 0; i < msgs.length; i += stride) {
    const m = msgs[i]!;
    const p: Record<string, number | string> = { tS: r((m.timeUs - base) / 1_000_000) };
    for (const f of want) {
      const v = m.fields[f];
      if (v !== undefined) p[f] = typeof v === 'number' ? r(v) : v;
    }
    points.push(p);
  }
  return { type, fields: want, totalRows: msgs.length, returned: points.length, stride, points };
}

export function getParameters(log: ParsedLog, names?: string[], search?: string): unknown {
  const parm = log.messages['PARM'];
  const map = new Map<string, number>();
  if (parm) {
    for (const m of parm) {
      const name = m.fields['Name'];
      const val = m.fields['Value'];
      if (typeof name === 'string' && typeof val === 'number') map.set(name, val);
    }
  }
  if (map.size === 0) {
    return { error: 'No PARM records in this log.' };
  }
  if (names && names.length) {
    const params: Record<string, number | null> = {};
    for (const n of names) params[n] = map.has(n) ? map.get(n)! : null;
    return { params };
  }
  if (search) {
    const q = search.toUpperCase();
    const params: Record<string, number> = {};
    let count = 0;
    for (const [k, v] of map) {
      if (k.toUpperCase().includes(q)) {
        params[k] = v;
        if (++count >= 100) break;
      }
    }
    return { matched: count, params };
  }
  return { totalParams: map.size, note: 'Call again with names[] (exact) or search (substring) to get values.' };
}

/** Claude tool definitions exposed to the model. */
export const CLAUDE_LOG_TOOLS = [
  {
    name: 'list_message_types',
    description:
      "List every message/topic type in this flight log, with row count and field names. Call this first to discover what's available (ArduPilot dataflash uses names like ATT, RCOU, VIBE, GPS, BAT, MODE; PX4 ULogs use topics like vehicle_attitude, sensor_combined, battery_status, vehicle_gps_position).",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_field_stats',
    description:
      'Summary statistics (count, min, max, mean, stddev, first, last) for numeric fields of a message/topic type, optionally over a time window. Use for aggregate questions: vibration levels, attitude error, output saturation, voltage sag. Times are seconds from log start.',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', description: 'Message/topic type, e.g. "VIBE" (dataflash) or "vehicle_imu_status" (ULog)' },
        fields: { type: 'array', items: { type: 'string' }, description: 'Field names; omit for all numeric fields' },
        startS: { type: 'number', description: 'Window start, seconds from log start' },
        endS: { type: 'number', description: 'Window end, seconds from log start' },
      },
      required: ['type'],
    },
  },
  {
    name: 'read_samples',
    description:
      'Decimated time-series samples (default ~200 points, max 500) for a message/topic type and fields over an optional window, so you can see the shape of a trend, spike, or oscillation. Each point has tS (seconds from log start) plus the requested fields. Prefer get_field_stats for aggregates; use this to inspect specific events.',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string' },
        fields: { type: 'array', items: { type: 'string' } },
        startS: { type: 'number' },
        endS: { type: 'number' },
        maxPoints: { type: 'number', description: '1–500, default 200' },
      },
      required: ['type'],
    },
  },
  {
    name: 'get_parameters',
    description:
      'Look up parameter values recorded in this log. Provide names[] for exact params, or search for a substring (e.g. "INS_"). With neither, returns the total count.',
    input_schema: {
      type: 'object',
      properties: {
        names: { type: 'array', items: { type: 'string' } },
        search: { type: 'string' },
      },
    },
  },
] as const;

export function executeLogTool(name: string, input: Record<string, unknown>, log: ParsedLog): unknown {
  switch (name) {
    case 'list_message_types':
      return listMessageTypes(log);
    case 'get_field_stats':
      return getFieldStats(
        log,
        String(input.type),
        input.fields as string[] | undefined,
        input.startS as number | undefined,
        input.endS as number | undefined,
      );
    case 'read_samples':
      return readSamples(
        log,
        String(input.type),
        input.fields as string[] | undefined,
        input.startS as number | undefined,
        input.endS as number | undefined,
        input.maxPoints as number | undefined,
      );
    case 'get_parameters':
      return getParameters(log, input.names as string[] | undefined, input.search as string | undefined);
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ─── Agentic loop ─────────────────────────────────────────────────────────────

export interface ClaudeBlock {
  type: string;
  [k: string]: unknown;
}
export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string | ClaudeBlock[];
}

type ClaudeCall = (body: {
  system: string;
  messages: ClaudeMessage[];
  tools: unknown[];
}) => Promise<{ success: boolean; content?: unknown[]; stop_reason?: string; error?: string }>;

/**
 * Run the Claude tool-use loop. `history` is the display chat (plain strings,
 * starting with a user turn); `call` proxies one Messages request through main.
 * Returns the final assistant text, or an error.
 */
export async function runClaudeLogChat(opts: {
  system: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  log: ParsedLog;
  call: ClaudeCall;
  maxIterations?: number;
}): Promise<{ text: string; error?: string }> {
  const messages: ClaudeMessage[] = opts.history.map((m) => ({ role: m.role, content: m.content }));
  const maxIter = opts.maxIterations ?? 8;

  for (let i = 0; i < maxIter; i++) {
    const res = await opts.call({ system: opts.system, messages, tools: CLAUDE_LOG_TOOLS as unknown as unknown[] });
    if (!res.success || !res.content) {
      return { text: '', error: res.error ?? 'Analysis failed' };
    }
    const blocks = res.content as ClaudeBlock[];

    if (res.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: blocks });
      const toolResults: ClaudeBlock[] = [];
      for (const b of blocks) {
        if (b.type !== 'tool_use') continue;
        let result: unknown;
        try {
          result = executeLogTool(b.name as string, (b.input ?? {}) as Record<string, unknown>, opts.log);
        } catch (e) {
          result = { error: e instanceof Error ? e.message : String(e) };
        }
        toolResults.push({ type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(result) });
      }
      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    const text = blocks
      .filter((b) => b.type === 'text')
      .map((b) => String(b.text ?? ''))
      .join('');
    return { text };
  }

  return { text: '', error: `Stopped after ${maxIter} tool iterations without a final answer.` };
}
