import { describe, it, expect, beforeEach } from 'vitest';
import { VehicleControl } from './vehicle-control';

let clock = 0;
let sent: { msgid: number; payload: Uint8Array }[] = [];
let vc: VehicleControl;

function heartbeat(opts: { mavType?: number; autopilot?: number; armed?: boolean; mode?: number; sysid?: number }) {
  const p = new Uint8Array(9);
  new DataView(p.buffer).setUint32(0, opts.mode ?? 0, true);
  p[4] = opts.mavType ?? 2;
  p[5] = opts.autopilot ?? 3;
  p[6] = opts.armed ? 0x80 : 0;
  vc.notePacket({ msgid: 0, sysid: opts.sysid ?? 1, compid: 1, payload: p });
}

function ack(command: number, result: number) {
  vc.notePacket({ msgid: 77, sysid: 1, compid: 1, payload: new Uint8Array([command & 0xff, command >> 8, result]) });
}

const guidedCopter = () => heartbeat({ mavType: 2, armed: true, mode: 4 });
const velocity = { kind: 'velocityBody' as const, forward: 2, right: 0, down: -0.5, yawRate: 0.2 };

beforeEach(() => {
  clock = 1000;
  sent = [];
  vc = new VehicleControl(() => clock);
  vc.setBackend({
    target: () => ({ sysid: 1, compid: 1 }),
    send: async (msgid, payload) => { sent.push({ msgid, payload }); return true; },
  });
});

describe('safety gate', () => {
  it('steers an armed copter in Guided', async () => {
    guidedCopter();
    expect(await vc.setpoint('cargo', velocity)).toEqual({ ok: true });
    const { msgid, payload } = sent[0]!;
    const v = new DataView(payload.buffer);
    expect(msgid).toBe(84);
    expect(payload[52]).toBe(9);
    expect(v.getUint16(48, true)).toBe(1479);
    expect(v.getFloat32(16, true)).toBeCloseTo(2);
    expect(v.getFloat32(24, true)).toBeCloseTo(-0.5);
    expect(v.getFloat32(44, true)).toBeCloseTo(0.2);
  });

  it('accepts Plane Guided (mode 15), not Copter Guided numbering on a plane', async () => {
    heartbeat({ mavType: 1, armed: true, mode: 15 });
    expect(vc.guidedState()).toMatchObject({ guided: true, vehicleClass: 'plane' });
    heartbeat({ mavType: 1, armed: true, mode: 4 });
    expect(vc.guidedState().guided).toBe(false);
  });

  it.each([
    ['disarmed', { mavType: 2, armed: false, mode: 4 }, 'vehicle is not armed'],
    ['not Guided', { mavType: 2, armed: true, mode: 5 }, 'vehicle is not in Guided mode'],
    ['PX4', { mavType: 2, autopilot: 12, armed: true, mode: 4 }, 'only ArduPilot vehicles can be steered'],
    ['a rover', { mavType: 10, armed: true, mode: 15 }, 'vehicle type not supported'],
  ])('refuses to steer when %s', async (_name, hb, error) => {
    heartbeat(hb);
    expect(await vc.setpoint('cargo', velocity)).toEqual({ ok: false, error });
    expect(sent).toHaveLength(0);
  });

  it('refuses once the heartbeat is stale', async () => {
    guidedCopter();
    clock += 3500;
    expect((await vc.setpoint('cargo', velocity)).error).toBe('no vehicle');
  });

  it('refuses non-finite values and limits the rate per cargo', async () => {
    guidedCopter();
    expect((await vc.setpoint('a', { ...velocity, forward: NaN })).ok).toBe(false);
    expect((await vc.setpoint('a', velocity)).ok).toBe(true);
    expect((await vc.setpoint('a', velocity)).error).toBe('too fast');
    expect((await vc.setpoint('b', velocity)).ok).toBe(true);
    clock += 25;
    expect((await vc.setpoint('a', velocity)).ok).toBe(true);
  });
});

describe('commands', () => {
  it('never lets a cargo arm, change mode or run arbitrary commands', async () => {
    guidedCopter();
    for (const command of [400, 176, 21, 20, 246]) {
      expect((await vc.command({ command })).ok).toBe(false);
    }
    expect(sent).toHaveLength(0);
  });

  it('aims the camera without Guided, and reports the ACK', async () => {
    heartbeat({ armed: false, mode: 0 });
    const pending = vc.command({ command: 2005, params: [0.4, 0.4, 0.6, 0.6] });
    await Promise.resolve();
    ack(2005, 0);
    expect(await pending).toEqual({ ok: true, result: 0 });
    expect(sent[0]!.msgid).toBe(76);
  });

  it('gates reposition behind Guided and sends it as COMMAND_INT', async () => {
    heartbeat({ armed: true, mode: 5 });
    expect((await vc.command({ command: 192, latitude: 52.1, longitude: 7.2, altitude: 40 })).error).toBe('vehicle is not in Guided mode');
    guidedCopter();
    const pending = vc.command({ command: 192, params: [-1], latitude: 52.1, longitude: 7.2, altitude: 40 });
    await Promise.resolve();
    ack(192, 4);
    expect(await pending).toMatchObject({ ok: false, result: 4 });
    const v = new DataView(sent[0]!.payload.buffer);
    expect(sent[0]!.msgid).toBe(75);
    expect(v.getInt32(16, true)).toBe(521000000);
  });
});

describe('taps', () => {
  it('delivers only the requested messages and survives a throwing listener', () => {
    const got: number[] = [];
    vc.subscribe([30], () => { throw new Error('cargo bug'); });
    const off = vc.subscribe([30, 33], (f) => got.push(f.msgid));
    vc.notePacket({ msgid: 30, sysid: 1, compid: 1, payload: new Uint8Array(28) });
    vc.notePacket({ msgid: 74, sysid: 1, compid: 1, payload: new Uint8Array(20) });
    off();
    vc.notePacket({ msgid: 33, sysid: 1, compid: 1, payload: new Uint8Array(28) });
    expect(got).toEqual([30]);
  });
});
