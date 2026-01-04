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

      // Check the platform type to determine if it's a multirotor or plane
      // First try the proper iNav MSP2 command
      let isMultirotor = false;
      try {
        const inavConfig = await withTimeout(window.electronAPI.mspGetInavMixerConfig(), 2000);
        if (inavConfig) {
          // platformType: 0=multirotor, 1=airplane, 2=helicopter, 3=tricopter
          isMultirotor = inavConfig.platformType === 0;
          const platformNames = ['MULTIROTOR', 'AIRPLANE', 'HELICOPTER', 'TRICOPTER', 'ROVER', 'BOAT'];
          console.log('[ServoWizard] iNav platform:', platformNames[inavConfig.platformType] ?? 'UNKNOWN',
            'isMultirotor:', isMultirotor);
        }
      } catch (err) {
        // iNav MSP2 not available - try legacy MSP command
        console.log('[ServoWizard] iNav mixer config not available, trying legacy:', err);
        try {
          const mixerConfig = await withTimeout(window.electronAPI.mspGetMixerConfig(), 2000);
          if (mixerConfig) {
            isMultirotor = mixerConfig.isMultirotor;
            console.log('[ServoWizard] Legacy mixer type:', mixerConfig.mixer, 'isMultirotor:', isMultirotor);
          }
        } catch (legacyErr) {
          // Mixer config not available - assume plane (show all options)
          console.log('[ServoWizard] Legacy mixer config not available:', legacyErr);
        }
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
          set({
            servoSupported: true,
            isCheckingSupport: false,
            isMultirotor,
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
      const configs = await window.electronAPI.mspGetServoConfigs();
      // Load mixer rules
      const mixer = await window.electronAPI.mspGetServoMixer();
      // Load current values
      const values = await window.electronAPI.mspGetServoValues();

      if (values && Array.isArray(values)) {
        set({ servoValues: values });
      }

      // TODO: Parse configs and mixer to detect current aircraft type
      // For now, just start fresh

      console.log('[ServoWizard] Loaded from FC:', { configs, mixer, values });
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

        // Set mixer rules for this servo
        // Note: iNav uses a flat array of mixer rules, not per-servo
        for (let r = 0; r < assignment.mixerRules.length; r++) {
          const rule = assignment.mixerRules[r];
          const mixerResult = await window.electronAPI.mspSetServoMixer(
            assignment.servoIndex * 2 + r, // Rough mapping - may need adjustment
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
            throw new Error(`Failed to set mixer rule for servo ${assignment.servoIndex}`);
          }
        }
      }

      // Save to EEPROM - check return value!
      const saveResult = await window.electronAPI.mspSaveEeprom();
      if (!saveResult) {
        throw new Error('Failed to save to EEPROM');
      }

      set({ isSaving: false });
      console.log('[ServoWizard] Saved to FC successfully');
    } catch (err) {
      let message = err instanceof Error ? err.message : 'Failed to save';

      // Add helpful suggestions based on error type
      if (message.includes('timed out')) {
        message += '. Possible causes: (1) FC not configured as airplane/fixed-wing, (2) iNav version too old, (3) Board has no servo outputs.';
      } else if (message.includes('not supported')) {
        message += '. Your FC firmware may not support servo configuration via MSP.';
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
