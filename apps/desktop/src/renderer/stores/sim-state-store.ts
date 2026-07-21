/**
 * Sim State Store
 *
 * Decode-only Zustand store for the ArduDeck in-app simulator. Opens a
 * WebSocket to the headless sim-engine (port reported on ArduPilotSitlStatus
 * as `simStateWsPort`), parses incoming StateMessages, and keeps the latest
 * state per vehicle. The 3D world reads from here; there is NO business logic
 * here beyond connection lifecycle + message ingestion.
 */

import { create } from 'zustand';

// =============================================================================
// Types
// =============================================================================

/**
 * Mirror of the sim-engine `StateMessage` wire type (apps/sim-engine/src/
 * state-ws.ts). Kept local to avoid a renderer → sim-engine import edge; the
 * fields below are validated structurally by `parseStateMessage`.
 */
/** Per-motor force-budget snapshot (physics X-ray). Engine-only; a real FC has
    no such internals, so live-MAVLink vehicles never carry it. */
export interface SimMotorDiag {
  /** Mount (arm) vector from CG, body frame (m). */
  position: [number, number, number];
  /** Thrust this rotor puts into the airframe, body frame (N). */
  thrust: [number, number, number];
  /** Normalized throttle 0..1 after the spin band. */
  command: number;
  /** Scalar rotor lift before momentum drag (N). */
  thrustMag: number;
  /** Motor current (A). */
  current: number;
  /** Induced inflow into the disc (m/s). */
  velocityIn: number;
  /** Bending moment on the arm: |position| * |thrust| (N·m). */
  armMoment: number;
  /** armMoment / maxArmMoment, 0..1. */
  armLoadRatio: number;
}

/** The force/torque budget that drove one step. Rides the WS stream optionally
    (decimated ~15 Hz); a malformed block downgrades to undefined and never drops
    the whole frame. */
export interface SimDiagnostics {
  motors: SimMotorDiag[];
  netThrustBody: [number, number, number];
  netThrustWorld: [number, number, number];
  torqueBody: [number, number, number];
  airframeDragBody: [number, number, number];
  momentumDragBody: [number, number, number];
  loadFactor: number;
  cgBody: [number, number, number];
  cgShift: [number, number, number];
  cgHoverEst: [number, number, number];
  maxArmMoment: number;
  /** Vehicle weight (m*g), N. World direction is +Z (down). 0 if not streamed. */
  weight: number;
  /** Net world force accelerating the airframe (NED): the X-ray resultant. */
  netForceWorld: [number, number, number];
}

/** Suspended-load state for the 3D world (cable line + load mesh, tension-tinted).
    Engine-only; absent when the frame has no slung load. */
export interface SimLoad {
  /** Load position, NED metres from home. */
  position: [number, number, number];
  /** Hardpoint world position (cable's airframe end), NED metres from home. */
  hardpoint: [number, number, number];
  velocity: [number, number, number];
  cableLength: number;
  tension: number;
  attached: boolean;
}

/** One motor's mount in the physical layout (top-down schematic source of
    truth). Engine-only; index 0 = MOT_1. */
export interface SimMotorMount {
  /** Body-forward offset from CG (m); +x points out the nose. */
  x: number;
  /** Body-right offset from CG (m); +y points out the right side. */
  y: number;
  /** Prop spin direction. */
  spin: 'cw' | 'ccw';
}

/** One active per-motor fault (physical failure injected in the sim engine).
    Engine-only; a real FC reports no such field. */
export interface SimFaultReport {
  /** Motor index, MOT_1..N order (0-based). */
  motor: number;
  /** Sub-fault name: motor_out / thrust_loss / imbalance / brownout /
      bearing_drag / asym_drag / outflow_loss. */
  kind: string;
  /** 0..1 "how bad" severity. */
  severity: number;
}

export interface SimStateMessage {
  type: 'state';
  id: string;
  home: { lat: number; lng: number; alt: number; heading: number };
  timestamp: number;
  /** NED metres from home origin (down is +z). */
  position: [number, number, number];
  velocity: [number, number, number];
  /** Body→world, [w, x, y, z]. */
  quaternion: [number, number, number, number];
  euler: { roll: number; pitch: number; yaw: number };
  batteryVoltage?: number;
  /** Normalized average motor output 0..1, drives 3D prop spin. */
  throttle?: number;
  /** Physics X-ray for this frame (optional, engine-only, sticky in the store). */
  diagnostics?: SimDiagnostics;
  /** Suspended-load state (optional, engine-only). */
  load?: SimLoad;
  /** Per-motor rotor lift (N), MOT_1..N order. Engine-only; dims a dead prop. */
  motorThrust?: number[];
  /** Per-motor current (A), MOT_1..N order. Engine-only; tints a hot motor. */
  motorCurrent?: number[];
  /** Motor layout, MOT_1..N order (optional, engine-only). Authoritative source
      for the top-down motor schematic. */
  motors?: SimMotorMount[];
  /** Active injected faults (optional, engine-only). */
  faults?: SimFaultReport[];
}

export type SimConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

/** The six per-motor physical faults the engine accepts on an inbound
    `{"type":"fault",...}` control frame. `outflow_loss` streams back in state
    frames but is not directly injectable, so it is deliberately excluded here. */
export type EngineFaultKind =
  | 'motor_out'
  | 'thrust_loss'
  | 'imbalance'
  | 'brownout'
  | 'bearing_drag'
  | 'asym_drag';

export interface SimStateStore {
  status: SimConnectionStatus;
  /** Port we are connected (or connecting) to, if any. */
  port: number | null;
  /** Latest decoded state, keyed by vehicle id. */
  vehicles: Map<string, SimStateMessage>;
  /** Monotonic counter bumped on every ingest, so consumers can detect change. */
  updateCount: number;

  // Actions
  connect: (port: number) => void;
  disconnect: () => void;
  /** Ingest one already-parsed message (exposed for the WS handler + tests). */
  ingest: (msg: SimStateMessage) => void;

  /** Low-level control send on the live engine socket. JSON-stringifies `obj`
      and writes it only when the socket is OPEN; returns false (never throws)
      when there is no socket, it is not open, or the send fails. */
  sendControl: (obj: unknown) => boolean;
  /** Inject one physical motor fault (motor is 0-based, engine wire order). */
  injectFault: (motor: number, kind: EngineFaultKind, severity: number) => boolean;
  /** Clear all active injected faults. */
  clearFaults: () => boolean;
  /** Attach (or reconfigure, live) a slung payload. Sensible engine defaults fill
      any omitted optional field. */
  attachLoad: (cfg: {
    loadMass: number;
    cableLength: number;
    hardpoint?: [number, number, number];
    loadDragCda?: number;
    stiffness?: number;
    damping?: number;
    winchMin?: number;
    winchMax?: number;
  }) => boolean;
  /** Release the slung load. */
  releaseLoad: () => boolean;
  /** Drive the winch: +rate pays out / lowers, -rate reels in, 0 holds (m/s). */
  setWinch: (rate: number) => boolean;
  /** Set wind live. All fields optional; sends only what changed. `steady` is a
      NED "blows toward" vector (m/s), `intensity` is gust magnitude (m/s), `tau`
      is the gust time constant (s). */
  setWind: (cfg: {
    steady?: [number, number, number];
    intensity?: number;
    tau?: number;
  }) => boolean;
}

// =============================================================================
// Pure helpers (unit-tested)
// =============================================================================

function isNumberTriple(v: unknown): v is [number, number, number] {
  return (
    Array.isArray(v) &&
    v.length === 3 &&
    typeof v[0] === 'number' &&
    typeof v[1] === 'number' &&
    typeof v[2] === 'number'
  );
}

function isNumberQuad(v: unknown): v is [number, number, number, number] {
  return (
    Array.isArray(v) &&
    v.length === 4 &&
    typeof v[0] === 'number' &&
    typeof v[1] === 'number' &&
    typeof v[2] === 'number' &&
    typeof v[3] === 'number'
  );
}

/**
 * Loosely parse the optional diagnostics block. A malformed block DOWNGRADES to
 * `undefined` rather than rejecting the whole frame: motion must always survive a
 * bad overlay. A well-formed block round-trips every field.
 */
export function parseDiagnostics(raw: unknown): SimDiagnostics | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const d = raw as Record<string, unknown>;
  const tri = (v: unknown): [number, number, number] | null => (isNumberTriple(v) ? v : null);

  const netThrustBody = tri(d.netThrustBody);
  const netThrustWorld = tri(d.netThrustWorld);
  const torqueBody = tri(d.torqueBody);
  const airframeDragBody = tri(d.airframeDragBody);
  const momentumDragBody = tri(d.momentumDragBody);
  const cgBody = tri(d.cgBody);
  const cgShift = tri(d.cgShift);
  const cgHoverEst = tri(d.cgHoverEst);
  if (
    !netThrustBody || !netThrustWorld || !torqueBody || !airframeDragBody ||
    !momentumDragBody || !cgBody || !cgShift || !cgHoverEst
  ) {
    return undefined;
  }
  if (typeof d.loadFactor !== 'number' || typeof d.maxArmMoment !== 'number') return undefined;
  if (!Array.isArray(d.motors)) return undefined;

  const motors: SimMotorDiag[] = [];
  for (const rawM of d.motors) {
    if (typeof rawM !== 'object' || rawM === null) return undefined;
    const m = rawM as Record<string, unknown>;
    const position = tri(m.position);
    const thrust = tri(m.thrust);
    if (
      !position || !thrust ||
      typeof m.command !== 'number' || typeof m.thrustMag !== 'number' ||
      typeof m.current !== 'number' || typeof m.velocityIn !== 'number' ||
      typeof m.armMoment !== 'number' || typeof m.armLoadRatio !== 'number'
    ) {
      return undefined;
    }
    motors.push({
      position,
      thrust,
      command: m.command,
      thrustMag: m.thrustMag,
      current: m.current,
      velocityIn: m.velocityIn,
      armMoment: m.armMoment,
      armLoadRatio: m.armLoadRatio,
    });
  }

  return {
    motors,
    netThrustBody,
    netThrustWorld,
    torqueBody,
    airframeDragBody,
    momentumDragBody,
    loadFactor: d.loadFactor,
    cgBody,
    cgShift,
    cgHoverEst,
    maxArmMoment: d.maxArmMoment,
    // Additive fields; tolerate an older engine that does not stream them.
    weight: typeof d.weight === 'number' ? d.weight : 0,
    netForceWorld: tri(d.netForceWorld) ?? [0, 0, 0],
  };
}

/**
 * Loosely parse the optional slung-load block. Malformed => `undefined` (never
 * rejects the frame); well-formed round-trips every field.
 */
export function parseLoad(raw: unknown): SimLoad | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const l = raw as Record<string, unknown>;
  if (!isNumberTriple(l.position) || !isNumberTriple(l.hardpoint) || !isNumberTriple(l.velocity)) {
    return undefined;
  }
  if (
    typeof l.cableLength !== 'number' ||
    typeof l.tension !== 'number' ||
    typeof l.attached !== 'boolean'
  ) {
    return undefined;
  }
  return {
    position: l.position,
    hardpoint: l.hardpoint,
    velocity: l.velocity,
    cableLength: l.cableLength,
    tension: l.tension,
    attached: l.attached,
  };
}

/** A finite number array, or undefined. Malformed downgrades to undefined so a
    bad overlay never drops the motion frame. */
function parseNumberArray(raw: unknown): number[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: number[] = [];
  for (const v of raw) {
    if (typeof v !== 'number') return undefined;
    out.push(v);
  }
  return out;
}

/** Loosely parse the optional motor-layout list. Malformed => undefined (never
    drops the frame); well-formed round-trips every mount. */
export function parseMotors(raw: unknown): SimMotorMount[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: SimMotorMount[] = [];
  for (const rawM of raw) {
    if (typeof rawM !== 'object' || rawM === null) return undefined;
    const m = rawM as Record<string, unknown>;
    if (typeof m.x !== 'number' || typeof m.y !== 'number') return undefined;
    if (m.spin !== 'cw' && m.spin !== 'ccw') return undefined;
    out.push({ x: m.x, y: m.y, spin: m.spin });
  }
  return out;
}

/** Loosely parse the optional active-faults list. Malformed => undefined. */
export function parseFaults(raw: unknown): SimFaultReport[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: SimFaultReport[] = [];
  for (const rawF of raw) {
    if (typeof rawF !== 'object' || rawF === null) return undefined;
    const f = rawF as Record<string, unknown>;
    if (typeof f.motor !== 'number' || typeof f.kind !== 'string' || typeof f.severity !== 'number') {
      return undefined;
    }
    out.push({ motor: f.motor, kind: f.kind, severity: f.severity });
  }
  return out;
}

/**
 * Parse + structurally validate a raw WS payload (JSON string or object) into a
 * SimStateMessage. Returns null for anything that isn't a well-formed state
 * message so a malformed frame can never corrupt the store.
 */
export function parseStateMessage(raw: unknown): SimStateMessage | null {
  let obj: unknown = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof obj !== 'object' || obj === null) return null;
  const m = obj as Record<string, unknown>;
  if (m.type !== 'state') return null;
  if (typeof m.id !== 'string') return null;
  if (typeof m.timestamp !== 'number') return null;
  if (!isNumberTriple(m.position)) return null;
  if (!isNumberTriple(m.velocity)) return null;
  if (!isNumberQuad(m.quaternion)) return null;

  const home = m.home as Record<string, unknown> | undefined;
  if (
    !home ||
    typeof home.lat !== 'number' ||
    typeof home.lng !== 'number' ||
    typeof home.alt !== 'number' ||
    typeof home.heading !== 'number'
  ) {
    return null;
  }

  const euler = m.euler as Record<string, unknown> | undefined;
  if (
    !euler ||
    typeof euler.roll !== 'number' ||
    typeof euler.pitch !== 'number' ||
    typeof euler.yaw !== 'number'
  ) {
    return null;
  }

  return {
    type: 'state',
    id: m.id,
    home: { lat: home.lat, lng: home.lng, alt: home.alt, heading: home.heading },
    timestamp: m.timestamp,
    position: m.position,
    velocity: m.velocity,
    quaternion: m.quaternion,
    euler: { roll: euler.roll, pitch: euler.pitch, yaw: euler.yaw },
    ...(typeof m.batteryVoltage === 'number' ? { batteryVoltage: m.batteryVoltage } : {}),
    ...(typeof m.throttle === 'number' ? { throttle: m.throttle } : {}),
    ...(m.diagnostics !== undefined
      ? (() => {
          const diag = parseDiagnostics(m.diagnostics);
          return diag ? { diagnostics: diag } : {};
        })()
      : {}),
    ...(m.load !== undefined
      ? (() => {
          const load = parseLoad(m.load);
          return load ? { load } : {};
        })()
      : {}),
    ...(m.motorThrust !== undefined
      ? (() => {
          const mt = parseNumberArray(m.motorThrust);
          return mt ? { motorThrust: mt } : {};
        })()
      : {}),
    ...(m.motorCurrent !== undefined
      ? (() => {
          const mc = parseNumberArray(m.motorCurrent);
          return mc ? { motorCurrent: mc } : {};
        })()
      : {}),
    ...(m.motors !== undefined
      ? (() => {
          const motors = parseMotors(m.motors);
          return motors ? { motors } : {};
        })()
      : {}),
    ...(m.faults !== undefined
      ? (() => {
          const faults = parseFaults(m.faults);
          return faults ? { faults } : {};
        })()
      : {}),
  };
}

// =============================================================================
// Store
// =============================================================================

// The live socket is module-scoped, not in the store, so React state stays
// serializable and the WebSocket isn't recreated on every render.
let socket: WebSocket | null = null;

export const useSimStateStore = create<SimStateStore>()((set, get) => ({
  status: 'disconnected',
  port: null,
  vehicles: new Map(),
  updateCount: 0,

  connect: (port: number) => {
    // Already connected/connecting to this port — no-op.
    if (socket && get().port === port && (get().status === 'connected' || get().status === 'connecting')) {
      return;
    }
    // Tear down any prior socket before opening a new one.
    get().disconnect();

    set({ status: 'connecting', port, vehicles: new Map(), updateCount: 0 });

    let ws: WebSocket;
    try {
      ws = new WebSocket(`ws://127.0.0.1:${port}`);
    } catch {
      set({ status: 'error' });
      return;
    }
    socket = ws;

    ws.onopen = () => {
      // Guard against a stale socket finishing its handshake after disconnect.
      if (socket !== ws) return;
      set({ status: 'connected' });
    };
    ws.onmessage = (ev: MessageEvent) => {
      if (socket !== ws) return;
      const msg = parseStateMessage(ev.data);
      if (msg) get().ingest(msg);
    };
    ws.onerror = () => {
      if (socket !== ws) return;
      set({ status: 'error' });
    };
    ws.onclose = () => {
      if (socket !== ws) return;
      socket = null;
      // Only flip to disconnected if we didn't already error out.
      set((s) => (s.status === 'error' ? s : { status: 'disconnected' }));
    };
  },

  disconnect: () => {
    if (socket) {
      const ws = socket;
      socket = null;
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }
    set({ status: 'disconnected', port: null, vehicles: new Map(), updateCount: 0 });
  },

  ingest: (msg: SimStateMessage) => {
    set((s) => {
      const vehicles = new Map(s.vehicles);
      // Sticky diagnostics: the X-ray block streams at ~15 Hz against 60 Hz
      // motion, so carry the last non-null diagnostics forward onto frames that
      // omit it. Motion always updates; the overlay never blinks.
      const prev = s.vehicles.get(msg.id);
      // Sticky overlays: diagnostics (X-ray) and the motor layout can stream at a
      // lower rate than motion, so carry the last-known forward onto frames that
      // omit them. Motion always updates; neither overlay blinks.
      const merged: SimStateMessage = { ...msg };
      if (msg.diagnostics === undefined && prev?.diagnostics) merged.diagnostics = prev.diagnostics;
      if (msg.motors === undefined && prev?.motors) merged.motors = prev.motors;
      vehicles.set(msg.id, merged);
      return { vehicles, updateCount: s.updateCount + 1 };
    });
  },

  sendControl: (obj: unknown) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    try {
      socket.send(JSON.stringify(obj));
      return true;
    } catch {
      return false;
    }
  },

  injectFault: (motor: number, kind: EngineFaultKind, severity: number) =>
    get().sendControl({ type: 'fault', motor, kind, severity }),

  clearFaults: () => get().sendControl({ type: 'clear_faults' }),

  attachLoad: (cfg) => get().sendControl({ type: 'attach_load', ...cfg }),

  releaseLoad: () => get().sendControl({ type: 'release_load' }),

  setWinch: (rate: number) => get().sendControl({ type: 'winch', rate }),

  setWind: (cfg) => get().sendControl({ type: 'set_wind', ...cfg }),
}));
