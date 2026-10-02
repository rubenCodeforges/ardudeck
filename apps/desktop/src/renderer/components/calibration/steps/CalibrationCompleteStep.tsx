/**
 * CalibrationCompleteStep - Shows calibration results
 *
 * Displays success/failure status, calibration data, and save option.
 * Auto-redirects to select screen after successful save.
 */

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCalibrationStore } from '../../../stores/calibration-store';
import { assessAccelCalibration, assessCompassFitness, type CalibrationVerdict } from '../../../../shared/calibration-quality';
import { useConnectionStore } from '../../../stores/connection-store';
import { CALIBRATION_TYPES, calibrationTypeName, type CalibrationVerification } from '../../../../shared/calibration-types';
import { boardSupportsPersistentParamSave } from '../../../../shared/board-mappings';
import { CalibrationResultCard } from '../shared/CalibrationResultCard';
import { CompassFitPanel } from '../shared/CompassFitPanel';

const ROTATION_NAMES: Record<number, string> = {
  0: 'None', 1: 'Yaw 45', 2: 'Yaw 90', 3: 'Yaw 135', 4: 'Yaw 180',
  5: 'Yaw 225', 6: 'Yaw 270', 7: 'Yaw 315', 8: 'Roll 180', 12: 'Pitch 180',
};
function rotationName(o: number | null): string {
  if (o == null) return '-';
  return ROTATION_NAMES[o] ?? `Rotation ${o}`;
}
/** Verdict styling. The judgement itself lives in shared/calibration-quality
 *  so the wizard, the stored record and the preflight card cannot disagree. */
const VERDICT_STYLE: Record<CalibrationVerdict, { labelKey: string; cls: string }> = {
  good: { labelKey: 'calibration:calibrationCompleteStep.verdictGood', cls: 'text-green-400 bg-green-500/15 border-green-500/30' },
  marginal: { labelKey: 'calibration:calibrationCompleteStep.verdictMarginal', cls: 'text-amber-400 bg-amber-500/15 border-amber-500/30' },
  bad: { labelKey: 'calibration:calibrationCompleteStep.verdictPoor', cls: 'text-red-400 bg-red-500/15 border-red-500/30' },
  unknown: { labelKey: 'common:unknown', cls: 'text-content-secondary bg-surface-raised border-subtle' },
};

const VERDICT_ORDER: Record<CalibrationVerdict, number> = { good: 0, unknown: 1, marginal: 2, bad: 3 };

export function CalibrationCompleteStep() {
  const { t } = useTranslation();
  const {
    calibrationType,
    calibrationSuccess,
    calibrationData,
    calibrationRebootRequired,
    calibrationUnconfirmed,
    error,
    isSaving,
    saveSuccess,
    saveError,
    isSavingPersistent,
    savePersistentSuccess,
    savePersistentError,
    fcVariant,
    verification,
    setStep,
    saveCalibrationData,
    saveCalibrationPersistent,
    selectCalibrationType,
  } = useCalibrationStore();

  const isInav = fcVariant?.toUpperCase().includes('INAV');
  const isMavlink = !isInav; // ArduPilot or other MAVLink-based FC

  // F4-based ArduPilot boards (e.g. SpeedyBee F405 Wing) use main-flash sector
  // storage that gets erased on firmware update — MAV_CMD_PREFLIGHT_STORAGE
  // succeeds but params don't actually persist across an upgrade. Only show
  // the persistent-save button on F7/H7 boards where it does what it claims.
  const boardId = useConnectionStore((s) => s.connectionState.boardId) ?? null;
  const showPersistentSave = isMavlink ? boardSupportsPersistentParamSave(boardId) : true;

  const calTypeInfo = calibrationType
    ? CALIBRATION_TYPES.find((c) => c.id === calibrationType)
    : null;

  const handleRecalibrate = () => {
    if (calibrationType) {
      selectCalibrationType(calibrationType);
    }
  };

  const handleStartNew = () => {
    setStep('select');
  };

  const [isRebooting, setIsRebooting] = useState(false);
  const [rebootError, setRebootError] = useState<string | null>(null);
  const handleReboot = async () => {
    setIsRebooting(true);
    setRebootError(null);
    try {
      const ok = await window.electronAPI?.mavlinkReboot();
      if (!ok) {
        setRebootError(t('calibration:calibrationCompleteStep.rebootFailed'));
        setIsRebooting(false);
        return;
      }
      // Reboot + reconnect runs in the background; leave the wizard.
      setStep('select');
    } catch (err) {
      setRebootError(err instanceof Error ? err.message : t('common:unknownError'));
      setIsRebooting(false);
    }
  };

  // Auto-redirect to select screen after persistent save completes
  // After normal save, we show the persistent storage option instead of auto-redirecting
  useEffect(() => {
    if (savePersistentSuccess) {
      const timer = setTimeout(() => setStep('select'), 2000);
      return () => clearTimeout(timer);
    }
  }, [savePersistentSuccess, setStep]);

  // While verification is in flight we don't yet know whether the cal really
  // applied — the FC's optimistic ACK (or the 8s fallback) might be a lie.
  // Show a neutral "verifying" banner instead of flashing green→red when the
  // verification eventually flips success to false.
  const isVerifying = verification?.status === 'pending';

  // Judge the six-point result from the parameters it actually wrote, using the
  // same engine as the stored record so the wizard and the preflight card can
  // never disagree about the same calibration.
  const accelAssessment = useMemo(() => {
    if (calibrationType !== 'accel-6point' || !verification) return null;
    const v: Record<string, number> = {};
    for (const row of verification.results) {
      if (row.after !== undefined && row.after !== null) v[row.paramId] = row.after;
    }
    if (v.INS_ACCOFFS_X === undefined && v.INS_ACCSCAL_X === undefined) return null;
    return assessAccelCalibration({
      offsets: v.INS_ACCOFFS_X !== undefined
        ? { x: v.INS_ACCOFFS_X, y: v.INS_ACCOFFS_Y ?? 0, z: v.INS_ACCOFFS_Z ?? 0 }
        : undefined,
      scales: v.INS_ACCSCAL_X !== undefined
        ? { x: v.INS_ACCSCAL_X, y: v.INS_ACCSCAL_Y ?? 1, z: v.INS_ACCSCAL_Z ?? 1 }
        : undefined,
    });
  }, [calibrationType, verification]);
  // "Unconfirmed" is success reported by a fallback that verification could
  // not settle (no snapshot, or the re-read errored). It must read as a
  // warning, never as a confirmed green success.
  const showUnconfirmed = calibrationSuccess === true && !isVerifying && calibrationUnconfirmed;
  const showSuccess = calibrationSuccess === true && !isVerifying && !calibrationUnconfirmed;
  const showFailure = calibrationSuccess === false;

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Success / Unconfirmed / Failure / Verifying Banner */}
      <div className={`rounded-xl p-6 text-center ${
        isVerifying
          ? 'bg-cyan-500/10 border border-cyan-500/30'
          : showSuccess
            ? 'bg-green-500/10 border border-green-500/30'
            : showUnconfirmed
              ? 'bg-amber-500/10 border border-amber-500/30'
              : 'bg-red-500/10 border border-red-500/30'
      }`}>
        <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full mb-4 ${
          isVerifying
            ? 'bg-cyan-500/20'
            : showSuccess ? 'bg-green-500/20' : showUnconfirmed ? 'bg-amber-500/20' : 'bg-red-500/20'
        }`}>
          {isVerifying ? (
            <svg className="w-8 h-8 text-cyan-400 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : showSuccess ? (
            <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : showUnconfirmed ? (
            <svg className="w-8 h-8 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M10.29 3.86l-8.02 13.89A2 2 0 004 21h16a2 2 0 001.73-3.25L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          ) : (
            <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
        </div>

        <h3 className={`text-xl font-semibold mb-2 ${
          isVerifying
            ? 'text-cyan-300'
            : showSuccess ? 'text-green-400' : showUnconfirmed ? 'text-amber-400' : 'text-red-400'
        }`}>
          {isVerifying
            ? t('calibration:calibrationCompleteStep.verifyingTitle')
            : showSuccess ? t('calibration:calibrationCompleteStep.successTitle') : showUnconfirmed ? t('calibration:calibrationCompleteStep.unconfirmedTitle') : t('calibration:calibrationCompleteStep.failedTitle')}
        </h3>

        <p className="text-content-secondary">
          {isVerifying
            ? t('calibration:calibrationCompleteStep.verifyingBody')
            : showSuccess
              ? t('calibration:calibrationCompleteStep.successBody', { name: calTypeInfo ? calibrationTypeName(calTypeInfo) : undefined })
              : showUnconfirmed
                ? t('calibration:calibrationCompleteStep.unconfirmedBody')
                : error || t('calibration:calibrationCompleteStep.failedBody')}
        </p>
      </div>

      {/* Calibration Results — hidden during verification because the verification
          may flip success→false, and we don't want to show "Calibration Results"
          for a calibration that didn't actually apply. */}
      {showSuccess && calibrationData && (
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-content uppercase tracking-wide">
            {t('calibration:calibrationCompleteStep.results')}
          </h4>

          <CalibrationResultCard data={calibrationData} type={calibrationType!} />
        </div>
      )}

      {/* Per-compass fit: score, keep-or-drop and priority in one place, so a
          three-compass result is a decision the pilot can act on here. */}
      {showSuccess && calibrationType === 'compass' && calibrationData?.compassResults?.length ? (
        <CompassFitPanel results={calibrationData.compassResults} />
      ) : null}

      {/* Accelerometer fit. The six-point cal has no fitness number, so it is
          judged on the values it produced: offsets that are large, or scales
          far from 1.0, mean a level that will not hold even though the FC
          reported success. */}
      {showSuccess && calibrationType === 'accel-6point' && accelAssessment && accelAssessment.verdict !== 'unknown' ? (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-content uppercase tracking-wide">{t('calibration:calibrationCompleteStep.accelFit')}</h4>
          <div className="flex items-center justify-between bg-surface rounded-lg border border-subtle p-3">
            <div className="text-sm text-content">{accelAssessment.summary}</div>
            <span className={`px-2 py-0.5 rounded-full border text-[11px] font-medium ${VERDICT_STYLE[accelAssessment.verdict].cls}`}>
              {t(VERDICT_STYLE[accelAssessment.verdict].labelKey)}
            </span>
          </div>
          {accelAssessment.advice && (
            <p className={`text-xs ${accelAssessment.verdict === 'bad' ? 'text-red-400/90' : 'text-amber-400/90'}`}>
              {accelAssessment.advice}
            </p>
          )}
        </div>
      ) : null}

      {/* Reboot required (compass on ArduPilot): offsets don't take effect and
          the EKF reports yaw inconsistent until the FC restarts. */}
      {showSuccess && calibrationRebootRequired && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
          <h4 className="text-sm font-medium text-content mb-1">{t('calibration:calibrationCompleteStep.rebootRequired')}</h4>
          <p className="text-xs text-content-secondary mb-3">
            {t('calibration:calibrationCompleteStep.rebootRequiredBody')}
          </p>
          {rebootError && <p className="text-xs text-red-400 mb-2">{rebootError}</p>}
          <button
            onClick={handleReboot}
            disabled={isRebooting}
            className="px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-amber-400 text-sm font-medium transition-colors"
          >
            {isRebooting ? t('calibration:loadCalibrationFromFileDialog.rebooting') : t('common:rebootNow')}
          </button>
        </div>
      )}

      {/* Parameter verification (MAVLink only) — diff of FC params before/after.
          Rendered on both success AND failure: if the store flipped success→false
          because verification status is 'unchanged', the user still needs to see
          the param table to understand WHY the cal failed. */}
      {verification && verification.status !== 'skipped' && (
        <CalibrationVerificationCard verification={verification} />
      )}

      {/* Save Error */}
      {saveError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-center">
          <p className="text-red-400 text-sm">{saveError}</p>
        </div>
      )}

      {/* Action Buttons — hidden during verification so the user can't bail
          out (or save a non-applied cal to flash) before we know the truth. */}
      {!isVerifying && (
      <div className="flex justify-between items-center pt-4">
        {/*
          On success this is the "I'm done, take me back" exit. On failure
          it's "give up retrying". Same destination either way (the calibration
          select screen) but the label needs to match the user's mental model
          so a successful cal doesn't feel like it has an undo button hanging
          off the side of the screen.
        */}
        {showSuccess ? (
          <button
            onClick={handleStartNew}
            className="px-4 py-2.5 text-content hover:text-content transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            {t('calibration:calibrationCompleteStep.backToCalibrations')}
          </button>
        ) : (
          <button
            onClick={handleStartNew}
            className="px-4 py-2.5 text-content-secondary hover:text-content transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            {t('common:cancel')}
          </button>
        )}

        <div className="flex gap-3">
          {showFailure && (
            <button
              onClick={handleRecalibrate}
              className="px-4 py-2.5 bg-yellow-500/20 hover:bg-yellow-500/30 rounded-lg text-yellow-400 transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {t('calibration:calibrationCompleteStep.tryAgain')}
            </button>
          )}

          {/* MSP/INAV: separate "Save to FC" step (writes to EEPROM via MSP) */}
          {showSuccess && !isMavlink && !saveSuccess && (
            <button
              onClick={saveCalibrationData}
              disabled={isSaving}
              className="px-6 py-2.5 bg-cyan-500 hover:bg-cyan-400 disabled:bg-cyan-500/50 disabled:cursor-not-allowed rounded-lg text-white font-medium transition-colors flex items-center gap-2"
            >
              {isSaving ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  {t('common:saving')}
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                  </svg>
                  {t('calibration:calibrationCompleteStep.saveToFc')}
                </>
              )}
            </button>
          )}

          {saveSuccess && !isMavlink && (
            <div className="px-6 py-2.5 bg-green-500/20 rounded-lg text-green-400 font-medium flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              {t('calibration:calibrationCompleteStep.savedSuccessfully')}
            </div>
          )}
        </div>
      </div>
      )}

      {/* Persistent Storage Option */}
      {/* MSP: shown after "Save to FC" succeeds. */}
      {/* MAVLink/ArduPilot: shown immediately after a successful calibration on
          F7/H7 boards. F4 boards are excluded — see showPersistentSave.
          Hidden during verification because we don't yet know if cal applied. */}
      {showSuccess && showPersistentSave && (isMavlink ? !savePersistentSuccess : (saveSuccess && !savePersistentSuccess)) && (
        <div className="bg-surface rounded-xl border border-subtle p-5">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
              </svg>
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-medium text-content mb-1">
                {isMavlink ? t('calibration:calibrationCompleteStep.saveToFlash') : t('calibration:calibrationCompleteStep.saveToPersistent')}
              </h4>
              <p className="text-xs text-content-secondary mb-3">
                {isMavlink
                  ? t('calibration:calibrationCompleteStep.saveToFlashBody')
                  : t('calibration:calibrationCompleteStep.saveToPersistentBody')}
              </p>

              {savePersistentError && (
                <p className="text-xs text-red-400 mb-3">{savePersistentError}</p>
              )}

              <div className="flex items-center gap-3">
                <button
                  onClick={saveCalibrationPersistent}
                  disabled={isSavingPersistent}
                  className="px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 disabled:bg-amber-500/10 disabled:cursor-not-allowed rounded-lg text-amber-400 text-sm font-medium transition-colors flex items-center gap-2"
                >
                  {isSavingPersistent ? (
                    <>
                      <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      {t('common:saving')}
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
                      </svg>
                      {isMavlink ? t('calibration:calibrationCompleteStep.saveToFlash') : t('calibration:calibrationCompleteStep.saveToPersistent')}
                    </>
                  )}
                </button>

                <button
                  onClick={() => setStep('select')}
                  disabled={isSavingPersistent}
                  className="text-xs text-content-secondary hover:text-content-secondary transition-colors"
                >
                  {t('common:skip')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {savePersistentSuccess && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 flex items-center gap-3">
          <svg className="w-4 h-4 text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <p className="text-sm text-green-400">
            {isMavlink
              ? t('calibration:calibrationCompleteStep.savedToFcStorage')
              : t('calibration:calibrationCompleteStep.savedToPersistent')}
          </p>
        </div>
      )}

      {/* Info note — uses showSuccess (not raw calibrationSuccess) so notes
          stay hidden during the verification window. */}
      {showSuccess && !saveSuccess && !isMavlink && (
        <p className="text-center text-xs text-content-secondary">
          {t('calibration:calibrationCompleteStep.noteMsp')}
        </p>
      )}
      {showSuccess && isMavlink && showPersistentSave && !savePersistentSuccess && (
        <p className="text-center text-xs text-content-secondary">
          {t('calibration:calibrationCompleteStep.noteMavlinkFlash')}
        </p>
      )}
      {showSuccess && isMavlink && !showPersistentSave && (
        <p className="text-center text-xs text-content-secondary">
          {t('calibration:calibrationCompleteStep.noteMavlinkSaved')}
        </p>
      )}
      {saveSuccess && !isMavlink && !savePersistentSuccess && (
        <p className="text-center text-xs text-green-600">
          {t('calibration:calibrationCompleteStep.noteSavedFlash')}
        </p>
      )}
      {savePersistentSuccess && (
        <p className="text-center text-xs text-green-600">
          {t('calibration:calibrationCompleteStep.noteAllSaved')}
        </p>
      )}
    </div>
  );
}

// =============================================================================
// Verification card — shows the post-cal param diff (MAVLink only)
// =============================================================================

function CalibrationVerificationCard({ verification }: { verification: CalibrationVerification }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  if (verification.status === 'pending') {
    return (
      <div className="bg-surface rounded-xl border border-subtle p-4 flex items-center gap-3">
        <svg className="w-4 h-4 animate-spin text-cyan-400 flex-shrink-0" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <p className="text-sm text-content-secondary">{t('calibration:calibrationCompleteStep.verifyingParams')}</p>
      </div>
    );
  }

  if (verification.status === 'error') {
    return (
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-amber-400 mb-1">{t('calibration:calibrationCompleteStep.couldNotVerify')}</p>
            <p className="text-xs text-amber-600">{t('calibration:calibrationCompleteStep.couldNotVerifyBody', { error: verification.error ?? t('calibration:calibrationCompleteStep.readbackFailed') })}</p>
          </div>
        </div>
      </div>
    );
  }

  const isUnchanged = verification.status === 'unchanged';
  const palette = isUnchanged
    ? { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-300', sub: 'text-amber-600', icon: 'text-amber-500' }
    : { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-300', sub: 'text-emerald-600', icon: 'text-emerald-500' };

  const changedCount = verification.results.filter(r => r.changed).length;
  const totalCount = verification.results.length;

  return (
    <div className={`${palette.bg} border ${palette.border} rounded-xl p-4`}>
      <div className="flex items-start gap-3">
        <svg className={`w-5 h-5 ${palette.icon} flex-shrink-0 mt-0.5`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          {isUnchanged ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          )}
        </svg>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${palette.text} mb-1`}>
            {isUnchanged
              ? t('calibration:calibrationCompleteStep.mayNotHaveApplied')
              : t('calibration:calibrationCompleteStep.verifiedCount', { changed: changedCount, count: totalCount })}
          </p>
          <p className={`text-xs ${palette.sub}`}>
            {isUnchanged
              ? t('calibration:calibrationCompleteStep.unchangedBody')
              : t('calibration:calibrationCompleteStep.verifiedBody')}
          </p>

          <button
            onClick={() => setExpanded(e => !e)}
            className={`mt-2 text-xs ${palette.sub} hover:opacity-100 transition-opacity flex items-center gap-1`}
          >
            <svg className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            {expanded ? t('calibration:calibrationCompleteStep.hideValues') : t('calibration:calibrationCompleteStep.showValues')}
          </button>

          {expanded && (
            <div className="mt-3 rounded-lg border border-subtle overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-surface">
                  <tr className="text-left text-content-secondary">
                    <th className="px-3 py-2 font-medium">{t('common:parameter')}</th>
                    <th className="px-3 py-2 font-medium text-right">{t('calibration:calibrationCompleteStep.colBefore')}</th>
                    <th className="px-3 py-2 font-medium text-right">{t('calibration:calibrationCompleteStep.colAfter')}</th>
                    <th className="px-3 py-2 font-medium text-right">{t('calibration:calibrationCompleteStep.colDelta')}</th>
                  </tr>
                </thead>
                <tbody>
                  {verification.results.map((r) => {
                    const delta = (r.after ?? 0) - (r.before ?? 0);
                    return (
                      <tr key={r.paramId} className="border-t border-subtle">
                        <td className="px-3 py-1.5 font-mono text-content">{r.paramId}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-content-secondary">{r.before?.toFixed(6) ?? '-'}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-content">{r.after?.toFixed(6) ?? '-'}</td>
                        <td className={`px-3 py-1.5 text-right font-mono ${r.changed ? palette.text : 'text-content-secondary'}`}>
                          {delta >= 0 ? '+' : ''}{delta.toFixed(6)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
