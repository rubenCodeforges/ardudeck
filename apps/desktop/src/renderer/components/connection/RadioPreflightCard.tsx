import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParameterStore } from '../../stores/parameter-store';
import { useMessagesStore } from '../../stores/messages-store';
import { evaluateRadioPreflight } from '../../utils/radio-preflight';

/**
 * Plain-language vehicle checks for flying/driving over a MAVLink radio
 * link (ELRS MAVLink mode etc.), with a single "fix" button. Hides the
 * parameter plumbing entirely - the details flap shows it for the curious.
 */
export function RadioPreflightCard() {
  const { t } = useTranslation();
  const parameters = useParameterStore((s) => s.parameters);
  const messages = useMessagesStore((s) => s.messages);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [rebooting, setRebooting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const firmwareBanner = useMemo(
    () => messages.find((m) => /Ardu\w+\s+V\d+\.\d+/.test(m.text))?.text ?? null,
    [messages],
  );

  const checks = useMemo(
    () => evaluateRadioPreflight((name) => parameters.get(name)?.value, firmwareBanner),
    [parameters, firmwareBanner],
  );

  const failing = checks.filter((c) => c.status === 'fail');
  const fixable = failing.flatMap((c) => c.fix ?? []);
  const allPass = checks.every((c) => c.status === 'pass');

  const applyFixes = async () => {
    setApplying(true);
    setFailure(null);
    try {
      const batch = fixable.map((f) => {
        const existing = parameters.get(f.param);
        if (!existing) throw new Error(t('connection:radioPreflight.paramNotLoaded', { param: f.param }));
        return { paramId: f.param, value: f.value, type: existing.type };
      });
      const result = await window.electronAPI.setParameterBatch(batch);
      const failed = result?.failed ?? [];
      if (failed.length > 0) {
        setFailure(t('connection:radioPreflight.vehicleRejected', { params: failed.join(', ') }));
      } else {
        setApplied(true);
      }
    } catch (e) {
      setFailure(e instanceof Error ? e.message : t('connection:radioPreflight.applyFailed'));
    } finally {
      setApplying(false);
    }
  };

  const reboot = async () => {
    setRebooting(true);
    try {
      await window.electronAPI.mavlinkReboot();
    } finally {
      setRebooting(false);
    }
  };

  const dot = (status: 'pass' | 'fail' | 'unknown') =>
    status === 'pass' ? 'bg-emerald-400' : status === 'fail' ? 'bg-red-400' : 'bg-gray-500';

  return (
    <div className="card">
      <div className="card-body space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-content">{t('connection:radioPreflight.title')}</p>
          <p className="text-xs text-content-secondary">
            {allPass
              ? t('connection:radioPreflight.allPass')
              : t('connection:radioPreflight.needsAdjusting')}
          </p>
        </div>
        {applied ? (
          <button
            onClick={reboot}
            disabled={rebooting}
            className="btn btn-primary text-xs shrink-0"
            data-tip={t('connection:radioPreflight.restartTip')}
          >
            {rebooting ? t('connection:radioPreflight.restarting') : t('connection:radioPreflight.restartVehicle')}
          </button>
        ) : (
          fixable.length > 0 && (
            <button
              onClick={applyFixes}
              disabled={applying}
              className="btn btn-primary text-xs shrink-0"
              data-tip={t('connection:radioPreflight.fixTip')}
            >
              {applying ? t('connection:radioPreflight.fixing') : t('connection:radioPreflight.fixForMe')}
            </button>
          )
        )}
      </div>

      <div className="space-y-1.5">
        {checks.map((c) => (
          <div key={c.id} className="flex items-start gap-2">
            <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${dot(c.status)}`} />
            <div>
              <p className="text-xs text-content">{c.title}</p>
              <p className="text-xs text-content-secondary">{c.detail}</p>
            </div>
          </div>
        ))}
      </div>

      {applied && (
        <p className="text-xs text-emerald-300">
          {t('connection:radioPreflight.applied')}
        </p>
      )}
      {failure && <p className="text-xs text-red-300">{failure}</p>}

      {fixable.length > 0 && (
        <button
          onClick={() => setShowDetails((v) => !v)}
          className="text-xs text-content-secondary hover:text-content transition-colors"
        >
          {showDetails ? t('connection:radioPreflight.hideDetails') : t('connection:radioPreflight.showDetails')}
        </button>
      )}
      {showDetails && fixable.length > 0 && (
        <div className="text-xs text-content-secondary font-mono space-y-0.5">
          {fixable.map((f) => (
            <p key={f.param}>
              {f.param} → {f.value}
            </p>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
