/**
 * Compact map readouts, ported from the mobile app's CompactReadout. One
 * visual language, three treatments, so any scalar instrument matches:
 *
 * - strip   a segmented band ~30px tall, meant to bank in a row under a
 *           toolbar (GPS uses the rising-bars signal glyph instead).
 * - cell    a small watch-complication tile (~92px): value, tag, a mini fill
 *           bar, and a detail line.
 * - inline  the value riding on top of its own FillBehind gauge.
 *
 * Each source subscribes only to the telemetry fields it renders (one hook
 * boundary per source), matching the registry's per-instrument selectors so a
 * telemetry tick re-renders only the readouts that show that field. No-range
 * quantities (altitude, speed, vsi, home) draw no bar: inventing a ceiling
 * would paint a "how full" meter that means nothing. Colors come from the
 * gauge palette; unit-bearing values convert via shared/user-units.
 */
import { useTranslation } from 'react-i18next';
import type { CSSProperties, ReactNode } from 'react';
import { useTelemetryStore } from '../../../stores/telemetry-store';
import { useSettingsStore } from '../../../stores/settings-store';
import {
  altitudeValueFromMeters,
  speedValueFromMetersPerSecond,
  verticalSpeedValueFromMetersPerSecond,
  formatDistanceFromMeters,
  UNIT_LABELS,
  UNIT_PRECISION,
} from '../../../../shared/user-units.js';
import { haversineMeters } from '../traffic/proximity';
import { GAUGE_COLORS } from './RoundGauge';
import { useInDock } from './dock-context';
import { SegmentBar, SignalBars, FillBehind, gaugeTint } from './ReadoutPrimitives';
import { useLinkUp } from './useLinkUp';
import { rssiState } from '../../../utils/rssi-state';
import { useMapHomeStore } from './registry';
import { STRIP_HEIGHT } from './stripMetrics';

export type ReadoutSource = 'battery' | 'gps' | 'altitude' | 'speed' | 'heading' | 'vsi' | 'home' | 'link';
export type ReadoutTreatment = 'strip' | 'cell' | 'inline';

interface Readout {
  /** Short tag: BAT, GPS. */
  tag: string;
  /** The already-formatted headline ("78%", "3D", "--"). */
  value: string;
  /** The supporting line ("16.8V 12A", "14 sats  0.8 hdop"). */
  detail: string;
  /** 0..1 for the fill and segment treatments, or null when the quantity has
   * no honest range (altitude, speed, vsi, home draw no bar). */
  fraction: number | null;
  /** True when the numbers mean something. */
  known: boolean;
  /** A gauge-palette css color (var() string). */
  color: string;
}

function trimmed(value: number, decimals: number): string {
  return String(Number(value.toFixed(decimals)));
}

function bandColor(pct: number): string {
  return pct > 30 ? GAUGE_COLORS.green : pct > 15 ? GAUGE_COLORS.amber : GAUGE_COLORS.red;
}

const GPS_FIX_SHORT: Record<number, string> = {
  2: '2D',
  3: '3D',
  4: 'DGPS',
  5: 'FLOAT',
  6: 'RTK',
};

const CARDINAL_KEYS = ['map:instrument.cardinalN', 'map:instrument.cardinalNE', 'map:instrument.cardinalE', 'map:instrument.cardinalSE', 'map:instrument.cardinalS', 'map:instrument.cardinalSW', 'map:instrument.cardinalW', 'map:instrument.cardinalNW'];

// ===========================================================================
// Shell + treatments
// ===========================================================================

const monoBase = 'font-mono tabular-nums leading-none whitespace-nowrap';

function Shell({ children, style }: { children: ReactNode; style?: CSSProperties }): JSX.Element {
  const inDock = useInDock();
  return (
    <div
      className={inDock ? 'select-none' : 'rounded-[9px] shadow-xl select-none'}
      style={{
        ...(inDock ? {} : { background: GAUGE_COLORS.face, border: `1.5px solid ${GAUGE_COLORS.bezelEdge}` }),
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function StripReadout({ r, signalGlyph }: { r: Readout; signalGlyph: boolean }): JSX.Element {
  return (
    <Shell style={{ height: STRIP_HEIGHT }}>
      <div className="flex items-center h-full px-2">
        <span className={`${monoBase} text-[8px] font-semibold`} style={{ color: GAUGE_COLORS.tickMinor }}>
          {r.tag}
        </span>
        {r.fraction !== null && (
          <div className="ml-[7px] mr-2 flex items-center">
            {signalGlyph ? (
              <SignalBars fraction={r.fraction} color={r.color} />
            ) : (
              <SegmentBar fraction={r.fraction} color={r.color} />
            )}
          </div>
        )}
        <span
          className={`${monoBase} ${r.fraction === null ? 'ml-[7px]' : ''} text-[13px] font-bold`}
          style={{ color: r.known ? r.color : GAUGE_COLORS.textDim }}
        >
          {r.value}
        </span>
        <span className={`${monoBase} ml-2 text-[9px]`} style={{ color: GAUGE_COLORS.textDim }}>
          {r.detail}
        </span>
      </div>
    </Shell>
  );
}

function CellReadout({ r }: { r: Readout }): JSX.Element {
  return (
    <Shell style={{ padding: '6px 8px' }}>
      <div style={{ width: 92 }}>
        <div className="flex items-baseline">
          <span className={`${monoBase} text-[19px] font-bold`} style={{ color: r.known ? r.color : GAUGE_COLORS.textDim }}>
            {r.value}
          </span>
          <span className={`${monoBase} ml-auto text-[8px] font-semibold`} style={{ color: GAUGE_COLORS.tickMinor }}>
            {r.tag}
          </span>
        </div>
        {r.fraction !== null && (
          <FillBehind
            fraction={r.fraction}
            fill={r.color}
            trough={gaugeTint(GAUGE_COLORS.bezelEdge, 50)}
            edge="transparent"
            style={{ height: 4, marginTop: 5 }}
          />
        )}
        <div
          className={`${monoBase} text-[9px] overflow-hidden text-ellipsis`}
          style={{ color: GAUGE_COLORS.textDim, marginTop: 5 }}
        >
          {r.detail}
        </div>
      </div>
    </Shell>
  );
}

function InlineReadout({ r }: { r: Readout }): JSX.Element {
  return (
    <Shell style={{ padding: '5px 9px 5px 7px' }}>
      <div className="flex items-center">
        <FillBehind
          fraction={r.fraction}
          fill={gaugeTint(r.color, 28)}
          trough={gaugeTint(GAUGE_COLORS.bezelEdge, 35)}
          edge={GAUGE_COLORS.bezelEdge}
          style={{ width: 78 }}
        >
          <div className="flex justify-center" style={{ padding: '5px 0' }}>
            <span className={`${monoBase} text-[17px] font-bold`} style={{ color: r.known ? r.color : GAUGE_COLORS.textDim }}>
              {r.value}
            </span>
          </div>
        </FillBehind>
        <span className={`${monoBase} ml-[9px] text-[10px]`} style={{ color: GAUGE_COLORS.textDim }}>
          {r.detail}
        </span>
      </div>
    </Shell>
  );
}

function ReadoutView({ treatment, r, signalGlyph = false }: { treatment: ReadoutTreatment; r: Readout; signalGlyph?: boolean }): JSX.Element {
  switch (treatment) {
    case 'strip':
      return <StripReadout r={r} signalGlyph={signalGlyph} />;
    case 'cell':
      return <CellReadout r={r} />;
    case 'inline':
      return <InlineReadout r={r} />;
  }
}

// ===========================================================================
// Per-source normalizers (one hook boundary each)
// ===========================================================================

function BatteryReadout({ treatment }: { treatment: ReadoutTreatment }): JSX.Element {
  const { t } = useTranslation();
  const connected = useLinkUp();
  const voltage = useTelemetryStore((s) => s.battery.voltage);
  const current = useTelemetryStore((s) => s.battery.current);
  const remaining = useTelemetryStore((s) => s.battery.remaining);

  const known = connected && remaining >= 0;
  const currentKnown = connected && current > 0;
  const r: Readout = {
    tag: t('map:instrument.bat'),
    value: known ? `${Math.round(remaining)}%` : '--',
    detail: connected ? `${voltage.toFixed(1)}V${currentKnown ? `  ${current.toFixed(0)}A` : ''}` : '--',
    fraction: known ? remaining / 100 : 0,
    known,
    color: known ? bandColor(remaining) : GAUGE_COLORS.tickMinor,
  };
  return <ReadoutView treatment={treatment} r={r} />;
}

function GpsReadout({ treatment }: { treatment: ReadoutTreatment }): JSX.Element {
  const { t } = useTranslation();
  const connected = useLinkUp();
  const fixType = useTelemetryStore((s) => s.gps.fixType);
  const satellites = useTelemetryStore((s) => s.gps.satellites);
  const hdop = useTelemetryStore((s) => s.gps.hdop);

  const known = connected && fixType > 0;
  const hdopKnown = connected && hdop < 99;
  const r: Readout = {
    tag: t('map:instrument.gps'),
    value: known ? (GPS_FIX_SHORT[fixType] ?? t('map:instrument.noFix')) : '--',
    // Sat count saturates the bar at 12; more than that is not a meaningfully
    // better fix, and the number is right there in the detail line.
    detail: connected ? (hdopKnown ? t('map:compactReadout.satsHdop', { n: satellites, hdop: hdop.toFixed(1) }) : t('map:instrument.sats', { n: satellites })) : t('map:instrument.satsNone'),
    fraction: known ? Math.max(0, Math.min(1, satellites / 12)) : 0,
    known,
    color: known ? (fixType >= 3 ? GAUGE_COLORS.green : GAUGE_COLORS.amber) : GAUGE_COLORS.tickMinor,
  };
  return <ReadoutView treatment={treatment} r={r} signalGlyph />;
}

function AltitudeReadout({ treatment }: { treatment: ReadoutTreatment }): JSX.Element {
  const { t } = useTranslation();
  const connected = useLinkUp();
  const msl = useTelemetryStore((s) => s.position.alt);
  const agl = useTelemetryStore((s) => s.position.relativeAlt);
  const altitudeUnit = useSettingsStore((s) => s.unitPreferences.altitude);

  const fmt = (m: number) => trimmed(altitudeValueFromMeters(m, altitudeUnit), UNIT_PRECISION.altitude[altitudeUnit]);
  const unit = UNIT_LABELS.altitude[altitudeUnit];
  const r: Readout = {
    tag: t('map:instrument.alt'),
    value: connected ? `${fmt(agl)}` : '--',
    detail: connected ? t('map:compactReadout.mslValue', { alt: fmt(msl), unit }) : t('map:compactReadout.mslNone'),
    fraction: null,
    known: connected,
    color: connected ? GAUGE_COLORS.text : GAUGE_COLORS.tickMinor,
  };
  return <ReadoutView treatment={treatment} r={r} />;
}

function SpeedReadout({ treatment }: { treatment: ReadoutTreatment }): JSX.Element {
  const { t } = useTranslation();
  const connected = useLinkUp();
  const groundspeed = useTelemetryStore((s) => s.vfrHud.groundspeed);
  const airspeed = useTelemetryStore((s) => s.vfrHud.airspeed);
  const speedUnit = useSettingsStore((s) => s.unitPreferences.speed);

  const fmt = (mps: number) => trimmed(speedValueFromMetersPerSecond(mps, speedUnit), UNIT_PRECISION.speed[speedUnit]);
  const unit = UNIT_LABELS.speed[speedUnit];
  const r: Readout = {
    tag: t('map:instrument.spd'),
    value: connected ? fmt(groundspeed) : '--',
    detail: connected ? t('map:compactReadout.airValue', { speed: fmt(airspeed), unit }) : t('map:compactReadout.airNone'),
    fraction: null,
    known: connected,
    color: connected ? GAUGE_COLORS.text : GAUGE_COLORS.tickMinor,
  };
  return <ReadoutView treatment={treatment} r={r} />;
}

function HeadingReadout({ treatment }: { treatment: ReadoutTreatment }): JSX.Element {
  const { t } = useTranslation();
  const connected = useLinkUp();
  const heading = useTelemetryStore((s) => s.vfrHud.heading);

  const deg = ((heading % 360) + 360) % 360;
  const r: Readout = {
    tag: t('map:instrument.hdg'),
    value: connected ? `${Math.round(deg)}°` : '--',
    detail: connected ? t(CARDINAL_KEYS[Math.floor(((deg + 22.5) % 360) / 45) % 8] ?? 'map:instrument.cardinalN') : '--',
    // Heading is the one unbounded quantity with a real range: a compass rose
    // is a full circle, so the fill reads as "where round the dial".
    fraction: connected ? deg / 360 : 0,
    known: connected,
    color: connected ? GAUGE_COLORS.text : GAUGE_COLORS.tickMinor,
  };
  return <ReadoutView treatment={treatment} r={r} />;
}

function VsiReadout({ treatment }: { treatment: ReadoutTreatment }): JSX.Element {
  const { t } = useTranslation();
  const connected = useLinkUp();
  const climb = useTelemetryStore((s) => s.vfrHud.climb);
  const verticalSpeedUnit = useSettingsStore((s) => s.unitPreferences.verticalSpeed);

  const value = verticalSpeedValueFromMetersPerSecond(climb, verticalSpeedUnit);
  const unit = UNIT_LABELS.verticalSpeed[verticalSpeedUnit];
  // Always signed with fixed decimals: a bare "0" vs a "+"/"-" prefix (and
  // trailing-zero trimming) changed the string width every tick, so the strip
  // jiggled as climb crossed zero. A constant sign + fixed places holds width.
  const vsiPrecision = UNIT_PRECISION.verticalSpeed[verticalSpeedUnit];
  const r: Readout = {
    tag: t('map:instrument.vsi'),
    value: connected ? `${value < 0 ? '-' : '+'}${Math.abs(value).toFixed(vsiPrecision)}` : '--',
    detail: connected ? unit : '--',
    fraction: null,
    known: connected,
    // Amber past 3 m/s either way, the same threshold as the VSI gauge.
    color: !connected ? GAUGE_COLORS.tickMinor : Math.abs(climb) > 3 ? GAUGE_COLORS.amber : GAUGE_COLORS.text,
  };
  return <ReadoutView treatment={treatment} r={r} />;
}

function HomeReadout({ treatment }: { treatment: ReadoutTreatment }): JSX.Element {
  const { t } = useTranslation();
  const connected = useLinkUp();
  const home = useMapHomeStore((s) => s.home);
  const lat = useTelemetryStore((s) => s.position.lat);
  const lon = useTelemetryStore((s) => s.position.lon);
  const distanceUnit = useSettingsStore((s) => s.unitPreferences.distance);

  const hasFix = connected && (lat !== 0 || lon !== 0);
  const active = !!home && hasFix;
  const distance = active ? haversineMeters(lat, lon, home[0], home[1]) : null;
  const r: Readout = {
    tag: t('map:instrument.home'),
    value: distance !== null ? formatDistanceFromMeters(distance, distanceUnit) : '--',
    detail: active ? t('map:compactReadout.toLaunch') : t('map:compactReadout.noHome'),
    fraction: null,
    known: active,
    color: active ? GAUGE_COLORS.green : GAUGE_COLORS.tickMinor,
  };
  return <ReadoutView treatment={treatment} r={r} />;
}

function LinkReadout({ treatment }: { treatment: ReadoutTreatment }): JSX.Element {
  const { t } = useTranslation();
  const connected = useLinkUp();
  const rssi = useTelemetryStore((s) => s.rcChannels.rssi);
  const chancount = useTelemetryStore((s) => s.rcChannels.chancount);
  const radioStatus = useTelemetryStore((s) => s.radioStatus);

  const state = rssiState({
    connected,
    rcRssi: rssi,
    chancount,
    modemRssi: radioStatus?.rssi ?? null,
  });
  const known = state.kind === 'value';
  const r: Readout = {
    tag: t('map:compactReadout.link'),
    value: known ? `${state.pct}%` : '--',
    detail: known ? (state.fromModem ? 'TLM RSSI' : 'RSSI') : state.kind === 'unconfigured' ? t('map:compactReadout.notSetUp') : t('map:compactReadout.noRssi'),
    fraction: known ? state.pct / 100 : 0,
    known,
    color: known ? bandColor(state.pct) : GAUGE_COLORS.tickMinor,
  };
  return <ReadoutView treatment={treatment} r={r} />;
}

/**
 * One widget, three treatments, every scalar instrument. Fixed source+treatment
 * per registry variant wrapper, so the source switch never crosses a hook.
 */
export function CompactReadout({ source, treatment }: { source: ReadoutSource; treatment: ReadoutTreatment }): JSX.Element {
  switch (source) {
    case 'battery':
      return <BatteryReadout treatment={treatment} />;
    case 'gps':
      return <GpsReadout treatment={treatment} />;
    case 'altitude':
      return <AltitudeReadout treatment={treatment} />;
    case 'speed':
      return <SpeedReadout treatment={treatment} />;
    case 'heading':
      return <HeadingReadout treatment={treatment} />;
    case 'vsi':
      return <VsiReadout treatment={treatment} />;
    case 'home':
      return <HomeReadout treatment={treatment} />;
    case 'link':
      return <LinkReadout treatment={treatment} />;
  }
}
