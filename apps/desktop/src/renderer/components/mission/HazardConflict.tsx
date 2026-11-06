import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { useMissionStore, allowHazardCrossingOnce } from '../../stores/mission-store';
import type { ZoneCrossing } from '../../../shared/mission-validation';
import { rerouteAroundHazards } from '../../utils/reroute-hazards';
import { useHazardsStore } from '../../stores/hazards-store';
import { ui } from '../ui/ui-hooks';

/** Upload stopped because legs cross hazards: reroute, inspect, or override with the admin PIN (logged, one upload). */
export function HazardConflict({ crossings, missionName, onClose, onContinue }: {
  crossings: ZoneCrossing[];
  missionName: string;
  onClose: () => void;
  /** The route is clear now (or overridden): carry on with the upload. */
  onContinue: () => void;
}): JSX.Element {
  const { t } = useTranslation();
  const first = crossings[0]!;
  const status = useHazardsStore((s) => s.status);
  const [message, setMessage] = useState<string | null>(null);
  const [askingPin, setAskingPin] = useState(false);
  const [pin, setPin] = useState('');

  const routeAround = () => {
    const { rerouted, unroutable } = rerouteAroundHazards();
    if (unroutable > 0) setMessage(t('mission:hazards.unroutable', { count: unroutable }));
    else if (rerouted > 0) onContinue();
  };
  const showLeg = () => useMissionStore.getState().focusWaypoint(first.toSeq);
  const override = async () => {
    if (!status.unlocked) {
      const unlocked = await window.electronAPI.hazardsUnlock(pin);
      if (!unlocked.success) { setMessage(unlocked.error === 'throttled' ? t('mission:hazards.pinThrottled') : t('mission:hazards.pinWrong')); return; }
    }
    const r = await window.electronAPI.hazardsOverride({ hazardIds: crossings.map((c) => c.zone.id), mission: missionName });
    if (!r.success) { setMessage(t('mission:hazards.overrideFailed')); return; }
    allowHazardCrossingOnce();
    onContinue();
  };

  const title = first.fromSeq === null
    ? t('mission:hazards.titleFromHome', { to: first.toSeq + 1, zone: first.zone.name })
    : t('mission:hazards.title', { from: first.fromSeq + 1, to: first.toSeq + 1, zone: first.zone.name });

  return (
    <div className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-6 pointer-events-none">
      <div className="pointer-events-auto w-full max-w-3xl bg-surface-solid border border-red-500 rounded-xl shadow-2xl px-4 py-3.5 flex flex-col gap-2.5">
        <div className="flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          <span className="text-sm font-semibold text-red-300">{title}</span>
          {crossings.length > 1 && <span className="text-xs text-content-secondary">{t('mission:hazards.more', { count: crossings.length - 1 })}</span>}
        </div>
        <span className="text-sm text-content-secondary">
          {t('mission:hazards.body', { buffer: Math.round(first.zone.bufferM) })}
        </span>
        {message && <span className="text-xs text-amber-500">{message}</span>}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button {...ui('button', { variant: 'primary' })} type="button" onClick={routeAround} className="h-9 px-3.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium">
            {t('mission:hazards.routeAround')}
          </button>
          <button {...ui('button', { variant: 'secondary' })} type="button" onClick={showLeg} className="h-9 px-3.5 rounded-lg border border-subtle text-sm text-content-secondary hover:text-content hover:bg-surface-raised">
            {t('mission:hazards.showLeg')}
          </button>
          {status.hasPin && (askingPin && !status.unlocked ? (
            <span className="flex items-center gap-1.5">
              <input
                type="password"
                inputMode="numeric"
                autoFocus
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void override(); }}
                placeholder={t('mission:hazards.pinPlaceholder')}
                aria-label={t('mission:hazards.pinPlaceholder')}
                className="h-9 w-32 px-2 rounded-lg bg-surface-input border border-subtle text-sm text-content"
              />
              <button {...ui('button', { variant: 'danger' })} type="button" onClick={() => void override()} className="h-9 px-3 rounded-lg border border-red-500/50 text-sm text-red-300 hover:bg-red-500/10">
                {t('mission:hazards.overrideConfirm')}
              </button>
            </span>
          ) : (
            <button {...ui('button', { variant: 'danger' })} type="button" onClick={() => (status.unlocked ? void override() : setAskingPin(true))} className="h-9 px-3.5 rounded-lg border border-red-500/50 text-sm text-red-300 hover:bg-red-500/10">
              {t('mission:hazards.override')}
            </button>
          ))}
          <button {...ui('button', { variant: 'secondary' })} type="button" onClick={onClose} className="ml-auto h-9 px-3 rounded-lg text-sm text-content-secondary hover:text-content">
            {t('common:cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
