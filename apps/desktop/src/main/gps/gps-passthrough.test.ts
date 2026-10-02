import { describe, it, expect, afterEach } from 'vitest';
import net from 'node:net';
import { deserializeSerialControl } from '@ardudeck/mavlink-ts';
import { GpsPassthrough, SERIAL_CONTROL_DEV_GPS1, SERIAL_CONTROL_FLAG as F, type GpsPassthroughEvent } from './gps-passthrough';
import { ubxFrame } from './ubx';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function harness() {
  const sent: ReturnType<typeof deserializeSerialControl>[] = [];
  const events: GpsPassthroughEvent[] = [];
  const pt = new GpsPassthrough({
    send: async (p) => { sent.push(deserializeSerialControl(p)); },
    emit: (e) => events.push(e),
  });
  return { pt, sent, events };
}

/** What ArduPilot sends back with GPS bytes in it. */
function reply(bytes: Uint8Array) {
  const data = new Array<number>(70).fill(0);
  bytes.forEach((b, i) => { data[i] = b; });
  return { baudrate: 0, timeout: 0, device: SERIAL_CONTROL_DEV_GPS1, flags: F.REPLY, count: bytes.length, data };
}

let active: GpsPassthrough | null = null;
afterEach(async () => {
  await active?.stop();
  active = null;
});

describe('GPS passthrough', () => {
  it('opens the GPS port exclusively and keeps polling it', async () => {
    const h = harness();
    active = h.pt;
    await h.pt.start();
    await sleep(60);
    const first = h.sent[0]!;
    expect(first.device).toBe(SERIAL_CONTROL_DEV_GPS1);
    expect(first.flags).toBe(F.EXCLUSIVE | F.RESPOND | F.MULTI);
    expect(first.count).toBe(0);
    expect(h.sent.filter((m) => m.count === 0 && m.flags === (F.EXCLUSIVE | F.RESPOND | F.MULTI)).length).toBeGreaterThan(1);
  });

  it('writes in 70-byte chunks and asks for a response only on the last one', async () => {
    const h = harness();
    active = h.pt;
    await h.pt.start();
    h.sent.length = 0;
    await h.pt.write(new Uint8Array(150).fill(7));
    const chunks = h.sent.filter((m) => m.count > 0 && m.data[0] === 7);
    expect(chunks.map((c) => c.count)).toEqual([70, 70, 10]);
    expect(chunks.map((c) => c.flags)).toEqual([F.EXCLUSIVE, F.EXCLUSIVE, F.EXCLUSIVE | F.RESPOND]);
  });

  it('hands the port back to ArduPilot with flags 0 on stop', async () => {
    const h = harness();
    await h.pt.start();
    await h.pt.stop();
    expect(h.sent.at(-1)).toMatchObject({ flags: 0, count: 0 });
    expect(h.events.at(-1)).toEqual({ kind: 'state', open: false });
  });

  it('decodes satellites out of the replies, ignoring other ports', async () => {
    const h = harness();
    active = h.pt;
    await h.pt.start();
    const p = new Uint8Array(8 + 12);
    p[5] = 1;
    p.set([6, 4, 38, 20], 8);
    const frame = ubxFrame(0x01, 0x35, p);
    h.pt.handleSerialControl({ ...reply(frame), device: 0 });
    h.pt.handleSerialControl(reply(frame.slice(0, 10)));
    h.pt.handleSerialControl(reply(frame.slice(10)));
    const sats = h.events.filter((e) => e.kind === 'sats');
    expect(sats).toHaveLength(1);
    expect(sats[0]).toMatchObject({ sats: [{ gnssId: 6, svId: 4, cno: 38, elevDeg: 20 }] });
  });

  it('bridges u-center over TCP in both directions', async () => {
    const h = harness();
    active = h.pt;
    await h.pt.start();
    const port = 46000 + Math.floor(Math.random() * 1000);
    expect(await h.pt.startBridge(port)).toEqual({ ok: true });

    const client = net.connect(port, '127.0.0.1');
    const received: number[] = [];
    client.on('data', (d) => received.push(...d));
    await new Promise((r) => client.once('connect', r));
    await sleep(20);

    h.pt.handleSerialControl(reply(new Uint8Array([1, 2, 3])));
    client.write(Buffer.from([0x42, 0x43]));
    await sleep(80);

    expect(received).toEqual([1, 2, 3]);
    expect(h.sent.some((m) => m.count === 2 && m.data[0] === 0x42 && m.data[1] === 0x43)).toBe(true);
    client.destroy();
  });
});
