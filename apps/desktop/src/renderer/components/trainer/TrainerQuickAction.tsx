import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigationStore } from '../../stores/navigation-store';
import type { TrainerStatus } from '../../../shared/trainer-types';

/**
 * "Fly it in the Trainer", on the screen where SITL is started.
 *
 * Placed beside the 3D World and FlightGear buttons because it answers the same question they
 * do, and because this is the screen somebody is already looking at when they decide to show a
 * flight. The Trainer's own view exists for the detail; this is the two-second path.
 *
 * Renders nothing until the Trainer is reachable, so it never appears with nothing behind it.
 */
export function TrainerQuickAction(): JSX.Element | null {
  const { t } = useTranslation();
  const setView = useNavigationStore((s) => s.setView);
  const [status, setStatus] = useState<TrainerStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const read = (): void => void window.electronAPI.trainerStatus().then(setStatus);
    read();
    // The take-off point appears when the flight controller gets a fix, which is not an event
    // this component is told about.
    const timer = setInterval(read, 2000);
    return () => clearInterval(timer);
  }, []);

  if (!status?.available) return null;

  const fly = async (): Promise<void> => {
    setBusy(true);
    // Straight to the Trainer view: it carries the log and the reason if this fails, and a
    // button that silently does nothing is the worst thing this could be.
    setView('trainer');
    try {
      await window.electronAPI.trainerLaunch({ stream: { enabled: true } });
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={() => void fly()}
      disabled={busy || !status?.canLaunch}
      data-tip={status?.reason ?? t('trainer:trainerQuickAction.tip')}
      className="mt-3 w-full py-2 text-sm font-medium text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v18" />
        <path d="M2 10l10-2 10 2-10 3z" />
      </svg>
      {busy ? t('trainer:trainerQuickAction.starting') : t('trainer:trainerView.flyInTrainer')}
    </button>
  );
}
