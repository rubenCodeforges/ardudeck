/**
 * Live compass coverage during a calibration run: one sphere per compass.
 *
 * Per compass, not merged. ArduPilot calibrates every enabled compass in the
 * same run and each keeps its OWN completion mask, so a single sphere cannot
 * say which compass is lagging, and merging them is actively wrong: a compass
 * reporting an empty mask drags a merged view to nothing and the solid never
 * fills, even while another compass is covering fine. Mobile draws one card per
 * compass for the same reason.
 *
 * Alongside each: how many of the 80 directions are still missing. "56 of 80"
 * tells you there is more turning to do; a percentage creeping upward does not.
 */

import { useEffect } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { CompassSphere } from './CompassSphere';
import { coveredCount, SECTION_COUNT } from '../../../../shared/geodesic-grid';
import { useCompassCoverageStore } from '../../../stores/compass-coverage-store';

interface CompassCoverageViewProps {
  /** False once the run has finished, to stop the idle spin. */
  active?: boolean;
}

export function CompassCoverageView({ active = true }: CompassCoverageViewProps) {
  const { t } = useTranslation();
  const byCompass = useCompassCoverageStore((s) => s.byCompass);
  const reset = useCompassCoverageStore((s) => s.reset);

  // A fresh run starts from nothing; without this the previous run's solids
  // would sit there looking like progress.
  useEffect(() => {
    if (active) reset();
  }, [active, reset]);

  const compasses = [...byCompass.entries()].sort((a, b) => a[0] - b[0]);

  if (compasses.length === 0) {
    return <div className="text-[11px] text-content-secondary">{t('calibration:compassCoverageView.waiting')}</div>;
  }

  // One compass gets the full-size solid; several share the width.
  const size = compasses.length === 1 ? 260 : compasses.length === 2 ? 190 : 150;

  return (
    <div className="flex flex-wrap items-start justify-center gap-5">
      {compasses.map(([id, coverage]) => {
        const covered = coveredCount(coverage.mask);
        const remaining = SECTION_COUNT - covered;
        return (
          <div key={id} className="flex flex-col items-center gap-2">
            <CompassSphere
              mask={coverage.mask}
              direction={coverage.direction}
              size={size}
              spinning={active}
            />
            <div className="text-center">
              <div className="text-xs text-content-secondary">{t('calibration:compassCoverageView.compassN', { n: id + 1 })}</div>
              <div className="text-sm text-content">
                <Trans
                  i18nKey="calibration:compassCoverageView.coveredOf"
                  values={{ covered, total: SECTION_COUNT }}
                  components={{
                    n: <span className="font-mono text-cyan-400" />,
                    m: <span className="text-content-secondary" />,
                  }}
                />
              </div>
              <div className="text-[11px] text-content-secondary mt-0.5">
                {remaining === 0
                  ? t('calibration:compassCoverageView.allSampled')
                  : t('calibration:compassCoverageView.patchesLeft', { count: remaining })}
              </div>
            </div>
          </div>
        );
      })}
      <p className="w-full text-center text-[11px] text-content-tertiary">
        {t('calibration:compassCoverageView.hint')}
      </p>
    </div>
  );
}
