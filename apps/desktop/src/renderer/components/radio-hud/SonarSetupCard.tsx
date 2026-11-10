import { ui } from '../ui/ui-hooks';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Info, Loader2, Radar } from 'lucide-react';
import { SONAR_PARAMS, sonarSetupState, type SonarSetupState } from './sonar-setup';
import { useNavigationStore } from '../../stores/navigation-store';

type Run =
  | { step: 'idle' }
  | { step: 'running'; phase: string; param?: string; value?: number }
  | { step: 'manual'; targetPath: string }
  | { step: 'error'; message: string };

/** One-click setup of the sonar script the Echogram tile needs on the boat. */
export function SonarSetupCard({ connected }: { connected: boolean }) {
  const { t } = useTranslation();
  const k = 'radio-hud:studio.sonar';
  const [state, setState] = useState<SonarSetupState | null>(null);
  const [run, setRun] = useState<Run>({ step: 'idle' });

  const read = useCallback(async () => {
    if (!connected) { setState(null); return; }
    const res = await window.electronAPI.readParameterBatch(SONAR_PARAMS).catch(() => null);
    setState(res ? sonarSetupState(res.values) : null);
  }, [connected]);

  useEffect(() => { void read(); }, [read]);
  useEffect(() => window.electronAPI.onRadioHudSonarProgress?.((p) => {
    setRun({ step: 'running', phase: p.phase, param: p.param, value: p.value });
  }), []);

  const setUp = async () => {
    if (state?.kind !== 'ready') return;
    setRun({ step: 'running', phase: 'checking' });
    const result = await window.electronAPI.radioHudInstallSonar(state.changes.map((c) => [c.param, c.to] as [string, number]));
    if (result.status === 'installed') {
      setRun({ step: 'idle' });
      await read();
    } else if (result.status === 'manual') {
      setRun({ step: 'manual', targetPath: result.targetPath });
    } else {
      setRun({ step: 'error', message: result.message });
    }
  };

  const shell = (tone: string, icon: React.ReactNode, title: string, body: React.ReactNode) => (
    <div className={`flex gap-3 rounded-lg border px-3.5 py-3 ${tone}`}>
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="text-sm font-medium text-content">{title}</p>
        <div className="text-xs leading-relaxed text-content-secondary">{body}</div>
      </div>
    </div>
  );
  const amber = 'border-amber-500/30 bg-amber-500/5';
  const radar = <Radar className="h-4 w-4 text-amber-500 dark:text-amber-400" />;

  if (run.step === 'running') {
    const what = run.phase === 'configuring' && run.param
      ? t(`${k}.phase.configuring`, { param: run.param, value: run.value })
      : t(`${k}.phase.${run.phase}`, { defaultValue: run.phase });
    return shell(amber, <Loader2 className="h-4 w-4 animate-spin text-amber-500" />, t(`${k}.runningTitle`), what);
  }
  if (run.step === 'manual') {
    return shell(amber, radar, t(`${k}.manualTitle`), t(`${k}.manualBody`, { path: run.targetPath }));
  }
  if (run.step === 'error') {
    return shell('border-red-500/30 bg-red-500/5', <Info className="h-4 w-4 text-red-400" />, t(`${k}.errorTitle`), (
      <>
        <p>{run.message}</p>
        <button type="button" onClick={() => setRun({ step: 'idle' })} className="mt-1.5 text-xs text-content hover:underline">{t(`${k}.tryAgain`)}</button>
      </>
    ));
  }
  if (!connected || !state) {
    return shell(amber, radar, t(`${k}.needsScriptTitle`), t(`${k}.connectFirst`));
  }
  if (state.kind === 'installed') {
    return shell('border-emerald-500/30 bg-emerald-500/5', <CheckCircle2 className="h-4 w-4 text-emerald-500" />, t(`${k}.installedTitle`), t(`${k}.installedBody`));
  }
  if (state.kind === 'nmea') {
    return shell('border-subtle bg-surface-input', <Info className="h-4 w-4 text-content-tertiary" />, t(`${k}.nmeaTitle`), t(`${k}.nmeaBody`));
  }
  if (state.kind === 'companion') {
    return shell('border-subtle bg-surface-input', <Info className="h-4 w-4 text-content-tertiary" />, t(`${k}.companionTitle`), t(`${k}.companionBody`));
  }
  if (state.kind === 'none') {
    return shell('border-subtle bg-surface-input', <Info className="h-4 w-4 text-content-tertiary" />, t(`${k}.noneTitle`), (
      <>
        <p>{t(`${k}.noneBody`)}</p>
        <button {...ui('button', { variant: 'secondary' })} type="button" onClick={() => useNavigationStore.getState().setView('parameters', 'tab:hardware?setup=ping')}
          className="mt-1.5 rounded-lg border border-subtle bg-surface-raised px-3 py-1.5 text-xs text-content hover:bg-surface-inset">
          {t(`${k}.setUpSounder`)}
        </button>
      </>
    ));
  }
  return shell(amber, radar, t(`${k}.needsScriptTitle`), (
    <>
      <p>{t(`${k}.readyBody`)}</p>
      <ul className="space-y-0.5 font-mono text-[11px] text-content">
        {state.changes.map((c) => <li key={c.param}>{c.param}  {c.from} → {c.to}</li>)}
        <li className="text-content-tertiary">{t(`${k}.plusScripting`)}</li>
      </ul>
      <div className="flex items-center gap-3 pt-1">
        <button {...ui('button', { variant: 'primary' })} type="button" onClick={() => { void setUp(); }}
          className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-blue-500">
          {t(`${k}.setUp`)}
        </button>
        <span className="text-[11px] text-content-tertiary">{t(`${k}.disarmed`)}</span>
      </div>
    </>
  ));
}
