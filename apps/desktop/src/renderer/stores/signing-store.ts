import { create } from 'zustand';
import type { SigningStatus } from '../../shared/ipc-channels.js';

interface SigningStore {
  // State
  enabled: boolean;
  hasKey: boolean;
  sentToFc: boolean;
  keyFingerprint: string | null;
  loading: boolean;
  error: string | null;

  // Actions
  loadStatus: () => Promise<void>;
  setKey: (passphrase: string) => Promise<boolean>;
  enable: () => Promise<boolean>;
  disable: () => Promise<void>;
  sendToFc: () => Promise<boolean>;
  removeKey: () => Promise<void>;
  updateFromStatus: (status: SigningStatus) => void;
}

export const useSigningStore = create<SigningStore>((set, get) => ({
  enabled: false,
  hasKey: false,
  sentToFc: false,
  keyFingerprint: null,
  loading: false,
  error: null,

  loadStatus: async () => {
    try {
      const status = await window.electronAPI?.signingGetStatus();
      if (status) {
        set({
          enabled: status.enabled,
          hasKey: status.hasKey,
          sentToFc: status.sentToFc,
          keyFingerprint: status.keyFingerprint ?? null,
        });
      }
    } catch {
      // Ignore load errors
    }
  },

  setKey: async (passphrase: string) => {
    set({ loading: true, error: null });
    try {
      const result = await window.electronAPI?.signingSetKey(passphrase);
      if (result?.success) {
        set({ hasKey: true, loading: false });
        return true;
      }
      set({ loading: false, error: result?.error || 'Failed to set key' });
      return false;
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : 'Unknown error' });
      return false;
    }
  },

  enable: async () => {
    set({ loading: true, error: null });
    try {
      const result = await window.electronAPI?.signingEnable();
      if (result?.success) {
        set({ enabled: true, loading: false });
        return true;
      }
      set({ loading: false, error: result?.error || 'Failed to enable signing' });
      return false;
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : 'Unknown error' });
      return false;
    }
  },

  disable: async () => {
    set({ loading: true, error: null });
    try {
      await window.electronAPI?.signingDisable();
      set({ enabled: false, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  sendToFc: async () => {
    set({ loading: true, error: null });
    try {
      const result = await window.electronAPI?.signingSendToFc();
      if (result?.success) {
        set({ sentToFc: true, loading: false });
        return true;
      }
      set({ loading: false, error: result?.error || 'Failed to send to FC' });
      return false;
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : 'Unknown error' });
      return false;
    }
  },

  removeKey: async () => {
    set({ loading: true, error: null });
    try {
      await window.electronAPI?.signingRemoveKey();
      set({ enabled: false, hasKey: false, sentToFc: false, keyFingerprint: null, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  updateFromStatus: (status: SigningStatus) => {
    set({
      enabled: status.enabled,
      hasKey: status.hasKey,
      sentToFc: status.sentToFc,
      keyFingerprint: status.keyFingerprint ?? null,
    });
  },
}));

// Listen for signing status updates from main process
export function initSigningListener(): () => void {
  const unsub = window.electronAPI?.onSigningStatus((status) => {
    useSigningStore.getState().updateFromStatus(status);
  });
  // Load initial status
  useSigningStore.getState().loadStatus();
  return unsub || (() => {});
}
