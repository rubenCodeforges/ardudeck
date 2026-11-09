import { describe, expect, it, vi } from 'vitest';
import { serializeTerrainRequest, TERRAIN_DATA_ID, deserializeTerrainData } from '@ardudeck/mavlink-ts';
// The real sampler pulls in the tile cache (electron-store); the uplink is tested through its injected sample().
vi.mock('./dem-sampler.js', () => ({ demSampler: { sample: async () => [], clear: () => {} } }));

import { createTerrainUplink, type UplinkDeps, type UplinkStatus } from './terrain-uplink';

function request(mask: bigint, sysid = 1) {
  return { sysid, compid: 1, payload: serializeTerrainRequest({ lat: 450000000, lon: 100000000, gridSpacing: 100, mask }) };
}

function setup(over: Partial<UplinkDeps> = {}) {
  const sent: { msgid: number; payload: Uint8Array }[] = [];
  const statuses: UplinkStatus[] = [];
  let t = 0;
  const deps: UplinkDeps = {
    enabled: () => true,
    sample: async (pts) => pts.map(() => 123.4),
    send: async (msgid, payload) => { sent.push({ msgid, payload }); },
    now: () => t,
    onStatus: (s) => statuses.push(s),
    ...over,
  };
  return { uplink: createTerrainUplink(deps), sent, statuses, advance: (ms: number) => { t += ms; } };
}

describe('terrain uplink', () => {
  it('answers each requested block with a TERRAIN_DATA message echoing the request', async () => {
    const { uplink, sent } = setup();
    await uplink.handleRequest(request(0b11n), 'link');
    expect(sent).toHaveLength(2);
    expect(sent[0]!.msgid).toBe(TERRAIN_DATA_ID);
    const first = deserializeTerrainData(sent[0]!.payload);
    expect(first).toMatchObject({ lat: 450000000, lon: 100000000, gridSpacing: 100, gridbit: 0 });
    expect(first.data).toHaveLength(16);
    expect(first.data.every((h) => h === 123)).toBe(true);
    expect(uplink.statusFor(1)).toMatchObject({ served: 2, missing: 0, unavailable: 0, gaps: 0, errors: 0 });
  });

  it('does not resend a block the vehicle repeats inside the 2 s window, then does after it', async () => {
    const { uplink, sent, advance } = setup();
    await uplink.handleRequest(request(1n), 'link');
    advance(1000);
    await uplink.handleRequest(request(1n), 'link');
    expect(sent).toHaveLength(1);
    advance(1500);
    await uplink.handleRequest(request(1n), 'link');
    expect(sent).toHaveLength(2);
  });

  it('counts a block with no elevation at all as tiles unavailable and sends nothing', async () => {
    const { uplink, sent } = setup({ sample: async (pts) => pts.map(() => null) });
    await uplink.handleRequest(request(0b1n), 'link');
    expect(sent).toHaveLength(0);
    expect(uplink.statusFor(1)).toMatchObject({ served: 0, missing: 1, unavailable: 1, gaps: 0 });
  });

  it('counts a block with only some points missing as a gap and never patches it', async () => {
    const { uplink, sent } = setup({ sample: async (pts) => pts.map((_, i) => (i === 3 ? null : 50)) });
    await uplink.handleRequest(request(0b1n), 'link');
    expect(sent).toHaveLength(0);
    expect(uplink.statusFor(1)).toMatchObject({ missing: 1, unavailable: 0, gaps: 1 });
  });

  it('keeps serving the other blocks after one fails to sample', async () => {
    let call = 0;
    const { uplink, sent } = setup({
      sample: async (pts) => {
        if (call++ === 0) throw new Error('tile fetch exploded');
        return pts.map(() => 10);
      },
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await uplink.handleRequest(request(0b11n), 'link');
    expect(sent).toHaveLength(1);
    expect(uplink.statusFor(1)).toMatchObject({ served: 1, missing: 1, errors: 1 });
  });

  it('never rejects, even when the payload cannot be decoded or the send throws', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { uplink, statuses } = setup({ send: async () => { throw new Error('link closed'); } });
    await expect(uplink.handleRequest({ sysid: 1, compid: 1, payload: new Uint8Array(0) }, 'link')).resolves.toBeUndefined();
    await expect(uplink.handleRequest(request(1n), 'link')).resolves.toBeUndefined();
    expect(uplink.statusFor(1).errors).toBeGreaterThanOrEqual(1);
    expect(statuses.length).toBe(2);
  });

  it('ignores requests while serving is off', async () => {
    const { uplink, sent } = setup({ enabled: () => false });
    await uplink.handleRequest(request(1n), 'link');
    expect(sent).toHaveLength(0);
    expect(uplink.statusFor(1).ignored).toBe(1);
  });

  it('keeps counters per vehicle', async () => {
    const { uplink } = setup();
    await uplink.handleRequest(request(1n, 1), 'link');
    await uplink.handleRequest(request(1n, 2), 'link');
    expect(uplink.statusFor(1).served).toBe(1);
    expect(uplink.statusFor(2).served).toBe(1);
  });
});
