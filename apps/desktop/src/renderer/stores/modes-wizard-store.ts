/**
 * Modes Wizard Store
 *
 * Manages state for the Betaflight/iNav modes configuration wizard.
 * Includes RC polling for live transmitter feedback.
 */

import { create } from 'zustand';
import type { MSPModeRange } from '@ardudeck/msp-ts';
import { PRESETS, type ModePreset } from '../components/modes/presets/mode-presets';

// Wizard steps
export type WizardStep =
  | 'welcome'
  | 'transmitter'
  | 'mode-config'
  | 'review';

// View mode
export type ViewMode = 'wizard' | 'advanced';

interface ModesWizardState {
  // View mode
  viewMode: ViewMode;
  isWizardOpen: boolean;

  // Wizard state
  currentStep: WizardStep;
  selectedPreset: ModePreset | null;
  isCustomSetup: boolean;

  // Mode being configured in wizard (index into preset's wizardModes)
  currentModeIndex: number;

  // Pending mode configurations (working copy)
  pendingModes: MSPModeRange[];

  // Original modes from FC (for comparison/reset)
  originalModes: MSPModeRange[];

  // Live RC channel values (polled from FC)
  rcChannels: number[];
  isPollingRc: boolean;
  rcPollInterval: ReturnType<typeof setInterval> | null;

  // Loading/saving state
  isLoading: boolean;
  isSaving: boolean;
  saveError: string | null;
  loadError: string | null;
  lastSaveSuccess: boolean; // True after successful save, reset on wizard open

  // Transmitter check state
  transmitterConfirmed: boolean;
  channelsDetected: boolean[];

  // Actions - View
  setViewMode: (mode: ViewMode) => void;
  openWizard: () => void;
  closeWizard: () => void;

  // Actions - Wizard Navigation
  setStep: (step: WizardStep) => void;
  nextStep: () => void;
  prevStep: () => void;
  setCurrentModeIndex: (index: number) => void;

  // Actions - Preset
  selectPreset: (presetId: string) => void;
  startCustomSetup: () => void;

  // Actions - Mode Configuration
  updateModeConfig: (index: number, updates: Partial<MSPModeRange>) => void;
  addMode: (boxId: number, auxChannel?: number) => void;
  removeMode: (index: number) => void;
  resetToOriginal: () => void;

  // Actions - RC Polling
  startRcPolling: () => void;
  stopRcPolling: () => void;
  updateRcChannels: (channels: number[]) => void;

  // Actions - FC Communication
  loadFromFC: () => Promise<void>;
  saveToFC: () => Promise<boolean>;

  // Computed - Check if modes have unsaved changes
  hasChanges: () => boolean;

  // Actions - Transmitter Check
  setTransmitterConfirmed: (confirmed: boolean) => void;
  updateChannelDetected: (channelIndex: number, detected: boolean) => void;

  // Actions - Reset
  reset: () => void;
}

// Step order for navigation
const STEP_ORDER: WizardStep[] = ['welcome', 'transmitter', 'mode-config', 'review'];

export const useModesWizardStore = create<ModesWizardState>((set, get) => ({
  // Initial state
  viewMode: 'wizard',
  isWizardOpen: false,

  currentStep: 'welcome',
  selectedPreset: null,
  isCustomSetup: false,

  currentModeIndex: 0,

  pendingModes: [],
  originalModes: [],

  rcChannels: Array(16).fill(1500),
  isPollingRc: false,
  rcPollInterval: null,

  isLoading: false,
  isSaving: false,
  saveError: null,
  loadError: null,
  lastSaveSuccess: false,

  transmitterConfirmed: false,
  channelsDetected: Array(8).fill(false),

  // View actions
  setViewMode: (mode) => set({ viewMode: mode }),

  openWizard: () => {
    set({
      isWizardOpen: true,
      currentStep: 'welcome',
      selectedPreset: null,
      isCustomSetup: false,
      currentModeIndex: 0,
      transmitterConfirmed: false,
      channelsDetected: Array(8).fill(false),
      saveError: null,
      lastSaveSuccess: false,
    });
    // Load current modes from FC
    get().loadFromFC();
  },

  closeWizard: () => {
    get().stopRcPolling();
    set({ isWizardOpen: false });
  },

  // Wizard navigation
  setStep: (step) => set({ currentStep: step }),

  nextStep: () => {
    const { currentStep, selectedPreset, currentModeIndex, isCustomSetup } = get();
    const currentIndex = STEP_ORDER.indexOf(currentStep);

    if (currentStep === 'mode-config' && selectedPreset && !isCustomSetup) {
      // Check if there are more modes to configure
      if (currentModeIndex < selectedPreset.wizardModes.length - 1) {
        set({ currentModeIndex: currentModeIndex + 1 });
        return;
      }
    }

    if (currentIndex < STEP_ORDER.length - 1) {
      set({
        currentStep: STEP_ORDER[currentIndex + 1],
        currentModeIndex: 0,
      });
    }
  },

  prevStep: () => {
    const { currentStep, currentModeIndex } = get();
    const currentIndex = STEP_ORDER.indexOf(currentStep);

    if (currentStep === 'mode-config' && currentModeIndex > 0) {
      set({ currentModeIndex: currentModeIndex - 1 });
      return;
    }

    if (currentIndex > 0) {
      set({ currentStep: STEP_ORDER[currentIndex - 1] });
    }
  },

  setCurrentModeIndex: (index) => set({ currentModeIndex: index }),

  // Preset actions
  selectPreset: (presetId) => {
    const preset = PRESETS[presetId];
    if (preset) {
      set({
        selectedPreset: preset,
        isCustomSetup: false,
        pendingModes: [...preset.modes],
        currentModeIndex: 0,
      });
    }
  },

  startCustomSetup: () => {
    set({
      selectedPreset: null,
      isCustomSetup: true,
      pendingModes: [],
      currentModeIndex: 0,
    });
  },

  // Mode configuration
  updateModeConfig: (index, updates) => {
    const { pendingModes } = get();
    const updated = [...pendingModes];
    if (updated[index]) {
      updated[index] = { ...updated[index], ...updates };
      set({ pendingModes: updated });
    }
  },

  addMode: (boxId, auxChannel = 0) => {
    const { pendingModes } = get();
    const newMode: MSPModeRange = {
      boxId,
      auxChannel,
      rangeStart: 1800,
      rangeEnd: 2100,
    };
    set({ pendingModes: [...pendingModes, newMode] });
  },

  removeMode: (index) => {
    const { pendingModes } = get();
    set({ pendingModes: pendingModes.filter((_, i) => i !== index) });
  },

  resetToOriginal: () => {
    const { originalModes } = get();
    set({ pendingModes: [...originalModes] });
  },

  // RC Polling
  startRcPolling: () => {
    const { isPollingRc, rcPollInterval } = get();
    if (isPollingRc || rcPollInterval) return;

    // BSOD FIX: Track if a request is in progress to prevent stacking
    let rcPollPending = false;

    const interval = setInterval(async () => {
      // BSOD FIX: Skip if previous request still pending (FC slow to respond)
      if (rcPollPending) return;

      rcPollPending = true;
      try {
        const result = await window.electronAPI?.mspGetRc();
        if (result?.channels) {
          get().updateRcChannels(result.channels);
        }
      } catch {
        // Silently ignore polling errors
      } finally {
        rcPollPending = false;
      }
    }, 100); // 10Hz polling

    set({ isPollingRc: true, rcPollInterval: interval });
  },

  stopRcPolling: () => {
    const { rcPollInterval } = get();
    if (rcPollInterval) {
      clearInterval(rcPollInterval);
      set({ isPollingRc: false, rcPollInterval: null });
    }
  },

  updateRcChannels: (channels) => {
    const { channelsDetected, rcChannels: prevChannels } = get();
    const newDetected = [...channelsDetected];

    // Detect if channels have significant movement (for transmitter check)
    for (let i = 0; i < Math.min(channels.length, 8); i++) {
      const delta = Math.abs(channels[i] - 1500);
      if (delta > 100) {
        newDetected[i] = true;
      }
    }

    set({ rcChannels: channels, channelsDetected: newDetected });
  },

  // FC Communication
  loadFromFC: async () => {
    set({ isLoading: true, loadError: null });
    try {
      const modes = await window.electronAPI?.mspGetModeRanges();
      if (modes) {
        // Filter out empty modes (rangeStart === rangeEnd)
        const validModes = (modes as MSPModeRange[]).filter(
          (m) => m.rangeStart !== m.rangeEnd
        );
        set({
          originalModes: validModes,
          pendingModes: [...validModes],
          isLoading: false,
        });
      } else {
        set({ isLoading: false, loadError: 'Failed to load modes from FC' });
      }
    } catch (error) {
      set({
        isLoading: false,
        loadError: error instanceof Error ? error.message : 'Failed to load modes',
      });
    }
  },

  // Check if modes have unsaved changes (compare pending vs original)
  hasChanges: () => {
    const { pendingModes, originalModes } = get();
    if (pendingModes.length !== originalModes.length) return true;
    return pendingModes.some((pending, i) => {
      const original = originalModes[i];
      return (
        pending.boxId !== original.boxId ||
        pending.auxChannel !== original.auxChannel ||
        pending.rangeStart !== original.rangeStart ||
        pending.rangeEnd !== original.rangeEnd
      );
    });
  },

  saveToFC: async () => {
    const { pendingModes } = get();
    set({ isSaving: true, saveError: null });

    try {
      console.log('[ModesWizard] Saving modes to FC...');

      // First, clear existing modes by setting empty ranges
      // We need to clear up to 20 mode slots
      for (let i = 0; i < 20; i++) {
        const success = await window.electronAPI?.mspSetModeRange(i, {
          boxId: 0,
          auxChannel: 0,
          rangeStart: 900,
          rangeEnd: 900, // Same start/end = disabled
        });
        if (!success) {
          throw new Error(`Failed to clear mode slot ${i}`);
        }
      }

      // Set new modes
      for (let i = 0; i < pendingModes.length; i++) {
        const mode = pendingModes[i];
        console.log(`[ModesWizard] Setting mode ${i}: boxId=${mode.boxId} aux=${mode.auxChannel} range=${mode.rangeStart}-${mode.rangeEnd}`);
        const success = await window.electronAPI?.mspSetModeRange(i, mode);
        if (!success) {
          throw new Error(`Failed to set mode ${i}`);
        }
      }

      // Save to EEPROM
      console.log('[ModesWizard] Saving to EEPROM...');
      const eepromSuccess = await window.electronAPI?.mspSaveEeprom();
      if (!eepromSuccess) {
        throw new Error('Modes sent but EEPROM save failed');
      }

      console.log('[ModesWizard] Modes saved successfully');
      set({
        isSaving: false,
        originalModes: [...pendingModes],
        lastSaveSuccess: true,
      });

      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to save modes';
      console.error('[ModesWizard] Save failed:', msg);
      set({
        isSaving: false,
        saveError: msg,
      });
      return false;
    }
  },

  // Transmitter check
  setTransmitterConfirmed: (confirmed) => set({ transmitterConfirmed: confirmed }),

  updateChannelDetected: (channelIndex, detected) => {
    const { channelsDetected } = get();
    const updated = [...channelsDetected];
    updated[channelIndex] = detected;
    set({ channelsDetected: updated });
  },

  // Reset
  reset: () => {
    get().stopRcPolling();
    set({
      viewMode: 'wizard',
      isWizardOpen: false,
      currentStep: 'welcome',
      selectedPreset: null,
      isCustomSetup: false,
      currentModeIndex: 0,
      pendingModes: [],
      originalModes: [],
      rcChannels: Array(16).fill(1500),
      isPollingRc: false,
      rcPollInterval: null,
      isLoading: false,
      isSaving: false,
      saveError: null,
      loadError: null,
      lastSaveSuccess: false,
      transmitterConfirmed: false,
      channelsDetected: Array(8).fill(false),
    });
  },
}));

// Selector hooks for common state slices
export const useCurrentPreset = () => useModesWizardStore((s) => s.selectedPreset);
export const useRcChannels = () => useModesWizardStore((s) => s.rcChannels);
export const usePendingModes = () => useModesWizardStore((s) => s.pendingModes);
export const useIsWizardOpen = () => useModesWizardStore((s) => s.isWizardOpen);
