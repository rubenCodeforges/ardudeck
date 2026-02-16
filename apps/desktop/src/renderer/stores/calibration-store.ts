/**
 * Calibration Store
 *
 * Manages state for the Calibration Wizard supporting MSP (iNav/Betaflight)
 * and MAVLink (ArduPilot) protocols.
 */

import { create } from 'zustand';
import { useConnectionStore } from './connection-store';
import {
  type CalibrationTypeId,
  type CalibrationStep,
  type CalibrationData,
  type SensorAvailability,
  type AccelPosition,
  type CalibrationProtocol,
  CALIBRATION_TYPES,
  ACCEL_6POINT_POSITIONS,
} from '../../shared/calibration-types';

// ============================================================================
// Types
// ============================================================================

export interface CalibrationState {
  // View state
  isOpen: boolean;
  currentStep: CalibrationStep;

  // Selected calibration
  calibrationType: CalibrationTypeId | null;

  // Protocol detection (from connection store)
  protocol: CalibrationProtocol | null;
  fcVariant: string | null; // 'INAV', 'BTFL', 'ARDU'

  // Sensor availability (loaded on open)
  sensors: SensorAvailability;
  isSensorsLoading: boolean;
  sensorsError: string | null;

  // Calibration state
  isCalibrating: boolean;
  progress: number; // 0-100
  currentPosition: AccelPosition; // For 6-point (0-5)
  positionStatus: boolean[]; // [false, false, false, false, false, false]
  countdown: number; // Seconds remaining (compass/opflow)
  statusText: string; // "Place vehicle level..."

  // Multi-compass progress (MAVLink)
  compassProgress: number[]; // Progress per compass (0-100 each)

  // Results (after completion)
  calibrationData: CalibrationData | null;
  calibrationSuccess: boolean | null;

  // Error state
  error: string | null;

  // Saving state
  isSaving: boolean;
  saveSuccess: boolean;
  saveError: string | null;

  // Track completed calibrations this session (arming flags may not clear until reboot)
  completedCalibrations: Set<CalibrationTypeId>;

  // Actions
  open: () => void;
  close: () => void;
  setStep: (step: CalibrationStep) => void;
  selectCalibrationType: (type: CalibrationTypeId) => void;

  // Calibration control
  startCalibration: () => Promise<void>;
  confirmPosition: () => Promise<void>; // For 6-point
  cancelCalibration: () => void;

  // Data
  loadSensorConfig: () => Promise<void>;
  loadCalibrationData: () => Promise<void>;
  saveCalibrationData: () => Promise<void>;

  // Progress updates (called from IPC events)
  handleProgressUpdate: (progress: number, statusText: string, position?: AccelPosition, positionStatus?: boolean[], countdown?: number, compassProgress?: number[]) => void;
  handleCalibrationComplete: (success: boolean, data?: CalibrationData, error?: string) => void;

  // Reset
  reset: () => void;
}

// Step order
const STEPS: CalibrationStep[] = ['select', 'prepare', 'calibrating', 'complete'];

// Default sensor state
const DEFAULT_SENSORS: SensorAvailability = {
  hasAccel: false,
  hasGyro: false,
  hasCompass: false,
  hasBarometer: false,
  hasGps: false,
  hasOpflow: false,
  hasPitot: false,
};

// ============================================================================
// Store
// ============================================================================

export const useCalibrationStore = create<CalibrationState>((set, get) => ({
  // Initial state
  isOpen: false,
  currentStep: 'select',

  calibrationType: null,

  protocol: null,
  fcVariant: null,

  sensors: DEFAULT_SENSORS,
  isSensorsLoading: false,
  sensorsError: null,

  isCalibrating: false,
  progress: 0,
  currentPosition: 0,
  positionStatus: [false, false, false, false, false, false],
  countdown: 0,
  statusText: '',
  compassProgress: [],

  calibrationData: null,
  calibrationSuccess: null,

  error: null,

  isSaving: false,
  saveSuccess: false,
  saveError: null,

  completedCalibrations: new Set(),

  // ============================================================================
  // View Actions
  // ============================================================================

  open: () => {
    // Get protocol info from connection store
    const { connectionState } = useConnectionStore.getState();
    const protocol = connectionState.protocol as CalibrationProtocol | undefined;
    const fcVariant = connectionState.fcVariant || connectionState.autopilot || null;

    set({
      isOpen: true,
      currentStep: 'select',
      calibrationType: null,
      protocol: protocol || null,
      fcVariant,
      calibrationData: null,
      calibrationSuccess: null,
      error: null,
      progress: 0,
      statusText: '',
      countdown: 0,
      currentPosition: 0,
      positionStatus: [false, false, false, false, false, false],
      compassProgress: [],
      isCalibrating: false,
      isSaving: false,
      saveSuccess: false,
      saveError: null,
    });

    // Load sensor config
    get().loadSensorConfig();
  },

  close: () => {
    // Cancel any in-progress calibration
    if (get().isCalibrating) {
      get().cancelCalibration();
    }

    set({
      isOpen: false,
      currentStep: 'select',
    });
  },

  setStep: (step: CalibrationStep) => {
    set({ currentStep: step });
  },

  selectCalibrationType: (type: CalibrationTypeId) => {
    const calType = CALIBRATION_TYPES.find((t) => t.id === type);
    if (!calType) return;

    // Check if this calibration type is supported for current protocol/variant
    const { protocol, fcVariant, sensors } = get();

    if (protocol && !calType.protocols.includes(protocol)) {
      set({ error: `${calType.name} is not supported for ${protocol.toUpperCase()} protocol` });
      return;
    }

    // Check sensor requirements
    if (calType.requiresSensor) {
      const sensorKey = calType.requiresSensor as keyof SensorAvailability;
      if (!sensors[sensorKey]) {
        set({ error: `${calType.name} requires ${calType.requiresSensor} sensor which is not available` });
        return;
      }
    }

    set({
      calibrationType: type,
      currentStep: 'prepare',
      error: null,
      progress: 0,
      statusText: getInitialStatusText(type),
      calibrationData: null,
      calibrationSuccess: null,
      currentPosition: 0,
      positionStatus: [false, false, false, false, false, false],
      countdown: calType.estimatedDuration,
      compassProgress: [],
      // Reset save state for new calibration
      isSaving: false,
      saveSuccess: false,
      saveError: null,
    });
  },

  // ============================================================================
  // Calibration Control
  // ============================================================================

  startCalibration: async () => {
    const { calibrationType, protocol } = get();
    if (!calibrationType || !protocol) {
      set({ error: 'No calibration type selected' });
      return;
    }

    set({
      isCalibrating: true,
      currentStep: 'calibrating',
      error: null,
      progress: 0,
    });

    try {
      // Call the IPC to start calibration
      const result = await window.electronAPI?.calibrationStart({ type: calibrationType });

      if (!result?.success) {
        throw new Error(result?.error || 'Failed to start calibration');
      }

      // For simple calibrations that complete immediately
      if (result.data) {
        get().handleCalibrationComplete(true, result.data);
      }
      // Otherwise, wait for progress/complete events from main process
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      set({
        isCalibrating: false,
        error: message,
        currentStep: 'prepare',
      });
    }
  },

  confirmPosition: async () => {
    const { calibrationType, currentPosition } = get();
    if (calibrationType !== 'accel-6point') return;

    try {
      const result = await window.electronAPI?.calibrationConfirmPosition(currentPosition);

      if (!result?.success) {
        throw new Error(result?.error || 'Failed to confirm position');
      }

      // Update position status
      const newStatus = [...get().positionStatus];
      newStatus[currentPosition] = true;

      // Move to next position or complete
      if (currentPosition < 5) {
        set({
          currentPosition: (currentPosition + 1) as AccelPosition,
          positionStatus: newStatus,
          statusText: `Place vehicle ${ACCEL_6POINT_POSITIONS[currentPosition + 1]}`,
          progress: ((currentPosition + 1) / 6) * 100,
        });
      } else {
        // All positions done
        set({
          positionStatus: newStatus,
          progress: 100,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      set({ error: message });
    }
  },

  cancelCalibration: () => {
    window.electronAPI?.calibrationCancel?.();
    set({
      isCalibrating: false,
      currentStep: 'prepare',
      progress: 0,
      statusText: '',
    });
  },

  // ============================================================================
  // Data Actions
  // ============================================================================

  loadSensorConfig: async () => {
    set({ isSensorsLoading: true, sensorsError: null });

    try {
      const result = await window.electronAPI?.calibrationGetSensorConfig();

      if (result) {
        set({
          sensors: result,
          isSensorsLoading: false,
        });
      } else {
        // Use defaults if no result
        set({
          sensors: {
            hasAccel: true, // Assume basic sensors exist
            hasGyro: true,
            hasCompass: false,
            hasBarometer: false,
            hasGps: false,
            hasOpflow: false,
            hasPitot: false,
          },
          isSensorsLoading: false,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load sensor config';
      console.warn('[Calibration] Failed to load sensor config:', message);
      set({
        isSensorsLoading: false,
        sensorsError: message,
        // Use defaults
        sensors: {
          hasAccel: true,
          hasGyro: true,
          hasCompass: false,
          hasBarometer: false,
          hasGps: false,
          hasOpflow: false,
          hasPitot: false,
        },
      });
    }
  },

  loadCalibrationData: async () => {
    try {
      const result = await window.electronAPI?.calibrationGetData();
      if (result) {
        set({ calibrationData: result });
      }
    } catch (err) {
      console.warn('[Calibration] Failed to load calibration data:', err);
    }
  },

  saveCalibrationData: async () => {
    const { calibrationData } = get();
    if (!calibrationData) return;

    set({ isSaving: true, saveError: null, saveSuccess: false });

    try {
      const result = await window.electronAPI?.calibrationSetData(calibrationData);

      if (!result?.success) {
        throw new Error(result?.error || 'Failed to save calibration data');
      }

      // Save to EEPROM
      await window.electronAPI?.mspSaveEeprom?.();

      // Track this calibration as completed this session
      // (arming flags may not clear until reboot, so we track it locally)
      const { calibrationType, completedCalibrations } = get();
      if (calibrationType) {
        const updated = new Set(completedCalibrations);
        updated.add(calibrationType);
        set({ isSaving: false, saveSuccess: true, completedCalibrations: updated });
      } else {
        set({ isSaving: false, saveSuccess: true });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save';
      set({ isSaving: false, saveError: message, saveSuccess: false });
    }
  },

  // ============================================================================
  // Progress Updates (from IPC events)
  // ============================================================================

  handleProgressUpdate: (progress, statusText, position, positionStatus, countdown, compassProgress) => {
    set({
      progress,
      statusText,
      ...(position !== undefined && { currentPosition: position }),
      ...(positionStatus && { positionStatus }),
      ...(countdown !== undefined && { countdown }),
      ...(compassProgress && { compassProgress }),
    });
  },

  handleCalibrationComplete: (success, data, error) => {
    set({
      isCalibrating: false,
      currentStep: 'complete',
      calibrationSuccess: success,
      calibrationData: data || null,
      error: error || null,
      progress: success ? 100 : get().progress,
    });
  },

  // ============================================================================
  // Reset
  // ============================================================================

  reset: () => {
    set({
      isOpen: false,
      currentStep: 'select',
      calibrationType: null,
      protocol: null,
      fcVariant: null,
      sensors: DEFAULT_SENSORS,
      isSensorsLoading: false,
      sensorsError: null,
      isCalibrating: false,
      progress: 0,
      currentPosition: 0,
      positionStatus: [false, false, false, false, false, false],
      countdown: 0,
      statusText: '',
      compassProgress: [],
      calibrationData: null,
      calibrationSuccess: null,
      error: null,
      isSaving: false,
      saveSuccess: false,
      saveError: null,
      completedCalibrations: new Set(),
    });
  },
}));

// ============================================================================
// Helpers
// ============================================================================

function getInitialStatusText(type: CalibrationTypeId): string {
  switch (type) {
    case 'accel-level':
      return 'Place your vehicle on a level surface';
    case 'accel-6point':
      return `Place vehicle ${ACCEL_6POINT_POSITIONS[0]}`;
    case 'compass':
      return 'Rotate your vehicle in all directions';
    case 'gyro':
      return 'Keep your vehicle completely still';
    case 'opflow':
      return 'Hold vehicle steady over a textured surface';
    default:
      return 'Follow the on-screen instructions';
  }
}

// ============================================================================
// Selector Hooks
// ============================================================================

export const useCalibrationOpen = () => useCalibrationStore((s) => s.isOpen);
export const useCalibrationStep = () => useCalibrationStore((s) => s.currentStep);
export const useCalibrationType = () => useCalibrationStore((s) => s.calibrationType);
export const useCalibrationProgress = () => useCalibrationStore((s) => ({
  progress: s.progress,
  statusText: s.statusText,
  countdown: s.countdown,
  currentPosition: s.currentPosition,
  positionStatus: s.positionStatus,
}));

// ============================================================================
// Computed getters
// ============================================================================

/**
 * Get available calibration types for current protocol/variant
 */
export function getAvailableCalibrationTypes(
  protocol: CalibrationProtocol | null,
  fcVariant: string | null,
  sensors: SensorAvailability
): (typeof CALIBRATION_TYPES)[number][] {
  return CALIBRATION_TYPES.filter((calType) => {
    // Check protocol support
    if (protocol && !calType.protocols.includes(protocol)) {
      return false;
    }

    // Check FC variant support
    if (fcVariant) {
      const variantUpper = fcVariant.toUpperCase();
      const matchedVariant = calType.variants.find(v =>
        variantUpper.includes(v) || v.includes(variantUpper.slice(0, 4))
      );
      if (!matchedVariant) {
        return false;
      }
    }

    // Check sensor requirements (but still show as disabled)
    // Actually, let's show all and mark unavailable ones
    return true;
  });
}

/**
 * Check if a calibration type is available (has required sensor)
 */
export function isCalibrationTypeAvailable(
  calType: (typeof CALIBRATION_TYPES)[number],
  sensors: SensorAvailability
): boolean {
  if (calType.requiresSensor) {
    const sensorKey = calType.requiresSensor as keyof SensorAvailability;
    return sensors[sensorKey];
  }
  return true;
}
