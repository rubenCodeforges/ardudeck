/**
 * The vehicle's own indicators: the LED ring, the buzzer and the safety
 * button, which on most builds all live in the GPS puck rather than on the
 * autopilot.
 *
 * Parameter names and the driver bitmask are taken from firmware source
 * (AP_Notify.cpp, AP_BoardConfig.cpp), and the labels come from the board's
 * own metadata when it has arrived, so a firmware that adds a driver does not
 * need a change here.
 */

import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Lightbulb, Volume2, ShieldAlert, Cpu, ChevronDown, Activity, Palette, Check, type LucideIcon } from 'lucide-react';
import { useParameterStore } from '../../stores/parameter-store';
import { useConnectionStore } from '../../stores/connection-store';
import { DraggableSlider } from '../ui/DraggableSlider';
import { InfoCard } from '../ui/InfoCard';
import { LedLens } from '../ui/LedLens';
import { useTelemetryStore } from '../../stores/telemetry-store';
import { ModuleConfigCards } from '../../modules/ModuleConfigCards';

const PRESETS = [
  { name: 'Red', nameKey: 'mavlink-config:notifyTab.colourRed', hex: '#ef4444' },
  { name: 'Orange', nameKey: 'mavlink-config:notifyTab.colourOrange', hex: '#f97316' },
  { name: 'Yellow', nameKey: 'mavlink-config:notifyTab.colourYellow', hex: '#eab308' },
  { name: 'Green', nameKey: 'mavlink-config:notifyTab.colourGreen', hex: '#22c55e' },
  { name: 'Cyan', nameKey: 'mavlink-config:notifyTab.colourCyan', hex: '#06b6d4' },
  { name: 'Blue', nameKey: 'mavlink-config:notifyTab.colourBlue', hex: '#3b82f6' },
  { name: 'Violet', nameKey: 'mavlink-config:notifyTab.colourViolet', hex: '#8b5cf6' },
  { name: 'White', nameKey: 'mavlink-config:notifyTab.colourWhite', hex: '#ffffff' },
  { name: 'Off', nameKey: 'mavlink-config:notifyTab.colourOff', hex: '#000000' },
];

function hexToRgb(hex: string): { red: number; green: number; blue: number } {
  const v = hex.replace('#', '');
  return {
    red: parseInt(v.slice(0, 2), 16),
    green: parseInt(v.slice(2, 4), 16),
    blue: parseInt(v.slice(4, 6), 16),
  };
}

const LED_STATES = [
  { colour: 'bg-red-500', labelKey: 'mavlink-config:notifyTab.stateInitialising', hintKey: 'mavlink-config:notifyTab.stateInitialisingHint' },
  { colour: 'bg-blue-500', labelKey: 'mavlink-config:notifyTab.stateNoGps', hintKey: 'mavlink-config:notifyTab.stateNoGpsHint' },
  { colour: 'bg-emerald-500', labelKey: 'mavlink-config:notifyTab.stateGpsLock', hintKey: 'mavlink-config:notifyTab.stateGpsLockHint' },
  { colour: 'bg-emerald-600', labelKey: 'mavlink-config:notifyTab.stateArmed', hintKey: 'mavlink-config:notifyTab.stateArmedHint' },
  { colour: 'bg-amber-500', labelKey: 'mavlink-config:notifyTab.stateFailsafe', hintKey: 'mavlink-config:notifyTab.stateFailsafeHint' },
];

/** NTF_LED_TYPES bits, from AP_Notify.cpp. Used when metadata is absent. */
const LED_TYPE_FALLBACK: Record<number, string> = {
  0: 'Built-in LED', 1: 'Internal ToshibaLED', 2: 'External ToshibaLED', // i18n-exempt
  3: 'External PCA9685', 4: 'Oreo LED', 5: 'DroneCAN', 6: 'NCP5623 External', // i18n-exempt
  7: 'NCP5623 Internal', 8: 'NeoPixel', 9: 'ProfiLED', 10: 'Scripting',
  11: 'DShot', 12: 'ProfiLED SPI', 13: 'LP5562 External', 14: 'LP5562 Internal',
  15: 'IS31FL3195 External', 16: 'IS31FL3195 Internal', 17: 'DiscreteRGB',
  18: 'NeoPixelRGB', 19: 'ProfiLED IOMCU',
};

/** NTF_BUZZ_TYPES bits, from AP_Notify.cpp. */
const BUZZ_TYPE_FALLBACK: Record<number, string> = {
  0: 'Built-in buzzer', 1: 'DShot', 2: 'DroneCAN', // i18n-exempt
};

const AP_BRIGHTNESS = [
  { value: 0, labelKey: 'common:off' },
  { value: 1, labelKey: 'mavlink-config:notifyTab.brightnessLow' },
  { value: 2, labelKey: 'mavlink-config:notifyTab.brightnessMedium' },
  { value: 3, labelKey: 'common:high' },
];

/** Serial-LED strips ride a servo output set to one of these functions. */
const STRIP_FUNCTIONS: Record<number, string> = {
  120: 'NeoPixel 1', 121: 'NeoPixel 2', 122: 'NeoPixel 3', 123: 'NeoPixel 4',
  124: 'ProfiLED 1', 125: 'ProfiLED 2', 126: 'ProfiLED 3', 127: 'ProfiLED Clock',
};

function isLight(hex: string): boolean {
  const { red, green, blue } = hexToRgb(hex);
  return red * 0.299 + green * 0.587 + blue * 0.114 > 170;
}

function SourceOption({ active, disabled, onClick, Icon, title, description }: {
  active: boolean; disabled: boolean; onClick(): void; Icon: LucideIcon; title: string; description: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`h-full flex items-start gap-3 rounded-xl border p-4 text-left transition-colors disabled:opacity-60 ${
        active ? 'border-amber-500 ring-1 ring-amber-500 bg-amber-500/5' : 'border-subtle bg-surface-raised hover:border-amber-500/50'
      }`}
    >
      <span className={`w-8 h-8 shrink-0 rounded-lg flex items-center justify-center ${active ? 'bg-amber-500/20' : 'bg-surface'}`}>
        <Icon className={`w-4 h-4 ${active ? 'text-amber-500 dark:text-amber-400' : 'text-content-secondary'}`} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-content">{title}</span>
        <span className="block text-[11px] text-content-secondary leading-snug mt-0.5">{description}</span>
      </span>
    </button>
  );
}

const BRIGHTNESS_GLOW = [0, 0.45, 0.7, 1];

export default function NotifyTab(): JSX.Element {
  const { t } = useTranslation();
  const { parameters, setParameter, getParameterMetadata } = useParameterStore();
  const firmware = useConnectionStore((s) => s.connectionState.firmware);
  const [busy, setBusy] = useState(false);
  const [showDrivers, setShowDrivers] = useState(false);
  const [colour, setColour] = useState('#3b82f6');
  const [rateHz, setRateHz] = useState(0);
  const [ledNote, setLedNote] = useState<string | null>(null);

  const isPx4 = firmware === 'px4';
  const isConnected = useConnectionStore((s) => s.connectionState.isConnected);
  const armed = useTelemetryStore((s) => s.flight.armed);
  const gpsFix = useTelemetryStore((s) => s.gps.fixType);
  const has = (name: string) => parameters.has(name);
  const num = (name: string, fallback: number) =>
    (parameters.get(name)?.value as number | undefined) ?? fallback;

  const write = useCallback(async (name: string, value: number) => {
    setBusy(true);
    try {
      await setParameter(name, value);
    } finally {
      setBusy(false);
    }
  }, [setParameter]);

  const bitsOf = useCallback((param: string, fallback: Record<number, string>) => {
    const meta = getParameterMetadata(param)?.bitmask;
    const src = meta && Object.keys(meta).length > 0 ? meta : fallback;
    return Object.entries(src)
      .map(([bit, label]) => ({ bit: Number(bit), label: String(label) }))
      .sort((a, b) => a.bit - b.bit);
  }, [getParameterMetadata]);

  /** Drive the ring. Turns the override on first, since the FC ignores us otherwise. */
  const applyColour = useCallback(async (hex: string, rate: number) => {
    if (typeof window.electronAPI?.setLedColour !== 'function') {
      setLedNote(t('mavlink-config:notifyTab.restartForLed'));
      return;
    }
    setBusy(true);
    setLedNote(null);
    try {
      if (!isPx4 && parameters.has('NTF_LED_OVERRIDE')
        && (parameters.get('NTF_LED_OVERRIDE')?.value as number) !== 1) {
        await setParameter('NTF_LED_OVERRIDE', 1);
      }
      const res = await window.electronAPI.setLedColour({ ...hexToRgb(hex), rateHz: rate });
      setLedNote(res?.success
        ? (rate > 0 ? t('mavlink-config:notifyTab.blinkingAt', { rate }) : t('mavlink-config:notifyTab.holdingColour'))
        : res?.error ?? t('mavlink-config:notifyTab.couldNotReach'));
    } catch (err) {
      setLedNote(err instanceof Error ? err.message : t('mavlink-config:notifyTab.ledCommandFailed'));
    } finally {
      setBusy(false);
    }
  }, [isPx4, parameters, setParameter, t]);

  const ledTypes = useMemo(() => bitsOf('NTF_LED_TYPES', LED_TYPE_FALLBACK), [bitsOf]);
  const buzzTypes = useMemo(() => bitsOf('NTF_BUZZ_TYPES', BUZZ_TYPE_FALLBACK), [bitsOf]);

  /** Servo outputs currently driving an LED strip. */
  const stripOutputs = useMemo(() => {
    const out: Array<{ channel: number; label: string }> = [];
    for (let ch = 1; ch <= 16; ch++) {
      const fn = parameters.get(`SERVO${ch}_FUNCTION`)?.value as number | undefined;
      if (fn !== undefined && STRIP_FUNCTIONS[fn]) {
        out.push({ channel: ch, label: STRIP_FUNCTIONS[fn]! });
      }
    }
    return out;
  }, [parameters]);

  const supported = isPx4
    ? has('SYS_RGB_MAXBRT') || has('CBRK_BUZZER')
    : has('NTF_LED_BRIGHT') || has('NTF_LED_TYPES') || has('BRD_SAFETY_DEFLT');

  if (!supported) {
    return (
      <div className="p-6">
        <InfoCard title={t('mavlink-config:notifyTab.ledsAndSound')} variant="info">
          {t('mavlink-config:notifyTab.notSupported')}
        </InfoCard>
      </div>
    );
  }

  const ledTypeMask = num('NTF_LED_TYPES', 0);
  const enabledDrivers = ledTypes.filter((t) => (ledTypeMask & (1 << t.bit)) !== 0).length;
  const buzzTypeMask = num('NTF_BUZZ_TYPES', 0);
  const override = num('NTF_LED_OVERRIDE', 0);
  const safetyDeflt = num('BRD_SAFETY_DEFLT', 1);
  const canOverride = !isPx4 && has('NTF_LED_OVERRIDE');
  const previewBrightness = isPx4 ? num('SYS_RGB_MAXBRT', 1) : BRIGHTNESS_GLOW[num('NTF_LED_BRIGHT', 3)] ?? 1;
  const preset = PRESETS.find((p) => p.hex === colour.toLowerCase());
  const preview = !isConnected
    ? { colour: null, blinkHz: 0, label: t('mavlink-config:notifyTab.previewOffline'), source: t('mavlink-config:notifyTab.previewOfflineHint') }
    : canOverride && override
      ? { colour, blinkHz: rateHz, label: preset ? t(preset.nameKey) : colour.toUpperCase(), source: t('mavlink-config:notifyTab.previewCustom') }
      : {
        colour: gpsFix >= 3 ? '#22c55e' : '#3b82f6',
        blinkHz: armed ? 0 : 1,
        label: armed ? t('mavlink-config:notifyTab.stateArmed') : gpsFix >= 3 ? t('mavlink-config:notifyTab.stateGpsLock') : t('mavlink-config:notifyTab.stateNoGps'),
        source: t('mavlink-config:notifyTab.previewLive'),
      };

  return (
    <div className="p-6 space-y-4">
      <div className="bg-surface rounded-xl border border-subtle p-5">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
            <Lightbulb className="w-5 h-5 text-amber-500 dark:text-amber-400" />
          </div>
          <div className="flex-1">
            <h3 className="font-medium text-content">{t('mavlink-config:notifyTab.statusLed')}</h3>
            <p className="text-xs text-content-secondary">{t('mavlink-config:notifyTab.statusLedHint')}</p>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[232px_1fr]">
          <div className="rounded-xl border border-subtle bg-surface-raised p-5 flex flex-col items-center text-center">
            <LedLens colour={preview.colour} blinkHz={preview.blinkHz} brightness={previewBrightness} size={104} />
            <div className="mt-4 text-sm font-medium text-content">{preview.label}</div>
            <div className="text-[11px] text-content-secondary">{preview.source}</div>

            {!isPx4 && has('NTF_LED_BRIGHT') && (
              <div className="mt-5 w-full">
                <div className="mb-1.5 text-left text-[11px] text-content-secondary">{t('mavlink-config:notifyTab.brightness')}</div>
                <div className="grid grid-cols-4 gap-1 rounded-lg bg-surface p-1">
                  {AP_BRIGHTNESS.map((b) => {
                    const active = num('NTF_LED_BRIGHT', 3) === b.value;
                    return (
                      <button
                        key={b.value}
                        onClick={() => write('NTF_LED_BRIGHT', b.value)}
                        disabled={busy}
                        className={`rounded-md px-1 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-40 ${
                          active ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300' : 'text-content-secondary hover:text-content'
                        }`}
                      >
                        {t(b.labelKey)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {isPx4 && has('SYS_RGB_MAXBRT') && (
              <div className="mt-5 w-full text-left">
                <DraggableSlider
                  label={t('mavlink-config:notifyTab.brightness')}
                  value={num('SYS_RGB_MAXBRT', 1)}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(v) => write('SYS_RGB_MAXBRT', v)}
                  disabled={busy}
                />
              </div>
            )}
          </div>

          <div className="space-y-4 min-w-0">
            {canOverride && (
              <div>
                <div className="mb-2 text-xs font-medium text-content-secondary">{t('mavlink-config:notifyTab.colourSource')}</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <SourceOption
                    active={!override}
                    disabled={busy}
                    onClick={() => { if (override) void write('NTF_LED_OVERRIDE', 0); }}
                    Icon={Activity}
                    title={t('mavlink-config:notifyTab.sourceStatus')}
                    description={t('mavlink-config:notifyTab.sourceStatusDesc')}
                  />
                  <SourceOption
                    active={!!override}
                    disabled={busy}
                    onClick={() => { if (!override) void applyColour(colour, rateHz); }}
                    Icon={Palette}
                    title={t('mavlink-config:notifyTab.sourceCustom')}
                    description={t('mavlink-config:notifyTab.sourceCustomDesc')}
                  />
                </div>
              </div>
            )}

            {canOverride && override ? (
              <div className="rounded-xl border border-subtle bg-surface-raised p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <span className="text-xs font-medium text-content-secondary">{t('mavlink-config:notifyTab.driveColour')}</span>
                  {ledNote && <span className="text-[11px] text-emerald-600 dark:text-emerald-400">{ledNote}</span>}
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  {PRESETS.map((p) => {
                    const selected = colour.toLowerCase() === p.hex;
                    return (
                      <button
                        key={p.name}
                        onClick={() => { setColour(p.hex); void applyColour(p.hex, rateHz); }}
                        disabled={busy}
                        data-tip={t(p.nameKey)}
                        aria-label={t(p.nameKey)}
                        aria-pressed={selected}
                        className={`relative h-9 w-9 rounded-full border border-subtle shadow-sm transition-transform hover:scale-110 disabled:opacity-40 ${selected ? 'ring-2 ring-offset-2 ring-offset-surface-raised ring-amber-500' : ''}`}
                        style={{ backgroundColor: p.hex }}
                      >
                        {selected && <Check className={`absolute inset-0 m-auto h-4 w-4 ${isLight(p.hex) ? 'text-gray-900' : 'text-white'}`} />}
                      </button>
                    );
                  })}
                  <label
                    data-tip={t('mavlink-config:notifyTab.custom')}
                    className="relative h-9 w-9 cursor-pointer overflow-hidden rounded-full border border-subtle shadow-sm transition-transform hover:scale-110"
                    style={{ background: 'conic-gradient(#ef4444, #eab308, #22c55e, #06b6d4, #3b82f6, #8b5cf6, #ef4444)' }}
                  >
                    <input
                      type="color"
                      value={colour}
                      onChange={(e) => { setColour(e.target.value); void applyColour(e.target.value, rateHz); }}
                      disabled={busy}
                      aria-label={t('mavlink-config:notifyTab.custom')}
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    />
                  </label>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <span className="text-[11px] text-content-secondary">{t('mavlink-config:notifyTab.blink')}</span>
                  <div className="inline-flex gap-1 rounded-lg bg-surface p-1">
                    {[0, 1, 2, 5, 10].map((r) => (
                      <button
                        key={r}
                        onClick={() => { setRateHz(r); void applyColour(colour, r); }}
                        disabled={busy}
                        className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-40 ${
                          rateHz === r ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300' : 'text-content-secondary hover:text-content'
                        }`}
                      >
                        {r === 0 ? t('mavlink-config:notifyTab.solid') : `${r} Hz`}{/* i18n-exempt */}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="mt-3 text-[11px] text-content-tertiary">{t('mavlink-config:notifyTab.customHint')}</p>
              </div>
            ) : (
              <div className="rounded-xl border border-subtle bg-surface-raised p-4">
                <div className="mb-3 text-xs font-medium text-content-secondary">{t('mavlink-config:notifyTab.coloursMean')}</div>
                <div className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
                  {LED_STATES.map((s) => (
                    <div key={s.labelKey} className="flex items-start gap-2.5">
                      <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${s.colour}`} />
                      <div className="min-w-0">
                        <div className="text-xs text-content">{t(s.labelKey)}</div>
                        <div className="text-[11px] text-content-secondary leading-snug">{t(s.hintKey)}</div>
                      </div>
                    </div>
                  ))}
                  <div className="flex items-start gap-2.5">
                    <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-content-tertiary ring-2 ring-inset ring-red-500/60" />
                    <div className="min-w-0">
                      <div className="text-xs text-content">{t('mavlink-config:notifyTab.doubleBlink')}</div>
                      <div className="text-[11px] text-content-secondary leading-snug">{t('mavlink-config:notifyTab.safetyBlinkHint')}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <ModuleConfigCards slot="notify" />

      {!isPx4 && has('NTF_LED_TYPES') && (
        <div className="bg-surface rounded-xl border border-subtle p-5">
          <button
            onClick={() => setShowDrivers(!showDrivers)}
            className="flex w-full items-center gap-3 text-left"
          >
            <Cpu className="h-4 w-4 shrink-0 text-content-tertiary" />
            <div className="min-w-0 flex-1">
              <h3 className="font-medium text-content">{t('mavlink-config:notifyTab.ledHardware')}</h3>
              <p className="text-xs text-content-secondary">
                {t('mavlink-config:notifyTab.driversEnabled', { enabled: enabledDrivers, total: ledTypes.length })}
              </p>
            </div>
            <ChevronDown className={`h-4 w-4 shrink-0 text-content-tertiary transition-transform ${showDrivers ? 'rotate-180' : ''}`} />
          </button>

          {showDrivers && (
            <div className="mt-4">
              <p className="mb-3 text-xs text-content-secondary">
                {t('mavlink-config:notifyTab.driversHint')}
              </p>
              <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
                {ledTypes.map((t) => {
                  const on = (ledTypeMask & (1 << t.bit)) !== 0;
                  return (
                    <button
                      key={t.bit}
                      onClick={() => write('NTF_LED_TYPES', ledTypeMask ^ (1 << t.bit))}
                      disabled={busy}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors disabled:opacity-40 ${
                        on
                          ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                          : 'border-subtle bg-surface-raised text-content-secondary hover:text-content'
                      }`}
                    >
                      <span className="w-3">{on ? '\u2713' : ''}</span>
                      <span className="min-w-0 truncate">{t.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {stripOutputs.length > 0 && (
            <div className="mt-4 rounded-lg border border-subtle bg-surface-raised p-3">
              <div className="text-xs text-content">{t('mavlink-config:notifyTab.ledStrip')}</div>
              <div className="mt-1 text-[11px] text-content-tertiary">
                {t('mavlink-config:notifyTab.drivenFrom', { outputs: stripOutputs.map((o) => `SERVO${o.channel} (${o.label})`).join(', ') })}
              </div>
              {has('NTF_LED_LEN') && (
                <div className="mt-3">
                  <DraggableSlider
                    label={t('mavlink-config:notifyTab.pixelsPerStrip')}
                    value={num('NTF_LED_LEN', 1)}
                    min={1}
                    max={32}
                    step={1}
                    onChange={(v) => write('NTF_LED_LEN', Math.round(v))}
                    disabled={busy}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="bg-surface rounded-xl border border-subtle p-5 space-y-4">
        <div className="flex items-center gap-3">
          <Volume2 className="h-4 w-4 text-content-tertiary" />
          <h3 className="font-medium text-content">{t('mavlink-config:notifyTab.buzzer')}</h3>
        </div>

        {!isPx4 && has('NTF_BUZZ_TYPES') && (
          <div className="flex flex-wrap gap-2">
            {buzzTypes.map((t) => {
              const on = (buzzTypeMask & (1 << t.bit)) !== 0;
              return (
                <button
                  key={t.bit}
                  onClick={() => write('NTF_BUZZ_TYPES', buzzTypeMask ^ (1 << t.bit))}
                  disabled={busy}
                  className={`rounded-md px-3 py-2 text-xs transition-colors disabled:opacity-40 ${
                    on
                      ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/40'
                      : 'bg-surface-overlay text-content-secondary hover:text-content'
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        )}

        {!isPx4 && has('NTF_BUZZ_VOLUME') && (
          <DraggableSlider
            label={t('mavlink-config:notifyTab.volume')}
            value={num('NTF_BUZZ_VOLUME', 100)}
            min={0}
            max={100}
            step={5}
            unit="%"
            onChange={(v) => write('NTF_BUZZ_VOLUME', Math.round(v))}
            disabled={busy}
          />
        )}

        {isPx4 && has('CBRK_BUZZER') && (
          <div>
            <div className="flex gap-2">
              {([
                { value: 0, label: t('mavlink-config:notifyTab.allSoundsOn') },
                { value: 782090, label: t('mavlink-config:notifyTab.silentStartup') },
                { value: 782097, label: t('mavlink-config:notifyTab.buzzerOff') },
              ] as const).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => write('CBRK_BUZZER', opt.value)}
                  disabled={busy}
                  className={`flex-1 rounded-md px-3 py-2 text-xs transition-colors disabled:opacity-40 ${
                    num('CBRK_BUZZER', 0) === opt.value
                      ? 'bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 ring-1 ring-cyan-500/40'
                      : 'bg-surface-overlay text-content-secondary hover:text-content'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-content-tertiary">
              {t('mavlink-config:notifyTab.px4BuzzerHint')}
            </p>
          </div>
        )}
      </div>

      {isPx4 && has('CBRK_IO_SAFETY') && (
        <div className="bg-surface rounded-xl border border-subtle p-5">
          <div className="flex items-center gap-3 mb-3">
            <ShieldAlert className="h-4 w-4 text-content-tertiary" />
            <h3 className="font-medium text-content">{t('mavlink-config:notifyTab.safetyButton')}</h3>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => write('CBRK_IO_SAFETY', 0)}
              disabled={busy}
              className={`flex-1 rounded-md px-3 py-2 text-xs transition-colors disabled:opacity-40 ${
                num('CBRK_IO_SAFETY', 0) === 0
                  ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/40'
                  : 'bg-surface-overlay text-content-secondary hover:text-content'
              }`}
            >
              {t('mavlink-config:notifyTab.safetyRequired')}
            </button>
            <button
              onClick={() => write('CBRK_IO_SAFETY', 22027)}
              disabled={busy}
              className={`flex-1 rounded-md px-3 py-2 text-xs transition-colors disabled:opacity-40 ${
                num('CBRK_IO_SAFETY', 0) === 22027
                  ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/40'
                  : 'bg-surface-overlay text-content-secondary hover:text-content'
              }`}
            >
              {t('mavlink-config:notifyTab.safetyDisabled')}
            </button>
          </div>
          <p className="mt-2 text-[11px] text-content-tertiary">
            {t('mavlink-config:notifyTab.safetyDisabledHint')}
          </p>
        </div>
      )}

      {!isPx4 && has('BRD_SAFETY_DEFLT') && (
        <div className="bg-surface rounded-xl border border-subtle p-5">
          <div className="flex items-center gap-3 mb-3">
            <ShieldAlert className="h-4 w-4 text-content-tertiary" />
            <h3 className="font-medium text-content">{t('mavlink-config:notifyTab.safetyButton')}</h3>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => write('BRD_SAFETY_DEFLT', 1)}
              disabled={busy}
              className={`flex-1 rounded-md px-3 py-2 text-xs transition-colors disabled:opacity-40 ${
                safetyDeflt === 1
                  ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/40'
                  : 'bg-surface-overlay text-content-secondary hover:text-content'
              }`}
            >
              {t('mavlink-config:notifyTab.safetyOnPress')}
            </button>
            <button
              onClick={() => write('BRD_SAFETY_DEFLT', 0)}
              disabled={busy}
              className={`flex-1 rounded-md px-3 py-2 text-xs transition-colors disabled:opacity-40 ${
                safetyDeflt === 0
                  ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/40'
                  : 'bg-surface-overlay text-content-secondary hover:text-content'
              }`}
            >
              {t('mavlink-config:notifyTab.noSafety')}
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-content-tertiary">
            {safetyDeflt === 1
              ? t('mavlink-config:notifyTab.safetyOnHint')
              : t('mavlink-config:notifyTab.noSafetyHint')}
          </p>
        </div>
      )}
    </div>
  );
}
