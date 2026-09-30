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

/** Prefer the i18n key; falls back to the literal. */
function ntText(t: (key: string) => string, key: string | undefined, fallback: string): string {
  return key ? t(key) : fallback;
}
import { useTranslation } from 'react-i18next';
import { Lightbulb, Volume2, ShieldAlert, Cpu, ChevronDown } from 'lucide-react';
import { useParameterStore } from '../../stores/parameter-store';
import { useConnectionStore } from '../../stores/connection-store';
import { DraggableSlider } from '../ui/DraggableSlider';
import { InfoCard } from '../ui/InfoCard';

const PRESETS = [
  { name: 'Red', nameKey: 'presetColours.red', hex: '#ef4444' },
  { name: 'Orange', nameKey: 'presetColours.orange', hex: '#f97316' },
  { name: 'Yellow', nameKey: 'presetColours.yellow', hex: '#eab308' },
  { name: 'Green', nameKey: 'presetColours.green', hex: '#22c55e' },
  { name: 'Cyan', nameKey: 'presetColours.cyan', hex: '#06b6d4' },
  { name: 'Blue', nameKey: 'presetColours.blue', hex: '#3b82f6' },
  { name: 'Violet', nameKey: 'presetColours.violet', hex: '#8b5cf6' },
  { name: 'White', nameKey: 'presetColours.white', hex: '#ffffff' },
  { name: 'Off', nameKey: 'presetColours.off', hex: '#000000' },
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
  { colour: 'bg-red-500', label: 'Initialising', labelKey: 'ledStates.initialising.label', hint: 'Red and blue alternating at boot', hintKey: 'ledStates.initialising.hint' },
  { colour: 'bg-blue-500', label: 'No GPS lock', labelKey: 'ledStates.no-gps-lock.label', hint: 'Disarmed, waiting for a fix', hintKey: 'ledStates.no-gps-lock.hint' },
  { colour: 'bg-emerald-500', label: 'GPS lock', labelKey: 'ledStates.gps-lock.label', hint: 'Disarmed and ready to arm', hintKey: 'ledStates.gps-lock.hint' },
  { colour: 'bg-emerald-600', label: 'Armed', labelKey: 'ledStates.armed.label', hint: 'Solid, no blink', hintKey: 'ledStates.armed.hint' },
  { colour: 'bg-amber-500', label: 'Failsafe', labelKey: 'ledStates.failsafe.label', hint: 'Radio or battery', hintKey: 'ledStates.failsafe.hint' },
];

/** NTF_LED_TYPES bits, from AP_Notify.cpp. Used when metadata is absent. */
const LED_TYPE_FALLBACK: Record<number, string> = {
  0: 'Built-in LED', 1: 'Internal ToshibaLED', 2: 'External ToshibaLED',
  3: 'External PCA9685', 4: 'Oreo LED', 5: 'DroneCAN', 6: 'NCP5623 External',
  7: 'NCP5623 Internal', 8: 'NeoPixel', 9: 'ProfiLED', 10: 'Scripting',
  11: 'DShot', 12: 'ProfiLED SPI', 13: 'LP5562 External', 14: 'LP5562 Internal',
  15: 'IS31FL3195 External', 16: 'IS31FL3195 Internal', 17: 'DiscreteRGB',
  18: 'NeoPixelRGB', 19: 'ProfiLED IOMCU',
};

/** NTF_BUZZ_TYPES bits, from AP_Notify.cpp. */
const BUZZ_TYPE_FALLBACK: Record<number, string> = {
  0: 'Built-in buzzer', 1: 'DShot', 2: 'DroneCAN',
};

const AP_BRIGHTNESS = [
  { value: 0, label: 'Off', labelKey: 'brightness.off' },
  { value: 1, label: 'Low', labelKey: 'brightness.low' },
  { value: 2, label: 'Medium', labelKey: 'brightness.medium' },
  { value: 3, label: 'High', labelKey: 'brightness.high' },
];

/** Serial-LED strips ride a servo output set to one of these functions. */
const STRIP_FUNCTIONS: Record<number, string> = {
  120: 'NeoPixel 1', 121: 'NeoPixel 2', 122: 'NeoPixel 3', 123: 'NeoPixel 4',
  124: 'ProfiLED 1', 125: 'ProfiLED 2', 126: 'ProfiLED 3', 127: 'ProfiLED Clock',
};

export default function NotifyTab(): JSX.Element {
  const { t } = useTranslation('notify');
  const { parameters, setParameter, getParameterMetadata } = useParameterStore();
  const firmware = useConnectionStore((s) => s.connectionState.firmware);
  const [busy, setBusy] = useState(false);
  const [showDrivers, setShowDrivers] = useState(false);
  const [colour, setColour] = useState('#3b82f6');
  const [rateHz, setRateHz] = useState(0);
  const [ledNote, setLedNote] = useState<string | null>(null);

  const isPx4 = firmware === 'px4';
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
      setLedNote('Restart ArduDeck: LED control lives in the main process and is not loaded yet.');
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
        ? (rate > 0 ? `Blinking at ${rate} Hz` : 'Holding that colour')
        : res?.error ?? 'Could not reach the vehicle');
    } catch (err) {
      setLedNote(err instanceof Error ? err.message : 'LED command failed');
    } finally {
      setBusy(false);
    }
  }, [isPx4, parameters, setParameter]);

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
        <InfoCard title={t('ui.ledsAndSound')} variant="info">
          {t('ui.boardUnsupported')}
        </InfoCard>
      </div>
    );
  }

  const ledTypeMask = num('NTF_LED_TYPES', 0);
  const enabledDrivers = ledTypes.filter((drv) => (ledTypeMask & (1 << drv.bit)) !== 0).length;
  const buzzTypeMask = num('NTF_BUZZ_TYPES', 0);
  const override = num('NTF_LED_OVERRIDE', 0);
  const safetyDeflt = num('BRD_SAFETY_DEFLT', 1);

  return (
    <div className="p-6 space-y-4">
      <div className="bg-surface rounded-xl border border-subtle p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
            <Lightbulb className="w-5 h-5 text-amber-500 dark:text-amber-400" />
          </div>
          <div className="flex-1">
            <h3 className="font-medium text-content">{t('ui.statusLed')}</h3>
            <p className="text-xs text-content-secondary">
              {t('ui.ringLocation')}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-4 lg:flex-row">
          <div className="shrink-0 min-w-[190px] rounded-xl border border-subtle bg-surface-raised p-4">
            <div className="mb-2 text-[11px] uppercase tracking-wide text-content-tertiary">
              {t('ui.colourMeaning')}
            </div>
            <div className="space-y-1.5">
              {LED_STATES.map((s) => (
                <div key={s.label} className="flex items-center gap-2" data-tip={ntText(t, s.hintKey, s.hint)}>
                  <span className={`h-2.5 w-2.5 rounded-full ${s.colour}`} />
                  <span className="text-[11px] text-content-secondary">{ntText(t, s.labelKey, s.label)}</span>
                </div>
              ))}
              <div className="flex items-center gap-2" data-tip={t('ui.outputsInhibited')}>
                <span className="h-2.5 w-2.5 rounded-full bg-content-tertiary ring-2 ring-inset ring-red-500/60" />
                <span className="text-[11px] text-content-secondary">{t('ui.doubleBlinkSafetyOn')}</span>
              </div>
            </div>
          </div>

          <div className="flex-1 space-y-4">
            {!isPx4 && has('NTF_LED_BRIGHT') && (
              <div>
                <div className="mb-2 text-xs text-content-secondary">{t('ui.brightness')}</div>
                <div className="flex gap-2">
                  {AP_BRIGHTNESS.map((b) => {
                    const active = num('NTF_LED_BRIGHT', 3) === b.value;
                    return (
                      <button
                        key={b.value}
                        onClick={() => write('NTF_LED_BRIGHT', b.value)}
                        disabled={busy}
                        className={`flex-1 rounded-md px-3 py-2 text-xs transition-colors disabled:opacity-40 ${
                          active
                            ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/40'
                            : 'bg-surface-overlay text-content-secondary hover:text-content'
                        }`}
                      >
                        {ntText(t, b.labelKey, b.label)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {isPx4 && has('SYS_RGB_MAXBRT') && (
              <DraggableSlider
                label={t('ui.brightness')}
                value={num('SYS_RGB_MAXBRT', 1)}
                min={0}
                max={1}
                step={0.05}
                onChange={(v) => write('SYS_RGB_MAXBRT', v)}
                disabled={busy}
              />
            )}

            {!isPx4 && has('NTF_LED_OVERRIDE') && (
              <div className="flex items-center gap-3 rounded-lg border border-subtle bg-surface-raised px-3 py-2">
                <span className="flex-1 text-sm text-content">
                  {t('ui.overrideTitle')}
                  <span className="block text-[11px] text-content-tertiary">
                    {t('ui.overrideHint')}
                  </span>
                </span>
                <button
                  onClick={() => write('NTF_LED_OVERRIDE', override ? 0 : 1)}
                  disabled={busy}
                  className={`shrink-0 rounded-md px-3 py-1.5 text-[11px] transition-colors disabled:opacity-40 ${
                    override
                      ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                      : 'bg-content-tertiary/15 text-content-secondary ring-1 ring-inset ring-content-tertiary/30'
                  }`}
                >
                  {override ? t('ui.overrideOn') : t('ui.firmwareDrivesIt')}
                </button>
              </div>
            )}
          </div>
        </div>

        {!isPx4 && (
          <div className="mt-4 border-t border-subtle pt-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs text-content-secondary">{t('ui.driveColourYourself')}</span>
              {ledNote && <span className="text-[11px] text-emerald-600 dark:text-emerald-400">{ledNote}</span>}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.name}
                  onClick={() => { setColour(p.hex); void applyColour(p.hex, rateHz); }}
                  disabled={busy}
                  data-tip={ntText(t, p.nameKey, p.name)}
                  aria-label={ntText(t, p.nameKey, p.name)}
                  className={`h-8 w-8 rounded-full border transition-transform hover:scale-110 disabled:opacity-40 ${
                    colour.toLowerCase() === p.hex ? 'border-content ring-2 ring-content/30' : 'border-subtle'
                  }`}
                  style={{ backgroundColor: p.hex }}
                />
              ))}

              <label className="ml-1 flex items-center gap-2 text-[11px] text-content-secondary">
                {t('ui.custom')}
                <input
                  type="color"
                  value={colour}
                  onChange={(e) => { setColour(e.target.value); void applyColour(e.target.value, rateHz); }}
                  disabled={busy}
                  className="h-8 w-10 cursor-pointer rounded border border-subtle bg-transparent"
                />
              </label>
            </div>

            <div className="mt-3 flex items-center gap-3">
              <span className="text-[11px] text-content-secondary whitespace-nowrap">{t('ui.blink')}</span>
              <div className="flex gap-1">
                {[0, 1, 2, 5, 10].map((r) => (
                  <button
                    key={r}
                    onClick={() => { setRateHz(r); void applyColour(colour, r); }}
                    disabled={busy}
                    className={`rounded-md px-2.5 py-1 text-[11px] transition-colors disabled:opacity-40 ${
                      rateHz === r
                        ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                        : 'bg-surface-overlay text-content-secondary hover:text-content'
                    }`}
                  >
                    {r === 0 ? t('ui.solid') : t('ui.hertz', { rate: r })}
                  </button>
                ))}
              </div>
            </div>

            <p className="mt-2 text-[11px] text-content-tertiary">
              {t('ui.colourSwitchesOverride')}
            </p>
          </div>
        )}
      </div>

      {!isPx4 && has('NTF_LED_TYPES') && (
        <div className="bg-surface rounded-xl border border-subtle p-5">
          <button
            onClick={() => setShowDrivers(!showDrivers)}
            className="flex w-full items-center gap-3 text-left"
          >
            <Cpu className="h-4 w-4 shrink-0 text-content-tertiary" />
            <div className="min-w-0 flex-1">
              <h3 className="font-medium text-content">{t('ui.ledHardware')}</h3>
              <p className="text-xs text-content-secondary">
                {t('ui.driversEnabled', { enabled: enabledDrivers, total: ledTypes.length })}{' '}
                {t('ui.driversProbeHint')}
              </p>
            </div>
            <ChevronDown className={`h-4 w-4 shrink-0 text-content-tertiary transition-transform ${showDrivers ? 'rotate-180' : ''}`} />
          </button>

          {showDrivers && (
            <div className="mt-4">
              <p className="mb-3 text-xs text-content-secondary">
                {t('ui.driversWarning')}
              </p>
              <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
                {ledTypes.map((drv) => {
                  const on = (ledTypeMask & (1 << drv.bit)) !== 0;
                  return (
                    <button
                      key={drv.bit}
                      onClick={() => write('NTF_LED_TYPES', ledTypeMask ^ (1 << drv.bit))}
                      disabled={busy}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors disabled:opacity-40 ${
                        on
                          ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                          : 'border-subtle bg-surface-raised text-content-secondary hover:text-content'
                      }`}
                    >
                      <span className="w-3">{on ? '\u2713' : ''}</span>
                      <span className="min-w-0 truncate">{drv.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {stripOutputs.length > 0 && (
            <div className="mt-4 rounded-lg border border-subtle bg-surface-raised p-3">
              <div className="text-xs text-content">{t('ui.ledStrip')}</div>
              <div className="mt-1 text-[11px] text-content-tertiary">
                {t('ui.drivenFrom', { outputs: stripOutputs.map((o) => `SERVO${o.channel} (${o.label})`).join(', ') })}
              </div>
              {has('NTF_LED_LEN') && (
                <div className="mt-3">
                  <DraggableSlider
                    label={t('ui.pixelsPerStrip')}
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
          <h3 className="font-medium text-content">{t('ui.buzzer')}</h3>
        </div>

        {!isPx4 && has('NTF_BUZZ_TYPES') && (
          <div className="flex flex-wrap gap-2">
            {buzzTypes.map((bz) => {
              const on = (buzzTypeMask & (1 << bz.bit)) !== 0;
              return (
                <button
                  key={bz.bit}
                  onClick={() => write('NTF_BUZZ_TYPES', buzzTypeMask ^ (1 << bz.bit))}
                  disabled={busy}
                  className={`rounded-md px-3 py-2 text-xs transition-colors disabled:opacity-40 ${
                    on
                      ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/40'
                      : 'bg-surface-overlay text-content-secondary hover:text-content'
                  }`}
                >
                  {bz.label}
                </button>
              );
            })}
          </div>
        )}

        {!isPx4 && has('NTF_BUZZ_VOLUME') && (
          <DraggableSlider
            label={t('ui.volume')}
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
                { value: 0, label: 'All sounds on', labelKey: 'buzzer.all-sounds-on' },
                { value: 782090, label: 'Silent startup only', labelKey: 'buzzer.silent-startup-only' },
                { value: 782097, label: 'Buzzer off', labelKey: 'buzzer.buzzer-off' },
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
                  {ntText(t, opt.labelKey, opt.label)}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-content-tertiary">
              {t('ui.px4BuzzerNote')}
            </p>
          </div>
        )}
      </div>

      {isPx4 && has('CBRK_IO_SAFETY') && (
        <div className="bg-surface rounded-xl border border-subtle p-5">
          <div className="flex items-center gap-3 mb-3">
            <ShieldAlert className="h-4 w-4 text-content-tertiary" />
            <h3 className="font-medium text-content">{t('ui.safetyButton')}</h3>
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
              {t('ui.safetyRequired')}
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
              {t('ui.safetyDisabled')}
            </button>
          </div>
          <p className="mt-2 text-[11px] text-content-tertiary">
            {t('ui.safetyDisabledWarning')}
          </p>
        </div>
      )}

      {!isPx4 && has('BRD_SAFETY_DEFLT') && (
        <div className="bg-surface rounded-xl border border-subtle p-5">
          <div className="flex items-center gap-3 mb-3">
            <ShieldAlert className="h-4 w-4 text-content-tertiary" />
            <h3 className="font-medium text-content">{t('ui.safetyButton')}</h3>
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
              {t('ui.safetyOnPressToRelease')}
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
              {t('ui.noSafetyLiveAtBoot')}
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-content-tertiary">
            {safetyDeflt === 1
              ? t('ui.safetyOnNote')
              : t('ui.safetyOffNote')}
          </p>
        </div>
      )}
    </div>
  );
}
