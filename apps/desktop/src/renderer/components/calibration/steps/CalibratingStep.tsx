/**
 * CalibratingStep - Active calibration display
 *
 * Every number shown here comes from the vehicle. When the vehicle has not
 * reported anything yet, the UI says so explicitly (animated "waiting" states
 * and an elapsed-time readout) instead of painting synthetic progress, a bar
 * that moves on its own hides exactly the stall the operator needs to see.
 */

import { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useCalibrationStore } from '../../../stores/calibration-store';
import { useConnectionStore } from '../../../stores/connection-store';
import { CALIBRATION_TYPES, accelPositionName, calibrationTypeName } from '../../../../shared/calibration-types';
import { CalibrationProgress } from '../shared/CalibrationProgress';
import { CompassCoverageView } from '../shared/CompassCoverageView';
import { useCompassCoverageStore, slowestCompassProgress } from '../../../stores/compass-coverage-store';
import { LiveOrientationGuide } from '../shared/LiveOrientationGuide';
import { CountdownTimer } from '../shared/CountdownTimer';

/** Elapsed seconds since mount, real time, not a fake countdown. */
function useElapsedSeconds(): number {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  return elapsed;
}

function formatElapsed(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Six position dots shared by the 6-point flow and the PX4 compass flow. */
function PositionDots({ positionStatus, currentPosition, highlightCurrent }: {
  positionStatus: boolean[];
  currentPosition: number;
  highlightCurrent: boolean;
}) {
  return (
    <div className="flex justify-center gap-2">
      {positionStatus.map((done, index) => (
        <div
          key={index}
          className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-all ${
            done
              ? 'bg-green-500/20 text-green-400 border border-green-500/50'
              : index === currentPosition && highlightCurrent
                ? 'bg-cyan-500/20 text-cyan-400 border-2 border-cyan-500 animate-pulse'
                : 'bg-surface-raised text-content-secondary border border-subtle'
          }`}
          data-tip={accelPositionName(index)}
        >
          {done ? (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            index + 1
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Shown while the vehicle has accepted the compass cal but no completion
 * percentage has arrived yet. Rotating early is correct (that is what makes
 * the first data appear), so the copy says to rotate, but the visual is
 * clearly "listening", not a progress bar pretending to know something.
 */
function CompassWaitingForData({ elapsed }: { elapsed: number }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-3 py-4">
      <div className="relative w-20 h-20">
        <svg className="absolute inset-0 w-full h-full animate-spin text-cyan-400" style={{ animationDuration: '3s' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
          <circle cx="12" cy="12" r="10" className="opacity-20" />
          <path strokeLinecap="round" d="M12 2a10 10 0 017.07 2.93" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <svg className="w-8 h-8 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9 9 0 100-18 9 9 0 000 18z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.5 8.5l-2 5-5 2 2-5 5-2z" />
          </svg>
        </div>
      </div>
      <div className="text-center">
        <p className="text-sm text-content">{t('calibration:calibratingStep.rotateWaiting')}</p>
        <p className="text-xs text-content-secondary mt-1">{t('calibration:calibratingStep.elapsed', { time: formatElapsed(elapsed) })}</p>
        {elapsed >= 20 && (
          <p className="text-xs text-amber-400 mt-2 max-w-sm">
            {t('calibration:calibratingStep.noProgressData')}
          </p>
        )}
      </div>
    </div>
  );
}

export function CalibratingStep() {
  const { t } = useTranslation();
  const {
    calibrationType,
    progress,
    statusText,
    currentPosition,
    positionStatus,
    countdown,
    compassProgress,
    isFinalizing,
    confirmPosition,
    cancelCalibration,
  } = useCalibrationStore();
  const isPx4 = useConnectionStore((s) => s.connectionState.firmware === 'px4');
  const elapsed = useElapsedSeconds();
  // Before the early return: a hook after it breaks hook order the moment
  // calibrationType clears mid-run.
  const coverageByCompass = useCompassCoverageStore((s) => s.byCompass);

  const calTypeInfo = calibrationType
    ? CALIBRATION_TYPES.find((c) => c.id === calibrationType)
    : null;

  if (!calibrationType || !calTypeInfo) {
    return null;
  }

  const fcHasRequestedPosition = statusText.startsWith('Place vehicle'); // i18n-exempt
  const isWaitingForConfirm =
    calibrationType === 'accel-6point' && !isPx4 && !isFinalizing &&
    !positionStatus[currentPosition] && fcHasRequestedPosition;
  const coverageProgress = slowestCompassProgress(coverageByCompass);
  // Coverage frames prove the run is live even when the FC's percentage is 0.
  const compassHasData = compassProgress.length > 0 || progress > 0 || coverageByCompass.size > 0;
  // PX4 compass runs side-by-side like an accel cal; a side has been seen
  // once any position is marked or the status mentions one.
  const px4CompassStarted = positionStatus.some(Boolean) || progress > 0;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Calibration type header */}
      <div className="text-center">
        <h3 className="text-xl font-semibold text-content mb-1">
          {calibrationTypeName(calTypeInfo)}
        </h3>
        <p className="text-sm text-content-secondary">
          {fcHasRequestedPosition ? t('calibration:calibratingStep.placeVehicle', { position: accelPositionName(currentPosition) }) : statusText}
        </p>
      </div>

      {/* Main progress display */}
      <div className="flex justify-center">
        {/* Compass (ArduPilot): listening state until real data, then the
            per-compass card below carries the numbers. */}
        {calibrationType === 'compass' && !isPx4 && !compassHasData && (
          <CompassWaitingForData elapsed={elapsed} />
        )}
        {calibrationType === 'compass' && !isPx4 && compassHasData && (
          <div className="flex flex-col items-center gap-3">
            {/* The sphere IS the progress: ArduPilot's completion mask says
                which of the 80 directions still have no samples, so the dark
                patches tell the pilot where to turn next. The bar underneath
                keeps the slowest-compass number. */}
            <CompassCoverageView active={!isFinalizing} />
            {/* Same numbers as the spheres. ArduPilot's own completion_pct
                tracks the sphere FIT, not the rotation, so it sits at 0 for
                most of a run: reading it here put "0%" under a solid that was
                visibly most of the way covered. */}
            <CalibrationProgress
              progress={coverageProgress ?? progress}
              label={t('calibration:calibratingStep.slowestCompass')}
            />
          </div>
        )}

        {/* Compass (PX4): side-driven, reuse the position dots. */}
        {calibrationType === 'compass' && isPx4 && (
          <div className="w-full space-y-3">
            {!px4CompassStarted && <CompassWaitingForData elapsed={elapsed} />}
            {px4CompassStarted && (
              <div className="flex justify-center">
                <CalibrationProgress progress={progress} indeterminate={progress === 0} label={t('calibration:calibratingStep.holdAndRotate')} />
              </div>
            )}
            <PositionDots positionStatus={positionStatus} currentPosition={currentPosition} highlightCurrent={px4CompassStarted} />
          </div>
        )}

        {/* Timed calibrations that genuinely count down (MSP opflow only) */}
        {calibrationType === 'opflow' && (
          <CountdownTimer seconds={countdown} total={calTypeInfo.estimatedDuration} />
        )}

        {/* One-shot calibrations. ArduPilot performs these synchronously and
            never reports a percentage, an honest spinner, not a dead "0%". */}
        {(calibrationType === 'accel-level' || calibrationType === 'gyro') && (
          <CalibrationProgress
            progress={progress}
            indeterminate={progress === 0}
            label={calibrationType === 'gyro' ? t('calibration:calibratingStep.keepStill') : t('calibration:calibratingStep.holdLevel')}
          />
        )}

        {/* 6-point position display */}
        {calibrationType === 'accel-6point' && (
          <div className="w-full space-y-3">
            {/* Position diagram + name inline (hidden once finalizing) */}
            {!isFinalizing && (
              <div className="flex flex-col items-center gap-2">
                {/* Live 3D target: the operator sees their own aircraft turn
                    and lock on, instead of guessing from a caption. */}
                <LiveOrientationGuide position={currentPosition} />
                <p className="text-center text-xs text-content-secondary">
                  {isPx4 ? (
                    positionStatus.some(Boolean) || fcHasRequestedPosition || progress > 0 ? (
                      <Trans
                        i18nKey="calibration:calibratingStep.detected"
                        values={{ position: accelPositionName(currentPosition), n: positionStatus.filter(Boolean).length }}
                        components={{ b: <span className="text-cyan-400 font-medium" /> }}
                      />
                    ) : (
                      <>{t('calibration:calibratingStep.holdAnySide')}</>
                    )
                  ) : (
                    <Trans
                      i18nKey="calibration:calibratingStep.positionOf"
                      values={{ n: currentPosition + 1, position: accelPositionName(currentPosition) }}
                      components={{ b: <span className="text-cyan-400 font-medium" /> }}
                    />
                  )}
                </p>
              </div>
            )}

            {/* Finalizing spinner */}
            {isFinalizing && (
              <div className="flex flex-col items-center justify-center py-4 gap-3">
                <svg className="w-10 h-10 animate-spin text-cyan-400" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <p className="text-sm text-content-secondary">{t('calibration:calibratingStep.writing')}</p>
              </div>
            )}

            <PositionDots positionStatus={positionStatus} currentPosition={currentPosition} highlightCurrent={!isFinalizing} />
          </div>
        )}
      </div>

      {/* Per-compass progress: real MAG_CAL_PROGRESS percentages, one bar
          per compass the FC is calibrating. */}
      {calibrationType === 'compass' && compassProgress.length > 0 && (
        <div className="bg-surface rounded-xl p-4 border border-subtle">
          <div className="flex justify-between items-baseline mb-3">
            <h4 className="text-sm font-medium text-content">{t('calibration:calibratingStep.compassProgress')}</h4>
            <span className="text-xs text-content-secondary">{t('calibration:calibratingStep.elapsed', { time: formatElapsed(elapsed) })}</span>
          </div>
          <div className="space-y-2">
            {compassProgress.map((prog, index) => (
              <div key={index} className="flex items-center gap-3">
                <span className="text-xs text-content-secondary w-20">{t('calibration:compassCoverageView.compassN', { n: index + 1 })}</span>
                <div className="flex-1 h-2 bg-surface-inset rounded-full overflow-hidden">
                  <div
                    className="h-full bg-cyan-500 transition-all duration-300"
                    style={{ width: `${prog}%` }}
                  />
                </div>
                <span className="text-xs text-content-secondary w-10 text-right">{prog}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex justify-center gap-4">
        {isWaitingForConfirm && (
          <button
            onClick={confirmPosition}
            className="px-6 py-2.5 bg-cyan-500 hover:bg-cyan-400 rounded-lg text-white font-medium transition-colors flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {t('calibration:calibratingStep.positionReady')}
          </button>
        )}

        {!isFinalizing && (
          <button
            onClick={cancelCalibration}
            className="px-4 py-2 bg-surface-raised hover:bg-red-500/20 hover:text-red-400 rounded-lg text-content-secondary transition-colors flex items-center gap-2 text-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            {t('common:cancel')}
          </button>
        )}
      </div>

      {/* Instructions reminder */}
      <p className="text-center text-xs text-content-secondary">
        {calibrationType === 'compass' && !isPx4 && t('calibration:calibratingStep.hintCompass')}
        {calibrationType === 'compass' && isPx4 && t('calibration:calibratingStep.hintCompassPx4')}
        {calibrationType === 'accel-level' && t('calibration:calibratingStep.hintLevel')}
        {calibrationType === 'accel-6point' && !isFinalizing && (isPx4
          ? t('calibration:calibratingStep.hintSixPointPx4')
          : t('calibration:calibratingStep.hintSixPoint'))}
        {calibrationType === 'accel-6point' && isFinalizing && t('calibration:calibratingStep.hintFinalizing')}
        {calibrationType === 'gyro' && t('calibration:calibratingStep.hintGyro')}
        {calibrationType === 'opflow' && t('calibration:calibratingStep.hintOpflow')}
      </p>
    </div>
  );
}
