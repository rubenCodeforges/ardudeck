/**
 * Px4ArmingConfig
 *
 * PX4 arming setup, mirroring the ArduPilot ArmingTab UX. PX4 has no single
 * ARMING_CHECK bitmask: each preflight check is its own COM_ARM_* parameter,
 * and a few are disabled through circuit breakers, which are "engaged" only
 * when written with one specific magic number.
 *
 * Those magic numbers are read from the vehicle's own parameter metadata (PX4
 * publishes them as the parameter's max), never hardcoded, so a firmware that
 * changes one cannot leave this UI quietly writing the wrong value.
 */

import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Shield, AlertTriangle, Unlock } from 'lucide-react';
import { useParameterStore } from '../../stores/parameter-store';
import { InfoCard } from '../ui/InfoCard';

/** Prefer the i18n key; falls back to the literal. */
function paText(t: (key: string) => string, key: string | undefined, fallback: string): string {
  return key ? t(key) : fallback;
}

interface CheckRow {
  param: string;
  label: string;
  labelKey?: string;
  hint: string;
  hintKey?: string;
  /**
   * Values this check can take, strictest first. `strict` is the value that
   * blocks arming, so the header can count what is switched off. Taken from
   * PX4's own enums: several of these are three-state, and COM_ARM_WO_GPS is
   * inverted (0 denies arming), so a plain on/off toggle would write the
   * opposite of what the label says.
   */
  options: Array<{ value: number; label: string; labelKey?: string }>;
  strict: number;
}

const TOGGLE_CHECKS: CheckRow[] = [
  {
    param: 'COM_ARM_WO_GPS',
    label: 'Arming without GNSS',
    labelKey: 'px4Arming.check.wo-gps.label',
    hint: 'PX4 inverts this one: 0 requires a position fix',
    hintKey: 'px4Arming.check.wo-gps.hint',
    strict: 0,
    options: [
      { value: 0, label: 'Deny', labelKey: 'px4Arming.option.deny' },
      { value: 1, label: 'Allow, warn', labelKey: 'px4Arming.option.allow-warn' },
      { value: 2, label: 'Allow', labelKey: 'px4Arming.option.allow' },
    ],
  },
  {
    param: 'COM_ARM_MAG_STR',
    label: 'Magnetometer field strength',
    labelKey: 'px4Arming.check.mag-str.label',
    hint: 'Catches interference and a bad calibration',
    hintKey: 'px4Arming.check.mag-str.hint',
    strict: 1,
    options: [
      { value: 1, label: 'Deny', labelKey: 'px4Arming.option.deny' },
      { value: 2, label: 'Warn', labelKey: 'px4Arming.option.warn' },
      { value: 0, label: 'Off', labelKey: 'px4Arming.option.off' },
    ],
  },
  {
    param: 'COM_ARM_CHK_ESCS',
    label: 'ESC telemetry',
    labelKey: 'px4Arming.check.chk-escs.label',
    hint: 'Only for ESCs that report back',
    hintKey: 'px4Arming.check.chk-escs.hint',
    strict: 1,
    options: [
      { value: 1, label: 'Checked', labelKey: 'px4Arming.option.checked' },
      { value: 0, label: 'Off', labelKey: 'px4Arming.option.off' },
    ],
  },
  {
    param: 'COM_ARM_MIS_REQ',
    label: 'Require a valid mission',
    labelKey: 'px4Arming.check.mis-req.label',
    hint: 'Refuses to arm with nothing loaded',
    hintKey: 'px4Arming.check.mis-req.hint',
    strict: 1,
    options: [
      { value: 1, label: 'Required', labelKey: 'px4Arming.option.required' },
      { value: 0, label: 'Off', labelKey: 'px4Arming.option.off' },
    ],
  },
  {
    param: 'COM_ARM_AUTH_REQ',
    label: 'External arm authorisation',
    labelKey: 'px4Arming.check.auth-req.label',
    hint: 'A companion must grant arming',
    hintKey: 'px4Arming.check.auth-req.hint',
    strict: 1,
    options: [
      { value: 1, label: 'Required', labelKey: 'px4Arming.option.required' },
      { value: 0, label: 'Off', labelKey: 'px4Arming.option.off' },
    ],
  },
  {
    param: 'COM_ARM_SWISBTN',
    label: 'Arm switch is a button',
    labelKey: 'px4Arming.check.swisbtn.label',
    hint: 'Momentary rather than a latching switch',
    hintKey: 'px4Arming.check.swisbtn.hint',
    strict: 1,
    options: [
      { value: 1, label: 'Button', labelKey: 'px4Arming.option.button' },
      { value: 0, label: 'Switch', labelKey: 'px4Arming.option.switch' },
    ],
  },
];

/** Circuit breakers: writing the magic value DISABLES the check. */
const BREAKERS: Array<{ param: string; label: string; labelKey: string; hint: string; hintKey: string }> = [
  {
    param: 'CBRK_SUPPLY_CHK',
    label: 'Power module check',
    labelKey: 'px4Arming.breaker.supply-chk.label',
    hint: 'Disable only on a bench with no power module',
    hintKey: 'px4Arming.breaker.supply-chk.hint',
  },
  {
    param: 'CBRK_USB_CHK',
    label: 'Refuse to arm on USB',
    labelKey: 'px4Arming.breaker.usb-chk.label',
    hint: 'Disable to allow arming while plugged in',
    hintKey: 'px4Arming.breaker.usb-chk.hint',
  },
  {
    param: 'CBRK_IO_SAFETY',
    label: 'Safety switch',
    labelKey: 'px4Arming.breaker.io-safety.label',
    hint: 'Disable when no safety button is fitted',
    hintKey: 'px4Arming.breaker.io-safety.hint',
  },
  {
    param: 'CBRK_VTOLARMING',
    label: 'VTOL fixed-wing arming check',
    labelKey: 'px4Arming.breaker.vtolarming.label',
    hint: 'VTOL only',
    hintKey: 'px4Arming.breaker.vtolarming.hint',
  },
];

export default function Px4ArmingConfig(): JSX.Element {
  const { t } = useTranslation('mavlink');
  const { parameters, setParameter, getParameterMetadata } = useParameterStore();
  const [busy, setBusy] = useState(false);

  const supported = TOGGLE_CHECKS.some((c) => parameters.has(c.param))
    || BREAKERS.some((c) => parameters.has(c.param));

  const write = useCallback(async (param: string, value: number) => {
    setBusy(true);
    try {
      await setParameter(param, value);
    } finally {
      setBusy(false);
    }
  }, [setParameter]);

  /** The value that engages a breaker, straight from this vehicle's metadata. */
  const breakerMagic = useCallback((param: string): number | null => {
    const max = getParameterMetadata(param)?.range?.max;
    return typeof max === 'number' && max > 0 ? max : null;
  }, [getParameterMetadata]);

  const activeToggles = useMemo(
    () => TOGGLE_CHECKS.filter((c) => parameters.has(c.param)),
    [parameters],
  );
  const activeBreakers = useMemo(
    () => BREAKERS.filter((c) => parameters.has(c.param)),
    [parameters],
  );

  const disabledCount = useMemo(() => {
    let n = 0;
    for (const c of activeToggles) {
      const v = (parameters.get(c.param)?.value as number) ?? c.strict;
      if (v !== c.strict) n++;
    }
    for (const c of activeBreakers) {
      const magic = breakerMagic(c.param);
      if (magic !== null && ((parameters.get(c.param)?.value as number) ?? 0) === magic) n++;
    }
    return n;
  }, [activeToggles, activeBreakers, parameters, breakerMagic]);

  if (!supported) {
    return (
      <div className="p-6">
        <InfoCard title={t('px4Arming.title.arming')} variant="info">
          {t('px4Arming.unsupported')}
        </InfoCard>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="bg-surface rounded-xl border border-subtle p-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
            <Shield className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="flex-1">
            <h3 className="font-medium text-content">{t('px4Arming.header.title')}</h3>
            <p className="text-xs text-content-secondary">
              {disabledCount === 0
                ? t('px4Arming.status.all-active')
                : disabledCount === 1
                  ? t('px4Arming.status.one-off')
                  : t('px4Arming.status.many-off', { n: disabledCount })}
            </p>
          </div>
        </div>

        {disabledCount > 0 && (
          <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <span>
                {t('px4Arming.warning.disabled-check')}
              </span>
            </div>
          </div>
        )}
      </div>

      {activeToggles.length > 0 && (
        <div className="bg-surface rounded-xl border border-subtle p-5">
          <h3 className="mb-3 font-medium text-content">{t('px4Arming.section.preflight')}</h3>
          <div className="space-y-2">
            {activeToggles.map((c) => {
              const value = (parameters.get(c.param)?.value as number) ?? c.strict;
              return (
                <div
                  key={c.param}
                  className="flex items-center gap-3 rounded-lg border border-subtle bg-surface-raised px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-content">{paText(t, c.labelKey, c.label)}</div>
                    <div className="text-[11px] text-content-tertiary">
                      {paText(t, c.hintKey, c.hint)} · <span className="font-mono">{c.param}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {c.options.map((o) => {
                      const active = value === o.value;
                      const strict = o.value === c.strict;
                      return (
                        <button
                          key={o.value}
                          onClick={() => write(c.param, o.value)}
                          disabled={busy}
                          className={`rounded-md px-2.5 py-1.5 text-[11px] transition-colors disabled:opacity-40 ${
                            active
                              ? strict
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : 'bg-amber-500/20 text-amber-300'
                              : 'bg-surface-overlay text-content-tertiary hover:text-content'
                          }`}
                        >
                          {paText(t, o.labelKey, o.label)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeBreakers.length > 0 && (
        <div className="bg-surface rounded-xl border border-subtle p-5">
          <div className="mb-1 flex items-center gap-2">
            <Unlock className="h-4 w-4 text-content-tertiary" />
            <h3 className="font-medium text-content">{t('px4Arming.section.breakers')}</h3>
          </div>
          <p className="mb-3 text-xs text-content-secondary">
            {t('px4Arming.breakers.intro')}
          </p>
          <div className="space-y-2">
            {activeBreakers.map((c) => {
              const magic = breakerMagic(c.param);
              const value = (parameters.get(c.param)?.value as number) ?? 0;
              const engaged = magic !== null && value === magic;
              return (
                <div
                  key={c.param}
                  className="flex items-center gap-3 rounded-lg border border-subtle bg-surface-raised px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-content">{paText(t, c.labelKey, c.label)}</div>
                    <div className="text-[11px] text-content-tertiary">
                      {paText(t, c.hintKey, c.hint)} · <span className="font-mono">{c.param}</span>
                    </div>
                  </div>
                  {magic === null ? (
                    <span className="shrink-0 text-[11px] text-content-tertiary">
                      {t('px4Arming.breaker.unlock-unknown')}
                    </span>
                  ) : (
                    <button
                      onClick={() => write(c.param, engaged ? 0 : magic)}
                      disabled={busy}
                      className={`shrink-0 rounded-md px-3 py-1.5 text-[11px] transition-colors disabled:opacity-40 ${
                        engaged
                          ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'
                          : 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
                      }`}
                    >
                      {engaged ? t('px4Arming.breaker.check-off') : t('px4Arming.breaker.checked')}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
