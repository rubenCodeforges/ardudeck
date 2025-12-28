import { create } from 'zustand';
import type { SavedLayout } from '../../shared/ipc-channels';

interface LayoutState {
  layouts: Record<string, SavedLayout>;
  activeLayoutName: string;
  isLoading: boolean;

  // Actions
  loadLayouts: () => Promise<void>;
  saveLayout: (name: string, data: unknown) => Promise<void>;
  deleteLayout: (name: string) => Promise<void>;
  setActiveLayout: (name: string) => Promise<void>;
  getActiveLayoutData: () => unknown | null;
}

export const useLayoutStore = create<LayoutState>((set, get) => ({
  layouts: {},
  activeLayoutName: 'default',
  isLoading: true,

  loadLayouts: async () => {
    set({ isLoading: true });
    try {
      const [layouts, activeLayoutName] = await Promise.all([
        window.electronAPI?.getAllLayouts() ?? {},
        window.electronAPI?.getActiveLayout() ?? 'default',
      ]);
      set({ layouts, activeLayoutName, isLoading: false });
    } catch (error) {
      console.error('Failed to load layouts:', error);
      set({ isLoading: false });
    }
  },

  saveLayout: async (name: string, data: unknown) => {
    await window.electronAPI?.saveLayout(name, data);
    // Reload layouts to get updated timestamps
    const layouts = await window.electronAPI?.getAllLayouts() ?? {};
    set({ layouts });
  },

  deleteLayout: async (name: string) => {
    await window.electronAPI?.deleteLayout(name);
    const layouts = await window.electronAPI?.getAllLayouts() ?? {};
    const activeLayoutName = await window.electronAPI?.getActiveLayout() ?? 'default';
    set({ layouts, activeLayoutName });
  },

  setActiveLayout: async (name: string) => {
    await window.electronAPI?.setActiveLayout(name);
    set({ activeLayoutName: name });
  },

  getActiveLayoutData: () => {
    const { layouts, activeLayoutName } = get();
    return layouts[activeLayoutName]?.data ?? null;
  },
}));
