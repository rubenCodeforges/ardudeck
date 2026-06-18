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
  type CalibrationVerification,
  type ParamReadResult,
  CALIBRATION_TYPES,
  ACCEL_6POINT_POSITIONS,
  MAVLINK_CALIBRATION_PARAMS,
  CALIBRATION_DIFF_EPSILON,
} from '../../shared/calibration-types';
import {
  categorizeCalibrationParam,
  type CalibrationCategory,
  type CalibrationParamInfo,
} from '../../shared/calibration-param-groups';
import { useParameterStore } from './parameter-store';

// ============================================================================
// Types — Force-accept calibration from file
// ============================================================================

/** A single calibration param parsed from the user's .param file. */
export interface LoadedCalParam {
  paramId: string;
  fileValue: number;
  /** Current value on the FC (undefined if not present in the live param cache). */
  currentValue: number | undefined;
  info: CalibrationParamInfo;
}

/** Per-category validation outcome populated when the file is loaded. */
export interface CategoryValidation {
  /** True if the file contains any non-zero offset for this category. A
   *  file full of zero offsets means no actual calibration was captured —
   *  applying it would wipe the FC's existing cal and trigger the very
   *  "3D calibration needed" prearm we're trying to avoid. */
  hasCalData: boolean;
  /** Outcome of comparing the file's sensor-ID params (INS_ACC*_ID /
   *  COMPASS_DEV_ID*) against the live FC values:
   *   - 'verified' → at least one ID present in both file and live, all match
   *   - 'mismatch' → at least one ID present in both, values disagree
   *                  (file is from a different physical board)
   *   - 'missing'  → file contains no IDs for this category; we cannot
   *                  verify the source board so the apply is refused
   */
  idStatus: 'verified' | 'mismatch' | 'missing';
  /** IDs that disagreed (only populated when idStatus === 'mismatch'). */
  idMismatches: ReadonlyArray<{ paramId: string; fileValue: number; liveValue: number }>;
}

export interface LoadedCalibration {
  filePath: string;
  vehicleType: string | null;
  /** All calibration params from the file (accel + mag only). */
  params: LoadedCalParam[];
  /** Total params in the source file (calibration + non-calibration). */
  fileTotalCount: number;
  /** Per-category validation. Used by the UI to disable category checkboxes
   *  and the Apply button when the file has no real cal data or comes from
   *  a different physical board. */
  validation: Record<CalibrationCategory, CategoryValidation>;
}

export interface LoadedCalibrationResult {
  applied: number;
  failed: number;
  /** True if the change requires a reboot to fully take effect. */
  rebootRecommended: boolean;
}

export interface ApplyLoadedCalibrationOptions {
  categories: ReadonlySet<CalibrationCategory>;
}

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
  // True after the user confirms the LAST 6-point position, while we wait
  // for the FC's "Calibration successful" message (or the 8s safety-net
  // fallback). Used to swap the calibrating UI into a "finalizing" state
  // so the user doesn't see a Cancel button next to all-green positions.
  isFinalizing: boolean;
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

  // Persistent storage save state (INAV only - survives firmware updates)
  isSavingPersistent: boolean;
  savePersistentSuccess: boolean;
  savePersistentError: string | null;

  // Track completed calibrations this session (arming flags may not clear until reboot)
  completedCalibrations: Set<CalibrationTypeId>;

  // Pre-cal snapshot of MAVLink params we'll diff against on completion.
  // Captured when the user clicks Start; cleared on reset.
  paramSnapshot: Record<string, number> | null;

  // Result of the post-cal param re-read + diff. Populated by handleCalibrationComplete
  // for MAVLink calibrations only. See CalibrationVerification in calibration-types.ts.
  verification: CalibrationVerification | null;

  // Force-accept calibration-from-file flow (#16). Independent of the live-cal
  // state above — the user can have a loaded file pending while the calibrating
  // step is doing nothing.
  loadedCalibration: LoadedCalibration | null;
  isApplyingLoadedCalibration: boolean;
  /** Streamed during the apply batch — confirmed = how many PARAM_VALUE echoes
   *  have come back from the FC; total includes lock-flag writes too. */
  loadedCalibrationApplyProgress: { applied: number; total: number } | null;
  loadedCalibrationResult: LoadedCalibrationResult | null;

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
  saveCalibrationPersistent: () => Promise<void>;

  // Progress updates (called from IPC events)
  handleProgressUpdate: (progress: number, statusText: string, position?: AccelPosition, positionStatus?: boolean[], countdown?: number, compassProgress?: number[]) => void;
  handleCalibrationComplete: (success: boolean, data?: CalibrationData, error?: string) => void;

  // Force-accept calibration-from-file actions (#16)
  loadCalibrationFromFile: () => Promise<{ ok: boolean; error?: string; calCount?: number }>;
  applyLoadedCalibration: (opts: ApplyLoadedCalibrationOptions) => Promise<void>;
  clearLoadedCalibration: () => void;
  dismissLoadedCalibrationResult: () => void;

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
  isFinalizing: false,
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

  isSavingPersistent: false,
  savePersistentSuccess: false,
  savePersistentError: null,

  completedCalibrations: new Set(),

  paramSnapshot: null,
  verification: null,

  loadedCalibration: null,
  isApplyingLoadedCalibration: false,
  loadedCalibrationApplyProgress: null,
  loadedCalibrationResult: null,

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
      isSavingPersistent: false,
      savePersistentSuccess: false,
      savePersistentError: null,
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
      isSavingPersistent: false,
      savePersistentSuccess: false,
      savePersistentError: null,
      // Reset prior verification result
      paramSnapshot: null,
      verification: null,
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

    // Snapshot the params we'll diff against on completion. Only meaningful
    // for MAVLink (the verification feature is ArduPilot-only). We use an
    // explicit PARAM_READ_BATCH instead of reading from the parameter-store
    // cache because:
    //   1. The cache might not have the INS_*/AHRS_TRIM_* params loaded yet
    //      if the user clicks Start before the initial bulk param fetch
    //      finishes (common on slow links / SITL TCP).
    //   2. Reading from the FC right now guarantees the snapshot keys match
    //      whatever the post-cal read returns, so the diff can never silently
    //      compare against an empty snapshot.
    // Cost is one round-trip (~1-2s for ~18 params in parallel).
    // Post-cal verification diffs ArduPilot INS_*/COMPASS_OFS_* params, which
    // do not exist on PX4. Skip the snapshot for PX4 so verification is not
    // attempted (otherwise it would report a misleading "silent failure").
    const isPx4 = useConnectionStore.getState().connectionState.firmware === 'px4';
    let paramSnapshot: Record<string, number> | null = null;
    if (protocol === 'mavlink' && !isPx4) {
      const trackedParams = MAVLINK_CALIBRATION_PARAMS[calibrationType];
      if (trackedParams && trackedParams.length > 0) {
        try {
          const result = await window.electronAPI?.readParameterBatch([...trackedParams]);
          if (result?.success && Object.keys(result.values).length > 0) {
            paramSnapshot = result.values;
          } else {
            // Fall back to the cache so we still try to verify if the live
            // read failed for some reason. Better than nothing.
            paramSnapshot = {};
            const cache = useParameterStore.getState().parameters;
            for (const id of trackedParams) {
              const p = cache.get(id);
              if (p) paramSnapshot[id] = p.value;
            }
          }
        } catch (err) {
          console.warn('[Calibration] Pre-cal snapshot read failed, falling back to cache:', err);
          paramSnapshot = {};
          const cache = useParameterStore.getState().parameters;
          for (const id of trackedParams) {
            const p = cache.get(id);
            if (p) paramSnapshot[id] = p.value;
          }
        }
      }
    }

    set({
      isCalibrating: true,
      currentStep: 'calibrating',
      error: null,
      progress: 0,
      paramSnapshot,
      verification: null,
    });

    try {
      // Call the IPC to start calibration, passing protocol so handler routes to MSP or MAVLink
      const result = await window.electronAPI?.calibrationStart({ type: calibrationType, protocol: protocol ?? undefined });

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

      const newStatus = [...get().positionStatus];
      newStatus[currentPosition] = true;
      const { protocol } = get();

      if (currentPosition < 5) {
        if (protocol === 'mavlink') {
          // MAVLink: do NOT advance position — AP drives the state machine
          // via COMMAND_LONG (handleIncomingCommandLong → handleProgressUpdate).
          set({
            positionStatus: newStatus,
            statusText: 'Waiting for flight controller...',
            progress: ((currentPosition + 1) / 6) * 100,
          });
        } else {
          // MSP: FC doesn't send position updates, advance immediately
          set({
            currentPosition: (currentPosition + 1) as AccelPosition,
            positionStatus: newStatus,
            statusText: `Place vehicle ${ACCEL_6POINT_POSITIONS[currentPosition + 1]}`,
            progress: ((currentPosition + 1) / 6) * 100,
          });
        }
      } else {
        if (protocol === 'mavlink') {
          // MAVLink: wait for AP's "Calibration successful" STATUSTEXT
          set({
            positionStatus: newStatus,
            progress: 100,
            isFinalizing: true,
            statusText: 'Finalizing calibration on flight controller...',
          });
        } else {
          // MSP: all positions done, complete event comes from main process
          set({
            positionStatus: newStatus,
            progress: 100,
            isFinalizing: true,
            statusText: 'Saving calibration...',
          });
        }
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
      isFinalizing: false,
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

  saveCalibrationPersistent: async () => {
    const { protocol } = get();
    set({ isSavingPersistent: true, savePersistentError: null, savePersistentSuccess: false });

    try {
      let result: { success: boolean; error?: string } | undefined;

      if (protocol === 'mavlink') {
        // ArduPilot: write all parameters (including calibration offsets) to flash
        // Uses MAV_CMD_PREFLIGHT_STORAGE (245) which persists across firmware updates
        result = await window.electronAPI?.writeParamsToFlash();
      } else {
        // MSP (INAV): use CLI `cali_save` to write to bootloader partition
        result = await window.electronAPI?.calibrationSavePersistent();
      }

      if (!result?.success) {
        throw new Error(result?.error || 'Failed to save to persistent storage');
      }

      set({ isSavingPersistent: false, savePersistentSuccess: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save to persistent storage';
      set({ isSavingPersistent: false, savePersistentError: message, savePersistentSuccess: false });
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
    const { calibrationType, protocol, paramSnapshot } = get();

    // Decide up front whether we'll run verification, so the initial state
    // transition can include `verification: pending` atomically. Without
    // this the UI would briefly flash a green "Complete!" banner before
    // flipping to the cyan "Verifying…" banner on the next set().
    const willVerify = !!(
      success &&
      protocol === 'mavlink' &&
      calibrationType &&
      paramSnapshot &&
      MAVLINK_CALIBRATION_PARAMS[calibrationType]
    );

    set({
      isCalibrating: false,
      isFinalizing: false,
      currentStep: 'complete',
      calibrationSuccess: success,
      calibrationData: data || null,
      error: error || null,
      progress: success ? 100 : get().progress,
      verification: willVerify ? { status: 'pending', results: [] } : null,
    });

    // Post-cal verification: only on success, MAVLink, and only when we
    // actually captured a snapshot at start time. Skipped types (MSP, opflow)
    // and missing snapshots fall through to verification: null which the UI
    // treats as "not applicable".
    if (willVerify && calibrationType && paramSnapshot) {
      void verifyCalibrationParams(calibrationType, paramSnapshot)
        .then((result) => {
          // Verification is the source of truth. If the tracked params
          // didn't move, the FC silently failed (or the 8s fallback fired
          // optimistically while AP never actually wrote anything). The
          // post-cal param state is the only reliable witness, so override
          // the optimistic success and flip to failed. This converts the
          // confusing "green banner + yellow warning" UI into a single
          // unambiguous outcome the user can act on.
          if (result.status === 'unchanged') {
            set({
              verification: result,
              calibrationSuccess: false,
              error: 'Flight controller reported success, but the calibration parameters did not change. The calibration silently failed — please try again.',
            });
          } else {
            set({ verification: result });
          }
        })
        .catch((err) => {
          const message = err instanceof Error ? err.message : 'Verification failed';
          set({ verification: { status: 'error', results: [], error: message } });
        });
    } else if (success && protocol === 'mavlink' && calibrationType && !MAVLINK_CALIBRATION_PARAMS[calibrationType]) {
      set({ verification: { status: 'skipped', results: [] } });
    }
  },

  // ============================================================================
  // Force-accept calibration from file (#16)
  // ============================================================================

  loadCalibrationFromFile: async () => {
    const result = await window.electronAPI?.loadParamsFromFile();
    if (!result?.success || !result.params) {
      return { ok: false, error: result?.error ?? 'Failed to load file' };
    }

    // Filter to only calibration params (accel + mag; gyro is intentionally
    // excluded — see calibration-param-groups.ts header) and join with the
    // live param cache so the UI can show file→FC diffs. Params not present
    // in the cache (e.g. INS_ACC3* on a single-IMU board) are kept with
    // currentValue=undefined.
    const livecache = useParameterStore.getState().parameters;
    const filtered: LoadedCalParam[] = [];
    for (const p of result.params) {
      const info = categorizeCalibrationParam(p.id);
      if (!info) continue;
      const existing = livecache.get(p.id);
      filtered.push({
        paramId: p.id,
        fileValue: p.value,
        currentValue: existing?.value,
        info,
      });
    }

    // Sort: by category (accel→mag), then by paramId — stable order makes
    // the per-category preview easy to scan.
    const categoryOrder: Record<CalibrationCategory, number> = { accel: 0, mag: 1 };
    filtered.sort((a, b) => {
      const co = categoryOrder[a.info.category] - categoryOrder[b.info.category];
      if (co !== 0) return co;
      return a.paramId.localeCompare(b.paramId);
    });

    const validation: Record<CalibrationCategory, CategoryValidation> = {
      accel: validateCategory('accel', filtered),
      mag: validateCategory('mag', filtered),
    };

    set({
      loadedCalibration: {
        filePath: result.filePath ?? '',
        vehicleType: result.vehicleType ?? null,
        params: filtered,
        fileTotalCount: result.params.length,
        validation,
      },
      loadedCalibrationResult: null,
      loadedCalibrationApplyProgress: null,
    });

    return { ok: true, calCount: filtered.length };
  },

  applyLoadedCalibration: async (opts) => {
    const loaded = get().loadedCalibration;
    if (!loaded) return;

    // Build the write list from the user's selection. Sensor-identity params
    // (DEV_IDs / INS_*_ID) are validated at load time and never written —
    // if the IDs already match the live FC there's nothing to do; if they
    // don't, the user shouldn't be applying this file anyway (the dialog
    // blocks Apply when validation fails).
    //
    // No lock-in flags (INS_GYR_CAL, COMPASS_LEARN) are touched — those are
    // vehicle-config decisions, not cal data, and the previous auto-write
    // surprised operators by silently disabling unrelated subsystems (#16).
    const toWrite: Array<{ paramId: string; value: number; type: number }> = [];
    const livecache = useParameterStore.getState().parameters;

    for (const p of loaded.params) {
      if (!opts.categories.has(p.info.category)) continue;
      // Validation must have passed for this category. The UI blocks Apply
      // when it hasn't, but defend in depth — caller could bypass via store API.
      const v = loaded.validation[p.info.category];
      if (!v.hasCalData || v.idStatus !== 'verified') continue;
      // Skip dev-id params — they already match (validation enforced it).
      if (p.info.kind === 'devid') continue;
      // Skip params that don't exist on the FC at all — PARAM_SET on a
      // missing param wastes a slot in the batch and the FC won't echo
      // PARAM_VALUE back, so it would hit the timeout.
      if (p.currentValue === undefined) continue;
      // Use the FC's current type if known; default to REAL32 (9) for cal data
      const type = livecache.get(p.paramId)?.type ?? 9;
      toWrite.push({ paramId: p.paramId, value: p.fileValue, type });
    }

    if (toWrite.length === 0) {
      set({
        loadedCalibrationResult: {
          applied: 0,
          failed: 0,
          rebootRecommended: false,
        },
      });
      return;
    }

    set({
      isApplyingLoadedCalibration: true,
      loadedCalibrationApplyProgress: { applied: 0, total: toWrite.length },
    });

    // Subscribe to streaming progress (guarded against stale preload — same
    // pattern as parameter-store.applySelectedFileParams).
    let unsubscribe: (() => void) | undefined;
    if (typeof window.electronAPI?.onParamSetBatchProgress === 'function') {
      unsubscribe = window.electronAPI.onParamSetBatchProgress(({ confirmed, total }) => {
        if (total !== toWrite.length) return;
        set({ loadedCalibrationApplyProgress: { applied: confirmed, total } });
      });
    }

    let result: Awaited<ReturnType<NonNullable<typeof window.electronAPI>['setParameterBatch']>> | undefined;
    try {
      result = await window.electronAPI?.setParameterBatch(toWrite);
    } finally {
      unsubscribe?.();
    }

    const applied = result?.confirmed ?? 0;
    const failed = toWrite.length - applied;

    // Flush to flash so the values survive a power cycle. Cal params are
    // already auto-saved on PARAM_SET in modern AP, but PREFLIGHT_STORAGE
    // is the documented "make sure" path and matches what Mission Planner
    // does after a manual cal accept.
    if (applied > 0) {
      await window.electronAPI?.writeParamsToFlash();
    }

    // Mirror the writes into the parameter-store cache so the Parameters
    // screen reflects them without a refresh.
    if (applied > 0) {
      const failedSet = new Set(result?.failed ?? []);
      const paramStore = useParameterStore.getState();
      const totalParams = paramStore.parameters.size;
      for (const w of toWrite) {
        if (failedSet.has(w.paramId)) continue;
        paramStore.updateParameter({
          paramId: w.paramId,
          paramValue: w.value,
          paramType: w.type,
          paramIndex: -1,
          paramCount: totalParams,
        });
      }
    }

    set({
      isApplyingLoadedCalibration: false,
      loadedCalibrationApplyProgress: null,
      loadedCalibrationResult: {
        applied,
        failed,
        rebootRecommended: applied > 0,
      },
    });
  },

  clearLoadedCalibration: () => {
    set({
      loadedCalibration: null,
      loadedCalibrationResult: null,
      loadedCalibrationApplyProgress: null,
      isApplyingLoadedCalibration: false,
    });
  },

  dismissLoadedCalibrationResult: () => {
    set({ loadedCalibrationResult: null });
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
      isFinalizing: false,
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
      isSavingPersistent: false,
      savePersistentSuccess: false,
      savePersistentError: null,
      completedCalibrations: new Set(),
      paramSnapshot: null,
      verification: null,
      loadedCalibration: null,
      isApplyingLoadedCalibration: false,
      loadedCalibrationApplyProgress: null,
      loadedCalibrationResult: null,
    });
  },
}));

// ============================================================================
// MAVLink calibration verification helper
// ============================================================================

/**
 * Re-fetch the params we snapshotted before the calibration ran and diff
 * them. Returns:
 *   - 'verified'  if at least one tracked param moved beyond the epsilon
 *   - 'unchanged' if every tracked param that exists on the FC is identical
 *                 (the FC reported success but didn't actually write anything)
 *   - 'error'     if the param re-read failed entirely
 *
 * Params present in the snapshot but missing from the post-cal read are
 * treated as "doesn't exist on this FC" and ignored (e.g. INS_ACC3* on a
 * single-IMU board) — they don't count toward changed or unchanged.
 */
async function verifyCalibrationParams(
  calType: CalibrationTypeId,
  snapshot: Record<string, number>,
): Promise<CalibrationVerification> {
  const tracked = MAVLINK_CALIBRATION_PARAMS[calType];
  if (!tracked) {
    return { status: 'skipped', results: [] };
  }

  const epsilon = CALIBRATION_DIFF_EPSILON[calType] ?? 1e-4;

  const result = await window.electronAPI?.readParameterBatch([...tracked]);
  if (!result || !result.success) {
    return {
      status: 'error',
      results: [],
      error: result?.error ?? 'Failed to read calibration parameters',
    };
  }

  const results: ParamReadResult[] = [];
  let changedCount = 0;
  let comparedCount = 0;

  for (const paramId of tracked) {
    const before = snapshot[paramId];
    const after = result.values[paramId];
    // Skip params that weren't present on this FC (or weren't in snapshot —
    // possibly because the param store didn't have them at start time).
    if (before === undefined || after === undefined) continue;

    const changed = Math.abs(after - before) > epsilon;
    results.push({ paramId, before, after, changed });
    comparedCount++;
    if (changed) changedCount++;
  }

  if (comparedCount === 0) {
    // Couldn't actually compare anything — treat as error so the UI flags it
    return {
      status: 'error',
      results,
      error: 'No tracked parameters could be read from the flight controller',
    };
  }

  return {
    status: changedCount > 0 ? 'verified' : 'unchanged',
    results,
  };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Build a CategoryValidation entry for one calibration category from the
 * filtered list of loaded params. Two checks run independently:
 *
 *   1. hasCalData — is there any non-zero offset for this category? A file
 *      with all-zero INS_ACCOFFS_* / COMPASS_OFS_* values has no real cal
 *      data (the user probably saved before calibrating, or the file came
 *      from a freshly-flashed FC). Applying it would clobber the live cal
 *      and trip the "3D calibration needed" prearm. We use the OFFSET kind
 *      as the discriminator because SCALE/ELLIPSOID/MOT have unit-valued
 *      defaults (1.0) that aren't useful as a "no data" signal, while
 *      OFFSETs default to 0 and only become non-zero after a real cal run.
 *
 *   2. idStatus — does this file come from the same physical board as the
 *      live FC? We require at least one ID param (INS_ACC*_ID for accel,
 *      COMPASS_DEV_ID* for mag) to be present in BOTH the file and the
 *      live param cache, and require all such overlapping IDs to match.
 *      If no ID overlap exists, we can't verify the source — refuse rather
 *      than silently write potentially wrong cal values.
 */
function validateCategory(
  category: CalibrationCategory,
  params: ReadonlyArray<LoadedCalParam>,
): CategoryValidation {
  let hasNonZeroOffset = false;
  const idMismatches: Array<{ paramId: string; fileValue: number; liveValue: number }> = [];
  let idsCompared = 0;

  for (const p of params) {
    if (p.info.category !== category) continue;

    if (p.info.kind === 'offset' && p.fileValue !== 0) {
      hasNonZeroOffset = true;
    }

    if (p.info.kind === 'devid' && p.currentValue !== undefined) {
      idsCompared++;
      if (p.fileValue !== p.currentValue) {
        idMismatches.push({
          paramId: p.paramId,
          fileValue: p.fileValue,
          liveValue: p.currentValue,
        });
      }
    }
  }

  let idStatus: CategoryValidation['idStatus'];
  if (idsCompared === 0) {
    idStatus = 'missing';
  } else if (idMismatches.length > 0) {
    idStatus = 'mismatch';
  } else {
    idStatus = 'verified';
  }

  return {
    hasCalData: hasNonZeroOffset,
    idStatus,
    idMismatches,
  };
}

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
