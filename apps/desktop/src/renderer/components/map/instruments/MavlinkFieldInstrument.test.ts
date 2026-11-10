// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';
import { MAX_FIELD_PICKS, numericField, streamFor, useFieldPicksStore } from './MavlinkFieldInstrument';
import type { MessageStats } from '../../../stores/inspector-store';

const stat = (name: string, sysid: number, compid: number, fields: Record<string, unknown>): MessageStats => ({
  key: `${sysid}:${compid}:0`, sysid, compid, msgid: 0, name, fields, lastPayload: new Uint8Array(), lastRxtime: 0, count: 1, hz: 1, bps: 1, isSigned: false,
});

describe('MAVLink field instrument (#97)', () => {
  beforeEach(() => {
    localStorage.clear();
    useFieldPicksStore.setState({ picks: [] });
  });

  it('reads numbers and bigints, not strings or arrays', () => {
    const f = { a: 1.5, b: 10n, c: 'x', d: [1, 2], e: Number.NaN };
    expect(numericField(f, 'a')).toBe(1.5);
    expect(numericField(f, 'b')).toBe(10);
    expect(numericField(f, 'c')).toBeNull();
    expect(numericField(f, 'd')).toBeNull();
    expect(numericField(f, 'e')).toBeNull();
    expect(numericField(null, 'a')).toBeNull();
  });

  it('prefers the connected vehicle autopilot when several senders share a message', () => {
    const flat = [stat('VFR_HUD', 2, 1, { airspeed: 9 }), stat('VFR_HUD', 1, 190, { airspeed: 7 }), stat('VFR_HUD', 1, 1, { airspeed: 5 })];
    expect(streamFor(flat, 'VFR_HUD', 1)?.fields).toEqual({ airspeed: 5 });
    expect(streamFor(flat, 'VFR_HUD', 3)?.sysid).toBe(2);
    expect(streamFor(flat, 'ATTITUDE', 1)).toBeUndefined();
  });

  it('keeps picks unique, capped, and saved', () => {
    const { add, remove } = useFieldPicksStore.getState();
    add({ message: 'VFR_HUD', field: 'airspeed' });
    add({ message: 'VFR_HUD', field: 'airspeed' });
    expect(useFieldPicksStore.getState().picks).toHaveLength(1);
    for (let i = 0; i < 10; i++) add({ message: 'SYS_STATUS', field: `f${i}` });
    expect(useFieldPicksStore.getState().picks).toHaveLength(MAX_FIELD_PICKS);
    remove(0);
    expect(JSON.parse(localStorage.getItem('ardudeck.instrument.mavlinkFields')!)).toHaveLength(MAX_FIELD_PICKS - 1);
  });
});
