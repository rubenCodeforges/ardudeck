import { create } from 'zustand';
import type { ConsoleLogEntry } from '../../shared/ipc-channels';
import { useSettingsStore } from './settings-store';

const MAX_LOG_ENTRIES = 500;

interface ConsoleStore {
  logs: ConsoleLogEntry[];
  isExpanded: boolean;
  filter: 'all' | 'info' | 'error' | 'packet';

  addLog: (entry: ConsoleLogEntry) => void;
  clearLogs: () => void;
  setExpanded: (expanded: boolean) => void;
  toggleExpanded: () => void;
  setFilter: (filter: ConsoleStore['filter']) => void;
}

export const useConsoleStore = create<ConsoleStore>((set) => ({
  logs: [],
  isExpanded: false,
  filter: 'all',

  addLog: (entry) => {
    // Drop debug/packet-level logs when showDebugLogs is off
    if ((entry.level === 'debug' || entry.level === 'packet') && !useSettingsStore.getState().showDebugLogs) {
      return;
    }
    set((state) => ({
      logs: [...state.logs.slice(-(MAX_LOG_ENTRIES - 1)), entry],
    }));
  },

  clearLogs: () => set({ logs: [] }),

  setExpanded: (expanded) => set({ isExpanded: expanded }),

  toggleExpanded: () => set((state) => ({ isExpanded: !state.isExpanded })),

  setFilter: (filter) => set({ filter }),
}));
