/**
 * The compasses a PX4 board found, and which one it trusts.
 *
 * PX4 keeps no COMPASS_USE flag. A magnetometer is used when its priority is
 * above zero, and CAL_MAGn_ROT says whether it is on the board or out on a
 * mast, so "in use" and "external" both have to be read off the priority and
 * the rotation rather than asked for directly.
 */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Compass, AlertTriangle, ArrowUp } from 'lucide-react';
import { useParameterStore } from '../../stores/parameter-store';
import { useNavigationStore } from '../../stores/navigation-store';

const MAX_MAGS = 4;

/** CAL_MAGn_PRIO. -1 is "never set up", 0 is off, higher wins. */
const PRIORITIES: { value: number; labelKey: string }[] = [
  { value: 0, labelKey: 'common:off' },
  { value: 25, labelKey: 'mavlink-config:px4CompassCard.prioLow' },
  { value: 50, labelKey: 'mavlink-config:px4CompassCard.prioMedium' },
  { value: 75, labelKey: 'common:high' },
  { value: 100, labelKey: 'common:max' },
];

interface Px4Mag {
  index: number;
  devId: number;
  priority: number;
  rotation: number;
  external: boolean;
  used: boolean;
}

function readMags(get: (name: string) => number | undefined): Px4Mag[] {
  const out: Px4Mag[] = [];
  for (let i = 0; i < MAX_MAGS; i++) {
    const devId = get(`CAL_MAG${i}_ID`);
    if (devId === undefined || devId === 0) continue;
    const priority = get(`CAL_MAG${i}_PRIO`) ?? -1;
    const rotation = get(`CAL_MAG${i}_ROT`) ?? -1;
    out.push({
      index: i,
      devId,
      priority,
      rotation,
      external: rotation >= 0,
      used: priority > 0,
    });
  }
  return out;
}

export function Px4CompassCard(): JSX.Element {
  const { t } = useTranslation();
  const { parameters, setParameter } = useParameterStore();
  const setView = useNavigationStore((s) => s.setView);
  const [busy, setBusy] = useState(false);

  const get = (name: string): number | undefined => {
    const p = parameters.get(name);
    return typeof p?.value === 'number' ? p.value : undefined;
  };

  const known = parameters.has('CAL_MAG0_ID');
  const mags = useMemo(
    () => readMags((name) => {
      const p = parameters.get(name);
      return typeof p?.value === 'number' ? p.value : undefined;
    }),
    [parameters],
  );

  if (!known) return <></>;

  const write = async (name: string, value: number) => {
    setBusy(true);
    try {
      await setParameter(name, value);
    } finally {
      setBusy(false);
    }
  };

  const best = mags.filter((m) => m.used).sort((a, b) => b.priority - a.priority)[0];
  const uncalibrated = mags.filter((m) => m.priority === -1);
  const magFusion = get('EKF2_MAG_TYPE');

  return (
    <div className="rounded-xl border border-subtle bg-surface p-5">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/20">
          <Compass className="h-5 w-5 text-cyan-400" />
        </div>
        <div className="flex-1">
          <h3 className="font-medium text-content">{t('mavlink-config:px4CompassCard.title')}</h3>
          <p className="text-xs text-content-secondary">
            {mags.length === 0
              ? t('mavlink-config:px4CompassCard.nothingDetected')
              : `${t('mavlink-config:px4CompassCard.detected', { count: mags.length })}${mags.some((m) => m.external) ? t('mavlink-config:px4CompassCard.includingExternal') : ''}`}
          </p>
        </div>
      </div>

      {mags.length === 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <p>
              {t('mavlink-config:px4CompassCard.noneCalibrated')}
            </p>
          </div>
        </div>
      )}

      {magFusion === 5 && mags.length > 0 && (
        <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          {t('mavlink-config:px4CompassCard.estimatorIgnores')}
        </div>
      )}

      <div className="mb-3 rounded-lg border border-subtle bg-surface-raised px-3 py-2 text-[11px] text-content-tertiary">
        {t('mavlink-config:px4CompassCard.priorityExplainer')}
      </div>

      <div className="space-y-2">
        {mags.map((mag) => (
          <div key={mag.devId} className="rounded-lg border border-subtle bg-surface-raised p-3">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-content">
                    {mag.external ? t('mavlink-config:px4CompassCard.external') : t('mavlink-config:px4CompassCard.onboard')}
                  </span>
                  <span className="rounded bg-surface-overlay px-1.5 py-0.5 font-mono text-[10px] text-content-tertiary">
                    {t('mavlink-config:px4CompassCard.id', { id: mag.devId })}
                  </span>
                  {best?.devId === mag.devId && (
                    <span className="flex items-center gap-1 rounded bg-cyan-500/20 px-1.5 py-0.5 text-[10px] text-cyan-700 dark:text-cyan-300">
                      <ArrowUp className="h-2.5 w-2.5" /> {t('mavlink-config:px4CompassCard.usedForHeading')}
                    </span>
                  )}
                  {mag.priority === -1 && (
                    <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-300">
                      {t('mavlink-config:px4CompassCard.notCalibrated')}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-[11px] text-content-tertiary">
                  {t('mavlink-config:px4CompassCard.slot', { n: mag.index })} · {mag.external ? t('mavlink-config:px4CompassCard.rotation', { n: mag.rotation }) : t('mavlink-config:px4CompassCard.mountedOnAutopilot')}
                </div>
              </div>

              <select
                value={mag.priority < 0 ? '' : mag.priority}
                disabled={busy}
                onChange={(e) => write(`CAL_MAG${mag.index}_PRIO`, Number(e.target.value))}
                className="select shrink-0 text-[11px]"
                data-tip={t('mavlink-config:px4CompassCard.priorityTip')}
              >
                {mag.priority < 0 && <option value="">{t('mavlink-config:px4CompassCard.notSet')}</option>}
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>{t(p.labelKey)}</option>
                ))}
              </select>
            </div>
          </div>
        ))}
      </div>

      {uncalibrated.length > 0 && (
        <button
          onClick={() => setView('calibration')}
          className="mt-3 text-[11px] text-cyan-400 hover:text-cyan-300"
        >
          {t('mavlink-config:px4CompassCard.calibrate')}
        </button>
      )}
    </div>
  );
}
