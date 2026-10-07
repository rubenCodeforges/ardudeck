import { useEffect } from 'react';
import { Check, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TrainerCatalogue, TrainerConditions } from '../../../shared/trainer-types';
import { useWeatherStore } from '../../stores/weather-store';
import { SkyPreview } from './SkyPreview';

/** Nearest preset to a measured cloud fraction, using the catalogue's own cover figures. */
function presetForCover(
  weather: TrainerCatalogue['weather'],
  cover: number,
): string | undefined {
  let best: { id: string; d: number } | undefined;
  for (const w of weather) {
    const d = Math.abs(w.cover - cover);
    if (!best || d < best.d) best = { id: w.id, d };
  }
  return best?.id;
}

/**
 * Time, weather and wind, shown as what they LOOK like rather than as their names.
 *
 * "Golden hour" and "Dusk" are two words a pilot can hold apart only by seeing them, so each
 * card carries a small sky drawn from the same day fraction the flight will use. The wording is
 * the Trainer's own, carried in the catalogue, so the two front doors describe the same choice
 * with the same sentence.
 */

export function TrainerConditionsStep({
  catalogue,
  conditions,
  onChange,
}: {
  catalogue: TrainerCatalogue;
  conditions: TrainerConditions;
  onChange: (patch: Partial<TrainerConditions>) => void;
}): JSX.Element {
  const { t } = useTranslation();
  const live = useWeatherStore((w) => w.weather);
  const refreshWeather = useWeatherStore((w) => w.refresh);
  useEffect(() => {
    if (!live) void refreshWeather();
  }, [live, refreshWeather]);

  const weatherLive = conditions.weatherMode === 'live';
  const windLive = conditions.windMode === 'live';

  const time = catalogue.times.find((x) => x.id === conditions.time) ?? catalogue.times[0];
  // In live mode the picture is drawn from what is actually measured here. The AUTHORITATIVE
  // resolution still happens in the Trainer at launch, at the flying site, which is why the
  // mode travels rather than the numbers: this app's weather is where the operator is standing,
  // and the aircraft may be somewhere else entirely.
  const measuredPreset = live ? presetForCover(catalogue.weather, live.cloudCoverPct / 100) : undefined;
  const shownPresetId = weatherLive ? (measuredPreset ?? conditions.preset) : conditions.preset;
  const weather = catalogue.weather.find((w) => w.id === shownPresetId) ?? catalogue.weather[1];

  const shownWindMs = windLive && live ? live.windSpeedMs : (conditions.windMs ?? 0);
  const shownWindFromDeg = windLive && live ? live.windDirDeg : (conditions.windFromDeg ?? 0);
  // "Now" has no fixed day fraction: it means read the clock where the flight happens, so the
  // preview reads this machine's clock rather than drawing an arbitrary hour.
  const dayFraction = time?.dayFraction ?? nowFraction();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-content">{t('trainer:trainerConditionsStep.title')}</h2>
        <p className="mt-0.5 text-xs text-content-tertiary">{t('trainer:trainerConditionsStep.subtitle')}</p>
      </div>

      <div className="relative overflow-hidden rounded-xl border border-subtle">
        <SkyPreview
          dayFraction={dayFraction}
          preset={weather?.id ?? 'fair'}
          cover={weather?.cover ?? 0.35}
          windMs={shownWindMs}
          windFromDeg={shownWindFromDeg}
          height={190}
        />
        <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4 py-2.5 text-xs">
          <span className="font-medium text-white/90 drop-shadow">
            {time?.label}, {weather?.label.toLowerCase()}
          </span>
        </div>
      </div>

      <Section title={t('trainer:trainerConditionsStep.timeOfDay')}>
        <div className="grid gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          {catalogue.times.map((option) => (
            <Tile
              key={option.id}
              active={conditions.time === option.id}
              onClick={() => onChange({ time: option.id })}
              preview={
                <SkyPreview
                  dayFraction={option.dayFraction ?? nowFraction()}
                  preset={weather?.id ?? 'fair'}
                  cover={weather?.cover ?? 0.35}
                  windMs={shownWindMs}
                  windFromDeg={shownWindFromDeg}
                  height={64}
                  compact
                />
              }
              label={option.label}
              hint={option.hint}
            />
          ))}
        </div>
      </Section>

      <Section
        title={t('trainer:trainerConditionsStep.weather')}
        control={
          <Toggle
            label={t('trainer:trainerConditionsStep.realWeatherHere')}
            on={weatherLive}
            onChange={(on) => onChange({ weatherMode: on ? 'live' : 'preset' })}
          />
        }
      >
        {live && weatherLive && (
          <div className="mb-2.5 flex items-center gap-2.5 rounded-lg border border-subtle bg-surface-inset px-3 py-2 text-xs">
            <RefreshCw className="h-3.5 w-3.5 shrink-0 text-content-tertiary" />
            <span className="text-content-secondary">
              {t('trainer:trainerConditionsStep.rightNow', {
                cloud: Math.round(live.cloudCoverPct),
                wind: live.windSpeedMs.toFixed(1),
                temp: Math.round(live.tempC),
              })}
            </span>
            <span className="ml-auto text-content-tertiary">
              {t('trainer:trainerConditionsStep.readsAs', { preset: weather?.label.toLowerCase() })}
            </span>
          </div>
        )}
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {catalogue.weather.map((option) => (
            <Tile
              key={option.id}
              active={conditions.preset === option.id}
              onClick={() => onChange({ preset: option.id, weatherMode: 'preset' })}
              preview={
                <SkyPreview
                  dayFraction={dayFraction}
                  preset={option.id}
                  cover={option.cover}
                  windMs={shownWindMs}
                  windFromDeg={shownWindFromDeg}
                  height={64}
                  compact
                />
              }
              label={option.label}
              hint={option.hint}
            />
          ))}
        </div>
      </Section>

      <Section
        title={t('trainer:trainerConditionsStep.wind')}
        control={
          <Toggle
            label={t('trainer:trainerConditionsStep.realWindHere')}
            on={windLive}
            onChange={(on) => onChange({ windMode: on ? 'live' : 'preset' })}
          />
        }
      >
        <div className="card card-body space-y-4">
          {windLive && live && (
            <p className="text-xs text-content-tertiary">
              {t('trainer:trainerConditionsStep.windFromReal', {
                speed: live.windSpeedMs.toFixed(1),
                dir: compass(live.windDirDeg),
                gust: live.windGustMs.toFixed(1),
              })}
            </p>
          )}
          <div>
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="text-xs font-medium text-content-secondary">{t('trainer:trainerConditionsStep.speedAt10m')}</span>
              <span className="text-xs text-content-tertiary">
                {(conditions.windMs ?? 0).toFixed(1)} m/s
              </span>
            </div>
            <input
              type="range"
              className="w-full accent-blue-500"
              min={0}
              max={catalogue.windMaxMs}
              step={0.1}
              value={conditions.windMs ?? 0}
              onChange={(e) => onChange({ windMs: Number(e.target.value), windMode: 'preset' })}
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="text-xs font-medium text-content-secondary">{t('trainer:trainerConditionsStep.comingFrom')}</span>
              {/* FROM, not toward: the convention every pilot and every forecast uses. The
                  Trainer turns it around once, at its own boundary. */}
              <span className="text-xs text-content-tertiary">
                {Math.round(conditions.windFromDeg ?? 0)}° {compass(conditions.windFromDeg ?? 0)}
              </span>
            </div>
            <input
              type="range"
              className="w-full accent-blue-500"
              min={0}
              max={359}
              step={1}
              value={conditions.windFromDeg ?? 0}
              onChange={(e) => onChange({ windFromDeg: Number(e.target.value) })}
            />
          </div>

          <div>
            <span className="mb-1.5 block text-xs font-medium text-content-secondary">{t('trainer:trainerConditionsStep.gusts')}</span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {catalogue.gusts.map((option) => (
                <button
                  key={option.id}
                  onClick={() => onChange({ gust: option.id })}
                  data-tip={option.hint}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                    conditions.gust === option.id
                      ? 'border-blue-500/50 bg-blue-500/10 text-blue-400'
                      : 'border-subtle text-content-secondary hover:bg-surface-raised'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}

function Section({
  title,
  control,
  children,
}: {
  title: string;
  control?: React.ReactNode;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <section>
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <h3 className="border-l-2 border-blue-500/60 pl-2.5 text-xs font-medium uppercase tracking-wide text-content-secondary">
          {title}
        </h3>
        {control}
      </div>
      {children}
    </section>
  );
}

function Toggle({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange: (on: boolean) => void;
}): JSX.Element {
  return (
    <button
      onClick={() => onChange(!on)}
      className="flex items-center gap-2 text-xs text-content-secondary"
    >
      {label}
      <span
        className={`relative h-4 w-7 rounded-full transition-colors ${on ? 'bg-blue-500' : 'border border-subtle bg-surface-inset'}`}
      >
        <span
          className={`absolute top-0.5 h-3 w-3 rounded-full border border-strong bg-white shadow-sm transition-all ${on ? 'left-3.5' : 'left-0.5'}`}
        />
      </span>
    </button>
  );
}

function Tile({
  active,
  onClick,
  preview,
  label,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  preview: React.ReactNode;
  label: string;
  hint: string;
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`card wx-card overflow-hidden text-left ${
        active ? '!border-blue-500/60 ring-1 ring-blue-500/30' : 'hover:border-strong'
      }`}
    >
      <div className="relative h-16 w-full overflow-hidden">
        {preview}
        {active && (
          <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-white">
            <Check className="h-3 w-3" />
          </span>
        )}
      </div>
      <div className="px-2.5 py-2">
        <div className="text-xs font-medium text-content">{label}</div>
        <div className="truncate text-[11px] text-content-tertiary">{hint}</div>
      </div>
    </button>
  );
}

function nowFraction(): number {
  const at = new Date();
  return (at.getHours() * 3600 + at.getMinutes() * 60 + at.getSeconds()) / 86_400;
}

const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

function compass(deg: number): string {
  return POINTS[Math.round(((deg % 360) + 360) % 360 / 45) % 8] ?? 'N';
}
