/**
 * Flight Info panel - a mission briefing for the active mission/survey: flight
 * time, distance, batteries, altitude, and live site weather. Read-only.
 *
 * All numbers come from the pure computeMissionBriefing(); this component only
 * sources inputs (mission store, survey store, vehicle profile, weather fetch)
 * and renders. The briefing's checks[] are informational today and become a
 * go/no-go advisor later with no change here.
 */
import { useEffect, useMemo, useState } from 'react';
import { Plane, Clock, Ruler, Wind, Camera, RefreshCw } from 'lucide-react';
import { useMissionStore } from '../../stores/mission-store';
import { useSurveyStore } from '../../stores/survey-store';
import { useSettingsStore } from '../../stores/settings-store';
import { commandHasLocation, hasValidCoordinates } from '../../../shared/mission-types';
import { estimateDataSizeGb } from '../survey/survey-stats';
import {
  computeMissionBriefing,
  formatAltitudeM,
  formatDistanceM,
  formatDurationSec,
  FC_WAYPOINT_SOFT_LIMIT,
  type BriefingPoint,
  type DaylightWindow,
} from '../../utils/flight-briefing';
import { getCurrentWeather, compassPoint, type WeatherSummary } from '../../utils/weather-api';
import {
  formatAreaFromSquareMeters,
  formatSpeedFromMetersPerSecond,
  formatWindSpeedFromMetersPerSecond,
  UNIT_LABELS,
  windSpeedValueFromMetersPerSecond,
  type WindSpeedUnit,
} from '../../../shared/user-units.js';

// Each section is a subtle raised card so the groups read as distinct blocks
// instead of one continuous list. Header (small icon + title) over a divider,
// then content. Semantic tokens only, so it tracks the app theme.
function Section({ icon, title, action, children }: {
  icon: React.ReactNode;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-surface-raised/50 rounded-lg border border-subtle overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-subtle">
        <span className="text-content-secondary flex items-center">{icon}</span>
        <h3 className="text-xs font-medium text-content flex-1">{title}</h3>
        {action}
      </div>
      <div className="px-3 py-2.5">{children}</div>
    </div>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="text-xs text-content-secondary">{label}</span>
      <span className="text-right">
        <span className="text-xs font-mono text-content">{value}</span>
        {detail && <span className="block text-[10px] text-content-tertiary">{detail}</span>}
      </span>
    </div>
  );
}

function Hero({ value, unit, sub }: { value: string; unit: string; sub: string }) {
  return (
    <div className="mb-2">
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold text-content tabular-nums">{value}</span>
        <span className="text-xs text-content-secondary">{unit}</span>
      </div>
      <div className="text-[10px] text-content-tertiary mt-0.5">{sub}</div>
    </div>
  );
}

// A labelled value with a proportion meter beneath it - turns a percentage or
// a value-against-limit into something readable at a glance.
function MeterStat({ label, value, detail, pct, tone = 'bg-blue-500/70' }: {
  label: string;
  value: string;
  detail?: string;
  pct: number;
  tone?: string;
}) {
  const w = Math.max(0, Math.min(100, pct));
  return (
    <div className="py-1">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs text-content-secondary">{label}</span>
        <span className="text-xs font-mono text-content">{value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-surface-input overflow-hidden mt-1">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${w}%` }} />
      </div>
      {detail && <span className="block text-[10px] text-content-tertiary mt-0.5">{detail}</span>}
    </div>
  );
}

// Compass showing the wind: an arrowhead on the rim at the bearing the wind
// comes FROM, pointing inward (the way it pushes the aircraft). Speed reads in
// the centre. Far faster to parse than a sentence with bearing and speed.
function WindRose({ dirDeg, speedMs, unit }: { dirDeg: number; speedMs: number; unit: WindSpeedUnit }) {
  const displaySpeed = windSpeedValueFromMetersPerSecond(speedMs, unit).toFixed(1);
  return (
    <div className="relative w-14 h-14 shrink-0">
      <svg viewBox="0 0 100 100" className="w-full h-full">
        <circle cx="50" cy="50" r="46" fill="none" strokeWidth="2"
          className="stroke-content-tertiary/30" />
        <text x="50" y="15" textAnchor="middle" fontSize="11"
          className="fill-content-tertiary">N</text>
        <g transform={`rotate(${dirDeg} 50 50)`}>
          {/* apex points inward (down toward centre); base sits near the rim. */}
          <polygon points="50,30 43,11 57,11" className="fill-sky-400" />
        </g>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-xs font-semibold text-content leading-none tabular-nums">{displaySpeed}</span>
        <span className="text-[8px] text-content-tertiary leading-none mt-0.5">{UNIT_LABELS.windSpeed[unit]}</span>
      </div>
    </div>
  );
}

function clockFromMin(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// Daylight window across a 24h track (site-local time): amber span = daylight,
// thin tick = now, blue tick = when the mission would finish if launched now.
// Makes "will I land before dark" obvious without reading clock times.
function DaylightBar({ d }: { d: DaylightWindow }) {
  const pct = (min: number) => Math.max(0, Math.min(100, (min / 1440) * 100));
  const left = pct(d.sunriseMin);
  const width = Math.max(0, pct(d.sunsetMin) - left);
  return (
    <div className="relative h-2 rounded-full bg-surface-input overflow-hidden mt-1">
      <div className="absolute inset-y-0 bg-amber-400/50" style={{ left: `${left}%`, width: `${width}%` }} />
      <div className="absolute inset-y-0 w-0.5 bg-content/70" style={{ left: `${pct(d.nowMin)}%` }} title="now" />
      <div className="absolute inset-y-0 w-0.5 bg-sky-400" style={{ left: `${pct(d.endMin)}%` }} title="mission end" />
    </div>
  );
}

export function FlightInfoPanel() {
  const missionItems = useMissionStore((s) => s.missionItems);
  const homePosition = useMissionStore((s) => s.homePosition);
  const surveyResult = useSurveyStore((s) => s.result);
  const surveyCamera = useSurveyStore((s) => s.config.camera);
  // Recompute endurance/cruise only when the active vehicle profile changes.
  const activeVehicleId = useSettingsStore((s) => s.activeVehicleId);
  const vehicles = useSettingsStore((s) => s.vehicles);
  const distanceUnit = useSettingsStore((s) => s.unitPreferences.distance);
  const altitudeUnit = useSettingsStore((s) => s.unitPreferences.altitude);
  const speedUnit = useSettingsStore((s) => s.unitPreferences.speed);
  const areaUnit = useSettingsStore((s) => s.unitPreferences.area);
  const windSpeedUnit = useSettingsStore((s) => s.unitPreferences.windSpeed);

  const { cruiseSpeedMs, enduranceSec, vehicleName, isAerial } = useMemo(() => {
    const st = useSettingsStore.getState();
    const v = st.getActiveVehicle();
    return {
      cruiseSpeedMs: st.getCruiseSpeed(),
      enduranceSec: st.getEstimatedFlightTime(),
      vehicleName: v?.name ?? 'vehicle',
      // Flight time / altitude / ceiling / daylight only make sense in the air.
      isAerial: !v || v.type === 'copter' || v.type === 'plane' || v.type === 'vtol',
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeVehicleId, vehicles]);

  const located = useMemo<BriefingPoint[]>(
    () =>
      missionItems
        .filter((it) => commandHasLocation(it.command) && hasValidCoordinates(it.latitude, it.longitude))
        .map((it) => ({ lat: it.latitude, lng: it.longitude, altM: it.altitude })),
    [missionItems],
  );

  const survey = useMemo(() => {
    if (!surveyResult) return null;
    return {
      gsdCm: surveyResult.stats.gsd,
      photoCount: surveyResult.stats.photoCount,
      dataGb: estimateDataSizeGb(surveyResult.stats.photoCount, surveyCamera.imageWidth, surveyCamera.imageHeight),
      areaM2: surveyResult.stats.areaCovered,
    };
  }, [surveyResult, surveyCamera.imageWidth, surveyCamera.imageHeight]);

  // Mission centroid drives the weather fetch. Rounded so small edits don't refetch.
  const centroidKey = useMemo(() => {
    if (located.length === 0) return null;
    let lat = 0, lng = 0;
    for (const p of located) { lat += p.lat; lng += p.lng; }
    return { lat: lat / located.length, lng: lng / located.length };
  }, [located]);

  const [weather, setWeather] = useState<WeatherSummary | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (!centroidKey) { setWeather(null); return; }
    let cancelled = false;
    setWeatherLoading(true);
    getCurrentWeather(centroidKey.lat, centroidKey.lng)
      .then((w) => { if (!cancelled) setWeather(w); })
      .finally(() => { if (!cancelled) setWeatherLoading(false); });
    return () => { cancelled = true; };
    // refreshTick lets the button re-run the fetch.
  }, [centroidKey?.lat, centroidKey?.lng, refreshTick]);

  const home = useMemo(
    () => (homePosition ? { lat: homePosition.lat, lng: homePosition.lon } : null),
    [homePosition],
  );

  const briefing = useMemo(
    () => computeMissionBriefing({ located, home, cruiseSpeedMs, enduranceSec, survey, weather, distanceUnit, altitudeUnit, windSpeedUnit }),
    [located, home, cruiseSpeedMs, enduranceSec, survey, weather, distanceUnit, altitudeUnit, windSpeedUnit],
  );

  if (!isAerial) {
    return (
      <div data-tour="flight-info-panel" className="h-full flex flex-col items-center justify-center text-center p-6 text-content-secondary bg-surface">
        <Plane className="w-10 h-10 mb-3 text-content-tertiary" />
        <p className="text-sm font-medium mb-1 text-content">Aerial vehicles only</p>
        <p className="text-xs text-content-tertiary max-w-[14rem]">
          The flight briefing (endurance, altitude, daylight) applies to copters, planes and VTOL. Switch the active vehicle to an aerial type to use it.
        </p>
      </div>
    );
  }

  if (briefing.empty) {
    return (
      <div data-tour="flight-info-panel" className="h-full flex flex-col items-center justify-center text-center p-6 text-content-secondary bg-surface">
        <Plane className="w-10 h-10 mb-3 text-content-tertiary" />
        <p className="text-sm font-medium mb-1 text-content">No mission to brief</p>
        <p className="text-xs text-content-tertiary max-w-[14rem]">
          Plan or load a mission to see flight time, distance, batteries and site weather.
        </p>
      </div>
    );
  }

  const ICON = 'w-3.5 h-3.5';
  const altPct = briefing.ceilingM > 0 ? (briefing.maxAltM / briefing.ceilingM) * 100 : 0;

  return (
    <div data-tour="flight-info-panel" className="h-full overflow-y-auto bg-surface p-2 space-y-2">
      {/* Endurance - the number a pilot opens this for. */}
      <Section icon={<Clock className={ICON} />} title="Endurance">
        <Hero
          value={formatDurationSec(briefing.flightTimeSec)}
          unit="flight time"
          sub={`at ~${formatSpeedFromMetersPerSecond(cruiseSpeedMs, speedUnit)} cruise (${vehicleName})`}
        />
        <Stat
          label="Batteries"
          value={briefing.batteryCount > 0 ? `${briefing.batteryCount}` : 'set vehicle'}
          detail={briefing.enduranceSec > 0 ? `~${formatDurationSec(briefing.enduranceSec)} usable each` : undefined}
        />
        {briefing.reservePct !== null && (
          <MeterStat
            label="Reserve (final pack)"
            value={`${Math.round(briefing.reservePct)}%`}
            pct={briefing.reservePct}
          />
        )}
      </Section>

      {/* Route */}
      <Section icon={<Ruler className={ICON} />} title="Route">
        <Stat label="Total distance" value={formatDistanceM(briefing.distanceM, distanceUnit)} />
        {homePosition && (
          <Stat label="Max from home" value={formatDistanceM(briefing.maxFromHomeM, distanceUnit)} />
        )}
        <MeterStat
          label="Max altitude"
          value={`${formatAltitudeM(briefing.maxAltM, altitudeUnit)} AGL`}
          detail={`ceiling ${formatAltitudeM(briefing.ceilingM, altitudeUnit)}`}
          pct={altPct}
          tone={altPct > 100 ? 'bg-amber-500/80' : 'bg-blue-500/70'}
        />
        <Stat
          label="Total climb"
          value={formatAltitudeM(briefing.totalClimbM, altitudeUnit)}
          detail={`from ${formatAltitudeM(briefing.minAltM, altitudeUnit)} lowest`}
        />
        <Stat
          label="Waypoints"
          value={briefing.waypointCount.toLocaleString()}
          detail={briefing.waypointCount > FC_WAYPOINT_SOFT_LIMIT ? 'very large - split into sorties before upload' : undefined}
        />
      </Section>

      {/* Weather */}
      <Section
        icon={<Wind className={ICON} />}
        title="Site weather"
        action={
          weather && (
            <button
              onClick={() => setRefreshTick((t) => t + 1)}
              className="p-1 text-content-secondary hover:text-content transition-colors"
              title="Refresh forecast"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${weatherLoading ? 'animate-spin' : ''}`} />
            </button>
          )
        }
      >
        {weatherLoading && !weather ? (
          <p className="text-xs text-content-tertiary">Fetching forecast...</p>
        ) : weather ? (
          <>
            <div className="flex items-center gap-3 py-1">
              <WindRose dirDeg={weather.windDirDeg} speedMs={weather.windSpeedMs} unit={windSpeedUnit} />
              <div className="min-w-0">
                <div className="text-sm text-content">
                  Wind from <span className="font-medium">{compassPoint(weather.windDirDeg)}</span>
                  <span className="text-content-secondary"> ({Math.round(weather.windDirDeg)}°)</span>
                </div>
                <div className="text-[11px] text-content-tertiary mt-0.5">
                  gusting to {formatWindSpeedFromMetersPerSecond(weather.windGustMs, windSpeedUnit)}
                  {cruiseSpeedMs > 0 && <> · {Math.round((weather.windSpeedMs / cruiseSpeedMs) * 100)}% of cruise</>}
                </div>
              </div>
            </div>
            <div className="border-t border-subtle mt-1.5 pt-1.5">
              <Stat label="Temperature" value={`${weather.tempC.toFixed(0)}°C`} />
              <Stat label="Precipitation" value={`${weather.precipMm.toFixed(1)} mm`} />
              {briefing.daylight ? (
                <>
                  <Stat
                    label="Daylight"
                    value={`${clockFromMin(briefing.daylight.sunriseMin)} - ${clockFromMin(briefing.daylight.sunsetMin)}`}
                  />
                  <DaylightBar d={briefing.daylight} />
                  <div className="text-[10px] text-content-tertiary mt-1">
                    {briefing.daylight.marginMin >= 0
                      ? `Ends ~${clockFromMin(briefing.daylight.endMin)} if launched now, ${formatDurationSec(briefing.daylight.marginMin * 60)} before sunset`
                      : `Ends ~${clockFromMin(briefing.daylight.endMin)} if launched now, ${formatDurationSec(-briefing.daylight.marginMin * 60)} after sunset`}
                  </div>
                </>
              ) : weather.sunriseIso && weather.sunsetIso ? (
                <Stat
                  label="Daylight"
                  value={`${weather.sunriseIso.slice(11, 16)} - ${weather.sunsetIso.slice(11, 16)}`}
                />
              ) : null}
            </div>
          </>
        ) : (
          <p className="text-xs text-content-tertiary">Weather unavailable for this site.</p>
        )}
      </Section>

      {/* Survey quality (only when a survey is active) */}
      {survey && (
        <Section icon={<Camera className={ICON} />} title="Survey">
          <Stat label="Coverage" value={formatAreaFromSquareMeters(survey.areaM2, areaUnit)} />
          <Stat label="GSD" value={survey.gsdCm > 0 ? `${survey.gsdCm.toFixed(1)} cm/px` : 'n/a'} />
          <Stat label="Photos" value={survey.photoCount.toLocaleString()} />
          <Stat label="Data" value={`~${survey.dataGb.toFixed(1)} GB`} detail="JPEG+RAW estimate" />
        </Section>
      )}
    </div>
  );
}
