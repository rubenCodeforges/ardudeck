/**
 * Quick Setup Wizard Store
 *
 * Manages state for the unified Quick Setup wizard that configures
 * all systems at once: PIDs, rates, modes, mixers, and failsafe.
 *
 * Supports both MSP boards (modern) and CLI boards (legacy).
 */

import { create } from 'zustand';
import {
  type QuickSetupPreset,
  QUICK_SETUP_PRESETS,
  generateCliCommands,
  getPresetSummary,
} from '../components/quick-setup/presets/quick-setup-presets';
import { useConnectionStore } from './connection-store';

// ============================================================================
// Types
// ============================================================================

export type QuickSetupStep =
  | 'welcome'      // Preset selection
  | 'transmitter'  // RC check
  | 'review'       // Configuration summary
  | 'apply';       // Applying configuration

export type BoardType = 'msp' | 'cli' | null;
export type VehicleType = 'multirotor' | 'fixed_wing' | null;

export interface ApplyProgress {
  current: number;
  total: number;
  currentTask: string;
  tasks: Array<{
    name: string;
    status: 'pending' | 'in_progress' | 'completed' | 'error';
    error?: string;
  }>;
}

interface QuickSetupState {
  // Wizard visibility
  isOpen: boolean;

  // Board detection
  boardType: BoardType;
  fcVariant: string | null; // 'INAV', 'BTFL', etc.
  fcVersion: string | null;

  // Wizard navigation
  currentStep: QuickSetupStep;
  selectedVehicle: VehicleType;
  selectedPreset: QuickSetupPreset | null;

  // RC state (for transmitter check)
  rcChannels: number[];
  isPollingRc: boolean;
  rcPollInterval: ReturnType<typeof setInterval> | null;
  transmitterConfirmed: boolean;
  channelsDetected: boolean[];

  // Apply state
  isApplying: boolean;
  applyProgress: ApplyProgress;
  applyError: string | null;
  applySuccess: boolean;

  // Loading state
  isLoading: boolean;
  loadError: string | null;

  // Actions - Wizard
  openWizard: (boardType: BoardType, fcVariant?: string, fcVersion?: string) => void;
  closeWizard: () => void;
  reset: () => void;

  // Actions - Navigation
  setStep: (step: QuickSetupStep) => void;
  nextStep: () => void;
  prevStep: () => void;

  // Actions - Vehicle & Preset
  selectVehicle: (vehicleType: VehicleType) => void;
  selectPreset: (presetId: string) => void;

  // Actions - RC Polling
  startRcPolling: () => void;
  stopRcPolling: () => void;
  updateRcChannels: (channels: number[]) => void;
  setTransmitterConfirmed: (confirmed: boolean) => void;

  // Actions - Apply
  applyPreset: () => Promise<boolean>;

  // Computed
  getPresetSummary: () => ReturnType<typeof getPresetSummary> | null;
  canProceed: () => boolean;
}

// Step order for navigation
const STEP_ORDER: QuickSetupStep[] = ['welcome', 'transmitter', 'review', 'apply'];

// Default apply progress
const DEFAULT_PROGRESS: ApplyProgress = {
  current: 0,
  total: 0,
  currentTask: '',
  tasks: [],
};

// ============================================================================
// Store
// ============================================================================

export const useQuickSetupStore = create<QuickSetupState>((set, get) => ({
  // Initial state
  isOpen: false,
  boardType: null,
  fcVariant: null,
  fcVersion: null,

  currentStep: 'welcome',
  selectedVehicle: null,
  selectedPreset: null,

  rcChannels: Array(16).fill(1500),
  isPollingRc: false,
  rcPollInterval: null,
  transmitterConfirmed: false,
  channelsDetected: Array(8).fill(false),

  isApplying: false,
  applyProgress: DEFAULT_PROGRESS,
  applyError: null,
  applySuccess: false,

  isLoading: false,
  loadError: null,

  // ============================================================================
  // Wizard Actions
  // ============================================================================

  openWizard: (boardType, fcVariant, fcVersion) => {
    set({
      isOpen: true,
      boardType,
      fcVariant: fcVariant || null,
      fcVersion: fcVersion || null,
      currentStep: 'welcome',
      selectedVehicle: null,
      selectedPreset: null,
      transmitterConfirmed: false,
      channelsDetected: Array(8).fill(false),
      applyError: null,
      applySuccess: false,
      applyProgress: DEFAULT_PROGRESS,
    });
  },

  closeWizard: () => {
    get().stopRcPolling();
    set({ isOpen: false });
  },

  reset: () => {
    get().stopRcPolling();
    set({
      isOpen: false,
      boardType: null,
      fcVariant: null,
      fcVersion: null,
      currentStep: 'welcome',
      selectedVehicle: null,
      selectedPreset: null,
      rcChannels: Array(16).fill(1500),
      isPollingRc: false,
      rcPollInterval: null,
      transmitterConfirmed: false,
      channelsDetected: Array(8).fill(false),
      isApplying: false,
      applyProgress: DEFAULT_PROGRESS,
      applyError: null,
      applySuccess: false,
      isLoading: false,
      loadError: null,
    });
  },

  // ============================================================================
  // Navigation Actions
  // ============================================================================

  setStep: (step) => set({ currentStep: step }),

  nextStep: () => {
    const { currentStep } = get();
    const currentIndex = STEP_ORDER.indexOf(currentStep);

    if (currentIndex < STEP_ORDER.length - 1) {
      set({ currentStep: STEP_ORDER[currentIndex + 1] });
    }
  },

  prevStep: () => {
    const { currentStep } = get();
    const currentIndex = STEP_ORDER.indexOf(currentStep);

    if (currentIndex > 0) {
      set({ currentStep: STEP_ORDER[currentIndex - 1] });
    }
  },

  // ============================================================================
  // Vehicle & Preset Actions
  // ============================================================================

  selectVehicle: (vehicleType) => {
    set({ selectedVehicle: vehicleType, selectedPreset: null });
  },

  selectPreset: (presetId) => {
    const preset = QUICK_SETUP_PRESETS[presetId];
    if (preset) {
      set({ selectedPreset: preset });
    }
  },

  // ============================================================================
  // RC Polling Actions
  // ============================================================================

  startRcPolling: () => {
    const { isPollingRc, rcPollInterval } = get();
    if (isPollingRc || rcPollInterval) return;

    // BSOD FIX: Track if a request is in progress
    let rcPollPending = false;

    const interval = setInterval(async () => {
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
    const { channelsDetected } = get();
    const newDetected = [...channelsDetected];

    // Detect significant movement
    for (let i = 0; i < Math.min(channels.length, 8); i++) {
      const delta = Math.abs(channels[i] - 1500);
      if (delta > 100) {
        newDetected[i] = true;
      }
    }

    set({ rcChannels: channels, channelsDetected: newDetected });
  },

  setTransmitterConfirmed: (confirmed) => set({ transmitterConfirmed: confirmed }),

  // ============================================================================
  // Apply Actions
  // ============================================================================

  applyPreset: async () => {
    const { selectedPreset, boardType } = get();
    if (!selectedPreset) {
      set({ applyError: 'No preset selected' });
      return false;
    }

    set({
      isApplying: true,
      applyError: null,
      applySuccess: false,
    });

    try {
      if (boardType === 'cli') {
        // CLI-based application (legacy boards)
        return await applyPresetViaCli(selectedPreset, set, get);
      } else {
        // MSP-based application (modern boards)
        return await applyPresetViaMsp(selectedPreset, set, get);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to apply preset';
      console.error('[QuickSetup] Apply failed:', msg);
      set({
        isApplying: false,
        applyError: msg,
      });
      return false;
    }
  },

  // ============================================================================
  // Computed
  // ============================================================================

  getPresetSummary: () => {
    const { selectedPreset } = get();
    if (!selectedPreset) return null;
    return getPresetSummary(selectedPreset);
  },

  canProceed: () => {
    const { currentStep, selectedPreset, transmitterConfirmed, isApplying } = get();

    switch (currentStep) {
      case 'welcome':
        return selectedPreset !== null;
      case 'transmitter':
        return transmitterConfirmed;
      case 'review':
        return selectedPreset !== null;
      case 'apply':
        return !isApplying;
      default:
        return false;
    }
  },
}));

// ============================================================================
// Reconnect Helper
// ============================================================================

/**
 * Attempts to reconnect to the board with retries and timeout.
 * Returns true if reconnected, false if timed out.
 */
async function reconnectWithRetry(options: {
  maxAttempts?: number;
  attemptDelayMs?: number;
  initialDelayMs?: number;
  onAttempt?: (attempt: number, maxAttempts: number) => void;
} = {}): Promise<boolean> {
  const {
    maxAttempts = 5,
    attemptDelayMs = 2000,
    initialDelayMs = 5000, // 5 seconds - older boards can take longer to boot
    onAttempt,
  } = options;

  // Initial delay for board to reboot
  console.log(`[QuickSetup] Waiting ${initialDelayMs}ms for board to reboot...`);
  await new Promise((r) => setTimeout(r, initialDelayMs));

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    onAttempt?.(attempt, maxAttempts);
    console.log(`[QuickSetup] Reconnect attempt ${attempt}/${maxAttempts}...`);

    // Check if already connected
    const state = useConnectionStore.getState().connectionState;
    if (state.isConnected) {
      console.log('[QuickSetup] Already connected!');
      return true;
    }

    // Try to connect
    try {
      // For SITL, use TCP connection
      await window.electronAPI?.connect({ host: '127.0.0.1', tcpPort: 5760 });

      // Wait a bit and check connection
      await new Promise((r) => setTimeout(r, 500));
      const newState = useConnectionStore.getState().connectionState;
      if (newState.isConnected) {
        console.log('[QuickSetup] Reconnected successfully!');
        // Wait for MSP to be ready
        await new Promise((r) => setTimeout(r, 500));
        return true;
      }
    } catch (err) {
      console.warn(`[QuickSetup] Connect attempt ${attempt} failed:`, err);
    }

    // Wait before next attempt
    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, attemptDelayMs));
    }
  }

  console.error('[QuickSetup] Failed to reconnect after all attempts');
  return false;
}

// ============================================================================
// Apply Helpers (MSP)
// ============================================================================

async function applyPresetViaMsp(
  preset: QuickSetupPreset,
  set: (state: Partial<QuickSetupState>) => void,
  _get: () => QuickSetupState
): Promise<boolean> {
  // Determine if we need servo/motor mixer tasks
  const hasServoMixer = preset.aircraft.servoMixerRules.length > 0;
  const hasMotorMixer = preset.aircraft.motorMixerRules.length > 0;

  const tasks = [
    { name: 'Exiting CLI mode', status: 'pending' as const },
    { name: 'Setting platform type', status: 'pending' as const },
    { name: 'Setting PIDs', status: 'pending' as const },
    { name: 'Setting Rates', status: 'pending' as const },
    ...(hasServoMixer ? [{ name: 'Configuring servo mixer', status: 'pending' as const }] : []),
    ...(hasMotorMixer ? [{ name: 'Configuring motor mixer', status: 'pending' as const }] : []),
    { name: 'Setting failsafe', status: 'pending' as const },
    { name: 'Clearing old modes', status: 'pending' as const },
    { name: 'Setting flight modes', status: 'pending' as const },
    { name: 'Saving to EEPROM', status: 'pending' as const },
  ];

  set({
    applyProgress: {
      current: 0,
      total: tasks.length,
      currentTask: '',
      tasks: [...tasks],
    },
  });

  let taskIndex = 0;

  const updateTask = (status: 'in_progress' | 'completed' | 'error', error?: string) => {
    const newTasks = [...tasks];
    newTasks[taskIndex] = { ...newTasks[taskIndex], status, error };
    tasks[taskIndex] = newTasks[taskIndex];
    set({
      applyProgress: {
        current: taskIndex + (status === 'completed' ? 1 : 0),
        total: tasks.length,
        currentTask: newTasks[taskIndex].name,
        tasks: newTasks,
      },
    });
  };

  const nextTask = () => {
    taskIndex++;
  };

  try {
    // 0. Exit CLI mode if active (prevents "MSP blocked - CLI mode active" errors)
    updateTask('in_progress');
    try {
      // Try to exit CLI mode
      await window.electronAPI?.cliExitMode();
      // Wait for FC to process the exit and switch to MSP mode
      await new Promise((r) => setTimeout(r, 500));

      // Verify MSP is working by doing a simple read
      const testRead = await window.electronAPI?.mspGetFcVariant();
      if (!testRead) {
        // Still blocked, try exiting again with longer wait
        console.warn('[QuickSetup] MSP still blocked after CLI exit, retrying...');
        await window.electronAPI?.cliSend('exit\n');
        await new Promise((r) => setTimeout(r, 1000));
      }
    } catch {
      // CLI mode may not be active, that's fine
      console.log('[QuickSetup] CLI exit skipped (may not be in CLI mode)');
    }
    updateTask('completed');
    nextTask();

    // 1. Set Platform Type (Multirotor/Airplane/etc.)
    // Check if platform change is needed - this causes a reboot!
    updateTask('in_progress');
    try {
      const currentMixer = await window.electronAPI?.mspGetInavMixerConfig();
      const currentPlatform = currentMixer?.platformType ?? -1;

      if (currentPlatform !== preset.aircraft.platformType) {
        const platformNames = ['MULTIROTOR', 'AIRPLANE', 'HELICOPTER', 'TRICOPTER', 'ROVER', 'BOAT'];
        const targetPlatformName = platformNames[preset.aircraft.platformType] ?? 'MULTIROTOR';
        console.log(`[QuickSetup] Platform change needed: ${currentPlatform} -> ${preset.aircraft.platformType} (${targetPlatformName})`);

        // Set flag to keep MspConfigView mounted during reboot
        useConnectionStore.getState().setPlatformChangeInProgress(true);

        // Try MSP2 first (modern iNav)
        let platformSuccess = await window.electronAPI?.mspSetInavPlatformType(
          preset.aircraft.platformType
        );

        if (platformSuccess) {
          // MSP2 succeeded - save + reboot
          console.log('[QuickSetup] MSP2 platform set succeeded, saving...');
          await window.electronAPI?.mspSaveEeprom();
          await new Promise((r) => setTimeout(r, 200));

          // Explicitly reboot (required for platform change to take effect!)
          console.log('[QuickSetup] Rebooting board...');
          window.electronAPI?.mspReboot().catch(() => {});
        } else {
          // MSP2 failed - use CLI fallback (works on SITL and older iNav)
          console.warn('[QuickSetup] MSP2 platform set failed, using CLI fallback');
          try {
            await window.electronAPI?.cliSend(`set platform_type = ${targetPlatformName}\n`);
            await new Promise((r) => setTimeout(r, 100));
            // CLI 'save' command triggers reboot automatically
            await window.electronAPI?.cliSend('save\n');
            console.log('[QuickSetup] Platform changed via CLI (save triggers reboot)');
            platformSuccess = true; // CLI succeeded
          } catch (cliErr) {
            console.error('[QuickSetup] CLI platform change failed:', cliErr);
            // Clear flag since we failed completely
            useConnectionStore.getState().setPlatformChangeInProgress(false);
            throw new Error('Failed to change platform type via MSP2 and CLI');
          }
        }

        // Auto-reconnect with retries
        const reconnected = await reconnectWithRetry({
          maxAttempts: 5,
          attemptDelayMs: 2000,
          initialDelayMs: 3000,
          onAttempt: (attempt, max) => {
            // Update task name to show reconnection progress
            const newTasks = [...tasks];
            newTasks[taskIndex] = {
              ...newTasks[taskIndex],
              name: `Reconnecting (${attempt}/${max})...`,
            };
            set({
              applyProgress: {
                current: taskIndex,
                total: tasks.length,
                currentTask: `Reconnecting (${attempt}/${max})...`,
                tasks: newTasks,
              },
            });
          },
        });

        if (!reconnected) {
          useConnectionStore.getState().setPlatformChangeInProgress(false);
          throw new Error('Board did not reconnect after platform change. Please reconnect manually and try again.');
        }
      } else {
        console.log('[QuickSetup] Platform already matches, skipping change');
      }
    } catch (err) {
      console.warn('[QuickSetup] Platform check/change failed:', err);
      // Clear the flag if we set it but failed
      useConnectionStore.getState().setPlatformChangeInProgress(false);
      // Continue anyway - platform might already be correct
    }
    updateTask('completed');
    nextTask();

    // 2. Set PIDs
    updateTask('in_progress');
    const pidSuccess = await window.electronAPI?.mspSetPid({
      roll: preset.pids.roll,
      pitch: preset.pids.pitch,
      yaw: preset.pids.yaw,
    });
    if (!pidSuccess) throw new Error('Failed to set PIDs');
    updateTask('completed');
    nextTask();

    // 3. Set Rates
    updateTask('in_progress');
    const ratesSuccess = await window.electronAPI?.mspSetRcTuning(preset.rates);
    if (!ratesSuccess) throw new Error('Failed to set rates');
    updateTask('completed');
    nextTask();

    // 4. Servo Mixer (if applicable - fixed wing)
    if (hasServoMixer) {
      updateTask('in_progress');
      const servoRules = preset.aircraft.servoMixerRules.map((rule) => ({
        servoIndex: rule.servoIndex,
        inputSource: rule.inputSource,
        rate: rule.rate,
      }));
      const servoSuccess = await window.electronAPI?.mspSetServoMixerCli(servoRules);
      if (!servoSuccess) {
        console.warn('[QuickSetup] Servo mixer via CLI failed, trying MSP fallback');
        // Fallback: try individual servo mixer rules
        for (let i = 0; i < servoRules.length; i++) {
          await window.electronAPI?.mspSetServoMixer(i, servoRules[i]);
        }
      }
      updateTask('completed');
      nextTask();
    }

    // 5. Motor Mixer (if applicable)
    if (hasMotorMixer) {
      updateTask('in_progress');
      const motorRules = preset.aircraft.motorMixerRules.map((rule) => ({
        motorIndex: rule.motorIndex,
        throttle: rule.throttle,
        roll: rule.roll,
        pitch: rule.pitch,
        yaw: rule.yaw,
      }));
      const motorSuccess = await window.electronAPI?.mspSetMotorMixerCli(motorRules);
      if (!motorSuccess) {
        console.warn('[QuickSetup] Motor mixer via CLI failed, trying MSP fallback');
        // Fallback: try MSP motor mixer
        const mspRules = motorRules.map((r) => ({
          throttle: r.throttle,
          roll: r.roll,
          pitch: r.pitch,
          yaw: r.yaw,
        }));
        await window.electronAPI?.mspSetMotorMixer(mspRules);
      }
      updateTask('completed');
      nextTask();
    }

    // 6. Failsafe Configuration
    // Try MSP first with read+merge, fallback to CLI if that fails
    updateTask('in_progress');
    let failsafeSet = false;
    try {
      // Small delay to ensure connection is stable after previous operations
      await new Promise((r) => setTimeout(r, 300));

      // Try to read current config first
      const currentFailsafe = await window.electronAPI?.mspGetFailsafeConfig();

      // Prepare the config - use current values as base, or sensible defaults
      const procedureValue = preset.failsafe.procedure === 'RTH' ? 2 : preset.failsafe.procedure === 'LAND' ? 0 : 1;
      const failsafeConfig = {
        // Base values - either from current config or safe defaults
        failsafeDelay: currentFailsafe?.failsafeDelay ?? 10, // 1 second
        failsafeOffDelay: currentFailsafe?.failsafeOffDelay ?? 20, // 2 seconds
        failsafeThrottle: currentFailsafe?.failsafeThrottle ?? 1000,
        failsafeKillSwitch: currentFailsafe?.failsafeKillSwitch ?? 0,
        failsafeThrottleLowDelay: currentFailsafe?.failsafeThrottleLowDelay ?? 100, // 10 seconds
        failsafeProcedure: procedureValue,
        failsafeRecoveryDelay: currentFailsafe?.failsafeRecoveryDelay ?? 10,
        failsafeFwRollAngle: currentFailsafe?.failsafeFwRollAngle ?? 0,
        failsafeFwPitchAngle: currentFailsafe?.failsafeFwPitchAngle ?? 50, // 5 deg nose down
        failsafeFwYawRate: currentFailsafe?.failsafeFwYawRate ?? 0,
        failsafeStickMotionThreshold: currentFailsafe?.failsafeStickMotionThreshold ?? 50,
        failsafeMinDistance: currentFailsafe?.failsafeMinDistance ?? 0,
        failsafeMinDistanceProcedure: currentFailsafe?.failsafeMinDistanceProcedure ?? 0,
        // Override with preset values
        ...(preset.failsafe.delay !== undefined && { failsafeDelay: preset.failsafe.delay * 10 }),
        ...(preset.failsafe.offDelay !== undefined && { failsafeOffDelay: preset.failsafe.offDelay * 10 }),
        ...(preset.failsafe.throttleLow !== undefined && { failsafeThrottle: preset.failsafe.throttleLow }),
      };

      if (currentFailsafe) {
        console.log('[QuickSetup] Read current failsafe config, merging preset values');
      } else {
        console.log('[QuickSetup] Could not read failsafe config, using defaults');
      }

      const failsafeSuccess = await window.electronAPI?.mspSetFailsafeConfig(failsafeConfig);
      if (failsafeSuccess) {
        console.log('[QuickSetup] Failsafe config set via MSP');
        failsafeSet = true;
      }
    } catch (err) {
      console.warn('[QuickSetup] MSP failsafe failed:', err);
    }

    // CLI fallback if MSP failed
    if (!failsafeSet) {
      console.log('[QuickSetup] Trying CLI fallback for failsafe...');
      try {
        const procedureName = preset.failsafe.procedure; // 'RTH', 'LAND', or 'DROP'
        const commands = [
          `set failsafe_procedure = ${procedureName}`,
          `set failsafe_delay = ${preset.failsafe.delay * 10}`,
          `set failsafe_off_delay = ${preset.failsafe.offDelay * 10}`,
          `set failsafe_throttle = ${preset.failsafe.throttleLow}`,
        ];
        for (const cmd of commands) {
          await window.electronAPI?.cliSend(cmd + '\n');
          await new Promise((r) => setTimeout(r, 50));
        }
        console.log('[QuickSetup] Failsafe set via CLI');
        failsafeSet = true;
      } catch (cliErr) {
        console.warn('[QuickSetup] CLI failsafe also failed:', cliErr);
      }
    }

    if (!failsafeSet) {
      console.warn('[QuickSetup] Could not set failsafe config (both MSP and CLI failed), continuing anyway');
    }
    updateTask('completed');
    nextTask();

    // 7. Clear old modes
    updateTask('in_progress');
    for (let i = 0; i < 20; i++) {
      const success = await window.electronAPI?.mspSetModeRange(i, {
        boxId: 0,
        auxChannel: 0,
        rangeStart: 900,
        rangeEnd: 900,
      });
      if (!success) throw new Error(`Failed to clear mode slot ${i}`);
    }
    updateTask('completed');
    nextTask();

    // 8. Set new modes
    updateTask('in_progress');
    for (let i = 0; i < preset.modes.length; i++) {
      const mode = preset.modes[i];
      const success = await window.electronAPI?.mspSetModeRange(i, mode);
      if (!success) throw new Error(`Failed to set mode ${i}`);
    }
    updateTask('completed');
    nextTask();

    // 9. Save to EEPROM
    updateTask('in_progress');
    const eepromSuccess = await window.electronAPI?.mspSaveEeprom();
    if (!eepromSuccess) throw new Error('Failed to save to EEPROM');
    updateTask('completed');

    // Clear platform change flag
    useConnectionStore.getState().setPlatformChangeInProgress(false);

    set({
      isApplying: false,
      applySuccess: true,
    });

    return true;
  } catch (error) {
    // Clear platform change flag on error too
    useConnectionStore.getState().setPlatformChangeInProgress(false);

    const msg = error instanceof Error ? error.message : 'Apply failed';
    set({
      isApplying: false,
      applyError: msg,
    });
    return false;
  }
}

// ============================================================================
// Apply Helpers (CLI - Legacy Boards)
// ============================================================================

async function applyPresetViaCli(
  preset: QuickSetupPreset,
  set: (state: Partial<QuickSetupState>) => void,
  _get: () => QuickSetupState
): Promise<boolean> {
  const commands = generateCliCommands(preset);

  const tasks = [
    { name: 'Sending CLI commands', status: 'pending' as const },
    { name: 'Saving configuration', status: 'pending' as const },
  ];

  set({
    applyProgress: {
      current: 0,
      total: tasks.length,
      currentTask: '',
      tasks: [...tasks],
    },
  });

  const updateTask = (index: number, status: 'in_progress' | 'completed' | 'error', error?: string) => {
    const newTasks = [...tasks];
    newTasks[index] = { ...newTasks[index], status, error };
    tasks[index] = newTasks[index];
    set({
      applyProgress: {
        current: index + (status === 'completed' ? 1 : 0),
        total: tasks.length,
        currentTask: newTasks[index].name,
        tasks: newTasks,
      },
    });
  };

  try {
    // 1. Send CLI commands
    updateTask(0, 'in_progress');
    for (const cmd of commands) {
      console.log(`[QuickSetup CLI] Sending: ${cmd}`);
      await window.electronAPI?.cliSend(cmd + '\n');
      // Small delay between commands to let FC process
      await new Promise((r) => setTimeout(r, 50));
    }
    updateTask(0, 'completed');

    // 2. Save configuration
    updateTask(1, 'in_progress');
    await window.electronAPI?.cliSend('save\n');
    // Wait for save to complete (FC reboots)
    await new Promise((r) => setTimeout(r, 2000));
    updateTask(1, 'completed');

    set({
      isApplying: false,
      applySuccess: true,
    });

    return true;
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'CLI apply failed';
    set({
      isApplying: false,
      applyError: msg,
    });
    return false;
  }
}

// ============================================================================
// Selector Hooks
// ============================================================================

export const useQuickSetupOpen = () => useQuickSetupStore((s) => s.isOpen);
export const useQuickSetupPreset = () => useQuickSetupStore((s) => s.selectedPreset);
export const useQuickSetupStep = () => useQuickSetupStore((s) => s.currentStep);
export const useQuickSetupProgress = () => useQuickSetupStore((s) => s.applyProgress);
