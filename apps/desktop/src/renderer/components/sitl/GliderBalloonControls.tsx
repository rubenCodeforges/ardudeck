import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useArduPilotSitlStore } from '../../stores/ardupilot-sitl-store';
import { useParameterStore } from '../../stores/parameter-store';
import { GAUGE_COLORS } from '../map/instruments/RoundGauge';
import { gaugeTint } from '../map/instruments/ReadoutPrimitives';

// Only ArduPilot's SIM_Glider registers this; read from the vehicle so a page reload or an outside SITL still shows the controls.
const GLIDER_SIM_PARAM = 'SIM_GLD_BLN_RATE';

export function useGliderSitl(): boolean {
  return useParameterStore((s) => s.parameters.has(GLIDER_SIM_PARAM));
}

/** Balloon lift and release for a running glider SITL. Renders nothing for any other vehicle. */
export function GliderBalloonControls({ variant }: { variant: 'instrument' | 'panel' }): JSX.Element | null {
  const { t } = useTranslation();
  const glider = useGliderSitl();
  const phase = useArduPilotSitlStore((s) => s.balloon);
  const setBalloonLift = useArduPilotSitlStore((s) => s.setBalloonLift);
  const releaseBalloon = useArduPilotSitlStore((s) => s.releaseBalloon);
  const [error, setError] = useState<string | null>(null);
  if (!glider) return null;

  const lifting = phase === 'lifting';
  const released = phase === 'released';
  const run = async (fn: () => Promise<{ success: boolean; error?: string } | void>) => {
    setError(null);
    try {
      const r = await fn();
      if (r && !r.success && r.error) setError(r.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common:unknownError'));
    }
  };
  const toggleLift = () => run(() => setBalloonLift(!lifting));
  const release = () => run(releaseBalloon);
  const releaseLabel = released ? t('sitl:balloon.released') : t('sitl:balloon.release');

  if (variant === 'instrument') {
    const pill = 'font-mono tabular-nums leading-none whitespace-nowrap rounded-full px-2 py-[3px] text-[9px] font-bold tracking-wider transition-colors';
    return (
      <div className="mt-2 flex items-center gap-1.5">
        <span className="font-mono text-[9px] font-semibold tracking-widest uppercase leading-none" style={{ color: GAUGE_COLORS.textDim }}>{t('sitl:balloon.title')}</span>
        <button
          type="button"
          onClick={toggleLift}
          disabled={released}
          data-tip={t('sitl:balloon.liftTip')}
          className={`${pill} ml-auto disabled:opacity-50`}
          style={lifting
            ? { color: GAUGE_COLORS.green, background: gaugeTint(GAUGE_COLORS.green, 16), border: `1px solid ${gaugeTint(GAUGE_COLORS.green, 55)}` }
            : { color: GAUGE_COLORS.textDim, border: `1px solid ${GAUGE_COLORS.bezelEdge}` }}
        >
          {t('sitl:balloon.lift')}
        </button>
        <button
          type="button"
          onClick={release}
          disabled={!lifting}
          data-tip={t('sitl:balloon.releaseTip')}
          className={`${pill} disabled:opacity-60`}
          style={released
            ? { color: GAUGE_COLORS.green, background: gaugeTint(GAUGE_COLORS.green, 16), border: `1px solid ${gaugeTint(GAUGE_COLORS.green, 55)}` }
            : { color: GAUGE_COLORS.amber, border: `1px solid ${gaugeTint(GAUGE_COLORS.amber, 55)}` }}
        >
          {releaseLabel}
        </button>
        {error && <span className="text-[10px]" style={{ color: GAUGE_COLORS.amber }}>{error}</span>}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-subtle bg-surface p-3">
      <div className="text-sm text-content">{t('sitl:balloon.title')}</div>
      <div className="text-[11px] text-content-tertiary">{t('sitl:balloon.desc')}</div>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={toggleLift}
          disabled={released}
          data-tip={t('sitl:balloon.liftTip')}
          className={`px-3 py-1.5 text-xs rounded transition-colors disabled:opacity-50 ${lifting ? 'bg-blue-600 text-white' : 'bg-surface-raised text-content hover:bg-surface-overlay'}`}
        >
          {t('sitl:balloon.lift')}
        </button>
        <button
          type="button"
          onClick={release}
          disabled={!lifting}
          data-tip={t('sitl:balloon.releaseTip')}
          className={`px-3 py-1.5 text-xs rounded text-white transition-colors disabled:opacity-80 ${released ? 'bg-emerald-600' : 'bg-amber-600 hover:bg-amber-500'}`}
        >
          {releaseLabel}
        </button>
      </div>
      {error && <div className="mt-1.5 text-[11px] text-amber-400">{error}</div>}
    </div>
  );
}
