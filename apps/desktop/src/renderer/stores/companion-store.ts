import { create } from 'zustand';
import type { CompanionConnectionIpcState } from '../../shared/ipc-channels';
import type {
  SystemInfo,
  MetricsData,
  ProcessInfo,
  LogEntry,
  NetworkInfo,
  ContainerInfo,
  ExtensionInfo,
} from '@ardudeck/companion-types';

const MAX_LOG_ENTRIES = 500;

interface CompanionStore {
  // Connection
  connectionState: CompanionConnectionIpcState;
  detected: boolean; // true if companion detected via any layer

  // Layer 1 (MAVLink)
  heartbeatOnline: boolean;
  lastHeartbeat: number | null;
  companionType: string | null;

  // Layer 2 (Agent)
  systemInfo: SystemInfo | null;
  metrics: MetricsData | null;
  processes: ProcessInfo[];
  network: NetworkInfo | null;
  logs: LogEntry[];

  // Layer 3
  containers: ContainerInfo[];
  extensions: ExtensionInfo[];

  // Actions
  setConnectionState: (state: CompanionConnectionIpcState) => void;
  setHeartbeat: (online: boolean, lastSeen: number, type?: string) => void;
  setSystemInfo: (info: SystemInfo) => void;
  setMetrics: (data: MetricsData) => void;
  setProcesses: (data: ProcessInfo[]) => void;
  setNetwork: (data: NetworkInfo) => void;
  addLog: (entry: LogEntry) => void;
  setContainers: (data: ContainerInfo[]) => void;
  setExtensions: (data: ExtensionInfo[]) => void;
  reset: () => void;
}

const initialConnectionState: CompanionConnectionIpcState = {
  state: 'disconnected',
  host: null,
  port: null,
  agentVersion: null,
  protocolVersion: null,
  versionMismatch: false,
  reconnectAttempt: 0,
};

export const useCompanionStore = create<CompanionStore>((set, get) => ({
  connectionState: { ...initialConnectionState },
  detected: false,

  heartbeatOnline: false,
  lastHeartbeat: null,
  companionType: null,

  systemInfo: null,
  metrics: null,
  processes: [],
  network: null,
  logs: [],

  containers: [],
  extensions: [],

  setConnectionState: (state) => set({
    connectionState: state,
    detected: state.state === 'connected' || state.state === 'reconnecting' || get().heartbeatOnline,
  }),

  setHeartbeat: (online, _lastSeen, type) => set({
    heartbeatOnline: online,
    lastHeartbeat: online ? Date.now() : get().lastHeartbeat,
    companionType: type ?? get().companionType,
    detected: online || get().connectionState.state === 'connected',
  }),

  setSystemInfo: (info) => set({ systemInfo: info }),

  setMetrics: (data) => set({ metrics: data }),

  setProcesses: (data) => set({ processes: data }),

  setNetwork: (data) => set({ network: data }),

  addLog: (entry) => set((state) => {
    const logs = [...state.logs, entry];
    if (logs.length > MAX_LOG_ENTRIES) {
      return { logs: logs.slice(-MAX_LOG_ENTRIES) };
    }
    return { logs };
  }),

  setContainers: (data) => set({ containers: data }),

  setExtensions: (data) => set({ extensions: data }),

  reset: () => set({
    connectionState: { ...initialConnectionState },
    detected: false,
    heartbeatOnline: false,
    lastHeartbeat: null,
    companionType: null,
    systemInfo: null,
    metrics: null,
    processes: [],
    network: null,
    logs: [],
    containers: [],
    extensions: [],
  }),
}));
