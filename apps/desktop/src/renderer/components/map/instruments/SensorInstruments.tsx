import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTelemetryStore } from '../../../stores/telemetry-store';
import { useSettingsStore } from '../../../stores/settings-store';
import { useParameterStore } from '../../../stores/parameter-store';
import { altitudeValueFromMeters, speedValueFromMetersPerSecond, UNIT_LABELS, UNIT_PRECISION } from '../../../../shared/user-units.js';
import { ORIENTATION_UP } from '../../../../shared/telemetry-types';
import { RoundGauge, GAUGE_COLORS, gaugeArcPath, gaugePoint } from './RoundGauge';
import { NumericReadout } from './NumericReadout';
import { SegmentBar, FillBehind, gaugeTint } from './ReadoutPrimitives';
import { useTelemetryFresh } from './useTelemetryFresh';
import { useLinkUp } from './useLinkUp';
import { useInDock } from './dock-context';

/** A distance reading older than this is a sensor that stopped, not a distance. */
const SENSOR_STALE_MS = 2000;
const mono = 'font-mono tabular-nums leading-none whitespace-nowrap';

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function Card({ label, right, children, width }: { label: string; right?: ReactNode; children: ReactNode; width?: number }): JSX.Element {
  const inDock = useInDock();
  return (
    <div
      className={`select-none px-3 pt-2 pb-2.5 ${inDock ? '' : 'rounded-lg shadow-xl'}`}
      style={{ ...(inDock ? {} : { background: GAUGE_COLORS.face, border: `1.5px solid ${GAUGE_COLORS.bezelEdge}` }), color: GAUGE_COLORS.text, width }}
    >
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-[9px] font-semibold tracking-[0.14em] leading-none" style={{ color: GAUGE_COLORS.textDim }}>{label}</span>
        {right && <span className="ml-auto">{right}</span>}
      </div>
      {children}
    </div>
  );
}

// ─── Wind ────────────────────────────────────────────────────────────────────

function useWind() {
  const fresh = useTelemetryFresh('wind');
  const raw = useTelemetryStore((s) => s.wind);
  // ArduPilot reports the direction in -180..180; compass bearings read 0..360
  const wind = { ...raw, direction: ((raw.direction % 360) + 360) % 360 };
  const heading = useTelemetryStore((s) => s.vfrHud.heading);
  const speedUnit = useSettingsStore((s) => s.unitPreferences.speed);
  // relative to the nose: 0 = straight on the nose (headwind), 90 = from the right
  const rel = (((wind.direction - heading) % 360) + 360) % 360;
  const head = wind.speed * Math.cos((rel * Math.PI) / 180);
  const cross = wind.speed * Math.sin((rel * Math.PI) / 180);
  const fmt = (ms: number) => String(Number(speedValueFromMetersPerSecond(Math.abs(ms), speedUnit).toFixed(UNIT_PRECISION.speed[speedUnit])));
  return { fresh, wind, rel, head, cross, fmt, unit: UNIT_LABELS.speed[speedUnit] };
}

export function WindInstrument(): JSX.Element {
  const { t } = useTranslation();
  const w = useWind();
  const calm = w.fresh && w.wind.speed < 0.5;
  const [tx, ty] = gaugePoint(41, w.rel);
  const [lx, ly] = gaugePoint(31, w.rel - 9);
  const [rx, ry] = gaugePoint(31, w.rel + 9);
  return (
    <RoundGauge
      label={t('map:sensorInstruments.wind')}
      svgContent={
        <>
          {/* the nose */}
          <line x1={52} y1={9} x2={52} y2={15} stroke={GAUGE_COLORS.tickMajor} strokeWidth={1.5} />
          {w.fresh && !calm && (
            // a pointer on the rim where the wind comes from, aimed at the aircraft
            <polygon points={`${tx},${ty} ${lx},${ly} ${rx},${ry}`} fill={GAUGE_COLORS.green} stroke={GAUGE_COLORS.bezel} strokeWidth={0.5} />
          )}
        </>
      }
    >
      <span className="text-[13px] font-semibold leading-none text-[var(--gauge-text)]">
        {!w.fresh ? '--' : calm ? t('map:sensorInstruments.calm') : `${w.fmt(w.wind.speed)}`}
      </span>
      <span className="mt-0.5 text-[8px] leading-none text-[var(--gauge-text-dim)]">{w.fresh && !calm ? w.unit : ''}</span>
      <span className="mt-1 text-[8px] leading-none text-[var(--gauge-text-dim)]">
        {w.fresh && !calm ? t('map:sensorInstruments.from', { deg: Math.round(w.wind.direction) }) : ''}
      </span>
    </RoundGauge>
  );
}

export function WindNumeric(): JSX.Element {
  const { t } = useTranslation();
  const w = useWind();
  const components = w.fresh && w.wind.speed >= 0.5
    ? `${w.head >= 0 ? t('map:sensorInstruments.head') : t('map:sensorInstruments.tail')} ${w.fmt(w.head)} · ${t('map:sensorInstruments.cross')} ${w.fmt(w.cross)} ${w.cross >= 0 ? 'R' : 'L'}` // i18n-exempt: R/L side marks
    : '';
  return (
    <NumericReadout
      label={t('map:sensorInstruments.wind')}
      value={w.fresh ? w.fmt(w.wind.speed) : '--'}
      unit={w.fresh ? w.unit : undefined}
      sub={w.fresh ? t('map:sensorInstruments.from', { deg: Math.round(w.wind.direction) }) : ''}
      footer={components ? <div className="mt-1 text-[9px] leading-none text-[var(--gauge-text-dim)] whitespace-nowrap">{components}</div> : undefined}
    />
  );
}

// ─── Rangefinder and proximity ──────────────────────────────────────────────

export function RangefinderInstrument(): JSX.Element {
  const { t } = useTranslation();
  const linkUp = useLinkUp();
  const now = useNow(500);
  const rf = useTelemetryStore((s) => s.rangefinder);
  const altUnit = useSettingsStore((s) => s.unitPreferences.altitude);
  const live = linkUp && rf !== null && now - rf.receivedAt < SENSOR_STALE_MS;
  const fmt = (m: number) => String(Number(altitudeValueFromMeters(m, altUnit).toFixed(1)));
  const outOfRange = live && rf.distance >= rf.max - 0.01;
  const tooClose = live && rf.distance <= rf.min + 0.01;
  const frac = live ? Math.max(0, Math.min(1, (rf.distance - rf.min) / Math.max(0.01, rf.max - rf.min))) : null;
  const tone = !live ? GAUGE_COLORS.textDim : outOfRange ? GAUGE_COLORS.textDim : tooClose ? GAUGE_COLORS.amber : GAUGE_COLORS.green;
  return (
    <Card
      label={t('map:sensorInstruments.rangefinder')}
      width={150}
      right={live && rf.quality !== null ? <span className={`${mono} text-[8.5px]`} style={{ color: GAUGE_COLORS.textDim }}>{t('map:sensorInstruments.quality', { q: rf.quality })}</span> : undefined}
    >
      <div className="flex items-baseline gap-1">
        <span className={`${mono} text-[22px] font-bold`} style={{ color: live && !outOfRange ? GAUGE_COLORS.text : GAUGE_COLORS.textDim }}>
          {!live ? '--' : outOfRange ? `>${fmt(rf.max)}` : fmt(rf.distance)}
        </span>
        <span className="text-[10px]" style={{ color: GAUGE_COLORS.textDim }}>{UNIT_LABELS.altitude[altUnit]}</span>
        <span className={`${mono} ml-auto text-[8.5px] font-bold tracking-wider`} style={{ color: tone }}>
          {!live ? t('map:sensorInstruments.noSensor') : outOfRange ? t('map:sensorInstruments.noTarget') : tooClose ? t('map:sensorInstruments.tooClose') : t('map:sensorInstruments.agl')}
        </span>
      </div>
      <FillBehind fraction={frac} fill={gaugeTint(tone, 55)} trough={GAUGE_COLORS.bezel} edge={GAUGE_COLORS.bezelEdge} style={{ height: 6, marginTop: 7 }} />
      <div className={`${mono} mt-1 flex justify-between text-[8px]`} style={{ color: GAUGE_COLORS.tickMinor }}>
        <span>{live ? fmt(rf.min) : ''}</span>
        <span>{live ? fmt(rf.max) : ''}</span>
      </div>
    </Card>
  );
}

const PROX_RED_M = 2;
const PROX_AMBER_M = 5;

export function ProximityInstrument(): JSX.Element {
  const { t } = useTranslation();
  const linkUp = useLinkUp();
  const now = useNow(500);
  const proximity = useTelemetryStore((s) => s.proximity);
  const distUnit = useSettingsStore((s) => s.unitPreferences.altitude);
  const fmt = (m: number) => String(Number(altitudeValueFromMeters(m, distUnit).toFixed(1)));
  const sectors = Array.from({ length: 8 }, (_, k) => {
    const d = proximity[k];
    return linkUp && d && now - d.receivedAt < SENSOR_STALE_MS && d.distance < d.max - 0.01 ? d.distance : null;
  });
  const up = proximity[ORIENTATION_UP];
  const upLive = linkUp && up && now - up.receivedAt < SENSOR_STALE_MS && up.distance < up.max - 0.01 ? up.distance : null;
  const anyLive = Object.values(proximity).some((d) => linkUp && now - d.receivedAt < SENSOR_STALE_MS);
  const closest = sectors.reduce<{ d: number; k: number } | null>((best, d, k) => (d !== null && (!best || d < best.d) ? { d, k } : best), null);
  const colour = (d: number | null) => (d === null ? GAUGE_COLORS.bezelEdge : d <= PROX_RED_M ? GAUGE_COLORS.red : d <= PROX_AMBER_M ? GAUGE_COLORS.amber : GAUGE_COLORS.green);
  return (
    <RoundGauge
      label={t('map:sensorInstruments.proximity')}
      svgContent={
        <>
          {sectors.map((d, k) => (
            <path key={k} d={gaugeArcPath(38, k * 45 - 19, k * 45 + 19)} fill="none" stroke={colour(d)} strokeWidth={d === null ? 2 : 5} strokeLinecap="round" />
          ))}
          <polygon points="52,44 48,53 52,51 56,53" fill={GAUGE_COLORS.tickMajor} />
        </>
      }
    >
      <span className="mt-4 text-[12px] font-semibold leading-none text-[var(--gauge-text)]" style={{ color: closest ? colour(closest.d) : undefined }}>
        {closest ? fmt(closest.d) : anyLive ? t('map:sensorInstruments.clear') : '--'}
      </span>
      <span className="mt-1 text-[8px] leading-none text-[var(--gauge-text-dim)]">
        {upLive !== null ? t('map:sensorInstruments.up', { d: fmt(upLive) }) : closest ? UNIT_LABELS.altitude[distUnit] : ''}
      </span>
    </RoundGauge>
  );
}

// ─── EKF health ─────────────────────────────────────────────────────────────

const EKF_ATTITUDE = 1;
const EKF_UNINITIALIZED = 1024;
const EKF_GPS_GLITCHING = 32768;
const EKF_CHECK = 0.5;

function useEkf() {
  const fresh = useTelemetryFresh('ekf');
  const ekf = useTelemetryStore((s) => s.ekf);
  const thresh = useParameterStore((s) => s.parameters.get('FS_EKF_THRESH')?.value);
  const bad = typeof thresh === 'number' && thresh > 0 ? thresh : 0.8;
  const rows = ekf
    ? ([['vel', ekf.velocity], ['posH', ekf.posHoriz], ['posV', ekf.posVert], ['mag', ekf.compass], ['terr', ekf.terrain]] as const)
    : [];
  const colour = (v: number) => (v >= bad ? GAUGE_COLORS.red : v >= EKF_CHECK ? GAUGE_COLORS.amber : GAUGE_COLORS.green);
  const worst = rows.reduce<{ key: string; v: number } | null>((w, [key, v]) => (!w || v > w.v ? { key, v } : w), null);
  let status: { key: string; color: string };
  if (!fresh || !ekf) status = { key: 'noData', color: GAUGE_COLORS.textDim };
  else if (ekf.flags & EKF_UNINITIALIZED || !(ekf.flags & EKF_ATTITUDE)) status = { key: 'initialising', color: GAUGE_COLORS.amber };
  else if (ekf.flags & EKF_GPS_GLITCHING) status = { key: 'gpsGlitch', color: GAUGE_COLORS.red };
  else if (worst && worst.v >= bad) status = { key: 'bad', color: GAUGE_COLORS.red };
  else if (worst && worst.v >= EKF_CHECK) status = { key: 'check', color: GAUGE_COLORS.amber };
  else status = { key: 'ok', color: GAUGE_COLORS.green };
  return { fresh, rows, colour, worst, status };
}

export function EkfInstrument(): JSX.Element {
  const { t } = useTranslation();
  const e = useEkf();
  return (
    <Card
      label={t('map:sensorInstruments.ekf')}
      width={150}
      right={<span className={`${mono} text-[9px] font-bold tracking-wider`} style={{ color: e.status.color }}>{t(`map:sensorInstruments.ekfStatus.${e.status.key}`)}</span>}
    >
      <div className="space-y-[5px]">
        {(e.fresh ? e.rows : (['vel', 'posH', 'posV', 'mag', 'terr'] as const).map((k) => [k, 0] as const)).map(([key, v]) => (
          <div key={key} className="flex items-center gap-2">
            <span className={`${mono} w-9 text-[8px] font-semibold`} style={{ color: GAUGE_COLORS.tickMinor }}>{t(`map:sensorInstruments.ekfRow.${key}`)}</span>
            <SegmentBar fraction={e.fresh ? Math.min(1, v) : 0} color={e.colour(v)} width={64} height={7} />
            <span className={`${mono} ml-auto text-[9px]`} style={{ color: e.fresh ? e.colour(v) : GAUGE_COLORS.textDim }}>{e.fresh ? v.toFixed(2) : '--'}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function EkfCompact(): JSX.Element {
  const { t } = useTranslation();
  const e = useEkf();
  const inDock = useInDock();
  return (
    <div
      className={`select-none flex items-center gap-2 px-2.5 ${inDock ? '' : 'rounded-[9px] shadow-xl'}`}
      style={{ ...(inDock ? {} : { background: GAUGE_COLORS.face, border: `1.5px solid ${GAUGE_COLORS.bezelEdge}` }), height: 30 }}
    >
      <span className={`${mono} text-[8px] font-semibold`} style={{ color: GAUGE_COLORS.tickMinor }}>{t('map:sensorInstruments.ekf')}</span>
      <span className={`${mono} text-[12px] font-bold`} style={{ color: e.status.color }}>{t(`map:sensorInstruments.ekfStatus.${e.status.key}`)}</span>
      {e.fresh && e.worst && (
        <span className={`${mono} text-[9px]`} style={{ color: GAUGE_COLORS.textDim }}>
          {t(`map:sensorInstruments.ekfRow.${e.worst.key}`)} {e.worst.v.toFixed(2)}
        </span>
      )}
    </div>
  );
}

// ─── Flight timer and endurance ─────────────────────────────────────────────

/** Seconds of current-draw averaging: long enough to ride out a punch-out, short enough to follow a cruise change. */
const CURRENT_TAU_S = 10;

function clock(totalS: number): string {
  const s = Math.max(0, Math.floor(totalS));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function FlightTimerInstrument(): JSX.Element {
  const { t } = useTranslation();
  const now = useNow(1000);
  const armedAt = useTelemetryStore((s) => s.armedAt);
  const battery = useTelemetryStore((s) => s.battery);
  const batteryFresh = useTelemetryFresh('battery');
  const primary = useTelemetryStore((s) => s.primaryBatteryId);
  const capacity = useParameterStore((s) => s.parameters.get(primary && primary > 0 ? `BATT${primary + 1}_CAPACITY` : 'BATT_CAPACITY')?.value);

  const avg = useRef<{ a: number; t: number } | null>(null);
  if (batteryFresh && battery.current > 0) {
    const prev = avg.current;
    const tNow = Date.now();
    if (!prev) avg.current = { a: battery.current, t: tNow };
    else if (tNow > prev.t) {
      const k = 1 - Math.exp(-(tNow - prev.t) / 1000 / CURRENT_TAU_S);
      avg.current = { a: prev.a + (battery.current - prev.a) * k, t: tNow };
    }
  }
  const draw = avg.current?.a ?? 0;
  const remainingMah = typeof capacity === 'number' && capacity > 0 && battery.remaining >= 0 ? (capacity * battery.remaining) / 100 : null;
  const enduranceS = remainingMah !== null && draw > 1 && batteryFresh ? (remainingMah / 1000 / draw) * 3600 : null;
  const flying = armedAt !== null;
  const lowColour = enduranceS === null ? GAUGE_COLORS.textDim : enduranceS < 120 ? GAUGE_COLORS.red : enduranceS < 300 ? GAUGE_COLORS.amber : GAUGE_COLORS.green;

  return (
    <Card label={t('map:sensorInstruments.flight')} width={150}>
      <div className="flex items-baseline gap-1.5">
        <span className={`${mono} text-[22px] font-bold`} style={{ color: flying ? GAUGE_COLORS.text : GAUGE_COLORS.textDim }}>
          {clock(flying ? (now - armedAt) / 1000 : 0)}
        </span>
        <span className={`${mono} ml-auto text-[8.5px] font-bold tracking-wider`} style={{ color: flying ? GAUGE_COLORS.green : GAUGE_COLORS.textDim }}>
          {flying ? t('map:sensorInstruments.armed') : t('map:sensorInstruments.disarmed')}
        </span>
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className={`${mono} text-[8px] font-semibold`} style={{ color: GAUGE_COLORS.tickMinor }}>{t('map:sensorInstruments.endurance')}</span>
        <span className={`${mono} ml-auto text-[13px] font-bold`} style={{ color: lowColour }}>{enduranceS !== null ? clock(enduranceS) : '--:--'}</span>
      </div>
      <div className="mt-1 text-[8.5px] leading-snug" style={{ color: GAUGE_COLORS.tickMinor }}>
        {remainingMah === null ? t('map:sensorInstruments.needCapacity') : enduranceS === null ? t('map:sensorInstruments.notDrawing') : t('map:sensorInstruments.atDraw', { a: draw.toFixed(1) })}
      </div>
    </Card>
  );
}
