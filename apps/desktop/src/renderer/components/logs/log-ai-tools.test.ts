import { describe, it, expect } from 'vitest';
import type { ParsedLog } from '../../stores/log-store';
import {
  listMessageTypes,
  getFieldStats,
  readSamples,
  getParameters,
  executeLogTool,
  runClaudeLogChat,
  type ClaudeMessage,
} from './log-ai-tools';

// Minimal ParsedLog covering the fields the tools touch. Time base: 1_000_000us
// start, so tS=0 at the first sample; 1 Hz samples → tS == index seconds.
function makeLog(): ParsedLog {
  const startUs = 1_000_000;
  const att = Array.from({ length: 10 }, (_, i) => ({
    type: 'ATT',
    timeUs: startUs + i * 1_000_000,
    fields: { Roll: i, DesRoll: 0, Label: 'x' } as Record<string, number | string>,
  }));
  return {
    format: 'dataflash',
    formats: {},
    messages: {
      ATT: att,
      VIBE: [
        { type: 'VIBE', timeUs: startUs, fields: { VibeX: 10, VibeY: 20 } },
        { type: 'VIBE', timeUs: startUs + 1_000_000, fields: { VibeX: 30, VibeY: 40 } },
      ],
      PARM: [
        { type: 'PARM', timeUs: startUs, fields: { Name: 'INS_ACCEL_FILTER', Value: 20 } },
        { type: 'PARM', timeUs: startUs, fields: { Name: 'INS_GYRO_FILTER', Value: 40 } },
        { type: 'PARM', timeUs: startUs, fields: { Name: 'ATC_RAT_RLL_P', Value: 0.135 } },
      ],
    },
    metadata: { vehicleType: 'Copter', firmwareVersion: '4.5', firmwareString: 'Copter 4.5', boardType: '', gitHash: '' },
    timeRange: { startUs, endUs: startUs + 9 * 1_000_000 },
    messageTypes: ['ATT', 'VIBE', 'PARM'],
    unitLabels: {},
    multValues: {},
  };
}

describe('listMessageTypes', () => {
  it('reports each type with count and fields, sorted by count desc', () => {
    const out = listMessageTypes(makeLog());
    expect(out[0]).toEqual({ type: 'ATT', count: 10, fields: ['Roll', 'DesRoll', 'Label'] });
    expect(out.find((t) => t.type === 'VIBE')).toEqual({ type: 'VIBE', count: 2, fields: ['VibeX', 'VibeY'] });
  });
});

describe('getFieldStats', () => {
  it('computes count/min/max/mean/first/last for a numeric field', () => {
    const res = getFieldStats(makeLog(), 'ATT', ['Roll']) as { stats: Record<string, { count: number; min: number; max: number; mean: number; first: number; last: number }> };
    expect(res.stats.Roll).toMatchObject({ count: 10, min: 0, max: 9, mean: 4.5, first: 0, last: 9 });
  });

  it('honors a time window (seconds from log start)', () => {
    const res = getFieldStats(makeLog(), 'ATT', ['Roll'], 2, 4) as { stats: Record<string, { count: number; min: number; max: number }> };
    // samples at tS 2,3,4 → Roll 2,3,4
    expect(res.stats.Roll).toMatchObject({ count: 3, min: 2, max: 4 });
  });

  it('skips non-numeric fields gracefully', () => {
    const res = getFieldStats(makeLog(), 'ATT', ['Label']) as { stats: Record<string, unknown> };
    expect(res.stats.Label).toEqual({ note: 'no numeric samples (non-numeric or missing field)' });
  });

  it('returns an error for an unknown message type', () => {
    expect(getFieldStats(makeLog(), 'NOPE')).toHaveProperty('error');
  });
});

describe('readSamples', () => {
  it('decimates to at most maxPoints and tags tS in seconds from start', () => {
    const res = readSamples(makeLog(), 'ATT', ['Roll'], undefined, undefined, 5) as { returned: number; stride: number; points: Array<{ tS: number; Roll: number }> };
    expect(res.returned).toBeLessThanOrEqual(5);
    expect(res.stride).toBe(2);
    expect(res.points[0]).toEqual({ tS: 0, Roll: 0 });
  });
});

describe('getParameters', () => {
  it('returns exact values for requested names, null when absent', () => {
    const res = getParameters(makeLog(), ['INS_ACCEL_FILTER', 'MISSING']) as { params: Record<string, number | null> };
    expect(res.params).toEqual({ INS_ACCEL_FILTER: 20, MISSING: null });
  });

  it('substring-searches parameter names', () => {
    const res = getParameters(makeLog(), undefined, 'ins_') as { matched: number; params: Record<string, number> };
    expect(res.matched).toBe(2);
    expect(res.params).toMatchObject({ INS_ACCEL_FILTER: 20, INS_GYRO_FILTER: 40 });
  });

  it('returns just the count when neither names nor search is given', () => {
    expect(getParameters(makeLog())).toMatchObject({ totalParams: 3 });
  });
});

describe('executeLogTool', () => {
  it('dispatches by tool name', () => {
    expect(executeLogTool('list_message_types', {}, makeLog())).toHaveLength(3);
    expect(executeLogTool('bogus', {}, makeLog())).toHaveProperty('error');
  });
});

describe('runClaudeLogChat', () => {
  it('executes a tool round-trip then returns the final text', async () => {
    const log = makeLog();
    const seen: ClaudeMessage[][] = [];
    let turn = 0;
    const call = async (body: { messages: ClaudeMessage[] }) => {
      seen.push(body.messages);
      turn++;
      if (turn === 1) {
        return {
          success: true,
          stop_reason: 'tool_use',
          content: [{ type: 'tool_use', id: 'tu_1', name: 'get_field_stats', input: { type: 'VIBE', fields: ['VibeX'] } }],
        };
      }
      return { success: true, stop_reason: 'end_turn', content: [{ type: 'text', text: 'VibeX peaked at 30.' }] };
    };

    const { text, error } = await runClaudeLogChat({
      system: 'sys',
      history: [{ role: 'user', content: 'How bad is vibration?' }],
      log,
      call,
    });

    expect(error).toBeUndefined();
    expect(text).toBe('VibeX peaked at 30.');
    // Second call must include the assistant tool_use turn and a user tool_result turn.
    const second = seen[1]!;
    expect(second.some((m) => Array.isArray(m.content) && m.content.some((b) => b.type === 'tool_result'))).toBe(true);
    const toolResult = second.flatMap((m) => (Array.isArray(m.content) ? m.content : [])).find((b) => b.type === 'tool_result');
    expect(String(toolResult!.content)).toContain('"max":30');
  });

  it('surfaces provider errors', async () => {
    const { text, error } = await runClaudeLogChat({
      system: 'sys',
      history: [{ role: 'user', content: 'hi' }],
      log: makeLog(),
      call: async () => ({ success: false, error: 'Claude API error 401' }),
    });
    expect(text).toBe('');
    expect(error).toBe('Claude API error 401');
  });
});
