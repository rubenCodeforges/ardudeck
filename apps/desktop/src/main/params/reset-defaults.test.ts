import { describe, expect, it, vi } from 'vitest';
import { eraseAllParameters, MAV_CMD_PREFLIGHT_STORAGE, PREFLIGHT_STORAGE_RESET, type ResetDefaultsDeps } from './reset-defaults';

function deps(ack: number | null, setOk = true) {
  const order: string[] = [];
  const d: ResetDefaultsDeps = {
    awaitAck: vi.fn(async (cmd: number) => { order.push(`await:${cmd}`); return ack; }),
    sendCommand: vi.fn(async (cmd: number, p1: number) => { order.push(`send:${cmd}:${p1}`); }),
    setParam: vi.fn(async (id: string, v: number) => { order.push(`set:${id}=${v}`); return setOk; }),
  };
  return { d, order };
}

describe('eraseAllParameters', () => {
  it('uses MAV_CMD_PREFLIGHT_STORAGE param1=2, waiting for the ACK armed before the send', async () => {
    const { d, order } = deps(0);
    expect(await eraseAllParameters(d)).toEqual({ ok: true, method: 'preflight-storage' });
    expect(order).toEqual([`await:${MAV_CMD_PREFLIGHT_STORAGE}`, `send:245:${PREFLIGHT_STORAGE_RESET}`]);
    expect(d.setParam).not.toHaveBeenCalled();
  });

  it.each<[number | null, string]>([[2, 'DENIED'], [3, 'UNSUPPORTED'], [null, 'no ACK']])('falls back to FORMAT_VERSION=0 on %s (%s)', async (ack) => {
    const { d, order } = deps(ack);
    expect(await eraseAllParameters(d)).toEqual({ ok: true, method: 'format-version' });
    expect(order.at(-1)).toBe('set:FORMAT_VERSION=0');
  });

  it('reports failure when the fallback write fails too', async () => {
    const { d } = deps(4, false);
    expect(await eraseAllParameters(d)).toEqual({ ok: false });
  });

  it('never writes FORMAT_VERSION when the fallback is off (PX4)', async () => {
    const { d } = deps(4);
    expect(await eraseAllParameters(d, 3000, false)).toEqual({ ok: false });
    expect(d.setParam).not.toHaveBeenCalled();
  });
});
