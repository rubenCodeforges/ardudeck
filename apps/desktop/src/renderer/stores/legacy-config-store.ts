/**
 * Legacy Config Store
 *
 * Parses CLI dump output and provides structured data for legacy F3 boards.
 * All configuration is done via CLI commands - no MSP write support.
 *
 * Parses:
 * - PID values (set p_roll, i_roll, d_roll, etc.)
 * - Rate values (set roll_rate, pitch_rate, yaw_rate, rc_expo, etc.)
 * - Motor mixer (mmix 0 1.000 0.000 0.000 0.000)
 * - Servo mixer (smix 0 3 0 100 0 0 100 0)
 * - Servo config (servo 0 1000 2000 1500 100)
 * - Aux modes (aux 0 0 0 1700 2100 0)
 * - Features (feature GPS, feature -TELEMETRY)
 */

import { create } from 'zustand';

// =============================================================================
// Types
// =============================================================================

export interface LegacyPidConfig {
  roll: { p: number; i: number; d: number; ff?: number };
  pitch: { p: number; i: number; d: number; ff?: number };
  yaw: { p: number; i: number; d: number; ff?: number };
  // Fixed-wing PIDs
  level?: { p: number; i: number; d: number };
  altHold?: { p: number; i: number; d: number };
  posHold?: { p: number; i: number; d: number };
  navRate?: { p: number; i: number; d: number };
}

export interface LegacyRatesConfig {
  rollRate: number;
  pitchRate: number;
  yawRate: number;
  rcExpo: number;
  rcYawExpo: number;
  rcRate: number;
  throttleMid: number;
  throttleExpo: number;
  tpaRate: number;
  tpaBreakpoint: number;
}

export interface LegacyMotorMix {
  index: number;
  throttle: number;
  roll: number;
  pitch: number;
  yaw: number;
}

export interface LegacyServoMix {
  index: number;
  targetChannel: number;
  inputSource: number;
  rate: number;
  speed: number;
  min: number;
  max: number;
  box: number;
}

export interface LegacyServoConfig {
  index: number;
  min: number;
  max: number;
  mid: number;
  rate: number;
}

export interface LegacyAuxMode {
  index: number;
  modeId: number;
  auxChannel: number;
  rangeStart: number;
  rangeEnd: number;
  logic: number;
}

// Platform type: 0=multirotor, 1=airplane (fixed-wing)
export type PlatformType = 'multirotor' | 'airplane';

// Reboot state machine
export type RebootState = 'idle' | 'saving' | 'rebooting' | 'reconnecting' | 'done' | 'error';

export interface LegacyConfigStore {
  // State
  isLoading: boolean;
  error: string | null;
  hasChanges: boolean;

  // Reboot/reconnect state
  rebootState: RebootState;
  rebootMessage: string;
  rebootError: string | null;

  // Raw dump output
  rawDump: string;

  // Platform type (detected from dump)
  platformType: PlatformType;

  // Parsed config
  pid: LegacyPidConfig | null;
  rates: LegacyRatesConfig | null;
  motorMixer: LegacyMotorMix[];
  servoMixer: LegacyServoMix[];
  servoConfigs: LegacyServoConfig[];
  auxModes: LegacyAuxMode[];
  features: Set<string>;

  // All set parameters (key=value map)
  parameters: Map<string, string>;

  // Actions
  loadConfig: () => Promise<void>;
  saveToEeprom: () => Promise<void>;

  // Update actions (mark hasChanges)
  updatePid: (pid: LegacyPidConfig) => void;
  updateRates: (rates: LegacyRatesConfig) => void;
  updateMotorMix: (index: number, mix: LegacyMotorMix) => void;
  updateServoMix: (index: number, mix: LegacyServoMix) => void;
  updateServoConfig: (index: number, config: LegacyServoConfig) => void;
  updateAuxMode: (index: number, mode: LegacyAuxMode) => void;

  // Add/remove actions for mixers
  addMotorMix: () => LegacyMotorMix;
  removeMotorMix: (index: number) => void;
  addServoMix: () => LegacyServoMix;
  removeServoMix: (index: number) => void;

  // Reboot/reconnect actions
  setRebootState: (state: RebootState, message?: string) => void;
  setRebootError: (error: string) => void;
  clearRebootState: () => void;

  // Reset
  reset: () => void;
}

// =============================================================================
// Parsers
// =============================================================================

function parseDump(dump: string): {
  pid: LegacyPidConfig;
  rates: LegacyRatesConfig;
  motorMixer: LegacyMotorMix[];
  servoMixer: LegacyServoMix[];
  servoConfigs: LegacyServoConfig[];
  auxModes: LegacyAuxMode[];
  features: Set<string>;
  parameters: Map<string, string>;
  platformType: PlatformType;
} {
  const lines = dump.split('\n');
  const parameters = new Map<string, string>();
  const motorMixer: LegacyMotorMix[] = [];
  const servoMixer: LegacyServoMix[] = [];
  const servoConfigs: LegacyServoConfig[] = [];
  const auxModes: LegacyAuxMode[] = [];
  const features = new Set<string>();

  for (const line of lines) {
    const trimmed = line.trim();

    // Parse set commands: set param_name = value
    const setMatch = trimmed.match(/^set\s+(\S+)\s*=\s*(.*)$/);
    if (setMatch) {
      const [, name, value] = setMatch;
      parameters.set(name!, value!.trim());
      continue;
    }

    // Parse mmix: mmix <index> <throttle> <roll> <pitch> <yaw>
    const mmixMatch = trimmed.match(/^mmix\s+(\d+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)/);
    if (mmixMatch) {
      const [, idx, throttle, roll, pitch, yaw] = mmixMatch;
      motorMixer.push({
        index: parseInt(idx!),
        throttle: parseFloat(throttle!),
        roll: parseFloat(roll!),
        pitch: parseFloat(pitch!),
        yaw: parseFloat(yaw!),
      });
      continue;
    }

    // Parse smix: smix <index> <target> <input> <rate> <speed> <min> <max> <box>
    const smixMatch = trimmed.match(/^smix\s+(\d+)\s+(\d+)\s+(\d+)\s+([\d-]+)\s+(\d+)\s+([\d-]+)\s+([\d-]+)\s+(\d+)/);
    if (smixMatch) {
      const [, idx, target, input, rate, speed, min, max, box] = smixMatch;
      servoMixer.push({
        index: parseInt(idx!),
        targetChannel: parseInt(target!),
        inputSource: parseInt(input!),
        rate: parseInt(rate!),
        speed: parseInt(speed!),
        min: parseInt(min!),
        max: parseInt(max!),
        box: parseInt(box!),
      });
      continue;
    }

    // Parse servo: servo <index> <min> <max> <mid> <rate>
    const servoMatch = trimmed.match(/^servo\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+([\d-]+)/);
    if (servoMatch) {
      const [, idx, min, max, mid, rate] = servoMatch;
      servoConfigs.push({
        index: parseInt(idx!),
        min: parseInt(min!),
        max: parseInt(max!),
        mid: parseInt(mid!),
        rate: parseInt(rate!),
      });
      continue;
    }

    // Parse aux: aux <index> <mode> <channel> <start> <end> <logic>
    const auxMatch = trimmed.match(/^aux\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/);
    if (auxMatch) {
      const [, idx, mode, channel, start, end, logic] = auxMatch;
      auxModes.push({
        index: parseInt(idx!),
        modeId: parseInt(mode!),
        auxChannel: parseInt(channel!),
        rangeStart: parseInt(start!),
        rangeEnd: parseInt(end!),
        logic: parseInt(logic!),
      });
      continue;
    }

    // Parse feature: feature GPS or feature -TELEMETRY
    const featureMatch = trimmed.match(/^feature\s+(-?)(\S+)/);
    if (featureMatch) {
      const [, minus, name] = featureMatch;
      if (minus === '-') {
        features.delete(name!);
      } else {
        features.add(name!);
      }
      continue;
    }
  }

  // Detect platform type from parameters
  // iNav uses: platform_type = AIRPLANE or platform_type = MULTIROTOR
  const platformTypeStr = parameters.get('platform_type')?.toUpperCase() || '';
  const platformType: PlatformType = platformTypeStr.includes('AIRPLANE') ? 'airplane' : 'multirotor';

  console.log('[LegacyConfigStore] Detected platform:', platformType, '(from:', platformTypeStr, ')');

  // Build PID config from parameters
  // iNav uses different parameter names based on platform:
  // - Multirotor: mc_p_roll, mc_i_roll, mc_d_roll
  // - Fixed-wing: fw_p_roll, fw_i_roll, fw_ff_roll (note: ff = feedforward, not d!)
  const prefix = platformType === 'airplane' ? 'fw' : 'mc';
  const dTerm = platformType === 'airplane' ? 'ff' : 'd'; // Fixed-wing uses feedforward

  const pid: LegacyPidConfig = {
    roll: {
      p: parseInt(parameters.get(`${prefix}_p_roll`) || '0'),
      i: parseInt(parameters.get(`${prefix}_i_roll`) || '0'),
      d: parseInt(parameters.get(`${prefix}_${dTerm}_roll`) || '0'),
      ff: platformType === 'airplane' ? 0 : parseInt(parameters.get('f_roll') || '0'),
    },
    pitch: {
      p: parseInt(parameters.get(`${prefix}_p_pitch`) || '0'),
      i: parseInt(parameters.get(`${prefix}_i_pitch`) || '0'),
      d: parseInt(parameters.get(`${prefix}_${dTerm}_pitch`) || '0'),
      ff: platformType === 'airplane' ? 0 : parseInt(parameters.get('f_pitch') || '0'),
    },
    yaw: {
      p: parseInt(parameters.get(`${prefix}_p_yaw`) || '0'),
      i: parseInt(parameters.get(`${prefix}_i_yaw`) || '0'),
      d: parseInt(parameters.get(`${prefix}_${dTerm}_yaw`) || '0'),
      ff: platformType === 'airplane' ? 0 : parseInt(parameters.get('f_yaw') || '0'),
    },
    level: {
      p: parseInt(parameters.get(`${prefix}_p_level`) || '0'),
      i: parseInt(parameters.get(`${prefix}_i_level`) || '0'),
      d: parseInt(parameters.get(`${prefix}_d_level`) || '0'),
    },
  };

  // Build rates config from parameters
  const rates: LegacyRatesConfig = {
    rollRate: parseInt(parameters.get('roll_rate') || '0'),
    pitchRate: parseInt(parameters.get('pitch_rate') || '0'),
    yawRate: parseInt(parameters.get('yaw_rate') || '0'),
    rcExpo: parseInt(parameters.get('rc_expo') || '0'),
    rcYawExpo: parseInt(parameters.get('rc_yaw_expo') || '0'),
    rcRate: parseInt(parameters.get('rc_rate') || '100'),
    throttleMid: parseInt(parameters.get('thr_mid') || '50'),
    throttleExpo: parseInt(parameters.get('thr_expo') || '0'),
    tpaRate: parseInt(parameters.get('tpa_rate') || '0'),
    tpaBreakpoint: parseInt(parameters.get('tpa_breakpoint') || '1500'),
  };

  return {
    pid,
    rates,
    motorMixer,
    servoMixer,
    servoConfigs,
    auxModes,
    features,
    parameters,
    platformType,
  };
}

// =============================================================================
// Store
// =============================================================================

const initialState = {
  isLoading: false,
  error: null as string | null,
  hasChanges: false,
  rebootState: 'idle' as RebootState,
  rebootMessage: '',
  rebootError: null as string | null,
  rawDump: '',
  platformType: 'multirotor' as PlatformType,
  pid: null as LegacyPidConfig | null,
  rates: null as LegacyRatesConfig | null,
  motorMixer: [] as LegacyMotorMix[],
  servoMixer: [] as LegacyServoMix[],
  servoConfigs: [] as LegacyServoConfig[],
  auxModes: [] as LegacyAuxMode[],
  features: new Set<string>(),
  parameters: new Map<string, string>(),
};

// Guard to prevent double-loading
let loadInProgress = false;

export const useLegacyConfigStore = create<LegacyConfigStore>((set, get) => ({
  ...initialState,

  loadConfig: async () => {
    // Prevent double-loading
    if (loadInProgress) {
      console.log('[LegacyConfigStore] loadConfig already in progress, skipping');
      return;
    }

    // Skip if already have config data
    const { pid } = get();
    if (pid !== null) {
      console.log('[LegacyConfigStore] Already have config data, skipping reload');
      return;
    }

    loadInProgress = true;
    set({ isLoading: true, error: null });

    try {
      console.log('[LegacyConfigStore] Loading config via CLI dump...');

      // Get dump via CLI
      const dump = await window.electronAPI.cliGetDump();

      console.log('[LegacyConfigStore] Dump received:', dump.length, 'chars');

      // Parse the dump
      const parsed = parseDump(dump);

      console.log('[LegacyConfigStore] Parsed config:', {
        pid: parsed.pid.roll.p !== 0 ? 'OK' : 'ZERO',
        rates: parsed.rates.rollRate !== 0 ? 'OK' : 'ZERO',
        parameters: parsed.parameters.size,
        servos: parsed.servoConfigs.length,
        modes: parsed.auxModes.length,
      });

      set({
        isLoading: false,
        rawDump: dump,
        platformType: parsed.platformType,
        pid: parsed.pid,
        rates: parsed.rates,
        motorMixer: parsed.motorMixer,
        servoMixer: parsed.servoMixer,
        servoConfigs: parsed.servoConfigs,
        auxModes: parsed.auxModes,
        features: parsed.features,
        parameters: parsed.parameters,
        hasChanges: false,
      });
    } catch (err) {
      console.error('[LegacyConfigStore] Failed to load config:', err);
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to load config',
      });
    } finally {
      loadInProgress = false;
    }
  },

  saveToEeprom: async () => {
    const { setRebootState, setRebootError, clearRebootState } = get();

    console.log('[LegacyConfigStore] Starting save to EEPROM...');

    try {
      // Step 1: Saving
      setRebootState('saving', 'Saving configuration to EEPROM...');
      await window.electronAPI.cliSendCommand('save');

      // Clear changes flag (they're saved now)
      set({ hasChanges: false });

      // Step 2: Rebooting
      setRebootState('rebooting', 'Board is rebooting...');
      console.log('[LegacyConfigStore] Save command sent, board is rebooting');

      // Wait for board to reboot (typical reboot takes 2-4 seconds)
      await new Promise(r => setTimeout(r, 4000));

      // Step 3: Reconnecting
      setRebootState('reconnecting', 'Reconnecting to board...');
      console.log('[LegacyConfigStore] Attempting to reconnect...');

      // Disconnect first to clean up state
      await window.electronAPI.disconnect();

      // Wait a bit for disconnect to complete
      await new Promise(r => setTimeout(r, 500));

      // Try to reconnect using the last connection settings
      // We'll need to get the port from connection state
      // For now, just show success and let user know to reconnect

      // Step 4: Done (or prompt user to reconnect manually)
      setRebootState('done', 'Configuration saved! Board rebooted. Please reconnect.');
      console.log('[LegacyConfigStore] Save complete, user should reconnect');

      // Auto-clear after 3 seconds
      setTimeout(() => {
        clearRebootState();
      }, 3000);

    } catch (err) {
      console.error('[LegacyConfigStore] Save failed:', err);
      setRebootError(err instanceof Error ? err.message : 'Failed to save configuration');
    }
  },

  updatePid: (pid) => {
    set({ pid, hasChanges: true });
  },

  updateRates: (rates) => {
    set({ rates, hasChanges: true });
  },

  updateMotorMix: (index, mix) => {
    const { motorMixer } = get();
    const updated = [...motorMixer];
    const existing = updated.findIndex((m) => m.index === index);
    if (existing >= 0) {
      updated[existing] = mix;
    } else {
      updated.push(mix);
    }
    set({ motorMixer: updated, hasChanges: true });
  },

  updateServoMix: (index, mix) => {
    const { servoMixer } = get();
    const updated = [...servoMixer];
    const existing = updated.findIndex((m) => m.index === index);
    if (existing >= 0) {
      updated[existing] = mix;
    } else {
      updated.push(mix);
    }
    set({ servoMixer: updated, hasChanges: true });
  },

  updateServoConfig: (index, config) => {
    const { servoConfigs } = get();
    const updated = [...servoConfigs];
    const existing = updated.findIndex((s) => s.index === index);
    if (existing >= 0) {
      updated[existing] = config;
    } else {
      updated.push(config);
    }
    set({ servoConfigs: updated, hasChanges: true });
  },

  updateAuxMode: (index, mode) => {
    const { auxModes } = get();
    const updated = [...auxModes];
    const existing = updated.findIndex((a) => a.index === index);
    if (existing >= 0) {
      updated[existing] = mode;
    } else {
      updated.push(mode);
    }
    set({ auxModes: updated, hasChanges: true });
  },

  // Add/remove actions for mixers
  addMotorMix: () => {
    const { motorMixer } = get();
    // Find next available index (0-7 for typical motor mixer)
    const usedIndices = new Set(motorMixer.map((m) => m.index));
    let newIndex = 0;
    while (usedIndices.has(newIndex) && newIndex < 8) {
      newIndex++;
    }
    if (newIndex >= 8) {
      console.warn('[LegacyConfigStore] Max motor mixer entries reached (8)');
      newIndex = motorMixer.length; // Fallback to next sequential
    }
    const newMix: LegacyMotorMix = {
      index: newIndex,
      throttle: 1.0,
      roll: 0,
      pitch: 0,
      yaw: 0,
    };
    set({ motorMixer: [...motorMixer, newMix], hasChanges: true });
    // Send CLI command to create the entry
    window.electronAPI.cliSendCommand(
      `mmix ${newMix.index} ${newMix.throttle.toFixed(3)} ${newMix.roll.toFixed(3)} ${newMix.pitch.toFixed(3)} ${newMix.yaw.toFixed(3)}`
    );
    return newMix;
  },

  removeMotorMix: (index) => {
    const { motorMixer } = get();
    const updated = motorMixer.filter((m) => m.index !== index);
    set({ motorMixer: updated, hasChanges: true });
    // Reset the mixer entry to zeros (effectively removes it)
    window.electronAPI.cliSendCommand(`mmix ${index} 0 0 0 0`);
  },

  addServoMix: () => {
    const { servoMixer } = get();
    // Find next available index (0-15 for typical servo mixer)
    const usedIndices = new Set(servoMixer.map((m) => m.index));
    let newIndex = 0;
    while (usedIndices.has(newIndex) && newIndex < 16) {
      newIndex++;
    }
    if (newIndex >= 16) {
      console.warn('[LegacyConfigStore] Max servo mixer entries reached (16)');
      newIndex = servoMixer.length;
    }
    const newMix: LegacyServoMix = {
      index: newIndex,
      targetChannel: 0, // Servo 0
      inputSource: 0, // Stabilized Roll
      rate: 100, // 100% mix
      speed: 0, // No speed limit
      min: 0, // No min limit
      max: 100, // Full range
      box: 0, // No aux condition
    };
    set({ servoMixer: [...servoMixer, newMix], hasChanges: true });
    // Send CLI command to create the entry
    window.electronAPI.cliSendCommand(
      `smix ${newMix.index} ${newMix.targetChannel} ${newMix.inputSource} ${newMix.rate} ${newMix.speed} ${newMix.min} ${newMix.max} ${newMix.box}`
    );
    return newMix;
  },

  removeServoMix: (index) => {
    const { servoMixer } = get();
    const updated = servoMixer.filter((m) => m.index !== index);
    set({ servoMixer: updated, hasChanges: true });
    // Reset the mixer entry (set rate to 0 effectively disables it)
    window.electronAPI.cliSendCommand(`smix ${index} 0 0 0 0 0 0 0`);
  },

  // Reboot/reconnect state actions
  setRebootState: (state, message = '') => {
    set({
      rebootState: state,
      rebootMessage: message,
      rebootError: null,
    });
  },

  setRebootError: (error) => {
    set({
      rebootState: 'error',
      rebootError: error,
    });
  },

  clearRebootState: () => {
    set({
      rebootState: 'idle',
      rebootMessage: '',
      rebootError: null,
    });
  },

  reset: () => {
    console.log('[LegacyConfigStore] Reset');
    loadInProgress = false;
    set(initialState);
  },
}));
