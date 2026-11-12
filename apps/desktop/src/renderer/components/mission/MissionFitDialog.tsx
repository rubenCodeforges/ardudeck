import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Scissors, HardDrive, Mountain, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import {
  useMissionFitStore,
  splitLargestSurveyIntoFlights,
  switchSurveysToFcTerrain,
  enableSdMissionStorage,
  largestSurveyGroup,
  terrainFollowGroups,
  sdMissionAvailable,
  SD_MISSION_ITEMS,
  type FitOutcome,
} from './mission-fit-actions';
import { useMissionStore } from '../../stores/mission-store';
import { useConnectionStore } from '../../stores/connection-store';

type OptionId = 'split' | 'terrain' | 'sd';

/** Ways to make a mission the flight controller cannot hold fit: split it, let the FC follow terrain, or store it on the SD card. */
export function MissionFitDialog(): JSX.Element | null {
  const { t } = useTranslation();
  const { open, itemCount, rejected, close } = useMissionFitStore();
  useMissionStore((s) => s.groups);
  useConnectionStore((s) => s.connectionState.isConnected);
  const [busy, setBusy] = useState<OptionId | null>(null);
  const [outcome, setOutcome] = useState<FitOutcome | null>(null);

  useEffect(() => {
    if (open) { setOutcome(null); setBusy(null); }
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, close]);

  if (!open) return null;

  const hasSurvey = !!largestSurveyGroup();
  const hasTerrainFollow = terrainFollowGroups().length > 0;
  const sdOk = sdMissionAvailable();

  const run = async (id: OptionId, fn: () => Promise<FitOutcome>) => {
    setBusy(id);
    setOutcome(null);
    try { setOutcome(await fn()); } finally { setBusy(null); }
  };

  const options: Array<{ id: OptionId; icon: typeof Scissors; accent: string; title: string; desc: string; note: string; enabled: boolean; why?: string; action: () => Promise<FitOutcome> }> = [
    {
      id: 'terrain', icon: Mountain, accent: 'text-emerald-500 bg-emerald-500/10',
      title: t('mission:missionFit.terrainTitle'), desc: t('mission:missionFit.terrainDesc'), note: t('mission:missionFit.terrainNote'),
      enabled: hasTerrainFollow, why: t('mission:missionFit.noTerrainFollow'), action: switchSurveysToFcTerrain,
    },
    {
      id: 'split', icon: Scissors, accent: 'text-sky-500 bg-sky-500/10',
      title: t('mission:missionFit.splitTitle'), desc: t('mission:missionFit.splitDesc'), note: t('mission:missionFit.splitNote'),
      enabled: hasSurvey, why: t('mission:missionFit.noSurvey'), action: splitLargestSurveyIntoFlights,
    },
    {
      id: 'sd', icon: HardDrive, accent: 'text-violet-500 bg-violet-500/10',
      title: t('mission:missionFit.sdTitle'), desc: t('mission:missionFit.sdDesc', { items: SD_MISSION_ITEMS.toLocaleString() }), note: t('mission:missionFit.sdNote'),
      enabled: sdOk, why: t('mission:missionFit.sdUnavailable'), action: enableSdMissionStorage,
    },
  ];

  return createPortal(
    <div className="fixed inset-0 z-[3000] bg-black/50 flex items-center justify-center p-4" onClick={() => !busy && close()}>
      <div role="dialog" aria-modal="true" aria-label={t('mission:missionFit.title')} onClick={(e) => e.stopPropagation()} className="w-full max-w-[520px] bg-surface-solid rounded-2xl border border-subtle shadow-2xl">
        <div className="px-5 pt-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-content">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
            {rejected ? t('mission:missionFit.titleRejected') : t('mission:missionFit.title')}
          </div>
          <p className="mt-1 text-[12px] text-content-secondary">
            {rejected ? t('mission:missionFit.introRejected', { count: itemCount }) : t('mission:missionFit.intro', { count: itemCount })}
          </p>
        </div>

        <div className="px-5 pt-4 flex flex-col gap-2">
          {options.map((o) => {
            const Icon = o.icon;
            return (
              <button
                key={o.id}
                type="button"
                disabled={!o.enabled || !!busy}
                onClick={() => void run(o.id, o.action)}
                data-tip={o.enabled ? undefined : o.why}
                className="flex items-start gap-3 rounded-xl border border-subtle bg-surface px-4 py-3 text-left hover:border-default hover:bg-surface-raised transition-colors disabled:opacity-50 disabled:hover:bg-surface"
              >
                <div className={`w-9 h-9 shrink-0 rounded-lg grid place-items-center ${o.accent}`}>
                  {busy === o.id ? <Loader2 className="w-[18px] h-[18px] animate-spin" /> : <Icon className="w-[18px] h-[18px]" />}
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-content">{o.title}</div>
                  <div className="mt-0.5 text-[11px] leading-snug text-content-secondary">{o.desc}</div>
                  <div className="mt-1 text-[11px] leading-snug text-content-tertiary">{o.enabled ? o.note : o.why}</div>
                </div>
              </button>
            );
          })}
        </div>

        {outcome && (
          <div className={`mx-5 mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-[12px] ${outcome.ok ? 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400' : 'border-amber-500/40 text-amber-600 dark:text-amber-400'}`}>
            {outcome.ok ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-px" /> : <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />}
            <span>{outcome.message}</span>
          </div>
        )}

        <div className="mt-4 px-5 py-3 border-t border-subtle flex justify-end">
          <button type="button" disabled={!!busy} onClick={close} className="h-8 px-3 rounded-lg text-xs text-content-secondary hover:text-content hover:bg-surface-raised disabled:opacity-50">
            {t('common:close')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
