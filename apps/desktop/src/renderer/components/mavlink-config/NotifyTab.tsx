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
import { Lightbulb, Volume2, ShieldAlert, Cpu, ChevronDown } from 'lucide-react';
import { useParameterStore } from '../../stores/parameter-store';
import { useConnectionStore } from '../../stores/connection-store';
import { DraggableSlider } from '../ui/DraggableSlider';
import { InfoCard } from '../ui/InfoCard';

const PRESETS = [
  { name: 'Red', hex: '#ef4444' },
  { name: 'Orange', hex: '#f97316' },
  { name: 'Yellow', hex: '#eab308' },
  { name: 'Green', hex: '#22c55e' },
  { name: 'Cyan', hex: '#06b6d4' },
  { name: 'Blue', hex: '#3b82f6' },
  { name: 'Violet', hex: '#8b5cf6' },
  { name: 'White', hex: '#ffffff' },
  { name: 'Off', hex: '#000000' },
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
  { colour: 'bg-red-500', label: 'Initialising', hint: 'Red and blue alternating at boot' },
  { colour: 'bg-blue-500', label: 'No GPS lock', hint: 'Disarmed, waiting for a fix' },
  { colour: 'bg-emerald-500', label: 'GPS lock', hint: 'Disarmed and ready to arm' },
  { colour: 'bg-emerald-600', label: 'Armed', hint: 'Solid, no blink' },
  { colour: 'bg-amber-500', label: 'Failsafe', hint: 'Radio or battery' },
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
  { value: 0, label: 'Off' },
  { value: 1, label: 'Low' },
  { value: 2, label: 'Medium' },
  { value: 3, label: 'High' },
];

/** Serial-LED strips ride a servo output set to one of these functions. */
const STRIP_FUNCTIONS: Record<number, string> = {
  120: 'NeoPixel 1', 121: 'NeoPixel 2', 122: 'NeoPixel 3', 123: 'NeoPixel 4',
  124: 'ProfiLED 1', 125: 'ProfiLED 2', 126: 'ProfiLED 3', 127: 'ProfiLED Clock',
};

export default function NotifyTab(): JSX.Element {
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
        <InfoCard title="LEDs and sound" variant="info">
          This board does not expose the notify parameters.
        </InfoCard>
      </div>
    );
  }

  const ledTypeMask = num('NTF_LED_TYPES', 0);
  const enabledDrivers = ledTypes.filter((t) => (ledTypeMask & (1 << t.bit)) !== 0).length;
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
            <h3 className="font-medium text-content">Status LED</h3>
            <p className="text-xs text-content-secondary">
              On most builds the ring is in the GPS puck, not on the autopilot
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-4 lg:flex-row">
          <div className="shrink-0 min-w-[190px] rounded-xl border border-subtle bg-surface-raised p-4">
            <div className="mb-2 text-[11px] uppercase tracking-wide text-content-tertiary">
              What the colours mean
            </div>
            <div className="space-y-1.5">
              {LED_STATES.map((s) => (
                <div key={s.label} className="flex items-center gap-2" data-tip={s.hint}>
                  <span className={`h-2.5 w-2.5 rounded-full ${s.colour}`} />
                  <span className="text-[11px] text-content-secondary">{s.label}</span>
                </div>
              ))}
              <div className="flex items-center gap-2" data-tip="Outputs inhibited until the button is held">
                <span className="h-2.5 w-2.5 rounded-full bg-content-tertiary ring-2 ring-inset ring-red-500/60" />
                <span className="text-[11px] text-content-secondary">Double blink: safety on</span>
              </div>
            </div>
          </div>

          <div className="flex-1 space-y-4">
            {!isPx4 && has('NTF_LED_BRIGHT') && (
              <div>
                <div className="mb-2 text-xs text-content-secondary">Brightness</div>
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
                        {b.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {isPx4 && has('SYS_RGB_MAXBRT') && (
              <DraggableSlider
                label="Brightness"
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
                  Let a script or ground station drive the colour
                  <span className="block text-[11px] text-content-tertiary">
                    NTF_LED_OVERRIDE. The firmware stops showing flight status on the ring.
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
                  {override ? 'Override on' : 'Firmware drives it'}
                </button>
              </div>
            )}
          </div>
        </div>

        {!isPx4 && (
          <div className="mt-4 border-t border-subtle pt-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs text-content-secondary">Drive the colour yourself</span>
              {ledNote && <span className="text-[11px] text-emerald-600 dark:text-emerald-400">{ledNote}</span>}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.name}
                  onClick={() => { setColour(p.hex); void applyColour(p.hex, rateHz); }}
                  disabled={busy}
                  data-tip={p.name}
                  aria-label={p.name}
                  className={`h-8 w-8 rounded-full border transition-transform hover:scale-110 disabled:opacity-40 ${
                    colour.toLowerCase() === p.hex ? 'border-content ring-2 ring-content/30' : 'border-subtle'
                  }`}
                  style={{ backgroundColor: p.hex }}
                />
              ))}

              <label className="ml-1 flex items-center gap-2 text-[11px] text-content-secondary">
                Custom
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
              <span className="text-[11px] text-content-secondary whitespace-nowrap">Blink</span>
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
                    {r === 0 ? 'Solid' : `${r} Hz`}
                  </button>
                ))}
              </div>
            </div>

            <p className="mt-2 text-[11px] text-content-tertiary">
              Picking a colour switches the override on for you, so the ring stops showing flight
              status. Set it back to "Firmware drives it" above to get the status colours back.
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
              <h3 className="font-medium text-content">LED hardware</h3>
              <p className="text-xs text-content-secondary">
                {enabledDrivers} of {ledTypes.length} drivers enabled.
                {' '}The firmware probes them all and uses whichever is fitted, so this normally
                needs no attention.
              </p>
            </div>
            <ChevronDown className={`h-4 w-4 shrink-0 text-content-tertiary transition-transform ${showDrivers ? 'rotate-180' : ''}`} />
          </button>

          {showDrivers && (
            <div className="mt-4">
              <p className="mb-3 text-xs text-content-secondary">
                Only worth touching if a fitted LED stays dark, or to silence one you do not want.
                Enabling a driver for hardware the vehicle does not have costs nothing.
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
              <div className="text-xs text-content">LED strip</div>
              <div className="mt-1 text-[11px] text-content-tertiary">
                Driven from {stripOutputs.map((o) => `SERVO${o.channel} (${o.label})`).join(', ')}
              </div>
              {has('NTF_LED_LEN') && (
                <div className="mt-3">
                  <DraggableSlider
                    label="Pixels per strip"
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
          <h3 className="font-medium text-content">Buzzer</h3>
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
            label="Volume"
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
                { value: 0, label: 'All sounds on' },
                { value: 782090, label: 'Silent startup only' },
                { value: 782097, label: 'Buzzer off' },
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
              PX4 silences the buzzer with a circuit breaker rather than a volume, so these are the
              only three states it has.
            </p>
          </div>
        )}
      </div>

      {isPx4 && has('CBRK_IO_SAFETY') && (
        <div className="bg-surface rounded-xl border border-subtle p-5">
          <div className="flex items-center gap-3 mb-3">
            <ShieldAlert className="h-4 w-4 text-content-tertiary" />
            <h3 className="font-medium text-content">Safety button</h3>
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
              Safety button required
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
              Safety disabled
            </button>
          </div>
          <p className="mt-2 text-[11px] text-content-tertiary">
            With safety disabled the outputs go live the moment the vehicle arms, with nothing on
            the airframe left to stop them. Keep the button unless the airframe has no room for one.
          </p>
        </div>
      )}

      {!isPx4 && has('BRD_SAFETY_DEFLT') && (
        <div className="bg-surface rounded-xl border border-subtle p-5">
          <div className="flex items-center gap-3 mb-3">
            <ShieldAlert className="h-4 w-4 text-content-tertiary" />
            <h3 className="font-medium text-content">Safety button</h3>
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
              Safety on, press to release
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
              No safety, live at boot
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-content-tertiary">
            {safetyDeflt === 1
              ? 'Outputs stay inhibited until the button is held for about two seconds. This is what "PreArm: Hardware safety switch" means.'
              : 'Outputs are live as soon as the vehicle is armed, with no button press. Only sensible when no button is fitted.'}
          </p>
        </div>
      )}
    </div>
  );
}
