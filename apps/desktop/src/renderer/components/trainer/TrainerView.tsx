import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Check, CloudSun, Globe, Loader2, Plane, Rocket } from 'lucide-react';
import type {
  TrainerCatalogue,
  TrainerConditions,
  TrainerLaunchInput,
  TrainerStatus,
} from '../../../shared/trainer-types';
import { NewRegionDialog } from './NewRegionDialog';
import { TrainerRegionStep } from './TrainerRegionStep';
import { TrainerConditionsStep } from './TrainerConditionsStep';
import { TrainerVehicleStep, type CameraChoice } from './TrainerVehicleStep';

/**
 * Choosing a flight and starting it, without leaving ArduDeck.
 *
 * The choices are the launcher's, but none of them are DECIDED here: the regions, their
 * imagery, the cameras, the weather wording and the limits on a new region all come from the
 * Trainer over `--trainer-query`, and what goes back is intent, not configuration. That is what
 * lets this be the launcher without becoming a second copy of it in a second repository.
 *
 * There is no launch summary column. The launcher needs one because it is a front door with
 * nothing else on screen; here the vehicle, its telemetry and its camera are already one click
 * away, so a panel restating them would be the third place the same numbers appear.
 */

const LOG_LINES = 200;

type StepId = 'region' | 'conditions' | 'vehicle';

const STEPS: { id: StepId; labelKey: string; hintKey: string; icon: JSX.Element }[] = [
  { id: 'region', labelKey: 'trainer:trainerView.stepRegion', hintKey: 'trainer:trainerView.stepRegionHint', icon: <Globe className="h-4 w-4" /> },
  {
    id: 'conditions',
    labelKey: 'trainer:trainerView.stepConditions',
    hintKey: 'trainer:trainerView.stepConditionsHint',
    icon: <CloudSun className="h-4 w-4" />,
  },
  { id: 'vehicle', labelKey: 'trainer:trainerView.stepVehicle', hintKey: 'trainer:trainerView.stepVehicleHint', icon: <Plane className="h-4 w-4" /> },
];

export function TrainerView(): JSX.Element {
  const { t } = useTranslation();
  const [step, setStep] = useState<StepId>('region');
  const [status, setStatus] = useState<TrainerStatus | null>(null);
  const [catalogue, setCatalogue] = useState<TrainerCatalogue | null>(null);
  const [catalogueError, setCatalogueError] = useState<string | null>(null);
  const [rescanning, setRescanning] = useState(false);
  const [region, setRegion] = useState<string | null>(null);
  // Null means "whatever the launcher last set up". A choice here is by KIND, so a gimbal can
  // be asked for even when the launcher has only ever had its default FPV camera.
  const [camera, setCamera] = useState<CameraChoice | null>(null);
  const [conditions, setConditions] = useState<TrainerConditions>({
    time: 'now',
    preset: 'fair',
    // Live by default, as the launcher is. Defaulting to a preset made every flight start in
    // dead calm under a sky nobody chose, which is what "still air" was reporting.
    weatherMode: 'live',
    windMode: 'live',
    windMs: 0,
    windFromDeg: 0,
    gust: 'light',
  });
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await window.electronAPI.trainerStatus());
    } catch {
      // An older main process has no handler. Leaving the status null keeps the view usable
      // and disabled rather than throwing out of a polling timer every two seconds.
      setStatus(null);
    }
  }, []);

  const reloadCatalogue = useCallback(async () => {
    setRescanning(true);
    try {
      const res = await window.electronAPI.trainerCatalogue();
      if (res.ok) {
        setCatalogue(res.catalogue);
        setCatalogueError(null);
      } else {
        setCatalogueError(res.error);
      }
    } catch (err) {
      setCatalogueError(
        t('trainer:trainerView.restartHint', { message: (err as Error).message }),
      );
    } finally {
      setRescanning(false);
    }
  }, [t]);

  useEffect(() => {
    void refresh();
    // The take-off point appears when the flight controller gets a fix, which is not an event
    // this view is told about, so it is polled rather than left saying "no GPS fix" forever.
    const timer = setInterval(() => void refresh(), 2000);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    void reloadCatalogue();
  }, [reloadCatalogue]);

  useEffect(
    () => window.electronAPI.onTrainerLog((line) => setLog((p) => [...p, line].slice(-LOG_LINES))),
    [],
  );

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [log]);

  const fly = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setLog([]);
    try {
      const input: TrainerLaunchInput = {
        // Null on purpose when nothing is picked: the Trainer then works the region out from
        // where the flight controller stands, which is right more often than a remembered
        // selection.
        region,
        camera,
        conditions,
        // The feed comes back into this app's camera panel, so the picture is here rather than
        // in another window: that is the "switch to the sim to show people" step, deleted.
        stream: { enabled: true },
        // Launched to be shown to somebody, on a stand or a second screen. A windowed sim is
        // the one nobody can see from more than a metre away.
        fullscreen: true,
      };
      const result = await window.electronAPI.trainerLaunch(input);
      if (!result.ok) setError(result.error ?? t('trainer:trainerView.didNotStart'));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      void refresh();
    }
  };

  const ready = status?.canLaunch === true;

  return (
    <div className="flex h-full overflow-hidden">
      <nav className="w-56 shrink-0 space-y-1.5 border-r border-subtle p-4">
        {STEPS.map((s, i) => {
          const active = step === s.id;
          const done = i === 0 && region !== null;
          return (
            <button
              key={s.id}
              onClick={() => setStep(s.id)}
              className={`flex w-full items-start gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors ${
                active
                  ? 'border-blue-500/50 bg-blue-500/10'
                  : 'border-transparent hover:bg-surface-raised'
              }`}
            >
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-semibold ${
                  done
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : active
                      ? 'bg-blue-500 text-white'
                      : 'bg-surface-raised text-content-tertiary'
                }`}
              >
                {done ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              <span className="min-w-0">
                <span
                  className={`flex items-center gap-1.5 text-sm font-medium ${active ? 'text-blue-400' : 'text-content'}`}
                >
                  {s.icon}
                  {t(s.labelKey)}
                </span>
                <span className="block truncate text-[11px] text-content-tertiary">{t(s.hintKey)}</span>
              </span>
            </button>
          );
        })}

        <div className="!mt-4 border-t border-subtle pt-4">
          <div className="mb-2 flex items-center gap-2 text-xs">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${ready ? 'bg-emerald-400' : 'bg-amber-400'}`}
            />
            <span className="text-content-secondary">
              {ready ? t('trainer:trainerView.readyToFly') : (status?.reason ?? t('trainer:trainerView.checking'))}
            </span>
          </div>
          <button
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-blue-500 px-3 py-2 text-sm font-semibold text-white shadow-sm shadow-blue-500/20 transition-all hover:from-blue-500 hover:to-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={busy || !ready}
            onClick={() => void fly()}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
            {busy ? t('trainer:trainerView.starting') : t('trainer:trainerView.flyInTrainer')}
          </button>
          {status?.home && (
            <p className="mt-2 font-mono text-[10px] leading-relaxed text-content-tertiary">
              {status.home.lat.toFixed(5)}, {status.home.lon.toFixed(5)}
            </p>
          )}
        </div>
      </nav>

      <div className="min-w-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-4xl space-y-5 p-6">
          {step === 'region' && (
            <TrainerRegionStep
              catalogue={catalogue}
              error={catalogueError}
              selected={region}
              onSelect={setRegion}
              onNew={() => setCreating(true)}
              onRescan={() => void reloadCatalogue()}
              onDeleted={(name) => {
                if (region === name) setRegion(null);
                void reloadCatalogue();
              }}
              rescanning={rescanning}
            />
          )}

          {step === 'conditions' && catalogue && (
            <TrainerConditionsStep
              catalogue={catalogue}
              conditions={conditions}
              onChange={(patch) => setConditions((prev) => ({ ...prev, ...patch }))}
            />
          )}

          {step === 'vehicle' && catalogue && (
            <TrainerVehicleStep
              catalogue={catalogue}
              camera={camera}
              onCamera={setCamera}
              status={status}
            />
          )}

          {error && (
            <p className="flex items-start gap-2 text-sm text-red-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </p>
          )}

          {log.length > 0 && (
            <div
              ref={logRef}
              className="h-48 overflow-auto rounded-xl border border-subtle bg-surface-inset p-3 font-mono text-[11px] leading-relaxed text-content-tertiary"
            >
              {log.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          )}
        </div>
      </div>

      {creating && catalogue && (
        <NewRegionDialog
          catalogue={catalogue}
          onClose={() => setCreating(false)}
          onBuilt={(name) => {
            setCreating(false);
            setRegion(name);
            void reloadCatalogue();
          }}
        />
      )}
    </div>
  );
}
