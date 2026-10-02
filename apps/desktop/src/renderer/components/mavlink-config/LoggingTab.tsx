/**
 * What the flight controller writes to its card, and whether it writes at all.
 *
 * The bit names come from the board's own parameter metadata, so this is right
 * for whatever firmware is connected rather than a table that rots. A vehicle
 * with no card is a first-class case here: turning logging off is one switch,
 * and it offers to drop the matching arming check in the same place, because
 * that is the thing that actually stops the refusals.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HardDrive, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useParameterStore } from '../../stores/parameter-store';
import { useConnectionStore } from '../../stores/connection-store';
import Px4LoggingConfig from './Px4LoggingConfig';
import { DraggableSlider } from '../ui/DraggableSlider';
import { InfoCard } from '../ui/InfoCard';

/** LOG_BACKEND_TYPE bits. */
const BACKEND_FILE = 1;
const BACKEND_MAVLINK = 2;
const BACKEND_BLOCK = 4;

/** ARMING_CHECK bit for "logging available". */
const ARMING_CHECK_LOGGING = 1024;

const DISARMED_OPTIONS = [
  { value: 0, labelKey: 'mavlink-config:loggingTab.onlyArmed', hintKey: 'mavlink-config:loggingTab.onlyArmedHint' },
  { value: 1, labelKey: 'mavlink-config:loggingTab.always', hintKey: 'mavlink-config:loggingTab.alwaysHint' },
  { value: 2, labelKey: 'mavlink-config:loggingTab.exceptUsb', hintKey: 'mavlink-config:loggingTab.exceptUsbHint' },
  { value: 3, labelKey: 'mavlink-config:loggingTab.discardNeverArmed', hintKey: 'mavlink-config:loggingTab.discardNeverArmedHint' },
];

export default function LoggingTab(): JSX.Element {
  const { t } = useTranslation();
  const { parameters, setParameter, getParameterMetadata } = useParameterStore();
  const firmware = useConnectionStore((s) => s.connectionState.firmware);
  const [busy, setBusy] = useState(false);
  // What the destinations were before they were switched off, so turning
  // logging back on restores the setup instead of guessing.
  const lastBackendRef = useRef(0);

  const backend = (parameters.get('LOG_BACKEND_TYPE')?.value as number) ?? 1;
  const bitmask = (parameters.get('LOG_BITMASK')?.value as number) ?? 0;
  const disarmed = (parameters.get('LOG_DISARMED')?.value as number) ?? 0;
  const rotateOnDisarm = (parameters.get('LOG_FILE_DSRMROT')?.value as number) ?? 0;
  const mbFree = (parameters.get('LOG_FILE_MB_FREE')?.value as number) ?? 500;
  const armingCheck = (parameters.get('ARMING_CHECK')?.value as number) ?? 1;

  const hasLogging = parameters.has('LOG_BACKEND_TYPE');
  const loggingOff = backend === 0;
  const loggingChecked = armingCheck === 1 || (armingCheck & ARMING_CHECK_LOGGING) !== 0;

  useEffect(() => {
    if (backend !== 0) lastBackendRef.current = backend;
  }, [backend]);

  // Categories straight from the firmware: every vehicle logs different things.
  const categories = useMemo(() => {
    const meta = getParameterMetadata('LOG_BITMASK');
    return Object.entries(meta?.bitmask ?? {})
      .map(([bit, label]) => ({ bit: Number(bit), label }))
      .sort((a, b) => a.bit - b.bit);
  }, [getParameterMetadata]);

  const write = useCallback(async (param: string, value: number) => {
    setBusy(true);
    try {
      await setParameter(param, value);
    } finally {
      setBusy(false);
    }
  }, [setParameter]);

  const toggleBackend = (bit: number) => write('LOG_BACKEND_TYPE', backend ^ bit);
  const toggleCategory = (bit: number) => write('LOG_BITMASK', bitmask ^ (1 << bit));

  if (firmware === 'px4') return <Px4LoggingConfig />;

  if (!hasLogging) {
    return (
      <div className="p-6">
        <InfoCard title={t('mavlink-config:loggingTab.title')} variant="info">
          {t('mavlink-config:loggingTab.notExposed')}
        </InfoCard>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Where it writes */}
      <div className="bg-surface rounded-xl border border-subtle p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-sky-500/20 flex items-center justify-center">
            <HardDrive className="w-5 h-5 text-sky-400" />
          </div>
          <div className="flex-1">
            <h3 className="font-medium text-content">{t('mavlink-config:loggingTab.whereTitle')}</h3>
            <p className="text-xs text-content-secondary">
              {t('mavlink-config:loggingTab.whereSubtitle')}
            </p>
          </div>
        </div>

        {/* The master state, because "no logging" is a choice people make, not
            three boxes to find and clear. */}
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-subtle bg-surface-raised p-1 w-fit">
          <button
            onClick={() => write('LOG_BACKEND_TYPE', lastBackendRef.current || BACKEND_FILE)}
            disabled={busy || !loggingOff}
            className={`rounded-md px-4 py-1.5 text-xs transition-colors ${
              !loggingOff ? 'bg-sky-500/20 text-sky-300' : 'text-content-secondary hover:text-content'
            }`}
          >
            {t('mavlink-config:loggingTab.loggingOn')}
          </button>
          <button
            onClick={() => write('LOG_BACKEND_TYPE', 0)}
            disabled={busy || loggingOff}
            className={`rounded-md px-4 py-1.5 text-xs transition-colors ${
              loggingOff ? 'bg-amber-500/20 text-amber-300' : 'text-content-secondary hover:text-content'
            }`}
          >
            {t('mavlink-config:loggingTab.noLogging')}
          </button>
        </div>

        {loggingOff ? (
          <p className="text-xs text-content-secondary">
            {t('mavlink-config:loggingTab.nothingRecorded')}
          </p>
        ) : null}

        <div className={`grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))] ${loggingOff ? 'opacity-50' : ''}`}>
          {[
            { bit: BACKEND_FILE, name: t('mavlink-config:loggingTab.sdCard'), hint: t('mavlink-config:loggingTab.sdCardHint') },
            { bit: BACKEND_MAVLINK, name: t('mavlink-config:loggingTab.overMavlink'), hint: t('mavlink-config:loggingTab.overMavlinkHint') },
            { bit: BACKEND_BLOCK, name: t('mavlink-config:loggingTab.onboardFlash'), hint: t('mavlink-config:loggingTab.onboardFlashHint') },
          ].map((b) => {
            const on = (backend & b.bit) !== 0;
            return (
              <button
                key={b.bit}
                onClick={() => toggleBackend(b.bit)}
                disabled={busy}
                className={`rounded-lg border px-3 py-2 text-left transition-colors disabled:opacity-40 ${
                  on ? 'border-sky-500/50 bg-sky-500/10' : 'border-subtle bg-surface-raised'
                }`}
              >
                <div className="flex items-center gap-2 text-sm text-content">
                  {on ? <CheckCircle2 className="w-3.5 h-3.5 text-sky-400" /> : <span className="w-3.5" />}
                  {b.name}
                </div>
                <div className="mt-0.5 text-[11px] text-content-tertiary">{b.hint}</div>
              </button>
            );
          })}
        </div>

        {loggingOff && loggingChecked && (
          <div className="mt-3 flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
            <span className="flex-1 text-xs text-amber-300">
              {t('mavlink-config:loggingTab.checkStillRequired')}
            </span>
            <button
              onClick={() => {
                // ARMING_CHECK 1 means "all": expand it before clearing one bit,
                // or the write would silently switch every other check off.
                const base = armingCheck === 1 ? 0xFFFF : armingCheck;
                void write('ARMING_CHECK', base & ~ARMING_CHECK_LOGGING);
              }}
              disabled={busy}
              className="shrink-0 rounded-md bg-amber-500/20 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-500/30 disabled:opacity-40"
            >
              {t('mavlink-config:loggingTab.dropCheck')}
            </button>
          </div>
        )}
      </div>

      {/* When it writes */}
      <div className="bg-surface rounded-xl border border-subtle p-5 space-y-4">
        <h3 className="font-medium text-content">{t('mavlink-config:loggingTab.whenTitle')}</h3>
        <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
          {DISARMED_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => write('LOG_DISARMED', o.value)}
              disabled={busy}
              className={`rounded-lg border px-3 py-2 text-left transition-colors disabled:opacity-40 ${
                disarmed === o.value ? 'border-sky-500/50 bg-sky-500/10' : 'border-subtle bg-surface-raised'
              }`}
            >
              <div className="text-sm text-content">{t(o.labelKey)}</div>
              <div className="mt-0.5 text-[11px] text-content-tertiary">{t(o.hintKey)}</div>
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={rotateOnDisarm === 1}
            onChange={(e) => write('LOG_FILE_DSRMROT', e.target.checked ? 1 : 0)}
            className="rounded border bg-surface-input"
          />
          <span className="text-xs text-content-secondary">
            {t('mavlink-config:loggingTab.rotateOnDisarm')}
          </span>
        </label>

        <DraggableSlider
          label={t('mavlink-config:loggingTab.keepFree')}
          value={mbFree}
          onChange={(v) => write('LOG_FILE_MB_FREE', v)}
          min={0}
          max={1000}
          step={10}
          color="#0EA5E9"
          hint={t('mavlink-config:loggingTab.keepFreeHint')}
        />
      </div>

      {/* What it writes */}
      <div className="bg-surface rounded-xl border border-subtle p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-medium text-content">{t('mavlink-config:loggingTab.whatTitle')}</h3>
            <p className="text-xs text-content-secondary">
              {t('mavlink-config:loggingTab.whatSubtitle')}
            </p>
          </div>
          <div className="text-[11px] text-content-tertiary tabular-nums">LOG_BITMASK {bitmask}</div>
        </div>
        {categories.length === 0 ? (
          <p className="text-xs text-content-tertiary">
            {t('mavlink-config:loggingTab.noCategories')}
          </p>
        ) : (
          <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
            {categories.map((c) => {
              const on = (bitmask & (1 << c.bit)) !== 0;
              return (
                <button
                  key={c.bit}
                  onClick={() => toggleCategory(c.bit)}
                  disabled={busy}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-left transition-colors disabled:opacity-40 ${
                    on ? 'bg-sky-500/10 text-sky-300' : 'bg-surface-raised text-content-secondary'
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full shrink-0 ${on ? 'bg-sky-400' : 'bg-content-tertiary/40'}`} />
                  {c.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
