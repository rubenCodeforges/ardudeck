/**
 * Tests for sim-state-store.ts — the decode-only sim state store. We exercise
 * the pure parser and the ingest/disconnect reducer logic (no real WebSocket).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  useSimStateStore,
  parseStateMessage,
  parseDiagnostics,
  parseLoad,
  parseMotors,
  type SimStateMessage,
  type SimDiagnostics,
  type SimLoad,
  type SimMotorMount,
} from './sim-state-store';

function makeLoad(overrides: Partial<SimLoad> = {}): SimLoad {
  return {
    position: [0, 0, 3.15],
    hardpoint: [0, 0, 0.15],
    velocity: [0, 0, 0],
    cableLength: 3.0,
    tension: 78.5,
    attached: true,
    ...overrides,
  };
}

function makeDiag(overrides: Partial<SimDiagnostics> = {}): SimDiagnostics {
  return {
    motors: [
      { position: [0.2, 0.1, 0], thrust: [0, 0, -5], command: 0.4, thrustMag: 5, current: 2, velocityIn: 1, armMoment: 1.1, armLoadRatio: 1 },
      { position: [-0.2, -0.1, 0], thrust: [0, 0, -4], command: 0.3, thrustMag: 4, current: 1.6, velocityIn: 0.9, armMoment: 0.9, armLoadRatio: 0.8 },
    ],
    netThrustBody: [0, 0, -9],
    netThrustWorld: [0, 0, -9],
    torqueBody: [0.01, 0.02, 0.03],
    airframeDragBody: [0.1, 0, 0],
    momentumDragBody: [0.05, 0, 0],
    loadFactor: 1.0,
    cgBody: [0, 0, 0],
    cgShift: [0, 0, 0],
    cgHoverEst: [0.001, 0, 0],
    maxArmMoment: 1.1,
    weight: 14.7,
    netForceWorld: [0, 0, 0],
    ...overrides,
  };
}

function makeMsg(overrides: Partial<SimStateMessage> = {}): SimStateMessage {
  return {
    type: 'state',
    id: 'v1',
    home: { lat: 42, lng: 19, alt: 0, heading: 270 },
    timestamp: 1.5,
    position: [1, 2, -3],
    velocity: [0.5, 0, -1],
    quaternion: [1, 0, 0, 0],
    euler: { roll: 0, pitch: 0, yaw: 0 },
    ...overrides,
  };
}

beforeEach(() => {
  useSimStateStore.setState({
    status: 'disconnected',
    port: null,
    vehicles: new Map(),
    updateCount: 0,
  });
});

describe('parseStateMessage', () => {
  it('parses a valid JSON string payload', () => {
    const msg = makeMsg({ batteryVoltage: 12.4 });
    const parsed = parseStateMessage(JSON.stringify(msg));
    expect(parsed).not.toBeNull();
    expect(parsed!.id).toBe('v1');
    expect(parsed!.position).toEqual([1, 2, -3]);
    expect(parsed!.batteryVoltage).toBe(12.4);
  });

  it('parses a plain object payload', () => {
    const parsed = parseStateMessage(makeMsg());
    expect(parsed).not.toBeNull();
    expect(parsed!.euler.yaw).toBe(0);
  });

  it('omits batteryVoltage when absent', () => {
    const parsed = parseStateMessage(makeMsg());
    expect(parsed).not.toBeNull();
    expect(parsed!.batteryVoltage).toBeUndefined();
  });

  it('returns null for non-state messages', () => {
    expect(parseStateMessage({ type: 'hello' })).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    expect(parseStateMessage('{not json')).toBeNull();
  });

  it('returns null when position is not a 3-tuple', () => {
    const bad = { ...makeMsg(), position: [1, 2] };
    expect(parseStateMessage(bad)).toBeNull();
  });

  it('returns null when quaternion is not a 4-tuple', () => {
    const bad = { ...makeMsg(), quaternion: [1, 0, 0] };
    expect(parseStateMessage(bad)).toBeNull();
  });

  it('returns null when home is missing fields', () => {
    const bad = { ...makeMsg(), home: { lat: 1, lng: 2 } };
    expect(parseStateMessage(bad)).toBeNull();
  });

  // ─── Fault fields (motorThrust / motorCurrent / faults) decode ─────────────
  it('a legacy healthy frame carries no fault fields', () => {
    const parsed = parseStateMessage(makeMsg());
    expect(parsed).not.toBeNull();
    expect(parsed!.motorThrust).toBeUndefined();
    expect(parsed!.motorCurrent).toBeUndefined();
    expect(parsed!.faults).toBeUndefined();
  });

  it('well-formed fault fields round-trip', () => {
    const parsed = parseStateMessage(
      makeMsg({
        motorThrust: [0, 5.1, 4.8, 5.0],
        motorCurrent: [0, 12, 20, 12],
        faults: [
          { motor: 0, kind: 'motor_out', severity: 1 },
          { motor: 2, kind: 'imbalance', severity: 0.3 },
        ],
      }),
    );
    expect(parsed).not.toBeNull();
    expect(parsed!.motorThrust).toEqual([0, 5.1, 4.8, 5.0]);
    expect(parsed!.motorCurrent![2]).toBe(20);
    expect(parsed!.faults).toHaveLength(2);
    expect(parsed!.faults![0]).toEqual({ motor: 0, kind: 'motor_out', severity: 1 });
  });

  it('a malformed faults block downgrades to undefined but keeps the frame', () => {
    const parsed = parseStateMessage(makeMsg({ faults: [{ motor: 0, kind: 'x' }] as never }));
    expect(parsed).not.toBeNull();
    expect(parsed!.faults).toBeUndefined();
    // Motion is untouched.
    expect(parsed!.position).toEqual([1, 2, -3]);
  });

  // ─── Diagnostics (physics X-ray) decode ────────────────────────────────────
  it('backward compat: a legacy frame with no diagnostics parses fine', () => {
    const parsed = parseStateMessage(makeMsg());
    expect(parsed).not.toBeNull();
    expect(parsed!.diagnostics).toBeUndefined();
  });

  it('a well-formed diagnostics block round-trips every field', () => {
    const parsed = parseStateMessage(makeMsg({ diagnostics: makeDiag() }));
    expect(parsed).not.toBeNull();
    expect(parsed!.diagnostics).toEqual(makeDiag());
    expect(parsed!.diagnostics!.motors).toHaveLength(2);
    expect(parsed!.diagnostics!.loadFactor).toBe(1.0);
  });

  it('a malformed diagnostics block downgrades to undefined but keeps the frame', () => {
    // Missing loadFactor and a broken motor triple, but the frame must survive.
    const bad = { ...makeMsg(), diagnostics: { netThrustBody: [1, 2], motors: 'nope' } };
    const parsed = parseStateMessage(bad);
    expect(parsed).not.toBeNull();
    expect(parsed!.position).toEqual([1, 2, -3]);
    expect(parsed!.diagnostics).toBeUndefined();
  });

  it('parseDiagnostics rejects a bad motor entry', () => {
    const diag = makeDiag();
    // Corrupt a numeric field on one motor.
    (diag.motors[0] as unknown as Record<string, unknown>).command = 'x';
    expect(parseDiagnostics(diag)).toBeUndefined();
  });

  // ─── Slung-load block decode ───────────────────────────────────────────────
  it('a well-formed load block round-trips every field', () => {
    const parsed = parseStateMessage(makeMsg({ load: makeLoad() }));
    expect(parsed).not.toBeNull();
    expect(parsed!.load).toEqual(makeLoad());
  });

  it('a malformed load block downgrades to undefined but keeps the frame', () => {
    const bad = { ...makeMsg(), load: { position: [0, 0], attached: 'yes' } };
    const parsed = parseStateMessage(bad);
    expect(parsed).not.toBeNull();
    expect(parsed!.load).toBeUndefined();
  });

  it('parseLoad requires a boolean attached flag', () => {
    const load = { ...makeLoad(), attached: 1 as unknown as boolean };
    expect(parseLoad(load)).toBeUndefined();
  });

  it('a legacy frame with no load parses fine', () => {
    const parsed = parseStateMessage(makeMsg());
    expect(parsed!.load).toBeUndefined();
  });

  // ─── Motor-layout block decode ─────────────────────────────────────────────
  it('a well-formed motors layout round-trips every mount', () => {
    const motors: SimMotorMount[] = [
      { x: 0.25, y: 0.25, spin: 'cw' },
      { x: -0.25, y: -0.25, spin: 'cw' },
      { x: 0.25, y: -0.25, spin: 'ccw' },
      { x: -0.25, y: 0.25, spin: 'ccw' },
    ];
    const parsed = parseStateMessage(makeMsg({ motors }));
    expect(parsed).not.toBeNull();
    expect(parsed!.motors).toEqual(motors);
    expect(parsed!.motors![2]!.spin).toBe('ccw');
  });

  it('a malformed motors block downgrades to undefined but keeps the frame', () => {
    const bad = { ...makeMsg(), motors: [{ x: 0.2, y: 0.2, spin: 'left' }] };
    const parsed = parseStateMessage(bad);
    expect(parsed).not.toBeNull();
    expect(parsed!.motors).toBeUndefined();
    expect(parsed!.position).toEqual([1, 2, -3]);
  });

  it('parseMotors rejects a mount with a non-numeric coordinate', () => {
    expect(parseMotors([{ x: 0.2, y: 'nope', spin: 'cw' }])).toBeUndefined();
  });

  it('parseMotors rejects a mount with an invalid spin', () => {
    expect(parseMotors([{ x: 0.2, y: 0.2, spin: 'clockwise' }])).toBeUndefined();
  });

  it('a legacy frame with no motors parses fine', () => {
    const parsed = parseStateMessage(makeMsg());
    expect(parsed!.motors).toBeUndefined();
  });
});

describe('ingest reducer', () => {
  it('adds a message to the vehicle map and bumps updateCount', () => {
    useSimStateStore.getState().ingest(makeMsg());
    const s = useSimStateStore.getState();
    expect(s.vehicles.size).toBe(1);
    expect(s.vehicles.get('v1')?.timestamp).toBe(1.5);
    expect(s.updateCount).toBe(1);
  });

  it('replaces an existing vehicle by id (keeps map size, latest wins)', () => {
    const store = useSimStateStore.getState();
    store.ingest(makeMsg({ timestamp: 1 }));
    store.ingest(makeMsg({ timestamp: 2 }));
    const s = useSimStateStore.getState();
    expect(s.vehicles.size).toBe(1);
    expect(s.vehicles.get('v1')?.timestamp).toBe(2);
    expect(s.updateCount).toBe(2);
  });

  it('tracks multiple vehicles independently', () => {
    const store = useSimStateStore.getState();
    store.ingest(makeMsg({ id: 'v1' }));
    store.ingest(makeMsg({ id: 'v2' }));
    const s = useSimStateStore.getState();
    expect(s.vehicles.size).toBe(2);
    expect(new Set(s.vehicles.keys())).toEqual(new Set(['v1', 'v2']));
  });

  it('produces a new Map reference on ingest (immutability for React)', () => {
    const before = useSimStateStore.getState().vehicles;
    useSimStateStore.getState().ingest(makeMsg());
    const after = useSimStateStore.getState().vehicles;
    expect(after).not.toBe(before);
  });

  it('keeps the last-known diagnostics sticky when a later frame omits them', () => {
    const store = useSimStateStore.getState();
    store.ingest(makeMsg({ timestamp: 1, diagnostics: makeDiag() }));
    store.ingest(makeMsg({ timestamp: 2 })); // no diagnostics this frame
    const v = useSimStateStore.getState().vehicles.get('v1');
    expect(v?.timestamp).toBe(2); // motion advanced
    expect(v?.diagnostics).toEqual(makeDiag()); // overlay stuck to last-known
  });

  it('replaces sticky diagnostics when a newer block arrives', () => {
    const store = useSimStateStore.getState();
    store.ingest(makeMsg({ diagnostics: makeDiag() }));
    store.ingest(makeMsg({ diagnostics: makeDiag({ loadFactor: 2.5 }) }));
    const v = useSimStateStore.getState().vehicles.get('v1');
    expect(v?.diagnostics?.loadFactor).toBe(2.5);
  });

  it('keeps the last-known motor layout sticky when a later frame omits it', () => {
    const motors: SimMotorMount[] = [
      { x: 0.25, y: 0.25, spin: 'cw' },
      { x: -0.25, y: -0.25, spin: 'cw' },
    ];
    const store = useSimStateStore.getState();
    store.ingest(makeMsg({ timestamp: 1, motors }));
    store.ingest(makeMsg({ timestamp: 2 })); // no motors this frame
    const v = useSimStateStore.getState().vehicles.get('v1');
    expect(v?.timestamp).toBe(2);
    expect(v?.motors).toEqual(motors);
  });
});

describe('control send path', () => {
  // A minimal WebSocket stand-in: never actually connects, records every send,
  // and lets a test drive readyState + onopen by hand.
  class FakeWS {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSED = 3;
    readyState = FakeWS.CONNECTING;
    sent: string[] = [];
    onopen: (() => void) | null = null;
    onmessage: ((ev: MessageEvent) => void) | null = null;
    onerror: (() => void) | null = null;
    onclose: (() => void) | null = null;
    url: string;
    constructor(url: string) {
      this.url = url;
      FakeWS.last = this;
    }
    send(data: string) {
      this.sent.push(data);
    }
    close() {
      this.readyState = FakeWS.CLOSED;
    }
    static last: FakeWS | null = null;
  }

  beforeEach(() => {
    FakeWS.last = null;
    vi.stubGlobal('WebSocket', FakeWS as unknown as typeof WebSocket);
  });

  afterEach(() => {
    // Null out the module-scoped socket between cases.
    useSimStateStore.getState().disconnect();
    vi.unstubAllGlobals();
  });

  /** Open the fake socket so sendControl will write to it. */
  function openSocket(): FakeWS {
    useSimStateStore.getState().connect(5780);
    const ws = FakeWS.last!;
    ws.readyState = FakeWS.OPEN;
    ws.onopen?.();
    return ws;
  }

  it('sendControl returns false when there is no socket', () => {
    useSimStateStore.getState().disconnect(); // ensure no socket
    expect(useSimStateStore.getState().sendControl({ type: 'clear_faults' })).toBe(false);
  });

  it('sendControl returns false when the socket is not OPEN', () => {
    useSimStateStore.getState().connect(5780); // socket stays CONNECTING
    expect(useSimStateStore.getState().sendControl({ type: 'clear_faults' })).toBe(false);
    expect(FakeWS.last!.sent).toHaveLength(0);
  });

  it('sendControl writes the JSON frame when the socket is OPEN', () => {
    const ws = openSocket();
    const ok = useSimStateStore.getState().sendControl({ type: 'clear_faults' });
    expect(ok).toBe(true);
    expect(ws.sent).toHaveLength(1);
    expect(JSON.parse(ws.sent[0]!)).toEqual({ type: 'clear_faults' });
  });

  it('injectFault sends a well-formed fault frame (0-based motor)', () => {
    const ws = openSocket();
    const ok = useSimStateStore.getState().injectFault(2, 'thrust_loss', 0.6);
    expect(ok).toBe(true);
    expect(JSON.parse(ws.sent[0]!)).toEqual({
      type: 'fault',
      motor: 2,
      kind: 'thrust_loss',
      severity: 0.6,
    });
  });

  it('clearFaults sends a clear_faults frame', () => {
    const ws = openSocket();
    expect(useSimStateStore.getState().clearFaults()).toBe(true);
    expect(JSON.parse(ws.sent[0]!)).toEqual({ type: 'clear_faults' });
  });

  it('attachLoad sends an attach_load frame with only the fields given', () => {
    const ws = openSocket();
    expect(useSimStateStore.getState().attachLoad({ loadMass: 12, cableLength: 3 })).toBe(true);
    expect(JSON.parse(ws.sent[0]!)).toEqual({ type: 'attach_load', loadMass: 12, cableLength: 3 });
  });

  it('attachLoad forwards optional fields when supplied', () => {
    const ws = openSocket();
    useSimStateStore.getState().attachLoad({
      loadMass: 20,
      cableLength: 4,
      hardpoint: [0, 0, 0.1],
      loadDragCda: 0.3,
    });
    expect(JSON.parse(ws.sent[0]!)).toEqual({
      type: 'attach_load',
      loadMass: 20,
      cableLength: 4,
      hardpoint: [0, 0, 0.1],
      loadDragCda: 0.3,
    });
  });

  it('releaseLoad sends a release_load frame', () => {
    const ws = openSocket();
    expect(useSimStateStore.getState().releaseLoad()).toBe(true);
    expect(JSON.parse(ws.sent[0]!)).toEqual({ type: 'release_load' });
  });

  it('setWinch sends a winch frame with the signed rate', () => {
    const ws = openSocket();
    expect(useSimStateStore.getState().setWinch(-0.5)).toBe(true);
    expect(JSON.parse(ws.sent[0]!)).toEqual({ type: 'winch', rate: -0.5 });
  });

  it('setWind sends a set_wind frame with only the fields given', () => {
    const ws = openSocket();
    expect(useSimStateStore.getState().setWind({ intensity: 6 })).toBe(true);
    expect(JSON.parse(ws.sent[0]!)).toEqual({ type: 'set_wind', intensity: 6 });
  });

  it('setWind forwards a steady vector', () => {
    const ws = openSocket();
    useSimStateStore.getState().setWind({ steady: [3, -1, 0], tau: 2 });
    expect(JSON.parse(ws.sent[0]!)).toEqual({ type: 'set_wind', steady: [3, -1, 0], tau: 2 });
  });

  it('sendControl never throws when the underlying send fails', () => {
    const ws = openSocket();
    ws.send = () => {
      throw new Error('socket blew up');
    };
    expect(() => useSimStateStore.getState().sendControl({ type: 'clear_faults' })).not.toThrow();
    expect(useSimStateStore.getState().sendControl({ type: 'clear_faults' })).toBe(false);
  });
});

describe('disconnect reducer', () => {
  it('clears vehicles, resets status and port', () => {
    useSimStateStore.setState({ status: 'connected', port: 5780 });
    useSimStateStore.getState().ingest(makeMsg());
    expect(useSimStateStore.getState().vehicles.size).toBe(1);

    useSimStateStore.getState().disconnect();
    const s = useSimStateStore.getState();
    expect(s.status).toBe('disconnected');
    expect(s.port).toBeNull();
    expect(s.vehicles.size).toBe(0);
    expect(s.updateCount).toBe(0);
  });
});
