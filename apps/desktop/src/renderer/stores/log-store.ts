import { create } from 'zustand';
import type { HealthCheckResult } from '@ardudeck/dataflash-parser';

export interface LogListEntry {
  id: number;
  numLogs: number;
  lastLogNum: number;
  timeUtc: number;
  size: number;
}

/** Serialized DataFlashLog from the worker (Maps serialized to plain objects) */
export interface ParsedLog {
  formats: Record<number, { id: number; name: string; length: number; format: string; fields: string[] }>;
  messages: Record<string, { type: string; timeUs: number; fields: Record<string, number | string> }[]>;
  metadata: { vehicleType: string; firmwareVersion: string; firmwareString: string; boardType: string; gitHash: string };
  timeRange: { startUs: number; endUs: number };
  messageTypes: string[];
}

interface LogStore {
  // Log list from FC
  availableLogs: LogListEntry[];
  isListLoading: boolean;

  // Current log
  currentLog: ParsedLog | null;
  currentLogPath: string | null;
  isParsingLog: boolean;
  parseProgress: number;

  // Download state
  downloadingLogId: number | null;
  downloadProgress: number;

  // Health report
  healthResults: HealthCheckResult[] | null;

  // Explorer state
  selectedTypes: string[];
  selectedFields: Map<string, string[]>;

  // Tab
  activeTab: 'list' | 'report' | 'explorer';

  // Actions
  setAvailableLogs: (logs: LogListEntry[]) => void;
  setIsListLoading: (loading: boolean) => void;
  setCurrentLog: (log: ParsedLog | null, path: string | null) => void;
  setIsParsingLog: (parsing: boolean) => void;
  setParseProgress: (progress: number) => void;
  setDownloadingLogId: (id: number | null) => void;
  setDownloadProgress: (progress: number) => void;
  setHealthResults: (results: HealthCheckResult[] | null) => void;
  setSelectedTypes: (types: string[]) => void;
  setSelectedFields: (type: string, fields: string[]) => void;
  setActiveTab: (tab: 'list' | 'report' | 'explorer') => void;
  reset: () => void;
}

export const useLogStore = create<LogStore>((set) => ({
  availableLogs: [],
  isListLoading: false,
  currentLog: null,
  currentLogPath: null,
  isParsingLog: false,
  parseProgress: 0,
  downloadingLogId: null,
  downloadProgress: 0,
  healthResults: null,
  selectedTypes: [],
  selectedFields: new Map(),
  activeTab: 'list',

  setAvailableLogs: (logs) => set({ availableLogs: logs }),
  setIsListLoading: (loading) => set({ isListLoading: loading }),
  setCurrentLog: (log, path) => set({ currentLog: log, currentLogPath: path }),
  setIsParsingLog: (parsing) => set({ isParsingLog: parsing }),
  setParseProgress: (progress) => set({ parseProgress: progress }),
  setDownloadingLogId: (id) => set({ downloadingLogId: id }),
  setDownloadProgress: (progress) => set({ downloadProgress: progress }),
  setHealthResults: (results) => set({ healthResults: results }),
  setSelectedTypes: (types) => set({ selectedTypes: types }),
  setSelectedFields: (type, fields) => set((state) => {
    const next = new Map(state.selectedFields);
    next.set(type, fields);
    return { selectedFields: next };
  }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  reset: () => set({
    availableLogs: [],
    isListLoading: false,
    currentLog: null,
    currentLogPath: null,
    isParsingLog: false,
    parseProgress: 0,
    downloadingLogId: null,
    downloadProgress: 0,
    healthResults: null,
    selectedTypes: [],
    selectedFields: new Map(),
    activeTab: 'list',
  }),
}));
