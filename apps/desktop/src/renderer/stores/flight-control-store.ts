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

/**
 * iNav Permanent Box IDs (from fc_msp_box.c)
 * These are FIXED IDs that never change - not runtime indices!
 */
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
  15: 'LEDS OFF',
  16: 'LIGHTS',
  19: 'OSD OFF',
  20: 'TELEMETRY',
  21: 'AUTO TUNE',
  26: 'BLACKBOX',
  27: 'FAILSAFE',
  28: 'NAV WP',
  29: 'AIR MODE',
  30: 'HOME RESET',
  31: 'GCS NAV',
  32: 'FPV ANGLE MIX',
  33: 'SURFACE',
  34: 'FLAPERON',
  35: 'TURN ASSIST',
  36: 'NAV LAUNCH',
  37: 'SERVO AUTOTRIM',
  39: 'CAMERA 1',
  40: 'CAMERA 2',
  41: 'CAMERA 3',
  42: 'OSD ALT 1',
  43: 'OSD ALT 2',
  44: 'OSD ALT 3',
  45: 'NAV CRUISE',
  46: 'MC BRAKING',
  47: 'USER1',
  48: 'USER2',
  49: 'LOITER CHANGE',
  50: 'MSP RC OVERRIDE',
  51: 'PREARM',
  52: 'TURTLE',
  53: 'NAV COURSE HOLD',
  54: 'AUTO LEVEL',
  55: 'WP PLANNER',
  56: 'SOARING',
  57: 'USER3',
  58: 'USER4',
  59: 'MISSION CHANGE',
  60: 'BEEPER MUTE',
  61: 'MULTI FUNCTION',
  62: 'MIXER PROFILE 2',
  63: 'MIXER TRANSITION',
  64: 'ANGLE HOLD',
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

  // Apply fallback SITL mode mappings
  applySitlFallbackMappings: () => void;
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

/**
 * Convert PWM value (1000-2000) to normalized value (-1 to +1) for Virtual RC
 * 1000 = -1, 1500 = 0, 2000 = +1
 */
function pwmToNormalized(pwm: number): number {
  return (pwm - 1500) / 500;
}

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
    // iNav permanent box IDs: ARM=0, NAV WP=28
    const armMapping = mappings.find((m) => m.boxId === 0);
    const navWpMapping = mappings.find((m) => m.boxId === 28);

    set({
      modeMappings: mappings,
      modeMappingsLoaded: true,
      canArm: armMapping !== undefined && armMapping.auxChannel !== null,
      canNavWp: navWpMapping !== undefined && navWpMapping.auxChannel !== null,
    });

    console.log('[FlightControl] Mode mappings loaded:', mappings.length, 'modes');
    console.log('[FlightControl] All configured modes:');
    mappings.forEach(m => {
      console.log(`  - ${m.name} (boxId=${m.boxId}): AUX${m.auxChannel !== null ? m.auxChannel + 1 : 'NONE'}, range ${m.rangeStart}-${m.rangeEnd}`);
    });
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

    // Also set Virtual RC for SITL bridge
    // Note: Virtual RC expects normalized values (-1 to +1), not PWM (1000-2000)
    const auxKey = `aux${armMapping.auxChannel + 1}` as 'aux1' | 'aux2' | 'aux3' | 'aux4';
    const normalizedThrottle = pwmToNormalized(1000); // -1
    const normalizedAux = pwmToNormalized(midpoint);
    try {
      await window.electronAPI.virtualRCSet({
        throttle: normalizedThrottle,
        [auxKey]: normalizedAux,
      });
      console.log(`[FlightControl] Virtual RC set: throttle=${normalizedThrottle}, ${auxKey}=${normalizedAux}`);
    } catch (e) {
      // Virtual RC might not be available (not SITL)
    }

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

    // Also set Virtual RC for SITL bridge
    // Note: Virtual RC expects normalized values (-1 to +1), not PWM (1000-2000)
    const auxKey = `aux${armMapping.auxChannel + 1}` as 'aux1' | 'aux2' | 'aux3' | 'aux4';
    const normalizedThrottle = pwmToNormalized(1000); // -1
    const normalizedAux = pwmToNormalized(lowValue);
    try {
      await window.electronAPI.virtualRCSet({
        throttle: normalizedThrottle,
        [auxKey]: normalizedAux,
      });
      console.log(`[FlightControl] Virtual RC set: throttle=${normalizedThrottle}, ${auxKey}=${normalizedAux}`);
    } catch (e) {
      // Virtual RC might not be available (not SITL)
    }

    // Send the disarm command
    await window.electronAPI.mspSetRawRc(newChannels);

    // Stop override after disarming
    get().stopOverride();

    return true;
  },

  // High-level: Activate a mode
  activateMode: async (boxId) => {
    const { modeMappings, channels, isOverrideActive } = get();

    const mapping = modeMappings.find((m) => m.boxId === boxId);
    if (!mapping || mapping.auxChannel === null) {
      console.error(`[FlightControl] Cannot activate mode ${boxId}: not configured on FC`);
      console.log(`[FlightControl] Available modes:`, modeMappings.map(m => `${m.boxId}:${m.name}`).join(', '));
      return false;
    }

    // Calculate midpoint of the activation range
    const midpoint = Math.round((mapping.rangeStart + mapping.rangeEnd) / 2);

    // AUX channel index: auxChannel 0 = channel index 4 (AUX1)
    const channelIndex = mapping.auxChannel + 4;

    console.log(`[FlightControl] Activating ${mapping.name} (boxId=${boxId})`);
    console.log(`[FlightControl]   Mapping: AUX${mapping.auxChannel + 1}, range ${mapping.rangeStart}-${mapping.rangeEnd}, midpoint=${midpoint}`);
    console.log(`[FlightControl]   Current channels[${channelIndex}]=${channels[channelIndex]}, setting to ${midpoint}`);

    // Update channels
    const newChannels = [...channels];
    newChannels[channelIndex] = midpoint;

    console.log(`[FlightControl]   New AUX values: AUX1=${newChannels[4]}, AUX2=${newChannels[5]}, AUX3=${newChannels[6]}, AUX4=${newChannels[7]}`);

    set({ channels: newChannels });

    // Send immediately if override is already active, otherwise start override
    if (isOverrideActive) {
      console.log(`[FlightControl]   Override active, sending RC immediately`);
      await window.electronAPI.mspSetRawRc(newChannels);
    } else {
      console.log(`[FlightControl]   Starting override`);
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
        console.warn('[FlightControl] Failed to load mode ranges from FC');
        // Apply SITL fallback if we're in SITL mode
        get().applySitlFallbackMappings();
        return false;
      }

      // Filter to only modes that have a valid AUX channel configured
      const configuredRanges = ranges.filter(
        (r: MSPModeRange) => r.auxChannel !== 255 && r.auxChannel < 12
      );

      if (configuredRanges.length === 0) {
        console.warn('[FlightControl] No configured mode ranges found');
        // Apply SITL fallback if we're in SITL mode
        get().applySitlFallbackMappings();
        return false;
      }

      get().setModeMappings(configuredRanges);

      return true;
    } catch (error) {
      console.error('[FlightControl] Failed to load mode ranges:', error);
      // Apply SITL fallback if we're in SITL mode
      get().applySitlFallbackMappings();
      return false;
    }
  },

  // Apply fallback SITL mode mappings when MSP_MODE_RANGES fails
  // These match what "Setup for SITL Testing" configures via CLI
  applySitlFallbackMappings: () => {
    console.log('[FlightControl] Applying SITL fallback mode mappings...');
    // Default SITL configuration (from FlightControlPanel's configureSitlForTesting):
    // aux 0 0 0 1700 2100 0 -> ARM on AUX1 (1700-2100)
    // aux 1 1 1 1300 1700 0 -> ANGLE on AUX2 (1300-1700)
    // aux 2 28 1 1700 2100 0 -> NAV WP on AUX2 (1700-2100)
    // aux 3 10 2 1700 2100 0 -> NAV RTH on AUX3 (1700-2100)
    // aux 4 11 3 1700 2100 0 -> NAV POSHOLD on AUX4 (1700-2100)
    const sitlFallbackModes: MSPModeRange[] = [
      { boxId: 0, auxChannel: 0, rangeStart: 1700, rangeEnd: 2100 },  // ARM on AUX1
      { boxId: 1, auxChannel: 1, rangeStart: 1300, rangeEnd: 1700 },  // ANGLE on AUX2
      { boxId: 28, auxChannel: 1, rangeStart: 1700, rangeEnd: 2100 }, // NAV WP on AUX2
      { boxId: 10, auxChannel: 2, rangeStart: 1700, rangeEnd: 2100 }, // NAV RTH on AUX3
      { boxId: 11, auxChannel: 3, rangeStart: 1700, rangeEnd: 2100 }, // NAV POSHOLD on AUX4
    ];

    get().setModeMappings(sitlFallbackModes);
    console.log('[FlightControl] SITL fallback applied - using default mode mappings');
    console.log('[FlightControl] NOTE: These assume you ran "Setup for SITL Testing" or configured modes via CLI');
  },
}));

// Export helper to get mode name by box ID
export function getModeName(boxId: number): string {
  return INAV_MODE_NAMES[boxId] || `Mode ${boxId}`;
}
