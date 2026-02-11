import { create } from 'zustand';
import type { AppUpdateInfo, AppUpdateStatus } from '../../shared/ipc-channels';

interface UpdateState {
  currentVersion: string | null;
  status: AppUpdateStatus;
  canAutoUpdate: boolean;
  latestVersion?: string;
  releaseUrl?: string;
  releaseName?: string;
  publishedAt?: string;
  downloadProgress: number;
  bytesDownloaded: number;
  totalBytes: number;
  downloadSpeed: number;
  error?: string;
  dismissed: boolean;
  fetchVersion: () => Promise<void>;
  checkForUpdate: () => Promise<void>;
  downloadUpdate: () => Promise<void>;
  installUpdate: () => Promise<void>;
  openReleaseUrl: () => void;
  dismiss: () => void;
}

export const useUpdateStore = create<UpdateState>((set, get) => {
  // Subscribe to push notifications from main process
  if (typeof window !== 'undefined' && window.electronAPI?.onUpdateStatus) {
    window.electronAPI.onUpdateStatus((info: AppUpdateInfo) => {
      set((prev) => ({
        status: info.status,
        canAutoUpdate: info.canAutoUpdate,
        currentVersion: info.currentVersion || prev.currentVersion,
        latestVersion: info.latestVersion ?? prev.latestVersion,
        releaseUrl: info.releaseUrl ?? prev.releaseUrl,
        releaseName: info.releaseName ?? prev.releaseName,
        publishedAt: info.publishedAt ?? prev.publishedAt,
        downloadProgress: info.downloadProgress ?? 0,
        bytesDownloaded: info.bytesDownloaded ?? 0,
        totalBytes: info.totalBytes ?? 0,
        downloadSpeed: info.downloadSpeed ?? 0,
        error: info.error,
        // Reset dismissed when a new update becomes available
        dismissed: info.status === 'available' ? false : prev.dismissed,
      }));
    });
  }

  return {
    currentVersion: null,
    status: 'idle',
    canAutoUpdate: true,
    downloadProgress: 0,
    bytesDownloaded: 0,
    totalBytes: 0,
    downloadSpeed: 0,
    dismissed: false,

    fetchVersion: async () => {
      if (!window.electronAPI?.getAppVersion) return;
      const version = await window.electronAPI.getAppVersion();
      set({ currentVersion: version });
    },

    checkForUpdate: async () => {
      if (!window.electronAPI?.checkForUpdate) return;
      await window.electronAPI.checkForUpdate();
    },

    downloadUpdate: async () => {
      if (!window.electronAPI?.downloadUpdate) return;
      await window.electronAPI.downloadUpdate();
    },

    installUpdate: async () => {
      if (!window.electronAPI?.installUpdate) return;
      await window.electronAPI.installUpdate();
    },

    openReleaseUrl: () => {
      const { releaseUrl } = get();
      if (releaseUrl && window.electronAPI?.openExternal) {
        window.electronAPI.openExternal(releaseUrl);
      }
    },

    dismiss: () => set({ dismissed: true }),
  };
});
