/**
 * Why the vehicle will not arm, and what to do about it.
 *
 * ArduPilot already says why, one line at a time, buried in the message stream
 * and worded for the firmware rather than the pilot. This gathers the live
 * refusals, names the check each one belongs to, and offers the action that
 * clears it, including switching a check off when the hardware is genuinely
 * not there.
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, ShieldAlert, ArrowRight } from 'lucide-react';
import { useMessagesStore } from '../../stores/messages-store';
import { useNavigationStore, type ViewId } from '../../stores/navigation-store';
import { useTelemetryStore } from '../../stores/telemetry-store';
import { currentPrearmFailures } from './prearm-status';
import {
  ARMING_CHECK_BITS,
  isCheckEnabled,
  withCheckDisabled,
  type ArmingModel,
} from './arming-checks';

interface PrearmPanelProps {
  model: ArmingModel | null;
  value: number;
  onWrite: (value: number) => void;
  /** Jump to another configuration tab, when one can fix this. */
  onGoTo?: (tab: string) => void;
}

/** What actually clears each refusal, in the pilot's terms. */
const ADVICE: Record<number, { fixKey: string; tab?: string; view?: string; tabLabelKey?: string }> = {
  1: { fixKey: 'mavlink-config:prearmPanel.fix1' },
  3: { fixKey: 'mavlink-config:prearmPanel.fix3' },
  // Level writes AHRS_TRIM_* only; this check reads INS_ACCOFFS_*/INS_ACCSCAL_*,
  // which only the six-point calibration writes.
  4: { fixKey: 'mavlink-config:prearmPanel.fix4', view: 'calibration', tabLabelKey: 'mavlink-config:prearmPanel.openCalibration' },
  2: { fixKey: 'mavlink-config:prearmPanel.fix2', view: 'calibration', tabLabelKey: 'mavlink-config:prearmPanel.openCalibration' },
  5: { fixKey: 'mavlink-config:prearmPanel.fix5', tab: 'parameters', tabLabelKey: 'mavlink-config:prearmPanel.openParameters' },
  6: { fixKey: 'mavlink-config:prearmPanel.fix6', tab: 'receiver', tabLabelKey: 'mavlink-config:prearmPanel.openRc' },
  7: { fixKey: 'mavlink-config:prearmPanel.fix7' },
  8: { fixKey: 'mavlink-config:prearmPanel.fix8', tab: 'battery', tabLabelKey: 'mavlink-config:prearmPanel.openBattery' },
  9: { fixKey: 'mavlink-config:prearmPanel.fix9' },
  10: { fixKey: 'mavlink-config:prearmPanel.fix10', tab: 'logging', tabLabelKey: 'mavlink-config:prearmPanel.openLogging' },
  11: { fixKey: 'mavlink-config:prearmPanel.fix11' },
  12: { fixKey: 'mavlink-config:prearmPanel.fix12' },
  13: { fixKey: 'mavlink-config:prearmPanel.fix13' },
  14: { fixKey: 'mavlink-config:prearmPanel.fix14', tab: 'mission', tabLabelKey: 'mavlink-config:prearmPanel.openMission' },
  15: { fixKey: 'mavlink-config:prearmPanel.fix15' },
  16: { fixKey: 'mavlink-config:prearmPanel.fix16' },
  17: { fixKey: 'mavlink-config:prearmPanel.fix17' },
  18: { fixKey: 'mavlink-config:prearmPanel.fix18' },
  19: { fixKey: 'mavlink-config:prearmPanel.fix19' },
};

export function PrearmPanel({ model, value, onWrite, onGoTo }: PrearmPanelProps): JSX.Element {
  const { t } = useTranslation();
  const statusMessages = useMessagesStore((s) => s.messages);
  const armed = useTelemetryStore((s) => s.flight.armed);
  const setView = useNavigationStore((s) => s.setView);

  const failures = useMemo(
    () => currentPrearmFailures(statusMessages as Array<{ text: string; timestamp?: number }>),
    [statusMessages],
  );

  const blocked = failures.length > 0 && !armed;
  const nameFor = (bit: number | null) =>
    ARMING_CHECK_BITS.find((b) => b.bit === bit)?.name ?? null;

  return (
    <div className={`rounded-xl border p-5 ${
      armed
        ? 'border-blue-500/40 bg-blue-500/5'
        : blocked ? 'border-amber-500/40 bg-amber-500/5' : 'border-emerald-500/40 bg-emerald-500/5'
    }`}>
      <div className="flex items-center gap-3">
        <div className={`w-11 h-11 rounded-lg flex items-center justify-center ${
          blocked ? 'bg-amber-500/20' : 'bg-emerald-500/20'
        }`}>
          {blocked
            ? <ShieldAlert className="w-6 h-6 text-amber-400" />
            : <ShieldCheck className="w-6 h-6 text-emerald-400" />}
        </div>
        <div className="flex-1">
          <h3 className={`text-lg font-medium ${blocked ? 'text-amber-300' : 'text-emerald-300'}`}>
            {armed ? t('common:armed') : blocked ? t('mavlink-config:prearmPanel.willNotArm') : t('mavlink-config:prearmPanel.readyToArm')}
          </h3>
          <p className="text-xs text-content-secondary">
            {armed
              ? t('mavlink-config:prearmPanel.armedBody')
              : blocked
                ? t('mavlink-config:prearmPanel.blocked', { count: failures.length })
                : t('mavlink-config:prearmPanel.ready')}
          </p>
        </div>
      </div>

      {blocked && (
        <div className="mt-4 space-y-2">
          {failures.map((f) => {
            const name = nameFor(f.bit);
            const advice = f.bit !== null ? ADVICE[f.bit] : undefined;
            const canSkip = model !== null && f.bit !== null && isCheckEnabled(model, value, f.bit);
            return (
              <div key={f.text} className="rounded-lg border border-subtle bg-surface p-3">
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <div className="text-sm text-content">{f.text}</div>
                    <div className="mt-0.5 text-[11px] text-content-tertiary">
                      {name ? t('mavlink-config:prearmPanel.checkName', { name }) : t('mavlink-config:prearmPanel.noMatchingCheck')}
                      {advice ? ` · ${t(advice.fixKey)}` : ''}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {(advice?.tab || advice?.view) && (
                      <button
                        onClick={() => {
                          if (advice.view) setView(advice.view as ViewId);
                          else if (advice.tab && onGoTo) onGoTo(advice.tab);
                        }}
                        className="flex items-center gap-1 rounded-md bg-surface-raised px-2.5 py-1.5 text-[11px] text-content-secondary hover:text-content"
                      >
                        {advice.tabLabelKey ? t(advice.tabLabelKey) : null} <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                    {canSkip && (
                      <button
                        onClick={() => onWrite(withCheckDisabled(model!, value, f.bit!))}
                        data-tip={t('mavlink-config:prearmPanel.skipTip', { name })}
                        className="rounded-md bg-amber-500/20 px-2.5 py-1.5 text-[11px] text-amber-200 hover:bg-amber-500/30"
                      >
                        {t('mavlink-config:prearmPanel.skipCheck')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
