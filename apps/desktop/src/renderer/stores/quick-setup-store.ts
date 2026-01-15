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

  // Current platform from FC (fetched when wizard opens)
  currentPlatform: number | null;
  currentPlatformName: string | null;

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

  // Platform mismatch state
  platformMismatch: {
    currentPlatform: number;
    currentName: string;
    requiredPlatform: number;
    requiredName: string;
  } | null;
  platformChangeState: 'idle' | 'changing' | 'saving' | 'rebooting' | 'disconnected' | 'error';
  platformChangeError: string | null;

  // Loading state
  isLoading: boolean;
  loadError: string | null;

  // Actions - Wizard
  openWizard: (boardType: BoardType, fcVariant?: string, fcVersion?: string) => Promise<void>;
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

  // Actions - Platform Change
  changePlatform: () => Promise<void>;
  dismissPlatformMismatch: () => void;

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

  currentPlatform: null,
  currentPlatformName: null,

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

  platformMismatch: null,
  platformChangeState: 'idle',
  platformChangeError: null,

  isLoading: false,
  loadError: null,

  // ============================================================================
  // Wizard Actions
  // ============================================================================

  openWizard: async (boardType, fcVariant, fcVersion) => {
    const platformNames = ['Multirotor', 'Airplane', 'Helicopter', 'Tricopter', 'Rover', 'Boat'];

    // Fetch current platform from FC
    let currentPlatform: number | null = null;
    let currentPlatformName: string | null = null;

    try {
      const mixer = await window.electronAPI?.mspGetInavMixerConfig();
      if (mixer) {
        currentPlatform = mixer.platformType;
        currentPlatformName = platformNames[mixer.platformType] ?? 'Unknown';
        console.log(`[QuickSetup] Current platform: ${currentPlatformName} (${currentPlatform})`);
      }
    } catch (err) {
      console.warn('[QuickSetup] Failed to fetch current platform:', err);
    }

    set({
      isOpen: true,
      boardType,
      fcVariant: fcVariant || null,
      fcVersion: fcVersion || null,
      currentPlatform,
      currentPlatformName,
      currentStep: 'welcome',
      selectedVehicle: null,
      selectedPreset: null,
      transmitterConfirmed: false,
      channelsDetected: Array(8).fill(false),
      applyError: null,
      applySuccess: false,
      applyProgress: DEFAULT_PROGRESS,
      platformMismatch: null,
      platformChangeState: 'idle',
      platformChangeError: null,
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
    if (!preset) return;

    const { currentPlatform, currentPlatformName } = get();
    const platformNames = ['Multirotor', 'Airplane', 'Helicopter', 'Tricopter', 'Rover', 'Boat'];

    // Check platform mismatch immediately
    if (currentPlatform !== null && preset.aircraft.platformType !== currentPlatform) {
      const requiredName = platformNames[preset.aircraft.platformType] ?? 'Unknown';
      console.log(`[QuickSetup] Platform mismatch: FC is ${currentPlatformName}, preset needs ${requiredName}`);

      set({
        selectedPreset: preset,
        platformMismatch: {
          currentPlatform,
          currentName: currentPlatformName ?? 'Unknown',
          requiredPlatform: preset.aircraft.platformType,
          requiredName,
        },
      });
    } else {
      // No mismatch, just select the preset
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

  // ============================================================================
  // Platform Change Actions
  // ============================================================================

  changePlatform: async () => {
    const { platformMismatch } = get();
    if (!platformMismatch) return;

    set({ platformChangeState: 'changing', platformChangeError: null });
    useConnectionStore.getState().setPlatformChangeInProgress(true);

    try {
      // 1. Set platform type via MSP
      const success = await window.electronAPI?.mspSetInavPlatformType(platformMismatch.requiredPlatform);
      if (!success) throw new Error('Failed to change platform type');

      // 2. Save to EEPROM
      set({ platformChangeState: 'saving' });
      await window.electronAPI?.mspSaveEeprom();
      await new Promise((r) => setTimeout(r, 200));

      // 3. Reboot - this will disconnect us
      set({ platformChangeState: 'rebooting' });
      window.electronAPI?.mspReboot().catch(() => {});

      // 4. Show disconnected state - user will need to reconnect
      // Wait a moment for the board to start rebooting
      await new Promise((r) => setTimeout(r, 1000));
      set({ platformChangeState: 'disconnected' });

      // 5. Auto-reconnect using the stored connection info
      const reconnected = await reconnectWithRetry({
        maxAttempts: 5,
        attemptDelayMs: 2000,
        initialDelayMs: 4000,
        onAttempt: (attempt, maxAttempts) => {
          console.log(`[QuickSetup] Reconnect attempt ${attempt}/${maxAttempts}`);
        },
      });

      if (reconnected) {
        // Successfully reconnected - update platform state
        console.log('[QuickSetup] Reconnected after platform change, updating platform state');
        const platformNames = ['Multirotor', 'Airplane', 'Helicopter', 'Tricopter', 'Rover', 'Boat'];

        set({
          // Update current platform to the new platform
          currentPlatform: platformMismatch.requiredPlatform,
          currentPlatformName: platformNames[platformMismatch.requiredPlatform] ?? 'Unknown',
          // Clear mismatch state
          platformMismatch: null,
          platformChangeState: 'idle',
          platformChangeError: null,
        });
        useConnectionStore.getState().setPlatformChangeInProgress(false);
        // Flow continues in the UI component which will call nextStep()
      } else {
        // Failed to reconnect - show error
        set({
          platformChangeState: 'error',
          platformChangeError: 'Failed to reconnect after platform change. Please reconnect manually and try again.',
        });
        useConnectionStore.getState().setPlatformChangeInProgress(false);
      }
    } catch (err) {
      console.error('[QuickSetup] Platform change error:', err);
      set({
        platformChangeState: 'error',
        platformChangeError: err instanceof Error ? err.message : 'Unknown error during platform change',
      });
      useConnectionStore.getState().setPlatformChangeInProgress(false);
    }
  },

  dismissPlatformMismatch: () => {
    set({
      platformMismatch: null,
      platformChangeState: 'idle',
      platformChangeError: null,
    });
    useConnectionStore.getState().setPlatformChangeInProgress(false);
  },
}));

// ============================================================================
// Reconnect Helper
// ============================================================================

/**
 * Attempts to reconnect to the board with retries and timeout.
 * Returns true if reconnected, false if timed out.
 *
 * Uses the stored connection info from the connection state to reconnect
 * with the same method (serial/TCP) as the original connection.
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

  // Get the current connection state BEFORE waiting (to capture connection info)
  const prevState = useConnectionStore.getState().connectionState;

  // Determine connection type from the previous connection
  // Priority: 1) isSitl flag, 2) portPath (serial), 3) parse transport string
  let connectOptions: { type: 'serial' | 'tcp'; port?: string; host?: string; tcpPort?: number; protocol?: 'msp' };

  if (prevState.isSitl) {
    // SITL connection - use TCP to localhost
    connectOptions = { type: 'tcp', host: '127.0.0.1', tcpPort: 5760, protocol: 'msp' };
    console.log('[QuickSetup] Will reconnect via TCP (SITL)');
  } else if (prevState.portPath) {
    // Serial connection - use stored port path
    connectOptions = { type: 'serial', port: prevState.portPath, protocol: 'msp' };
    console.log(`[QuickSetup] Will reconnect via serial: ${prevState.portPath}`);
  } else if (prevState.transport) {
    // Parse transport string as fallback
    // Format: "TCP 127.0.0.1:5760" or "/dev/ttyUSB0 @ 115200"
    if (prevState.transport.toLowerCase().startsWith('tcp')) {
      const match = prevState.transport.match(/TCP\s+([^:]+):(\d+)/i);
      if (match) {
        connectOptions = { type: 'tcp', host: match[1], tcpPort: parseInt(match[2], 10), protocol: 'msp' };
        console.log(`[QuickSetup] Will reconnect via TCP: ${match[1]}:${match[2]}`);
      } else {
        // Default TCP
        connectOptions = { type: 'tcp', host: '127.0.0.1', tcpPort: 5760, protocol: 'msp' };
        console.log('[QuickSetup] Will reconnect via TCP (default)');
      }
    } else {
      // Assume serial - extract port from transport string like "/dev/ttyUSB0 @ 115200"
      const port = prevState.transport.split('@')[0]?.trim();
      if (port) {
        connectOptions = { type: 'serial', port, protocol: 'msp' };
        console.log(`[QuickSetup] Will reconnect via serial: ${port}`);
      } else {
        // Last resort - try TCP
        connectOptions = { type: 'tcp', host: '127.0.0.1', tcpPort: 5760, protocol: 'msp' };
        console.log('[QuickSetup] Will reconnect via TCP (fallback)');
      }
    }
  } else {
    // No connection info available - default to TCP (likely SITL dev environment)
    connectOptions = { type: 'tcp', host: '127.0.0.1', tcpPort: 5760, protocol: 'msp' };
    console.log('[QuickSetup] Will reconnect via TCP (no previous connection info)');
  }

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

    // Try to connect with the determined options
    try {
      await window.electronAPI?.connect(connectOptions);

      // Wait a bit and check connection
      await new Promise((r) => setTimeout(r, 500));
      const newState = useConnectionStore.getState().connectionState;
      if (newState.isConnected) {
        console.log('[QuickSetup] Reconnected successfully!');
        // Wait for board to fully initialize after platform change
        // Older F3 boards need more time to stabilize
        console.log('[QuickSetup] Waiting for board to stabilize...');
        await new Promise((r) => setTimeout(r, 2000));
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
    { name: 'Checking platform', status: 'pending' as const },
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
    // CRITICAL: Check connection FIRST before doing anything
    const connState = useConnectionStore.getState().connectionState;
    if (!connState.isConnected) {
      throw new Error('Not connected to flight controller. Please connect first.');
    }

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
        await window.electronAPI?.cliSendRaw('exit\n');
        await new Promise((r) => setTimeout(r, 1000));
      }
    } catch {
      // CLI mode may not be active, that's fine
      console.log('[QuickSetup] CLI exit skipped (may not be in CLI mode)');
    }
    updateTask('completed');
    nextTask();

    // 1. Check Platform Type compatibility
    // If platform doesn't match, show dialog to let user change it
    updateTask('in_progress');
    const currentMixer = await window.electronAPI?.mspGetInavMixerConfig();
    if (currentMixer && currentMixer.platformType !== preset.aircraft.platformType) {
      const platformNames = ['Multirotor', 'Airplane', 'Helicopter', 'Tricopter', 'Rover', 'Boat'];
      const currentName = platformNames[currentMixer.platformType] ?? 'Unknown';
      const requiredName = platformNames[preset.aircraft.platformType] ?? 'Unknown';

      // Set platform mismatch state - UI will show dialog
      set({
        isApplying: false,
        platformMismatch: {
          currentPlatform: currentMixer.platformType,
          currentName,
          requiredPlatform: preset.aircraft.platformType,
          requiredName,
        },
      });
      return false; // Stop applying, user needs to change platform first
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

    // Reset CLI flags before failsafe - servo/motor operations may have entered CLI mode
    console.log('[QuickSetup] Resetting CLI mode flags before failsafe...');
    try {
      await window.electronAPI?.cliExitMode();
      await window.electronAPI?.cliResetAllFlags();
      await new Promise((r) => setTimeout(r, 300));
    } catch {
      // Ignore errors
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
        // Enter CLI mode first
        await window.electronAPI?.cliEnterMode();
        await new Promise((r) => setTimeout(r, 500));

        const procedureName = preset.failsafe.procedure; // 'RTH', 'LAND', or 'DROP'
        const commands = [
          `set failsafe_procedure = ${procedureName}`,
          `set failsafe_delay = ${preset.failsafe.delay * 10}`,
          `set failsafe_off_delay = ${preset.failsafe.offDelay * 10}`,
          `set failsafe_throttle = ${preset.failsafe.throttleLow}`,
        ];
        for (const cmd of commands) {
          await window.electronAPI?.cliSendRaw(cmd + '\n');
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

    // CRITICAL: Reset ALL CLI mode flags before mode operations
    // Previous operations (servo mixer, motor mixer, failsafe) may have entered CLI mode.
    // Reset ALL flags (both cli-handlers and msp-handlers) to ensure MSP operations work.
    console.log('[QuickSetup] Resetting CLI mode flags before mode operations...');
    try {
      await window.electronAPI?.cliExitMode();
      await window.electronAPI?.cliResetAllFlags();
      await new Promise((r) => setTimeout(r, 500));
    } catch {
      // Ignore errors - flags should still be reset
    }

    // 7. Clear old modes
    // Add small delay between operations to prevent MSP command pileup
    updateTask('in_progress');
    for (let i = 0; i < 20; i++) {
      const success = await window.electronAPI?.mspSetModeRange(i, {
        boxId: 0,
        auxChannel: 0,
        rangeStart: 900,
        rangeEnd: 900,
      });
      if (!success) {
        console.warn(`[QuickSetup] Failed to clear mode slot ${i}, continuing...`);
        // Don't throw - continue clearing other slots
      }
      // Small delay between MSP commands to prevent serial buffer overflow
      await new Promise((r) => setTimeout(r, 50));
    }
    updateTask('completed');
    nextTask();

    // 8. Set new modes
    // Add small delay between operations to prevent MSP command pileup
    updateTask('in_progress');
    let modesSetCount = 0;
    for (let i = 0; i < preset.modes.length; i++) {
      const mode = preset.modes[i];
      const success = await window.electronAPI?.mspSetModeRange(i, mode);
      if (!success) {
        console.warn(`[QuickSetup] Failed to set mode ${i}, continuing...`);
        // Don't throw - continue setting other modes
      } else {
        modesSetCount++;
      }
      // Small delay between MSP commands to prevent serial buffer overflow
      await new Promise((r) => setTimeout(r, 50));
    }
    console.log(`[QuickSetup] Set ${modesSetCount}/${preset.modes.length} modes`);
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

    // Enter CLI mode first
    await window.electronAPI?.cliEnterMode();
    await new Promise((r) => setTimeout(r, 500));

    for (const cmd of commands) {
      console.log(`[QuickSetup CLI] Sending: ${cmd}`);
      await window.electronAPI?.cliSendRaw(cmd + '\n');
      // Small delay between commands to let FC process
      await new Promise((r) => setTimeout(r, 50));
    }
    updateTask(0, 'completed');

    // 2. Save configuration
    updateTask(1, 'in_progress');
    await window.electronAPI?.cliSendRaw('save\n');
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
