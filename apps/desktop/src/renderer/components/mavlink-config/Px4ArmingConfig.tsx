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
import { Shield, AlertTriangle, Unlock } from 'lucide-react';
import { useParameterStore } from '../../stores/parameter-store';
import { InfoCard } from '../ui/InfoCard';
import { useTranslation } from 'react-i18next';

interface CheckRow {
  param: string;
  labelKey: string;
  hintKey: string;
  /**
   * Values this check can take, strictest first. `strict` is the value that
   * blocks arming, so the header can count what is switched off. Taken from
   * PX4's own enums: several of these are three-state, and COM_ARM_WO_GPS is
   * inverted (0 denies arming), so a plain on/off toggle would write the
   * opposite of what the label says.
   */
  options: Array<{ value: number; labelKey: string }>;
  strict: number;
}

const TOGGLE_CHECKS: CheckRow[] = [
  {
    param: 'COM_ARM_WO_GPS',
    labelKey: 'mavlink-config:px4ArmingConfig.armWithoutGnss',
    hintKey: 'mavlink-config:px4ArmingConfig.armWithoutGnssHint',
    strict: 0,
    options: [
      { value: 0, labelKey: 'mavlink-config:px4ArmingConfig.deny' },
      { value: 1, labelKey: 'mavlink-config:px4ArmingConfig.allowWarn' },
      { value: 2, labelKey: 'mavlink-config:px4ArmingConfig.allow' },
    ],
  },
  {
    param: 'COM_ARM_MAG_STR',
    labelKey: 'mavlink-config:px4ArmingConfig.magStrength',
    hintKey: 'mavlink-config:px4ArmingConfig.magStrengthHint',
    strict: 1,
    options: [
      { value: 1, labelKey: 'mavlink-config:px4ArmingConfig.deny' },
      { value: 2, labelKey: 'mavlink-config:px4ArmingConfig.warn' },
      { value: 0, labelKey: 'common:off' },
    ],
  },
  {
    param: 'COM_ARM_CHK_ESCS',
    labelKey: 'mavlink-config:px4ArmingConfig.escTelemetry',
    hintKey: 'mavlink-config:px4ArmingConfig.escTelemetryHint',
    strict: 1,
    options: [{ value: 1, labelKey: 'mavlink-config:px4ArmingConfig.checked' }, { value: 0, labelKey: 'common:off' }],
  },
  {
    param: 'COM_ARM_MIS_REQ',
    labelKey: 'mavlink-config:px4ArmingConfig.requireMission',
    hintKey: 'mavlink-config:px4ArmingConfig.requireMissionHint',
    strict: 1,
    options: [{ value: 1, labelKey: 'mavlink-config:px4ArmingConfig.required' }, { value: 0, labelKey: 'common:off' }],
  },
  {
    param: 'COM_ARM_AUTH_REQ',
    labelKey: 'mavlink-config:px4ArmingConfig.externalAuth',
    hintKey: 'mavlink-config:px4ArmingConfig.externalAuthHint',
    strict: 1,
    options: [{ value: 1, labelKey: 'mavlink-config:px4ArmingConfig.required' }, { value: 0, labelKey: 'common:off' }],
  },
  {
    param: 'COM_ARM_SWISBTN',
    labelKey: 'mavlink-config:px4ArmingConfig.armSwitchButton',
    hintKey: 'mavlink-config:px4ArmingConfig.armSwitchButtonHint',
    strict: 1,
    options: [{ value: 1, labelKey: 'mavlink-config:px4ArmingConfig.button' }, { value: 0, labelKey: 'mavlink-config:px4ArmingConfig.switch' }],
  },
];

/** Circuit breakers: writing the magic value DISABLES the check. */
const BREAKERS: Array<{ param: string; labelKey: string; hintKey: string }> = [
  { param: 'CBRK_SUPPLY_CHK', labelKey: 'mavlink-config:px4ArmingConfig.powerModuleCheck', hintKey: 'mavlink-config:px4ArmingConfig.powerModuleCheckHint' },
  { param: 'CBRK_USB_CHK', labelKey: 'mavlink-config:px4ArmingConfig.refuseUsb', hintKey: 'mavlink-config:px4ArmingConfig.refuseUsbHint' },
  { param: 'CBRK_IO_SAFETY', labelKey: 'mavlink-config:px4ArmingConfig.safetySwitch', hintKey: 'mavlink-config:px4ArmingConfig.safetySwitchHint' },
  { param: 'CBRK_VTOLARMING', labelKey: 'mavlink-config:px4ArmingConfig.vtolArming', hintKey: 'mavlink-config:px4ArmingConfig.vtolArmingHint' },
];

export default function Px4ArmingConfig(): JSX.Element {
  const { t } = useTranslation();
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
        <InfoCard title={t('common:arming')} variant="info">
          {t('mavlink-config:px4ArmingConfig.notExposed')}
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
            <h3 className="font-medium text-content">{t('mavlink-config:px4ArmingConfig.armingChecks')}</h3>
            <p className="text-xs text-content-secondary">
              {disabledCount === 0
                ? t('mavlink-config:px4ArmingConfig.allActive')
                : t('mavlink-config:px4ArmingConfig.switchedOff', { count: disabledCount })}
            </p>
          </div>
        </div>

        {disabledCount > 0 && (
          <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <span>
                {t('mavlink-config:px4ArmingConfig.disabledWarning')}
              </span>
            </div>
          </div>
        )}
      </div>

      {activeToggles.length > 0 && (
        <div className="bg-surface rounded-xl border border-subtle p-5">
          <h3 className="mb-3 font-medium text-content">{t('mavlink-config:px4ArmingConfig.preflightChecks')}</h3>
          <div className="space-y-2">
            {activeToggles.map((c) => {
              const value = (parameters.get(c.param)?.value as number) ?? c.strict;
              return (
                <div
                  key={c.param}
                  className="flex items-center gap-3 rounded-lg border border-subtle bg-surface-raised px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-content">{t(c.labelKey)}</div>
                    <div className="text-[11px] text-content-tertiary">
                      {t(c.hintKey)} · <span className="font-mono">{c.param}</span>
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
                          {t(o.labelKey)}
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
            <h3 className="font-medium text-content">{t('mavlink-config:px4ArmingConfig.circuitBreakers')}</h3>
          </div>
          <p className="mb-3 text-xs text-content-secondary">
            {t('mavlink-config:px4ArmingConfig.breakersHint')}
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
                    <div className="text-sm text-content">{t(c.labelKey)}</div>
                    <div className="text-[11px] text-content-tertiary">
                      {t(c.hintKey)} · <span className="font-mono">{c.param}</span>
                    </div>
                  </div>
                  {magic === null ? (
                    <span className="shrink-0 text-[11px] text-content-tertiary">
                      {t('mavlink-config:px4ArmingConfig.unlockUnknown')}
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
                      {engaged ? t('mavlink-config:px4ArmingConfig.checkOff') : t('mavlink-config:px4ArmingConfig.checked')}
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
