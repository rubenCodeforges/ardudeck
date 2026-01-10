/**
 * Payload Configuration Store
 *
 * Manages payload settings for CCRP calculations.
 */

import { create } from 'zustand';
import {
  PAYLOAD_PRESETS,
  DEFAULT_PAYLOAD_CONFIG,
  type PayloadPreset,
} from '../utils/ccrp-calculator';

export interface PayloadConfig {
  name: string;
  weightKg: number;
  descentRateMs: number;
}

interface PayloadStore {
  // Current configuration
  config: PayloadConfig;

  // Available presets
  presets: PayloadPreset[];

  // Actions
  setConfig: (config: Partial<PayloadConfig>) => void;
  loadPreset: (presetName: string) => void;
  reset: () => void;
}

export const usePayloadStore = create<PayloadStore>((set) => ({
  config: {
    name: DEFAULT_PAYLOAD_CONFIG.name,
    weightKg: DEFAULT_PAYLOAD_CONFIG.weightKg,
    descentRateMs: DEFAULT_PAYLOAD_CONFIG.descentRateMs,
  },

  presets: PAYLOAD_PRESETS,

  setConfig: (updates) =>
    set((state) => ({
      config: { ...state.config, ...updates },
    })),

  loadPreset: (presetName) => {
    const preset = PAYLOAD_PRESETS.find((p) => p.name === presetName);
    if (preset) {
      set({
        config: {
          name: preset.name,
          weightKg: preset.weightKg,
          descentRateMs: preset.descentRateMs,
        },
      });
    }
  },

  reset: () =>
    set({
      config: {
        name: DEFAULT_PAYLOAD_CONFIG.name,
        weightKg: DEFAULT_PAYLOAD_CONFIG.weightKg,
        descentRateMs: DEFAULT_PAYLOAD_CONFIG.descentRateMs,
      },
    }),
}));
