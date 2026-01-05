/**
 * Servo Wizard Store
 *
 * Manages state for the Servo Setup Wizard.
 * Handles step progression, aircraft type selection, servo assignments,
 * and live servo polling.
 */

import { create } from 'zustand';
import {
  AircraftPreset,
  ControlSurfaceAssignment,
  getDefaultAssignments,
  getPreset,
} from '../components/servo-wizard/presets/servo-presets';

// Wizard steps
export type WizardStep = 'aircraft' | 'assign' | 'test' | 'endpoints' | 'review';

const STEPS: WizardStep[] = ['aircraft', 'assign', 'test', 'endpoints', 'review'];

export const STEP_INFO: Record<WizardStep, { label: string; icon: string; description: string }> = {
  aircraft: { label: 'Aircraft', icon: '✈️', description: 'Select your aircraft type' },
  assign: { label: 'Assign', icon: '🔧', description: 'Map servos to control surfaces' },
  test: { label: 'Test', icon: '🎮', description: 'Verify servo movement' },
  endpoints: { label: 'Calibrate', icon: '📏', description: 'Adjust servo limits' },
  review: { label: 'Save', icon: '💾', description: 'Review and save' },
};

interface ServoWizardState {
  // Wizard state
  isOpen: boolean;
  currentStep: WizardStep;
  currentStepIndex: number;

  // Servo support detection
  servoSupported: boolean | null; // null = not checked yet
  isCheckingSupport: boolean;
  supportError: string | null;
  isMultirotor: boolean; // true = quad/hex (gimbal only), false = plane (all options)
  detectedMixerType: number | null; // Legacy mixer type for auto-detection
  msp2PlatformType: number | null; // MSP2 platformType (0=MULTI, 1=AIRPLANE, etc.) - authoritative

  // Servo range limits (old iNav: 750-2250, modern: 500-2500)
  servoRangeLimits: { min: number; max: number };
  usesCliFallback: boolean; // true if old board using CLI for servo config

  // Aircraft selection
  selectedPresetId: string | null;
  selectedPreset: AircraftPreset | null;

  // Servo assignments
  assignments: ControlSurfaceAssignment[];
  originalAssignments: ControlSurfaceAssignment[]; // For revert

  // Live servo values (from polling)
  servoValues: number[];
  isPollingServos: boolean;
  servoPollInterval: ReturnType<typeof setInterval> | null;

  // Saving state
  isSaving: boolean;
  saveError: string | null;

  // Actions
  openWizard: () => void;
  closeWizard: () => void;
  checkServoSupport: () => Promise<void>;
  nextStep: () => void;
  prevStep: () => void;
  goToStep: (step: WizardStep) => void;

  selectAircraftType: (presetId: string) => void;
  updateAssignment: (index: number, updates: Partial<ControlSurfaceAssignment>) => void;
  reverseServo: (index: number) => void;

  startServoPolling: () => void;
  stopServoPolling: () => void;

  loadFromFC: () => Promise<void>;
  saveToFC: () => Promise<void>;
  reset: () => void;
}

export const useServoWizardStore = create<ServoWizardState>((set, get) => ({
  // Initial state
  isOpen: false,
  currentStep: 'aircraft',
  currentStepIndex: 0,

  // Servo support
  servoSupported: null,
  isCheckingSupport: false,
  supportError: null,
  isMultirotor: false,
  detectedMixerType: null,
  msp2PlatformType: null,

  // Default to modern iNav range limits (500-2500)
  servoRangeLimits: { min: 500, max: 2500 },
  usesCliFallback: false,

  selectedPresetId: null,
  selectedPreset: null,

  assignments: [],
  originalAssignments: [],

  servoValues: new Array(9).fill(1500),
  isPollingServos: false,
  servoPollInterval: null,

  isSaving: false,
  saveError: null,

  // Open the wizard
  openWizard: () => {
    set({
      isOpen: true,
      currentStep: 'aircraft',
      currentStepIndex: 0,
      selectedPresetId: null,
      selectedPreset: null,
      assignments: [],
      saveError: null,
      servoSupported: null,
      supportError: null,
    });
    // Check servo support and load config
    get().checkServoSupport();
  },

  // Check if FC supports servo commands and detect platform type
  checkServoSupport: async () => {
    set({ isCheckingSupport: true, supportError: null });

    try {
      // Helper to create fresh timeout promise each time
      const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> => {
        return Promise.race([
          promise,
          new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms)),
        ]);
      };

      // Check platform type and mixer type
      // MSP2 platformType is authoritative for platform detection
      // Legacy mixer type is used for auto-detecting aircraft preset (flying_wing vs traditional)
      let isMultirotor = false;
      let msp2PlatformWorked = false;
      let msp2PlatformType: number | null = null;
      let detectedMixerType: number | null = null;

      // First try MSP2 for platform type - this is authoritative
      try {
        const inavConfig = await withTimeout(window.electronAPI.mspGetInavMixerConfig(), 2000);
        if (inavConfig) {
          msp2PlatformType = inavConfig.platformType;
          isMultirotor = inavConfig.platformType === 0; // 0 = MULTIROTOR
          msp2PlatformWorked = true;
          const platformNames = ['MULTIROTOR', 'AIRPLANE', 'HELICOPTER', 'TRICOPTER', 'ROVER', 'BOAT'];
          console.log('[ServoWizard] iNav platform:', platformNames[inavConfig.platformType] ?? 'UNKNOWN', '(MSP2 authoritative)');
        }
      } catch (err) {
        console.log('[ServoWizard] iNav MSP2 not available:', err);
      }

      // Read legacy mixer config for auto-detection of aircraft preset
      // Only use legacy isMultirotor as FALLBACK if MSP2 didn't work
      try {
        const mixerConfig = await withTimeout(window.electronAPI.mspGetMixerConfig(), 2000);
        if (mixerConfig) {
          detectedMixerType = mixerConfig.mixer ?? null;
          // Only use legacy isMultirotor if MSP2 failed
          if (!msp2PlatformWorked && detectedMixerType !== null) {
            isMultirotor = mixerConfig.isMultirotor;
            console.log('[ServoWizard] Using legacy mixer for platform detection');
          }
          console.log('[ServoWizard] Mixer type:', detectedMixerType, 'isMultirotor:', isMultirotor);
        }
      } catch (legacyErr) {
        console.log('[ServoWizard] Legacy mixer config not available:', legacyErr);
      }

      // For multirotors, check if SERVO_TILT feature is enabled (bit 5)
      // Without this feature, gimbal servos won't work on quads
      if (isMultirotor) {
        try {
          const features = await withTimeout(window.electronAPI.mspGetFeatures(), 2000);
          const hasServoTilt = features !== null && (features & (1 << 5)) !== 0;
          console.log('[ServoWizard] Features:', features, 'hasServoTilt:', hasServoTilt);

          if (!hasServoTilt) {
            set({
              servoSupported: false,
              isCheckingSupport: false,
              isMultirotor: true,
              supportError: 'Servo outputs are not available on this board in multirotor mode. This is a hardware limitation - not all flight controller boards can output servo signals when configured as a quad/hex.',
            });
            return;
          }
        } catch (err) {
          console.log('[ServoWizard] Could not check features:', err);
        }
      }

      // Check if servo configs are available
      try {
        const configs = await withTimeout(window.electronAPI.mspGetServoConfigs(), 2000);

        if (configs && Array.isArray(configs) && configs.length > 0) {
          // Fetch servo config mode (CLI fallback status and valid ranges)
          let servoRangeLimits = { min: 500, max: 2500 }; // Default to modern iNav
          let usesCliFallback = false;
          console.log('[ServoWizard] About to probe servo config mode...');
          try {
            const configMode = await window.electronAPI.mspGetServoConfigMode();
            console.log('[ServoWizard] Probe result:', configMode);
            if (configMode) {
              servoRangeLimits = { min: configMode.minValue, max: configMode.maxValue };
              usesCliFallback = configMode.usesCli;
              console.log('[ServoWizard] Servo config mode:', usesCliFallback ? 'CLI fallback' : 'MSP', 'range:', servoRangeLimits.min, '-', servoRangeLimits.max);
            } else {
              console.log('[ServoWizard] configMode is null/undefined');
            }
          } catch (err) {
            console.log('[ServoWizard] Could not get servo config mode:', err);
          }
          console.log('[ServoWizard] Final limits:', servoRangeLimits, 'usesCli:', usesCliFallback);

          set({
            servoSupported: true,
            isCheckingSupport: false,
            isMultirotor,
            detectedMixerType,
            msp2PlatformType,
            servoRangeLimits,
            usesCliFallback,
          });
          // Load current config from FC
          get().loadFromFC();
        } else {
          set({
            servoSupported: false,
            isCheckingSupport: false,
            isMultirotor,
            supportError: isMultirotor
              ? 'No servo outputs available on this board for gimbal control.'
              : 'No servo outputs detected. Ensure your board supports servos.',
          });
        }
      } catch (err) {
        // Servo configs not available - show error
        console.log('[ServoWizard] Servo config not available:', err);
        set({
          servoSupported: false,
          isCheckingSupport: false,
          isMultirotor,
          supportError: 'Servo configuration not supported on this firmware. iNav 2.0.0 may be too old - try updating to a newer version.',
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('[ServoWizard] Check failed:', message);

      set({
        servoSupported: false,
        isCheckingSupport: false,
        supportError: 'Failed to check servo support. Please try again.',
      });
    }
  },

  // Close the wizard
  closeWizard: () => {
    get().stopServoPolling();
    set({
      isOpen: false,
      currentStep: 'aircraft',
      currentStepIndex: 0,
    });
  },

  // Navigate to next step
  nextStep: () => {
    const { currentStepIndex } = get();
    if (currentStepIndex < STEPS.length - 1) {
      const newIndex = currentStepIndex + 1;
      set({
        currentStep: STEPS[newIndex],
        currentStepIndex: newIndex,
      });

      // Start polling when entering test step
      if (STEPS[newIndex] === 'test' || STEPS[newIndex] === 'endpoints') {
        get().startServoPolling();
      }
    }
  },

  // Navigate to previous step
  prevStep: () => {
    const { currentStepIndex } = get();
    if (currentStepIndex > 0) {
      const newIndex = currentStepIndex - 1;
      set({
        currentStep: STEPS[newIndex],
        currentStepIndex: newIndex,
      });

      // Stop polling when leaving test/endpoints steps
      const prevStep = STEPS[newIndex];
      if (prevStep !== 'test' && prevStep !== 'endpoints') {
        get().stopServoPolling();
      }
    }
  },

  // Jump to specific step
  goToStep: (step: WizardStep) => {
    const index = STEPS.indexOf(step);
    if (index !== -1) {
      set({
        currentStep: step,
        currentStepIndex: index,
      });

      // Manage polling based on step
      if (step === 'test' || step === 'endpoints') {
        get().startServoPolling();
      } else {
        get().stopServoPolling();
      }
    }
  },

  // Select aircraft type and load default assignments
  // Also sets the platform type on the FC so it knows it's a plane/wing/etc.
  selectAircraftType: async (presetId: string) => {
    const preset = getPreset(presetId);
    if (!preset) return;

    const assignments = getDefaultAssignments(presetId);
    set({
      selectedPresetId: presetId,
      selectedPreset: preset,
      assignments,
      originalAssignments: JSON.parse(JSON.stringify(assignments)),
    });

    // Set the platform type on the FC so it's configured as the right aircraft type
    // This is critical - without it, the FC might think it's a quad!
    // The backend handles MSP2 -> CLI fallback automatically for old iNav
    const platformNames = ['MULTIROTOR', 'AIRPLANE', 'HELICOPTER', 'TRICOPTER', 'ROVER', 'BOAT'];
    const platformName = platformNames[preset.platformType] ?? 'UNKNOWN';

    try {
      console.log(`[ServoWizard] Setting platform to ${platformName} (${preset.platformType}) for ${preset.name}`);

      // Use mspSetInavPlatformType - it has CLI fallback for old iNav built-in
      const success = await window.electronAPI.mspSetInavPlatformType(preset.platformType);
      if (success) {
        console.log(`[ServoWizard] Platform type set successfully`);
        // Update local state to reflect the change
        set({ isMultirotor: preset.platformType === 0 });
      } else {
        // Both MSP2 and CLI fallback failed
        console.error(`[ServoWizard] Failed to set platform type (MSP2 + CLI both failed)`);
        // Show user a helpful message
        set({
          supportError: `Could not change platform to ${platformName}. For iNav 2.0.0, you may need to use iNav Configurator to change the mixer type, then reconnect.`,
        });
      }
    } catch (err) {
      console.error('[ServoWizard] Error setting platform type:', err);
      set({
        supportError: `Error changing platform: ${err instanceof Error ? err.message : 'Unknown error'}. Try using iNav Configurator to change the mixer type.`,
      });
    }
  },

  // Update a specific assignment
  updateAssignment: (index: number, updates: Partial<ControlSurfaceAssignment>) => {
    set((state) => ({
      assignments: state.assignments.map((a, i) =>
        i === index ? { ...a, ...updates } : a
      ),
    }));
  },

  // Reverse a servo (negate all mixer rule rates)
  reverseServo: (index: number) => {
    set((state) => ({
      assignments: state.assignments.map((a, i) => {
        if (i !== index) return a;
        return {
          ...a,
          reversed: !a.reversed,
          mixerRules: a.mixerRules.map((rule) => ({
            ...rule,
            rate: -rule.rate,
          })),
        };
      }),
    }));
  },

  // Start polling servo values at 100ms intervals
  startServoPolling: () => {
    const { isPollingServos } = get();
    if (isPollingServos) return;

    const pollServoValues = async () => {
      try {
        const values = await window.electronAPI.mspGetServoValues();
        if (values && Array.isArray(values)) {
          set({ servoValues: values });
        }
      } catch (err) {
        console.warn('[ServoWizard] Failed to poll servo values:', err);
      }
    };

    // Initial poll
    pollServoValues();

    // Start interval
    const interval = setInterval(pollServoValues, 100);
    set({
      isPollingServos: true,
      servoPollInterval: interval,
    });
  },

  // Stop polling servo values
  stopServoPolling: () => {
    const { servoPollInterval } = get();
    if (servoPollInterval) {
      clearInterval(servoPollInterval);
    }
    set({
      isPollingServos: false,
      servoPollInterval: null,
    });
  },

  // Load current servo config from flight controller
  loadFromFC: async () => {
    try {
      // Load servo configs (PWM settings)
      let configs = null;
      try {
        configs = await window.electronAPI.mspGetServoConfigs();
      } catch (err) {
        console.warn('[ServoWizard] Failed to get servo configs:', err);
      }

      // Load mixer rules (MSP2 - may not be supported on old iNav)
      let mixer = null;
      try {
        mixer = await window.electronAPI.mspGetServoMixer();
      } catch (err) {
        console.warn('[ServoWizard] Servo mixer not supported (old iNav?):', err);
      }

      // Load current values
      let values = null;
      try {
        values = await window.electronAPI.mspGetServoValues();
      } catch (err) {
        console.warn('[ServoWizard] Failed to get servo values:', err);
      }

      if (values && Array.isArray(values)) {
        set({ servoValues: values });
      }

      console.log('[ServoWizard] Loaded from FC:', { configs, mixer, values });

      // Auto-detect aircraft type from mixer type OR platform type
      const { detectedMixerType, msp2PlatformType } = get();

      // Map iNav mixer types to our preset IDs
      const mixerToPreset: Record<number, string> = {
        8: 'flying_wing',    // FLYING_WING
        14: 'traditional',   // AIRPLANE
        24: 'traditional',   // CUSTOM_AIRPLANE
      };

      // Try mixer type first
      let presetId: string | null = detectedMixerType !== null ? (mixerToPreset[detectedMixerType] ?? null) : null;

      // FALLBACK: If no preset from mixer type, use MSP2 platformType
      // On old iNav 2.0.0, mixer type may return wrong value but platformType is correct
      if (!presetId && msp2PlatformType !== null) {
        if (msp2PlatformType === 1) {
          // platformType 1 = AIRPLANE → default to traditional
          presetId = 'traditional';
          console.log('[ServoWizard] Defaulting to traditional preset for AIRPLANE platform');
        }
      }

      if (presetId) {
        console.log('[ServoWizard] Auto-detected preset:', presetId, 'from mixer type:', detectedMixerType, 'platform:', msp2PlatformType);

        // Get the preset and create assignments
        const preset = getPreset(presetId);
        if (preset) {
          const defaultAssignments = getDefaultAssignments(presetId);

          // Apply actual FC values to assignments if we have them
          if (configs && Array.isArray(configs)) {
            for (const assignment of defaultAssignments) {
              const fcConfig = configs[assignment.servoIndex] as { min?: number; max?: number; middle?: number } | undefined;
              if (fcConfig) {
                // Use FC values if they look valid (not all zeros or defaults)
                if (fcConfig.min !== undefined && fcConfig.min > 0) {
                  assignment.min = fcConfig.min;
                }
                if (fcConfig.max !== undefined && fcConfig.max > 0) {
                  assignment.max = fcConfig.max;
                }
                if (fcConfig.middle !== undefined && fcConfig.middle > 0) {
                  assignment.center = fcConfig.middle;
                }
                console.log(`[ServoWizard] Servo ${assignment.servoIndex} from FC: min=${assignment.min}, center=${assignment.center}, max=${assignment.max}`);
              }
            }
          }

          set({
            selectedPresetId: presetId,
            selectedPreset: preset,
            assignments: defaultAssignments,
            originalAssignments: JSON.parse(JSON.stringify(defaultAssignments)),
          });
        }
      } else {
        console.log('[ServoWizard] Unknown mixer type:', detectedMixerType, 'platform:', msp2PlatformType, '- user must select manually');
      }
    } catch (err) {
      console.error('[ServoWizard] Failed to load from FC:', err);
    }
  },

  // Save servo config to flight controller
  saveToFC: async () => {
    const { assignments } = get();
    set({ isSaving: true, saveError: null });

    try {
      // Apply each assignment's servo config
      for (let i = 0; i < assignments.length; i++) {
        const assignment = assignments[i];

        // Set servo PWM config - check return value!
        const configResult = await window.electronAPI.mspSetServoConfig(assignment.servoIndex, {
          min: assignment.min,
          max: assignment.max,
          middle: assignment.center,
          rate: 100,
          forwardFromChannel: 255, // Disabled
          reversedSources: 0,
        });

        if (!configResult) {
          throw new Error(`Failed to set servo ${assignment.servoIndex} config`);
        }

        // Set mixer rules for this servo (MSP2 - not supported on old iNav)
        // Skip entirely if using CLI fallback - old iNav uses default mixer rules
        const { usesCliFallback: usingCli } = get();
        if (!usingCli && assignment.mixerRules.length > 0) {
          for (let r = 0; r < assignment.mixerRules.length; r++) {
            const rule = assignment.mixerRules[r];
            const mixerResult = await window.electronAPI.mspSetServoMixer(
              assignment.servoIndex * 2 + r,
              {
                targetChannel: assignment.servoIndex,
                inputSource: rule.inputSource,
                rate: rule.rate,
                speed: 0,
                min: 0,
                max: 100,
                box: 0,
              }
            );

            if (!mixerResult) {
              // Don't throw - mixer rules via MSP2 may not be supported
              console.log('[ServoWizard] Mixer rules skipped (MSP2 not supported)');
              break;
            }
          }
        }
      }

      // Save to EEPROM - try MSP first, then CLI fallback
      // If servo config used CLI (old iNav), we need CLI save which reboots
      let saveResult = false;
      try {
        saveResult = await window.electronAPI.mspSaveEeprom();
      } catch {
        console.log('[ServoWizard] MSP save failed, trying CLI fallback...');
      }

      if (!saveResult) {
        // Try CLI save (for old iNav where servo config used CLI)
        // This will save and reboot the board
        const cliSaveResult = await window.electronAPI.mspSaveServoCli();
        if (!cliSaveResult) {
          throw new Error('Failed to save to EEPROM');
        }
        console.log('[ServoWizard] Saved via CLI (board will reboot)');
      }

      // Fetch updated servo config mode (CLI fallback may have been triggered)
      // This updates the range limits for the UI
      try {
        const configMode = await window.electronAPI.mspGetServoConfigMode();
        if (configMode) {
          set({
            servoRangeLimits: { min: configMode.minValue, max: configMode.maxValue },
            usesCliFallback: configMode.usesCli,
          });
          console.log('[ServoWizard] Updated config mode:', configMode.usesCli ? 'CLI' : 'MSP', 'range:', configMode.minValue, '-', configMode.maxValue);
        }
      } catch (err) {
        console.log('[ServoWizard] Could not update servo config mode:', err);
      }

      set({ isSaving: false });
      console.log('[ServoWizard] Saved to FC successfully');
    } catch (err) {
      let message = err instanceof Error ? err.message : 'Failed to save';

      // Add helpful suggestions based on error type
      if (message.includes('timed out')) {
        message += '. Possible causes: (1) FC not configured as airplane/fixed-wing, (2) iNav version too old, (3) Board has no servo outputs.';
      } else if (message.includes('not supported')) {
        message += '. Your FC firmware may not support servo configuration via MSP. Try using iNav Configurator CLI.';
      }

      set({ isSaving: false, saveError: message });
      console.error('[ServoWizard] Failed to save to FC:', err);
      // Re-throw so component can catch it
      throw err;
    }
  },

  // Reset wizard state
  reset: () => {
    get().stopServoPolling();
    set({
      isOpen: false,
      currentStep: 'aircraft',
      currentStepIndex: 0,
      servoSupported: null,
      isCheckingSupport: false,
      supportError: null,
      isMultirotor: false,
      detectedMixerType: null,
      msp2PlatformType: null,
      servoRangeLimits: { min: 500, max: 2500 },
      usesCliFallback: false,
      selectedPresetId: null,
      selectedPreset: null,
      assignments: [],
      originalAssignments: [],
      servoValues: new Array(9).fill(1500),
      isSaving: false,
      saveError: null,
    });
  },
}));
