import { create } from 'zustand';
import type { DroneCanParam, DroneCanState } from '../../shared/dronecan-types.js';

interface NodeParams {
  params: DroneCanParam[];
  loading: boolean;
  progress: number;
  error: string | null;
}

const inflight = new Map<number, Promise<DroneCanParam[]>>();

interface DroneCanStore {
  state: DroneCanState | null;
  selectedNodeId: number | null;
  paramsByNode: Record<number, NodeParams>;
  init(): () => void;
  start(bus: number): Promise<string | null>;
  stop(): Promise<void>;
  /** Hold monitoring on a bus; it stops when the last holder releases. */
  acquire(bus: number): () => void;
  startError: string | null;
  selectNode(nodeId: number | null, load?: boolean): void;
  /** Concurrent calls for the same node share one bus transfer. Throws the request error code. */
  loadParams(nodeId: number): Promise<DroneCanParam[]>;
  applyWritten(nodeId: number, written: DroneCanParam[]): void;
  saveParams(nodeId: number): Promise<string | null>;
  restartNode(nodeId: number): Promise<string | null>;
}

const api = () => window.electronAPI;

const holders = new Map<number, number>();
let initCount = 0;
let unsubscribeIpc: (() => void) | null = null;
let activeBus: number | null = null;

export const useDroneCanStore = create<DroneCanStore>((set, get) => ({
  state: null,
  selectedNodeId: null,
  paramsByNode: {},
  startError: null,

  acquire(bus) {
    holders.set(bus, (holders.get(bus) ?? 0) + 1);
    if (activeBus !== bus) {
      activeBus = bus;
      void get().start(bus).then((startError) => set({ startError }));
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const left = (holders.get(bus) ?? 1) - 1;
      if (left > 0) { holders.set(bus, left); return; }
      holders.delete(bus);
      if (activeBus !== bus) return;
      const next = holders.keys().next();
      if (next.done) {
        activeBus = null;
        void get().stop();
      } else {
        activeBus = next.value;
        void get().start(next.value).then((startError) => set({ startError }));
      }
    };
  },

  init() {
    if (initCount++ === 0) {
      void api().dronecanGetState().then((state) => state && set({ state }));
      const offState = api().onDronecanState((state) => set({ state }));
      const offProgress = api().onDronecanParamProgress(({ nodeId, count }) => {
        const cur = get().paramsByNode[nodeId];
        if (cur) set({ paramsByNode: { ...get().paramsByNode, [nodeId]: { ...cur, progress: count } } });
      });
      unsubscribeIpc = () => { offState(); offProgress(); };
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (--initCount === 0) unsubscribeIpc?.();
    };
  },

  async start(bus) {
    const res = await api().dronecanStart(bus);
    return res.success ? null : res.error;
  },

  async stop() {
    await api().dronecanStop();
  },

  selectNode(nodeId, load = true) {
    set({ selectedNodeId: nodeId });
    if (load && nodeId !== null && !get().paramsByNode[nodeId]) get().loadParams(nodeId).catch(() => undefined);
  },

  loadParams(nodeId) {
    const running = inflight.get(nodeId);
    if (running) return running;
    const run = (async () => {
      const prev = get().paramsByNode[nodeId];
      set({ paramsByNode: { ...get().paramsByNode, [nodeId]: { params: prev?.params ?? [], loading: true, progress: 0, error: null } } });
      const res = await api().dronecanListParams(nodeId);
      set({
        paramsByNode: {
          ...get().paramsByNode,
          [nodeId]: res.success
            ? { params: res.data, loading: false, progress: res.data.length, error: null }
            : { params: prev?.params ?? [], loading: false, progress: 0, error: res.error },
        },
      });
      if (!res.success) throw new Error(res.error);
      return res.data;
    })().finally(() => inflight.delete(nodeId));
    inflight.set(nodeId, run);
    return run;
  },

  applyWritten(nodeId, written) {
    const cur = get().paramsByNode[nodeId];
    if (!cur || written.length === 0) return;
    const byName = new Map(written.map((w) => [w.name, w]));
    set({
      paramsByNode: {
        ...get().paramsByNode,
        [nodeId]: { ...cur, params: cur.params.map((p) => { const w = byName.get(p.name); return w ? { ...w, index: p.index } : p; }) },
      },
    });
  },

  async saveParams(nodeId) {
    const res = await api().dronecanSaveParams(nodeId);
    if (!res.success) return res.error;
    return res.data ? null : 'rejected';
  },

  async restartNode(nodeId) {
    const res = await api().dronecanRestartNode(nodeId);
    if (!res.success) return res.error;
    const { [nodeId]: _dropped, ...rest } = get().paramsByNode;
    set({ paramsByNode: rest });
    return res.data ? null : 'rejected';
  },
}));
