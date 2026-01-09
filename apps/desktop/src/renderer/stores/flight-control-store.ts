/**
 * Flight Control Store
 *
 * Manages GCS control features for arm/disarm, mode switching, and RC simulation.
 * This enables controlling the aircraft from the GCS instead of requiring CLI commands.
 *
 * How it works:
 * - iNav/Betaflight use RC-based control: modes are activated by AUX channel values
 * - This store simulates RC input by sending MSP_SET_RAW_RC commands
 * - Mode ranges define which AUX channel activates which mode
 */

import { create } from 'zustand';

// =============================================================================
// Types
// =============================================================================

/** Mode mapping from mode ranges */
export interface ModeMapping {
  /** Box ID (0=ARM, 1=ANGLE, etc.) */
  boxId: number;
  /** Mode name (e.g., "ARM", "ANGLE", "NAV WP") */
  name: string;
  /** AUX channel (0=AUX1, 1=AUX2, etc.) or null if not configured */
  auxChannel: number | null;
  /** PWM range start (900-2100) */
  rangeStart: number;
  /** PWM range end (900-2100) */
  rangeEnd: number;
}

/** Mode range from MSP (as returned by getModeRanges) */
export interface MSPModeRange {
  boxId: number;
  auxChannel: number;
  rangeStart: number;
  rangeEnd: number;
}

/** Flight mode names by box ID (iNav) */
export const INAV_MODE_NAMES: Record<number, string> = {
  0: 'ARM',
  1: 'ANGLE',
  2: 'HORIZON',
  3: 'NAV ALTHOLD',
  5: 'HEADING HOLD',
  6: 'HEADFREE',
  7: 'HEADADJ',
  8: 'CAMSTAB',
  10: 'NAV RTH',
  11: 'NAV POSHOLD',
  12: 'MANUAL',
  13: 'BEEPER',
  15: 'LEDLOW',
  16: 'LIGHTS',
  19: 'OSD DISABLE',
  20: 'TELEMETRY',
  21: 'BLACKBOX',
  22: 'FAILSAFE',
  23: 'NAV WP',
  24: 'AIRMODE',
  25: 'HOMING RESET',
  26: 'GCS NAV',
  27: 'FPV ANGLE MIX',
  28: 'SURFACE',
  29: 'FLAPERON',
  30: 'TURN ASSIST',
  31: 'NAV LAUNCH',
  32: 'SERVO AUTOTRIM',
  33: 'AUTO TUNE',
  34: 'CAMERA 1',
  35: 'CAMERA 2',
  36: 'CAMERA 3',
  37: 'OSD ALT 1',
  38: 'OSD ALT 2',
  39: 'OSD ALT 3',
  40: 'NAV CRUISE',
  41: 'BRAKING',
  42: 'USER 1',
  43: 'USER 2',
  44: 'USER 3',
  45: 'USER 4',
  46: 'LOITER CHANGE',
  47: 'MSP RC OVERRIDE',
  48: 'PREARM',
  49: 'TURTLE',
  50: 'NAV MISSION CHANGE',
  51: 'BEEPER MUTE',
  52: 'MULTI FUNCTION',
  53: 'MIXER PROFILE 2',
  54: 'MIXER TRANSITION',
  55: 'ANGLE HOLD',
  56: 'SOARING',
  57: 'MC BRAKING',
  58: 'LEDSTRIP INDICATOR',
};

// =============================================================================
// Store
// =============================================================================

interface FlightControlStore {
  // RC Channel State (16 channels)
  channels: number[];

  // Mode Mappings (from MSP_MODE_RANGES)
  modeMappings: ModeMapping[];
  modeMappingsLoaded: boolean;

  // Derived state
  canArm: boolean;
  canNavWp: boolean;

  // RC Override State
  isOverrideActive: boolean;
  overrideInterval: ReturnType<typeof setInterval> | null;

  // Actions
  setChannel: (channel: number, value: number) => void;
  setChannels: (channels: number[]) => void;

  // Mode mappings
  setModeMappings: (ranges: MSPModeRange[]) => void;
  clearModeMappings: () => void;

  // RC Override
  startOverride: () => void;
  stopOverride: () => void;

  // High-level control actions
  arm: () => Promise<boolean>;
  disarm: () => Promise<boolean>;
  activateMode: (boxId: number) => Promise<boolean>;
  deactivateMode: (boxId: number) => Promise<boolean>;

  // Load mode ranges from FC
  loadModeRanges: () => Promise<boolean>;
}

// Default channel values: all centered (1500) except throttle at minimum (1000)
const DEFAULT_CHANNELS: number[] = [
  1500, // Roll
  1500, // Pitch
  1000, // Throttle (MUST be low for arming!)
  1500, // Yaw
  1000, // AUX1
  1000, // AUX2
  1000, // AUX3
  1000, // AUX4
  1000, // AUX5
  1000, // AUX6
  1000, // AUX7
  1000, // AUX8
  1000, // AUX9
  1000, // AUX10
  1000, // AUX11
  1000, // AUX12
];

// RC override interval (send RC values every 100ms)
const RC_OVERRIDE_INTERVAL_MS = 100;

export const useFlightControlStore = create<FlightControlStore>((set, get) => ({
  // Initial state
  channels: [...DEFAULT_CHANNELS],
  modeMappings: [],
  modeMappingsLoaded: false,
  canArm: false,
  canNavWp: false,
  isOverrideActive: false,
  overrideInterval: null,

  // Set single channel value
  setChannel: (channel, value) => {
    const channels = [...get().channels];
    if (channel >= 0 && channel < channels.length) {
      channels[channel] = Math.max(1000, Math.min(2000, Math.round(value)));
      set({ channels });
    }
  },

  // Set all channels
  setChannels: (newChannels) => {
    const channels = newChannels.map((v) =>
      Math.max(1000, Math.min(2000, Math.round(v)))
    );
    set({ channels });
  },

  // Set mode mappings from MSP_MODE_RANGES response
  setModeMappings: (ranges) => {
    const mappings: ModeMapping[] = ranges.map((range) => ({
      boxId: range.boxId,
      name: INAV_MODE_NAMES[range.boxId] || `Mode ${range.boxId}`,
      auxChannel: range.auxChannel,
      rangeStart: range.rangeStart,
      rangeEnd: range.rangeEnd,
    }));

    // Check if ARM and NAV WP modes are configured
    const armMapping = mappings.find((m) => m.boxId === 0);
    const navWpMapping = mappings.find((m) => m.boxId === 23);

    set({
      modeMappings: mappings,
      modeMappingsLoaded: true,
      canArm: armMapping !== undefined && armMapping.auxChannel !== null,
      canNavWp: navWpMapping !== undefined && navWpMapping.auxChannel !== null,
    });

    console.log('[FlightControl] Mode mappings loaded:', mappings.length, 'modes');
    console.log('[FlightControl] canArm:', armMapping !== undefined);
    console.log('[FlightControl] canNavWp:', navWpMapping !== undefined);
  },

  // Clear mode mappings (on disconnect) - also resets channels
  clearModeMappings: () => {
    set({
      channels: [...DEFAULT_CHANNELS],
      modeMappings: [],
      modeMappingsLoaded: false,
      canArm: false,
      canNavWp: false,
    });
  },

  // Start RC override (sends RC values continuously)
  startOverride: () => {
    const { isOverrideActive, overrideInterval, channels } = get();
    if (isOverrideActive) return;

    console.log('[FlightControl] Starting RC override');

    // Send RC values immediately
    window.electronAPI.mspSetRawRc(channels);

    // Start interval to keep sending
    const interval = setInterval(() => {
      const currentChannels = get().channels;
      window.electronAPI.mspSetRawRc(currentChannels);
    }, RC_OVERRIDE_INTERVAL_MS);

    set({
      isOverrideActive: true,
      overrideInterval: interval,
    });
  },

  // Stop RC override
  stopOverride: () => {
    const { overrideInterval } = get();
    if (overrideInterval) {
      clearInterval(overrideInterval);
    }
    set({
      isOverrideActive: false,
      overrideInterval: null,
    });
    console.log('[FlightControl] Stopped RC override');
  },

  // High-level: ARM
  arm: async () => {
    const { canArm, modeMappings, channels } = get();
    if (!canArm) {
      console.error('[FlightControl] Cannot arm: ARM mode not configured');
      return false;
    }

    const armMapping = modeMappings.find((m) => m.boxId === 0);
    if (!armMapping || armMapping.auxChannel === null) return false;

    // Calculate midpoint of the activation range
    const midpoint = Math.round((armMapping.rangeStart + armMapping.rangeEnd) / 2);

    // AUX channel index: auxChannel 0 = channel index 4 (AUX1)
    const channelIndex = armMapping.auxChannel + 4;

    console.log(`[FlightControl] Arming: Setting AUX${armMapping.auxChannel + 1} (ch ${channelIndex}) to ${midpoint}`);

    // Update channels
    const newChannels = [...channels];
    newChannels[channelIndex] = midpoint;

    // Ensure throttle is low!
    newChannels[2] = 1000;

    set({ channels: newChannels });

    // Start override to send continuously
    get().startOverride();

    return true;
  },

  // High-level: DISARM
  disarm: async () => {
    const { canArm, modeMappings, channels } = get();
    if (!canArm) {
      console.error('[FlightControl] Cannot disarm: ARM mode not configured');
      return false;
    }

    const armMapping = modeMappings.find((m) => m.boxId === 0);
    if (!armMapping || armMapping.auxChannel === null) return false;

    // Set AUX channel below the activation range
    const lowValue = Math.max(1000, armMapping.rangeStart - 100);

    // AUX channel index: auxChannel 0 = channel index 4 (AUX1)
    const channelIndex = armMapping.auxChannel + 4;

    console.log(`[FlightControl] Disarming: Setting AUX${armMapping.auxChannel + 1} (ch ${channelIndex}) to ${lowValue}`);

    // Update channels
    const newChannels = [...channels];
    newChannels[channelIndex] = lowValue;

    // Ensure throttle is low!
    newChannels[2] = 1000;

    set({ channels: newChannels });

    // Send the disarm command
    await window.electronAPI.mspSetRawRc(newChannels);

    // Stop override after disarming
    get().stopOverride();

    return true;
  },

  // High-level: Activate a mode
  activateMode: async (boxId) => {
    const { modeMappings, channels } = get();

    const mapping = modeMappings.find((m) => m.boxId === boxId);
    if (!mapping || mapping.auxChannel === null) {
      console.error(`[FlightControl] Cannot activate mode ${boxId}: not configured`);
      return false;
    }

    // Calculate midpoint of the activation range
    const midpoint = Math.round((mapping.rangeStart + mapping.rangeEnd) / 2);

    // AUX channel index: auxChannel 0 = channel index 4 (AUX1)
    const channelIndex = mapping.auxChannel + 4;

    console.log(`[FlightControl] Activating ${mapping.name}: Setting AUX${mapping.auxChannel + 1} (ch ${channelIndex}) to ${midpoint}`);

    // Update channels
    const newChannels = [...channels];
    newChannels[channelIndex] = midpoint;

    set({ channels: newChannels });

    // Start override if not already active
    if (!get().isOverrideActive) {
      get().startOverride();
    }

    return true;
  },

  // High-level: Deactivate a mode
  deactivateMode: async (boxId) => {
    const { modeMappings, channels } = get();

    const mapping = modeMappings.find((m) => m.boxId === boxId);
    if (!mapping || mapping.auxChannel === null) {
      console.error(`[FlightControl] Cannot deactivate mode ${boxId}: not configured`);
      return false;
    }

    // Set AUX channel below the activation range
    const lowValue = Math.max(1000, mapping.rangeStart - 100);

    // AUX channel index: auxChannel 0 = channel index 4 (AUX1)
    const channelIndex = mapping.auxChannel + 4;

    console.log(`[FlightControl] Deactivating ${mapping.name}: Setting AUX${mapping.auxChannel + 1} (ch ${channelIndex}) to ${lowValue}`);

    // Update channels
    const newChannels = [...channels];
    newChannels[channelIndex] = lowValue;

    set({ channels: newChannels });

    // Send the update (override should already be active)
    if (get().isOverrideActive) {
      await window.electronAPI.mspSetRawRc(newChannels);
    }

    return true;
  },

  // Load mode ranges from FC via MSP
  loadModeRanges: async () => {
    try {
      console.log('[FlightControl] Loading mode ranges from FC...');
      const ranges = await window.electronAPI.mspGetModeRanges();

      if (!ranges || !Array.isArray(ranges)) {
        console.warn('[FlightControl] Failed to load mode ranges');
        return false;
      }

      // Filter to only modes that have a valid AUX channel configured
      const configuredRanges = ranges.filter(
        (r: MSPModeRange) => r.auxChannel !== 255 && r.auxChannel < 12
      );

      get().setModeMappings(configuredRanges);

      return true;
    } catch (error) {
      console.error('[FlightControl] Failed to load mode ranges:', error);
      return false;
    }
  },
}));

// Export helper to get mode name by box ID
export function getModeName(boxId: number): string {
  return INAV_MODE_NAMES[boxId] || `Mode ${boxId}`;
}
