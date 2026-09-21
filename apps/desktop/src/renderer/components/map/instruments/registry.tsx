/**
 * Registry of the floating map instruments. Each entry is a self-contained
 * widget that subscribes to exactly the telemetry fields it renders, so the
 * per-second telemetry ticks re-render only the instruments that are visible.
 *
 * The five numeric instruments are round cockpit gauges on RoundGauge,
 * styled as siblings of the attitude ball overlay. flight-data stays a card.
 * Default positions stack down the LEFT edge of the map below the Instruments
 * menu button, spaced by the gauge diameter, so fresh instruments never
 * collide with the right-side toolbar, the bottom-center wind bar, or the
 * bottom-center attitude ball. flight-data defaults to the bottom-left slot
 * the old hardcoded stats card occupied. The heading gauge replaced the old
 * small CompassOverlay, so it ships visible and defaults to the old compass
 * spot beside the attitude ball. Users drag them anywhere from there.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { create } from 'zustand';
import { useTelemetryStore } from '../../../stores/telemetry-store';
import { useParameterStore } from '../../../stores/parameter-store';
import { useMissionStore } from '../../../stores/mission-store';
import { useSettingsStore } from '../../../stores/settings-store';
import {
  altitudeValueFromMeters,
  speedValueFromMetersPerSecond,
  verticalSpeedValueFromMetersPerSecond,
  formatAltitudeFromMeters,
  formatSpeedFromMetersPerSecond,
  formatDistanceFromMeters,
  UNIT_LABELS,
  UNIT_PRECISION,
} from '../../../../shared/user-units.js';
import { haversineMeters, bearingDeg } from '../traffic/proximity';
import { getModeCategory } from '../tactical-icon-pool';
import { AttitudeIndicator } from '../../panels/AttitudePanel';
import { RoundGauge, GAUGE_COLORS, gaugeArcPath, gaugePoint, valueToAngle, type GaugeScale } from './RoundGauge';

/** Inner consumption track, inside the 41 px charge arc. */
const USED_TRACK_R = 33;
import { InstrumentShell } from './InstrumentShell';
import { InstrumentStrip } from './InstrumentStrip';
import { FlightControlInstrument } from './FlightControlInstrument';
import { CompactReadout, type ReadoutSource } from './CompactReadout';
import { PANEL_WIDTH } from './stripMetrics';
import { useLinkUp, useHeartbeatAgeMs, HEARTBEAT_STALE_MS } from './useLinkUp';
import { useInDock } from './dock-context';
import { LinkInstrument } from './LinkInstrument';
import { useTelemetryFresh } from './useTelemetryFresh';
import { RtkInstrument } from './RtkInstrument';

/** An alternative rendering of an instrument, chosen per-instrument and
 * persisted alongside the analog/numeric choice. */
export interface MapInstrumentVariant {
  /** Persisted key; also the value stored in the display-mode map. */
  id: string;
  label: string;
  Component: () => JSX.Element;
  /** This variant draws a round dial, so a docked group shapes around it. */
  round?: boolean;
}

/** Which kind of vehicle an instrument is for. Untagged = both. */
export type InstrumentProfile = 'air' | 'ground';

export interface MapInstrumentDef {
  id: string;
  label: string;
  defaultClassName: string;
  defaultVisible: boolean;
  Component: () => JSX.Element;
  /** Numeric readout alternative; instruments without one are analog-only. */
  NumericComponent?: () => JSX.Element;
  /** Extra display forms (strip/cell/inline) offered beside analog/numeric.
   * Instruments without any behave exactly as before. */
  variants?: MapInstrumentVariant[];
  /** Renders as a round gauge in analog mode; a docked group holding one
   * becomes a tray instead of a merged card. */
  round?: boolean;
  /** Fixed battery monitor this instrument watches (0-based MAVLink id).
   * The catalog offers it only while the vehicle streams that monitor. */
  monitorId?: number;
  /** Vehicle profiles this instrument belongs to; absent means every one. The
   * catalog hides the others, but one already placed stays placed. */
  profiles?: InstrumentProfile[];
}

/** True when the instrument belongs on this kind of vehicle. */
export function instrumentSuitsProfile(def: MapInstrumentDef, profile: InstrumentProfile): boolean {
  return def.profiles === undefined || def.profiles.includes(profile);
}

/** Component for the persisted display mode; mirrors InstrumentSlot's pick. */
export function resolveInstrumentComponent(def: MapInstrumentDef, mode: string): () => JSX.Element {
  const variant = def.variants?.find((v) => v.id === mode);
  if (variant) return variant.Component;
  if (mode === 'numeric' && def.NumericComponent) return def.NumericComponent;
  return def.Component;
}

/** True when the instrument shows its round-gauge face in the given mode. */
export function isRoundInMode(def: MapInstrumentDef, mode: string): boolean {
  const variant = def.variants?.find((v) => v.id === mode);
  if (variant) return variant.round === true;
  return def.round === true && mode === 'analog';
}

/** The three compact-readout treatments every wired scalar source offers. */
function compactVariants(source: ReadoutSource): MapInstrumentVariant[] {
  return [
    { id: 'strip', label: 'Strip', Component: () => <CompactReadout source={source} treatment="strip" /> },
    { id: 'cell', label: 'Cell', Component: () => <CompactReadout source={source} treatment="cell" /> },
    { id: 'inline', label: 'Inline', Component: () => <CompactReadout source={source} treatment="inline" /> },
  ];
}

/**
 * Home position lives in MapPanel's local state (first-fix capture + the Set
 * Home button); it is mirrored here so the flight-data instrument, which is a
 * registry component with no access to that panel, can render Home/Brng.
 */
export const useMapHomeStore = create<{
  home: [number, number] | null;
  setHome: (home: [number, number] | null) => void;
}>((set) => ({
  home: null,
  setHome: (home) => set({ home }),
}));

function trimmed(value: number, decimals: number): string {
  return String(Number(value.toFixed(decimals)));
}

const BATTERY_SCALE: GaugeScale = {
  min: 0,
  max: 100,
  startAngle: -135,
  endAngle: 135,
  zones: [
    { from: 0, to: 15, color: GAUGE_COLORS.red },
    { from: 15, to: 30, color: GAUGE_COLORS.amber },
    { from: 30, to: 100, color: GAUGE_COLORS.green },
  ],
  majorTicks: [0, 50, 100],
  minorTicks: [25, 75],
};

/** "B{n}" chip on the BAT instrument, shown only when the vehicle streams
 * more than one monitor. One click cycles to the next monitor (every display
 * follows); the tooltip lists all packs live. Detailed rows live in the
 * Battery panel. Needs pointer-events-auto: the gauge center slot disables
 * pointer events so clicks fall through to the map drag. */
function BatteryMonitorBadge({ className }: { className?: string }): JSX.Element | null {
  const batteries = useTelemetryStore((s) => s.batteries);
  const primaryBatteryId = useTelemetryStore((s) => s.primaryBatteryId);
  const setPrimaryBattery = useTelemetryStore((s) => s.setPrimaryBattery);
  const ids = Object.values(batteries).map((b) => b.id).sort((a, b) => a - b);
  if (ids.length <= 1) return null;
  const effective = primaryBatteryId ?? 0;
  const next = ids[(ids.indexOf(effective) + 1) % ids.length] ?? 0;
  const tip = Object.values(batteries)
    .sort((a, b) => a.id - b.id)
    .map((b) => `B${b.id + 1}: ${b.voltage.toFixed(1)}V ${b.remaining >= 0 ? Math.round(b.remaining) + '%' : '-'}`)
    .join('   ');
  return (
    <button
      type="button"
      onClick={() => setPrimaryBattery(next)}
      data-tip={`Switch to B${next + 1}. ${tip}`}
      className={
        'pointer-events-auto text-[9px] font-semibold leading-none px-1.5 py-[3px] rounded border border-[var(--gauge-bezel-edge)] ' +
        'text-[var(--gauge-text-dim)] hover:text-[var(--gauge-text)] hover:border-[var(--gauge-text-dim)] transition-colors ' + (className ?? '')
      }
    >
      B{effective + 1} {'\u21C4'}
    </button>
  );
}

/** Live data for one FIXED battery monitor (0-based MAVLink id), with its
 * own freshness (the shared slot stamps only track the primary). */
function useBatteryInstance(monitorId: number): { voltage: number; remaining: number; fresh: boolean } {
  const inst = useTelemetryStore((s) => s.batteries[monitorId]);
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return {
    voltage: inst?.voltage ?? 0,
    remaining: inst?.remaining ?? -1,
    fresh: !!inst && Date.now() - inst.updatedAt < 5000,
  };
}

function makeBatteryInstanceGauge(monitorId: number): () => JSX.Element {
  return function BatteryInstanceGauge(): JSX.Element {
    const { voltage, remaining, fresh } = useBatteryInstance(monitorId);
    const known = fresh && remaining >= 0;
    const valueColor = !known ? 'text-[var(--gauge-text)]' : remaining > 30 ? 'text-[var(--gauge-green)]' : remaining > 15 ? 'text-[var(--gauge-amber)]' : 'text-[var(--gauge-red)]';
    return (
      <RoundGauge label={`BAT${monitorId + 1}`} scale={BATTERY_SCALE} needleValue={known ? remaining : null}>
        <span className={`text-[15px] font-semibold leading-none ${valueColor}`}>
          {fresh ? voltage.toFixed(1) : '--'}
          {fresh && <span className="text-[8px] font-normal text-[var(--gauge-text-dim)] ml-0.5">V</span>}
        </span>
        <span className="mt-1 text-[9px] leading-none text-[var(--gauge-text-dim)]">
          {known ? `${Math.round(remaining)}%` : '--%'}
        </span>
      </RoundGauge>
    );
  };
}

function makeBatteryInstanceNumeric(monitorId: number): () => JSX.Element {
  return function BatteryInstanceNumeric(): JSX.Element {
    const { voltage, remaining, fresh } = useBatteryInstance(monitorId);
    const known = fresh && remaining >= 0;
    const valueClassName = !known ? undefined : remaining > 30 ? 'text-[var(--gauge-green)]' : remaining > 15 ? 'text-[var(--gauge-amber)]' : 'text-[var(--gauge-red)]';
    return (
      <NumericReadout
        label={`BAT${monitorId + 1}`}
        value={fresh ? voltage.toFixed(1) : '--'}
        unit={fresh ? 'V' : undefined}
        sub={known ? `${Math.round(remaining)}%` : '--%'}
        valueClassName={valueClassName}
      />
    );
  };
}

function BatteryInstrument(): JSX.Element {
  const connected = useTelemetryFresh('battery');
  const voltage = useTelemetryStore((s) => s.battery.voltage);
  const remaining = useTelemetryStore((s) => s.battery.remaining);

  const known = connected && remaining >= 0;
  const valueColor = !known ? 'text-[var(--gauge-text)]' : remaining > 30 ? 'text-[var(--gauge-green)]' : remaining > 15 ? 'text-[var(--gauge-amber)]' : 'text-[var(--gauge-red)]';

  return (
    <RoundGauge label="BAT" scale={BATTERY_SCALE} needleValue={known ? remaining : null}>
      <span className={`text-[15px] font-semibold leading-none ${valueColor}`}>
        {connected ? voltage.toFixed(1) : '--'}
        {connected && <span className="text-[8px] font-normal text-[var(--gauge-text-dim)] ml-0.5">V</span>}
      </span>
      <span className="mt-1 text-[9px] leading-none text-[var(--gauge-text-dim)]">
        {known ? `${Math.round(remaining)}%` : '--%'}
      </span>
      <BatteryMonitorBadge className="mt-1" />
    </RoundGauge>
  );
}

/**
 * Battery with consumption as a second track.
 *
 * A gauge reads through pointer-against-scale and colour, with one numeral for
 * precision. So charge keeps the rim pointer and the coloured arc, consumption
 * gets its own inner track that fills as the pack is spent, and the only text
 * is the voltage. Earlier revisions put the second value in 9 px type, which
 * is unreadable at a glance and wastes the dial.
 */
function BatteryUsedInstrument(): JSX.Element {
  const connected = useTelemetryFresh('battery');
  const voltage = useTelemetryStore((s) => s.battery.voltage);
  const remaining = useTelemetryStore((s) => s.battery.remaining);
  const drawn = useTelemetryStore((s) => s.battery.mahDrawn);
  const capacityMah = useParameterStore((s) => s.parameters.get('BATT_CAPACITY')?.value as number | undefined);

  const known = connected && remaining >= 0;
  const valueColor = !known
    ? 'text-[var(--gauge-text)]'
    : remaining > 30 ? 'text-[var(--gauge-green)]' : remaining > 15 ? 'text-[var(--gauge-amber)]' : 'text-[var(--gauge-red)]';

  const usedPct = connected && typeof drawn === 'number' && drawn >= 0 && capacityMah && capacityMah > 0
    ? Math.min(100, (drawn / capacityMah) * 100)
    : null;

  // Inner track: an unlit groove that fills from the empty end as capacity is
  // spent, so "how much is gone" is a length, not a number to read.
  const usedTrack = (
    <>
      <path
        d={gaugeArcPath(USED_TRACK_R, BATTERY_SCALE.startAngle, BATTERY_SCALE.endAngle)}
        fill="none"
        stroke="var(--gauge-text-dim)"
        strokeWidth="2.5"
        opacity="0.25"
      />
      {usedPct !== null && usedPct > 0.5 && (
        <path
          d={gaugeArcPath(USED_TRACK_R, BATTERY_SCALE.startAngle, valueToAngle(usedPct, BATTERY_SCALE))}
          fill="none"
          stroke={GAUGE_COLORS.amber}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      )}
    </>
  );

  return (
    <RoundGauge label="BAT" scale={BATTERY_SCALE} needleValue={known ? remaining : null} svgContent={usedTrack}>
      <span className={`text-[19px] font-semibold leading-none ${valueColor}`}>
        {connected ? voltage.toFixed(1) : '--'}
        {connected && <span className="text-[9px] font-normal text-[var(--gauge-text-dim)] ml-0.5">V</span>}
      </span>
      <BatteryMonitorBadge className="mt-1.5" />
    </RoundGauge>
  );
}

// Short faces of GPS_FIX_TYPES in shared/telemetry-types.ts, keyed by the same
// fixType codes; anything unknown reads as no fix.
// "FLOAT" not "RTK F": to a pilot "RTK F" reads as Fixed.
const GPS_FIX_SHORT: Record<number, string> = {
  2: '2D',
  3: '3D',
  4: 'DGPS',
  5: 'FLOAT',
  6: 'RTK',
};

const GPS_SEGMENTS = 14;

// Ring of satellite-count segments spanning 300 degrees (bottom gap holds the
// label), lit progressively from the scale start.
function GpsSegmentRing({ lit, color }: { lit: number; color: string }): JSX.Element {
  const span = 300 / GPS_SEGMENTS;
  return (
    <>
      {Array.from({ length: GPS_SEGMENTS }, (_, i) => {
        const a1 = -150 + i * span + 2;
        const a2 = -150 + (i + 1) * span - 2;
        return (
          <path
            key={i}
            d={gaugeArcPath(41, a1, a2)}
            fill="none"
            stroke={i < lit ? color : GAUGE_COLORS.bezelEdge}
            strokeWidth="4"
          />
        );
      })}
    </>
  );
}

function GpsInstrument(): JSX.Element {
  const connected = useTelemetryFresh('gps');
  const fixType = useTelemetryStore((s) => s.gps.fixType);
  const satellites = useTelemetryStore((s) => s.gps.satellites);

  const fixColor = !connected ? 'text-[var(--gauge-text)]' : fixType >= 3 ? 'text-[var(--gauge-green)]' : fixType >= 2 ? 'text-[var(--gauge-amber)]' : 'text-[var(--gauge-red)]';
  const segColor = fixType >= 3 ? GAUGE_COLORS.green : fixType >= 2 ? GAUGE_COLORS.amber : GAUGE_COLORS.red;
  const lit = connected ? Math.min(GPS_SEGMENTS, Math.max(0, satellites)) : 0;

  return (
    <RoundGauge label="GPS" svgContent={<GpsSegmentRing lit={lit} color={segColor} />}>
      <span className={`text-[12px] font-semibold leading-none whitespace-nowrap ${fixColor}`}>
        {connected ? (GPS_FIX_SHORT[fixType] ?? 'NO FIX') : '--'}
      </span>
      <span className="mt-1 text-[9px] leading-none text-[var(--gauge-text-dim)]">
        {connected ? `${satellites} sats` : '-- sats'}
      </span>
    </RoundGauge>
  );
}

// Right-side vertical-speed indicator: arrow deflects up/down proportional to
// climb clamped to +/-5 m/s, neutral at level; tiny converted value above it.
function VsiIndicator({ climb, connected, climbText }: { climb: number; connected: boolean; climbText: string }): JSX.Element {
  const dy = connected ? -(Math.max(-5, Math.min(5, climb)) / 5) * 15 : 0;
  return (
    <g>
      <line x1="83" y1="36" x2="83" y2="68" stroke={GAUGE_COLORS.tickMinor} strokeWidth="1" />
      <line x1="80" y1="52" x2="86" y2="52" stroke={GAUGE_COLORS.tickMajor} strokeWidth="1" />
      <polygon points="76,49.5 76,54.5 82.5,52" fill={GAUGE_COLORS.needle} transform={`translate(0 ${dy})`} />
      <text x="83" y="31" textAnchor="middle" fontSize="6" fill={GAUGE_COLORS.textDim}>
        {connected ? climbText : ''}
      </text>
    </g>
  );
}

function AltitudeInstrument(): JSX.Element {
  const connected = useTelemetryFresh('position');
  const msl = useTelemetryStore((s) => s.position.alt);
  const agl = useTelemetryStore((s) => s.position.relativeAlt);
  const climb = useTelemetryStore((s) => s.vfrHud.climb);
  const altitudeUnit = useSettingsStore((s) => s.unitPreferences.altitude);
  const verticalSpeedUnit = useSettingsStore((s) => s.unitPreferences.verticalSpeed);

  const fmtAlt = (m: number) => trimmed(altitudeValueFromMeters(m, altitudeUnit), UNIT_PRECISION.altitude[altitudeUnit]);
  const climbValue = verticalSpeedValueFromMetersPerSecond(climb, verticalSpeedUnit);
  const climbText = `${climbValue > 0 ? '+' : ''}${trimmed(climbValue, UNIT_PRECISION.verticalSpeed[verticalSpeedUnit])}`;

  return (
    <RoundGauge label="ALT" svgContent={<VsiIndicator climb={climb} connected={connected} climbText={climbText} />}>
      <span className="text-[15px] font-semibold leading-none text-[var(--gauge-text)] whitespace-nowrap">
        {connected ? fmtAlt(agl) : '--'}
        {connected && <span className="text-[8px] font-normal text-[var(--gauge-text-dim)] ml-0.5">{UNIT_LABELS.altitude[altitudeUnit]}</span>}
      </span>
      <span className="mt-1 text-[8px] leading-none text-[var(--gauge-text-dim)] whitespace-nowrap">
        MSL {connected ? fmtAlt(msl) : '--'}
      </span>
    </RoundGauge>
  );
}

function SpeedInstrument(): JSX.Element {
  const connected = useTelemetryFresh('vfrHud');
  const groundspeed = useTelemetryStore((s) => s.vfrHud.groundspeed);
  const airspeed = useTelemetryStore((s) => s.vfrHud.airspeed);
  const speedUnit = useSettingsStore((s) => s.unitPreferences.speed);

  const gs = speedValueFromMetersPerSecond(groundspeed, speedUnit);
  const air = speedValueFromMetersPerSecond(airspeed, speedUnit);
  const fmt = (v: number) => trimmed(v, UNIT_PRECISION.speed[speedUnit]);

  // Sticky auto-scale with guaranteed headroom: the arc grows the moment the
  // needle would pass 80% of it, but shrinks only after the speed has stayed
  // low for a while. Rescaling mid-sweep makes the needle visibly leap, so
  // it must be rare and never flap on jitter around a step boundary.
  const needed = Math.max(10, Math.ceil((gs * 1.25) / 5) * 5);
  const [max, setMax] = useState(10);
  const shrinkSinceRef = useRef<number | null>(null);
  useEffect(() => {
    if (needed > max) {
      setMax(needed);
      shrinkSinceRef.current = null;
    } else if (needed < max) {
      if (shrinkSinceRef.current === null) shrinkSinceRef.current = Date.now();
      else if (Date.now() - shrinkSinceRef.current > 5000) {
        setMax(needed);
        shrinkSinceRef.current = null;
      }
    } else {
      shrinkSinceRef.current = null;
    }
  }, [needed, max, gs]);
  const step = max / 5;
  const majorTicks = Array.from({ length: 6 }, (_, i) => i * step);
  const scale: GaugeScale = {
    min: 0,
    max,
    startAngle: -135,
    endAngle: 135,
    majorTicks,
    minorTicks: Array.from({ length: 5 }, (_, i) => i * step + step / 2),
  };

  return (
    <RoundGauge
      label="SPD"
      scale={scale}
      needleValue={connected ? gs : null}
      svgContent={
        <>
          {majorTicks.map((v) => {
            const t = v / max;
            const [x, y] = gaugePoint(30, -135 + t * 270);
            return (
              <text key={v} x={x} y={y + 2} textAnchor="middle" fontSize="5.5" fill={GAUGE_COLORS.textDim}>
                {v}
              </text>
            );
          })}
        </>
      }
    >
      <span className="text-[15px] font-semibold leading-none text-[var(--gauge-text)]">
        {connected ? fmt(gs) : '--'}
        {connected && <span className="text-[8px] font-normal text-[var(--gauge-text-dim)] ml-0.5">{UNIT_LABELS.speed[speedUnit]}</span>}
      </span>
      {connected && air > 0 && (
        <span className="mt-1 text-[8px] leading-none text-[var(--gauge-text-dim)] whitespace-nowrap">
          AIR {fmt(air)}
        </span>
      )}
    </RoundGauge>
  );
}

const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const CARDINAL_LETTERS = ['N', 'E', 'S', 'W'];

// Rotating rose (current heading at the top lubber line, like CompassOverlay's
// bigger sibling): cardinal + 30-degree ticks, letters oriented radially.
function HeadingRose({ heading }: { heading: number }): JSX.Element {
  return (
    <>
      <g transform={`rotate(${-heading} 52 52)`}>
        {Array.from({ length: 12 }, (_, i) => {
          const d = i * 30;
          const cardinal = d % 90 === 0;
          const [x1, y1] = gaugePoint(43, d);
          const [x2, y2] = gaugePoint(cardinal ? 36.5 : 39.5, d);
          return (
            <g key={d}>
              <line
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={d === 0 ? GAUGE_COLORS.north : cardinal ? '#fff' : GAUGE_COLORS.tickMajor}
                strokeWidth={cardinal ? 1.8 : 1}
              />
              {cardinal && (
                <g transform={`rotate(${d} 52 52)`}>
                  <text x="52" y="24" textAnchor="middle" fontSize="8" fontWeight="600" fill="#fff">
                    {CARDINAL_LETTERS[d / 90]}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </g>
      {/* Fixed lubber mark */}
      <polygon points="52,17 48,9 56,9" fill={GAUGE_COLORS.lubber} stroke={GAUGE_COLORS.bezel} strokeWidth="0.5" />
    </>
  );
}

function HeadingInstrument(): JSX.Element {
  const connected = useTelemetryFresh('vfrHud');
  const heading = useTelemetryStore((s) => s.vfrHud.heading);

  const deg = Math.round(heading) % 360;
  const cardinal = CARDINALS[Math.round(deg / 45) % 8];

  return (
    <RoundGauge label="HDG" svgContent={<HeadingRose heading={connected ? heading : 0} />}>
      <span className="text-[15px] font-semibold leading-none text-[var(--gauge-text)]">
        {connected ? deg : '--'}
        {connected && <span className="text-[8px] font-normal text-[var(--gauge-text-dim)] ml-0.5">°</span>}
      </span>
      <span className="mt-1 text-[9px] leading-none text-[var(--gauge-text-dim)]">
        {connected ? cardinal : ''}
      </span>
    </RoundGauge>
  );
}

/**
 * The bottom-left MSL/Rel/Spd/Hdg/Home/Brng card that used to be hardcoded in
 * MapPanel's 2D view; moved here unchanged so it is toggleable and draggable
 * like the rest. Home distance/bearing mirror MapPanel's homeStats: measured
 * from the GPS position when the fix is valid, else from home itself (0 m).
 */
function FlightDataInstrument(): JSX.Element {
  const lat = useTelemetryStore((s) => s.gps.lat);
  const lon = useTelemetryStore((s) => s.gps.lon);
  const fixType = useTelemetryStore((s) => s.gps.fixType);
  const msl = useTelemetryStore((s) => s.position.alt);
  const rel = useTelemetryStore((s) => s.position.relativeAlt);
  const groundspeed = useTelemetryStore((s) => s.vfrHud.groundspeed);
  const heading = useTelemetryStore((s) => s.vfrHud.heading);
  const altitudeUnit = useSettingsStore((s) => s.unitPreferences.altitude);
  const speedUnit = useSettingsStore((s) => s.unitPreferences.speed);
  const distanceUnit = useSettingsStore((s) => s.unitPreferences.distance);
  const home = useMapHomeStore((s) => s.home);

  const hasValidGps = fixType >= 2 && lat !== 0 && lon !== 0;
  const from: [number, number] | null = hasValidGps ? [lat, lon] : home;
  const homeStats = home && from
    ? { distance: haversineMeters(from[0], from[1], home[0], home[1]), bearing: bearingDeg(from[0], from[1], home[0], home[1]) }
    : null;
  const inDock = useInDock();

  return (
    <div
      className={`px-3 py-2 text-xs space-y-1 font-mono ${inDock ? '' : 'rounded-lg shadow-xl'}`}
      style={{
        ...(inDock ? {} : { background: GAUGE_COLORS.face, border: `1.5px solid ${GAUGE_COLORS.bezelEdge}` }),
        color: GAUGE_COLORS.text,
        width: PANEL_WIDTH,
      }}
    >
      <div className="flex justify-between">
        <span className="text-[var(--gauge-text-dim)]">MSL</span>
        <span className="font-mono text-[var(--gauge-text)]">{formatAltitudeFromMeters(msl, altitudeUnit)}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-[var(--gauge-text-dim)]">Rel</span>
        <span className="font-mono text-[var(--gauge-text)]">{formatAltitudeFromMeters(rel, altitudeUnit)}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-[var(--gauge-text-dim)]">Spd</span>
        <span className="font-mono text-[var(--gauge-text)]">{formatSpeedFromMetersPerSecond(groundspeed, speedUnit)}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-[var(--gauge-text-dim)]">Hdg</span>
        <span className="font-mono text-[var(--gauge-text)]">{heading.toFixed(0)}<span className="text-[var(--gauge-text-dim)] ml-0.5">°</span></span>
      </div>
      {homeStats && (
        <>
          <div className="my-1" style={{ borderTop: `1px solid ${GAUGE_COLORS.bezelEdge}` }} />
          <div className="flex justify-between">
            <span className="text-[var(--gauge-text-dim)]">Home</span>
            <span className="font-mono text-[var(--gauge-green)]">{formatDistanceFromMeters(homeStats.distance, distanceUnit)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--gauge-text-dim)]">Brng</span>
            {/* Bearing to a point you are standing on is undefined: within GPS
                noise of home (~sub-meter jitter) it swings tens of degrees per
                sample. Blank it until the distance makes direction meaningful. */}
            {homeStats.distance >= 5 ? (
              <span className="font-mono text-[var(--gauge-green)]">{homeStats.bearing.toFixed(0)}<span className="text-[var(--gauge-text-dim)] ml-0.5">°</span></span>
            ) : (
              <span className="font-mono text-[var(--gauge-text-dim)]">--</span>
            )}
          </div>
        </>
      )}
      {hasValidGps && (
        <>
          <div className="my-1" style={{ borderTop: `1px solid ${GAUGE_COLORS.bezelEdge}` }} />
          <div className="text-[10px] text-[var(--gauge-text-dim)] font-mono">
            {lat.toFixed(6)}, {lon.toFixed(6)}
          </div>
        </>
      )}
    </div>
  );
}

const VSI_LIMIT = 5;

// Real-VSI geometry: zero rests at 9 o'clock, climb sweeps clockwise through
// 12 to +5 near 1:30, descent counter-clockwise through 6 to -5 near 4:30;
// the 3 o'clock gap is where the amber zones end.
const VSI_SCALE: GaugeScale = {
  min: -VSI_LIMIT,
  max: VSI_LIMIT,
  startAngle: -225,
  endAngle: 45,
  zones: [
    { from: -VSI_LIMIT, to: -3, color: GAUGE_COLORS.amber },
    { from: 3, to: VSI_LIMIT, color: GAUGE_COLORS.amber },
  ],
  majorTicks: [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5],
  minorTicks: [-4.5, -3.5, -2.5, -1.5, -0.5, 0.5, 1.5, 2.5, 3.5, 4.5],
};

function VsiInstrument(): JSX.Element {
  const connected = useTelemetryFresh('vfrHud');
  const climb = useTelemetryStore((s) => s.vfrHud.climb);
  const verticalSpeedUnit = useSettingsStore((s) => s.unitPreferences.verticalSpeed);

  const toUnit = (mps: number) => verticalSpeedValueFromMetersPerSecond(mps, verticalSpeedUnit);
  const value = toUnit(climb);
  const valueText = `${value > 0 ? '+' : ''}${trimmed(value, UNIT_PRECISION.verticalSpeed[verticalSpeedUnit])}`;
  const valueColor = connected && Math.abs(climb) > 3 ? 'text-[var(--gauge-amber)]' : 'text-[var(--gauge-text)]';

  return (
    <RoundGauge
      label="VSI"
      scale={VSI_SCALE}
      // 0, not null: parking a VSI needle at scale min would read as a -5 dive.
      needleValue={connected ? climb : 0}
      svgContent={
        <>
          {[-VSI_LIMIT, 0, VSI_LIMIT].map((v) => {
            const [x, y] = gaugePoint(29, valueToAngle(v, VSI_SCALE));
            return (
              <text key={v} x={x} y={y + 2} textAnchor="middle" fontSize="5.5" fill={GAUGE_COLORS.textDim}>
                {trimmed(toUnit(v), 0)}
              </text>
            );
          })}
        </>
      }
    >
      <span className={`text-[14px] font-semibold leading-none whitespace-nowrap ${valueColor}`}>
        {connected ? valueText : '--'}
      </span>
      <span className="mt-1 text-[8px] leading-none text-[var(--gauge-text-dim)]">
        {UNIT_LABELS.verticalSpeed[verticalSpeedUnit]}
      </span>
    </RoundGauge>
  );
}

/** Rollover awareness, not an artificial horizon: a driver needs to know how
 * far the machine is leaning and how close that is to going over. */
const TILT_LIMIT = 45;
const TILT_CAUTION = 20;
const TILT_SCALE: GaugeScale = {
  min: -TILT_LIMIT,
  max: TILT_LIMIT,
  startAngle: -110,
  endAngle: 110,
  zones: [
    { from: -TILT_LIMIT, to: -TILT_CAUTION, color: GAUGE_COLORS.amber },
    { from: TILT_CAUTION, to: TILT_LIMIT, color: GAUGE_COLORS.amber },
  ],
  majorTicks: [-45, -30, -20, -10, 0, 10, 20, 30, 45],
  minorTicks: [-40, -35, -25, -15, -5, 5, 15, 25, 35, 40],
};

function TiltInstrument(): JSX.Element {
  const attitude = useTelemetryStore((s) => s.attitude);
  const fresh = useTelemetryFresh('attitude');
  const roll = attitude.roll;
  const pitch = attitude.pitch;
  const lean = Math.max(Math.abs(roll), Math.abs(pitch));
  const color =
    !fresh ? GAUGE_COLORS.textDim
      : lean >= 30 ? GAUGE_COLORS.red
        : lean >= TILT_CAUTION ? GAUGE_COLORS.amber
          : GAUGE_COLORS.green;
  const shown = fresh ? Math.max(-TILT_LIMIT, Math.min(TILT_LIMIT, roll)) : 0;

  return (
    <RoundGauge
      label="TILT"
      scale={TILT_SCALE}
      needleValue={shown}
      svgContent={
        // A horizon, not a picture of a vehicle: it tips with roll, which is
        // what this gauge measures. A side-on car reads as pitch, and the two
        // are the one thing that must not be confused when the machine is on
        // a slope.
        <g opacity={fresh ? 1 : 0.35}>
          <clipPath id="svt-tilt-face">
            <circle cx="52" cy="52" r="30" />
          </clipPath>
          <g clipPath="url(#svt-tilt-face)">
            <g transform={`rotate(${-shown} 52 46)`}>
              <rect x="10" y="46" width="84" height="40" fill={color} opacity="0.18" />
              <line x1="10" y1="46" x2="94" y2="46" stroke={color} strokeWidth="2" />
            </g>
          </g>
          {/* Fixed reference: the vehicle stays level, the world tips. */}
          <path d="M44 46 L50 46 L52 49 L54 46 L60 46" fill="none"
            stroke={GAUGE_COLORS.text} strokeWidth="1.8" strokeLinejoin="round" />
        </g>
      }
    >
      {/* Pushed below the horizon so the needle and the numbers never overlap. */}
      <span className="mt-[26px] text-[13px] font-semibold leading-none whitespace-nowrap" style={{ color }}>
        {fresh ? `${roll > 0 ? 'R' : roll < 0 ? 'L' : ''} ${Math.abs(Math.round(roll))}\u00b0` : '--'}
      </span>
      <span className="mt-0.5 text-[8px] leading-none text-[var(--gauge-text-dim)]">
        {fresh ? `PITCH ${Math.round(pitch)}\u00b0` : 'ROLL'}
      </span>
    </RoundGauge>
  );
}

/** Steering demand, read from servo output 1 (ArduPilot Rover's ground-steering
 * channel). Skid-steer frames drive the wheels instead, so this reads centred
 * there and the instrument can simply be left off. */
function steerPercent(pwm: number | undefined): number | null {
  if (pwm === undefined || pwm < 800 || pwm > 2200) return null;
  return Math.max(-100, Math.min(100, ((pwm - 1500) / 500) * 100));
}

function SteerInstrument(): JSX.Element {
  const pwm = useTelemetryStore((s) => s.servoOutput?.outputs[0]);
  const throttlePwm = useTelemetryStore((s) => s.servoOutput?.outputs[2]);
  const steer = steerPercent(pwm);
  const throttle = steerPercent(throttlePwm);
  const magnitude = steer === null ? 0 : Math.abs(steer);

  return (
    <InstrumentShell
      label="Steer"
      value={steer === null ? '--' : magnitude < 1 ? 'CTR' : `${steer < 0 ? 'L' : 'R'} ${Math.round(magnitude)}`}
      unit={steer === null || magnitude < 1 ? undefined : '%'}
    >
      <div className="relative h-1.5 w-full rounded-full bg-surface-raised">
        <div className="absolute inset-y-0 left-1/2 w-px bg-content-tertiary/60" />
        {steer !== null && (
          <div
            className="absolute inset-y-0 rounded-full bg-blue-500/70"
            style={{
              left: steer < 0 ? `${50 - magnitude / 2}%` : '50%',
              width: `${magnitude / 2}%`,
            }}
          />
        )}
      </div>
      {throttle !== null && (
        <div className="text-[10px] text-content-tertiary">
          THR {throttle > 0 ? '+' : ''}{Math.round(throttle)}%
        </div>
      )}
    </InstrumentShell>
  );
}

/** Cross-track error while following a mission: how far off the line the
 * machine is, and which side, which is the number a driver steers back on. */
function XtrackInstrument(): JSX.Element {
  const nav = useTelemetryStore((s) => s.navController);
  const distanceUnit = useSettingsStore((s) => s.unitPreferences.distance);
  const xtrack = nav?.xtrackError;
  const magnitude = xtrack === undefined ? null : Math.abs(xtrack);

  return (
    <InstrumentShell
      label="Xtrack"
      value={
        xtrack === undefined || magnitude === null
          ? '--'
          : `${xtrack < 0 ? 'L' : 'R'} ${formatDistanceFromMeters(magnitude, distanceUnit)}`
      }
      valueClassName={magnitude !== null && magnitude > 5 ? 'text-amber-400' : undefined}
    >
      <div className="text-[10px] text-content-tertiary">
        {nav?.wpDist === undefined ? 'No active leg' : `WP ${formatDistanceFromMeters(nav.wpDist, distanceUnit)}`}
      </div>
    </InstrumentShell>
  );
}

function HomeInstrument(): JSX.Element {
  const connected = useTelemetryFresh('position');
  const home = useMapHomeStore((s) => s.home);
  const lat = useTelemetryStore((s) => s.position.lat);
  const lon = useTelemetryStore((s) => s.position.lon);
  const heading = useTelemetryStore((s) => s.vfrHud.heading);
  const distanceUnit = useSettingsStore((s) => s.unitPreferences.distance);

  const hasFix = connected && (lat !== 0 || lon !== 0);
  const active = !!home && hasFix;
  const bearing = active ? bearingDeg(lat, lon, home[0], home[1]) : 0;
  const distance = active ? haversineMeters(lat, lon, home[0], home[1]) : null;

  return (
    <RoundGauge
      label="HOME"
      svgContent={
        // Rotated by bearing MINUS heading (OSD home-arrow convention): it
        // points the turn the pilot must make, not the map direction of home.
        <g transform={`rotate(${active ? bearing - heading : 0} 52 52)`} opacity={active ? 1 : 0.35}>
          <polygon
            points="52,11 44,25 49.5,22 49.5,33 54.5,33 54.5,22 60,25"
            fill={active ? GAUGE_COLORS.green : GAUGE_COLORS.tickMajor}
            stroke={GAUGE_COLORS.bezel}
            strokeWidth="0.5"
          />
        </g>
      }
    >
      <span className="text-[12px] font-semibold leading-none whitespace-nowrap text-[var(--gauge-text)]">
        {distance !== null ? formatDistanceFromMeters(distance, distanceUnit) : '--'}
      </span>
      <span className="mt-1 text-[8px] leading-none text-[var(--gauge-text-dim)]">
        {active ? `BRG ${Math.round((bearing + 360) % 360)}°` : ''}
      </span>
    </RoundGauge>
  );
}

/**
 * Shared card for the numeric display mode of the round gauges. Same
 * gauge-face palette as the analog instruments (white face + near-black
 * digits in light, dark face + white digits in dark), big tabular digits so
 * it stays readable at a glance in the field.
 */
function NumericReadout({
  label,
  value,
  unit,
  sub,
  valueClassName,
  footer,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  valueClassName?: string;
  footer?: React.ReactNode;
}): JSX.Element {
  const inDock = useInDock();
  return (
    <div
      className={`px-3 pt-1.5 pb-2 min-w-[100px] select-none ${inDock ? '' : 'rounded-lg shadow-xl'}`}
      style={{
        ...(inDock ? {} : { background: GAUGE_COLORS.face, border: `1.5px solid ${GAUGE_COLORS.bezelEdge}` }),
        color: GAUGE_COLORS.text,
      }}
    >
      <div className="text-[9px] font-semibold tracking-[0.14em] leading-none text-[var(--gauge-text-dim)]">{label}</div>
      <div className="mt-1.5 flex items-baseline gap-1 whitespace-nowrap">
        <span className={`text-[22px] font-bold leading-none tabular-nums ${valueClassName ?? 'text-[var(--gauge-text)]'}`}>
          {value}
        </span>
        {unit && <span className="text-[10px] font-medium text-[var(--gauge-text-dim)]">{unit}</span>}
      </div>
      <div className="mt-1 text-[9px] leading-none text-[var(--gauge-text-dim)] whitespace-nowrap min-h-[9px]">{sub ?? ''}</div>
      {footer}
    </div>
  );
}

function BatteryNumeric(): JSX.Element {
  const connected = useTelemetryFresh('battery');
  const voltage = useTelemetryStore((s) => s.battery.voltage);
  const remaining = useTelemetryStore((s) => s.battery.remaining);
  const known = connected && remaining >= 0;
  const valueClassName = !known ? undefined : remaining > 30 ? 'text-[var(--gauge-green)]' : remaining > 15 ? 'text-[var(--gauge-amber)]' : 'text-[var(--gauge-red)]';
  return (
    <NumericReadout
      label="BAT"
      value={connected ? voltage.toFixed(1) : '--'}
      unit={connected ? 'V' : undefined}
      sub={known ? `${Math.round(remaining)}%` : '--%'}
      valueClassName={valueClassName}
      footer={<BatteryMonitorBadge className="mt-1" />}
    />
  );
}

function GpsNumeric(): JSX.Element {
  const connected = useTelemetryFresh('gps');
  const fixType = useTelemetryStore((s) => s.gps.fixType);
  const satellites = useTelemetryStore((s) => s.gps.satellites);
  const valueClassName = !connected ? undefined : fixType >= 3 ? 'text-[var(--gauge-green)]' : fixType >= 2 ? 'text-[var(--gauge-amber)]' : 'text-[var(--gauge-red)]';
  return (
    <NumericReadout
      label="GPS"
      value={connected ? (GPS_FIX_SHORT[fixType] ?? 'NO FIX') : '--'}
      sub={connected ? `${satellites} sats` : '-- sats'}
      valueClassName={valueClassName}
    />
  );
}

function AltitudeNumeric(): JSX.Element {
  const connected = useTelemetryFresh('position');
  const msl = useTelemetryStore((s) => s.position.alt);
  const agl = useTelemetryStore((s) => s.position.relativeAlt);
  const altitudeUnit = useSettingsStore((s) => s.unitPreferences.altitude);
  const fmtAlt = (m: number) => trimmed(altitudeValueFromMeters(m, altitudeUnit), UNIT_PRECISION.altitude[altitudeUnit]);
  return (
    <NumericReadout
      label="ALT"
      value={connected ? fmtAlt(agl) : '--'}
      unit={connected ? UNIT_LABELS.altitude[altitudeUnit] : undefined}
      sub={connected ? `MSL ${fmtAlt(msl)}` : undefined}
    />
  );
}

function SpeedNumeric(): JSX.Element {
  const connected = useTelemetryFresh('vfrHud');
  const groundspeed = useTelemetryStore((s) => s.vfrHud.groundspeed);
  const airspeed = useTelemetryStore((s) => s.vfrHud.airspeed);
  const speedUnit = useSettingsStore((s) => s.unitPreferences.speed);
  const fmt = (mps: number) => trimmed(speedValueFromMetersPerSecond(mps, speedUnit), UNIT_PRECISION.speed[speedUnit]);
  return (
    <NumericReadout
      label="SPD"
      value={connected ? fmt(groundspeed) : '--'}
      unit={connected ? UNIT_LABELS.speed[speedUnit] : undefined}
      sub={connected && airspeed > 0 ? `AIR ${fmt(airspeed)}` : undefined}
    />
  );
}

function HeadingNumeric(): JSX.Element {
  const connected = useTelemetryFresh('vfrHud');
  const heading = useTelemetryStore((s) => s.vfrHud.heading);
  const deg = Math.round(heading) % 360;
  return (
    <NumericReadout
      label="HDG"
      value={connected ? String(deg) : '--'}
      unit={connected ? '°' : undefined}
      sub={connected ? CARDINALS[Math.round(deg / 45) % 8] : undefined}
    />
  );
}

function VsiNumeric(): JSX.Element {
  const connected = useTelemetryFresh('vfrHud');
  const climb = useTelemetryStore((s) => s.vfrHud.climb);
  const verticalSpeedUnit = useSettingsStore((s) => s.unitPreferences.verticalSpeed);
  const value = verticalSpeedValueFromMetersPerSecond(climb, verticalSpeedUnit);
  const valueText = `${value > 0 ? '+' : ''}${trimmed(value, UNIT_PRECISION.verticalSpeed[verticalSpeedUnit])}`;
  return (
    <NumericReadout
      label="VSI"
      value={connected ? valueText : '--'}
      unit={connected ? UNIT_LABELS.verticalSpeed[verticalSpeedUnit] : undefined}
      valueClassName={connected && Math.abs(climb) > 3 ? 'text-[var(--gauge-amber)]' : undefined}
    />
  );
}

function HomeNumeric(): JSX.Element {
  const connected = useTelemetryFresh('position');
  const home = useMapHomeStore((s) => s.home);
  const lat = useTelemetryStore((s) => s.position.lat);
  const lon = useTelemetryStore((s) => s.position.lon);
  const distanceUnit = useSettingsStore((s) => s.unitPreferences.distance);
  const hasFix = connected && (lat !== 0 || lon !== 0);
  const active = !!home && hasFix;
  const bearing = active ? bearingDeg(lat, lon, home[0], home[1]) : 0;
  const distance = active ? haversineMeters(lat, lon, home[0], home[1]) : null;
  return (
    <NumericReadout
      label="HOME"
      value={distance !== null ? formatDistanceFromMeters(distance, distanceUnit) : '--'}
      sub={active ? `BRG ${Math.round((bearing + 360) % 360)}°` : undefined}
      valueClassName={active ? 'text-[var(--gauge-green)]' : undefined}
    />
  );
}

function FlightModeInstrument(): JSX.Element {
  const connected = useLinkUp();
  const mode = useTelemetryStore((s) => s.flight.mode);
  const armed = useTelemetryStore((s) => s.flight.armed);

  // Mode category maps onto the instrument status palette (vivid in both
  // themes) instead of --mode-*, whose light variants read mustard/drab on
  // the white instrument face.
  const category = getModeCategory(mode);
  const modeColor =
    category === 'emergency' ? GAUGE_COLORS.red
    : category === 'auto' ? GAUGE_COLORS.green
    : category === 'assisted' ? GAUGE_COLORS.amber
    : GAUGE_COLORS.text;

  return (
    <InstrumentStrip label="Flight mode">
      <div className="flex items-center gap-2">
        <span
          className="w-1 self-stretch rounded-full shrink-0"
          style={{ background: connected ? modeColor : GAUGE_COLORS.tickMinor }}
        />
        <span
          className="text-[15px] font-semibold leading-none whitespace-nowrap"
          style={{ color: connected ? modeColor : GAUGE_COLORS.text }}
        >
          {connected ? (mode || 'Unknown').toUpperCase() : '--'}
        </span>
        {connected && (
          <span
            className="ml-auto text-[8px] font-semibold tracking-wider px-1.5 py-[3px] rounded-full leading-none shrink-0"
            style={
              armed
                ? { color: GAUGE_COLORS.red, background: 'rgba(248,113,113,0.15)', border: '1px solid rgba(248,113,113,0.4)' }
                : { color: GAUGE_COLORS.textDim, border: `1px solid ${GAUGE_COLORS.bezelEdge}` }
            }
          >
            {armed ? 'ARMED' : 'DISARMED'}
          </span>
        )}
      </div>
    </InstrumentStrip>
  );
}

type AnnunState = 'absent' | 'ok' | 'amber' | 'red';

// MAV_SYS_STATUS_SENSOR bits. PREARM lights amber, not red: it blocks arming
// but is not a failing sensor.
const ANNUN_SENSOR_CELLS: Array<{ label: string; bit: number; bad: 'red' | 'amber' }> = [
  { label: 'GYRO', bit: 0x01, bad: 'red' },
  { label: 'ACC', bit: 0x02, bad: 'red' },
  { label: 'MAG', bit: 0x04, bad: 'red' },
  { label: 'BARO', bit: 0x08, bad: 'red' },
  { label: 'GPS', bit: 0x20, bad: 'red' },
  { label: 'RC', bit: 0x10000, bad: 'red' },
  { label: 'FENCE', bit: 0x100000, bad: 'red' },
  { label: 'AHRS', bit: 0x200000, bad: 'red' },
  { label: 'TERRAIN', bit: 0x400000, bad: 'red' },
  { label: 'BATT', bit: 0x1000000, bad: 'red' },
  { label: 'PREARM', bit: 0x10000000, bad: 'amber' },
];

// Lamp styling: an off annunciator is a recessed dark window with an engraved
// label; a lit one is a glowing filled lamp with dark lettering. Red lamps
// pulse (annun-pulse keyframes in globals.css) the way a master warning does.
const ANNUN_STATE_STYLE: Record<AnnunState, CSSProperties> = {
  absent: {
    background: 'var(--gauge-lamp-off)',
    color: 'var(--gauge-tick-minor)',
    opacity: 0.55,
    border: '1px solid var(--gauge-lamp-off-border)',
    boxShadow: 'var(--gauge-lamp-off-shadow)',
  },
  ok: {
    background: 'var(--gauge-lamp-off)',
    color: GAUGE_COLORS.textDim,
    border: '1px solid var(--gauge-lamp-off-border)',
    boxShadow: 'var(--gauge-lamp-off-shadow)',
  },
  amber: {
    background: 'linear-gradient(180deg, #fbbf24, #d97706)',
    color: '#231303',
    border: '1px solid rgba(0,0,0,0.4)',
    boxShadow: '0 0 6px 1px rgba(245,158,11,0.55), inset 0 1px 1px rgba(255,255,255,0.4)',
  },
  red: {
    background: 'linear-gradient(180deg, #f87171, #dc2626)',
    color: '#2a0505',
    border: '1px solid rgba(0,0,0,0.4)',
    boxShadow: '0 0 7px 1px rgba(239,68,68,0.6), inset 0 1px 1px rgba(255,255,255,0.35)',
  },
};

function AnnunCell({ label, state }: { label: string; state: AnnunState }): JSX.Element {
  return (
    <span
      className={
        'h-[18px] flex items-center justify-center rounded-[3px] text-[7px] font-bold tracking-wider leading-none whitespace-nowrap' +
        (state === 'red' ? ' annun-pulse' : '')
      }
      style={ANNUN_STATE_STYLE[state]}
    >
      {label}
    </span>
  );
}

function AnnunciatorInstrument(): JSX.Element {
  const connected = useLinkUp();
  const sensorHealth = useTelemetryStore((s) => s.sensorHealth);
  const remaining = useTelemetryStore((s) => s.battery.remaining);
  const age = useHeartbeatAgeMs();

  // An annunciator shows problems, not confirmations: OK and not-present cells
  // both stay dark, differing only in label brightness.
  const sensorState = (bit: number, bad: 'red' | 'amber'): AnnunState => {
    if (!connected || !sensorHealth || !(sensorHealth.present & bit)) return 'absent';
    return sensorHealth.health & bit ? 'ok' : bad;
  };
  const linkState: AnnunState = !connected ? 'red' : age >= HEARTBEAT_STALE_MS ? 'amber' : 'ok';
  // Zero-default remaining with no link would read as a failed battery.
  const battFsState: AnnunState = !connected ? 'absent' : remaining >= 0 && remaining <= 15 ? 'red' : 'ok';

  return (
    <InstrumentStrip label="Annunciator" tall>
      <div className="grid grid-cols-3 gap-1">
        {ANNUN_SENSOR_CELLS.map((c) => (
          <AnnunCell key={c.label} label={c.label} state={sensorState(c.bit, c.bad)} />
        ))}
        <AnnunCell label="LINK" state={linkState} />
        <AnnunCell label="BATT FS" state={battFsState} />
      </div>
    </InstrumentStrip>
  );
}

function formatEta(seconds: number): string {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function MissionInstrument(): JSX.Element {
  const connected = useLinkUp();
  const missionItems = useMissionStore((s) => s.missionItems);
  const currentSeq = useMissionStore((s) => s.currentSeq);
  const dirty = useMissionStore((s) => s.isDirty);
  const lat = useTelemetryStore((s) => s.position.lat);
  const lon = useTelemetryStore((s) => s.position.lon);
  const groundspeed = useTelemetryStore((s) => s.vfrHud.groundspeed);
  const distanceUnit = useSettingsStore((s) => s.unitPreferences.distance);

  const total = missionItems.length;
  // currentSeq is already fcSeqOffset-translated in the store, so it indexes
  // missionItems[].seq directly; 1-based display matches the Flight Control
  // panel's mission strip.
  const cur = currentSeq !== null ? Math.min(currentSeq + 1, total) : null;

  const target = currentSeq !== null ? missionItems.find((it) => it.seq === currentSeq) : undefined;
  const hasFix = connected && (lat !== 0 || lon !== 0);
  const distance =
    target && hasFix && (target.latitude !== 0 || target.longitude !== 0)
      ? haversineMeters(lat, lon, target.latitude, target.longitude)
      : null;
  const eta = distance !== null && groundspeed > 0.5 ? formatEta(distance / groundspeed) : null;
  const progress = total > 0 && cur !== null ? cur / total : 0;

  return (
    <InstrumentStrip
      label="Mission"
      bar={
        total > 0 ? (
          <div className="h-[3px]" style={{ background: GAUGE_COLORS.bezel }}>
            <div
              className="h-full"
              style={{ width: `${Math.min(100, progress * 100)}%`, background: GAUGE_COLORS.green }}
            />
          </div>
        ) : undefined
      }
    >
      {total === 0 ? (
        <span className="text-[11px] leading-none" style={{ color: GAUGE_COLORS.tickMinor }}>
          No mission
        </span>
      ) : (
        <div className="flex items-baseline gap-2 whitespace-nowrap w-full">
          <span className="text-[15px] font-semibold leading-none text-[var(--gauge-text)]">
            WP {cur ?? '--'}
            <span className="text-[10px] font-normal text-[var(--gauge-text-dim)]">/{total}</span>
          </span>
          {dirty && cur === null ? (
            /* The plan on screen is not on the vehicle; say so where the
               pilot looks instead of implying a ready-to-fly mission. */
            <span className="ml-auto text-[8px] font-semibold tracking-wider leading-none text-[var(--gauge-amber)]">
              NOT UPLOADED
            </span>
          ) : (
            <>
              {distance !== null && (
                <span className="text-[9px] leading-none text-[var(--gauge-text-dim)]">
                  {formatDistanceFromMeters(distance, distanceUnit)}
                </span>
              )}
              {eta && <span className="ml-auto text-[9px] leading-none text-[var(--gauge-text-dim)]">ETA {eta}</span>}
            </>
          )}
        </div>
      )}
    </InstrumentStrip>
  );
}

// The nav ball, a first-class instrument like everything else (drag, resize,
// opacity, layouts). Was a special-cased MapPanel overlay before; its old
// 'attitude-ball' drag position migrates in map-instruments-store.
function AttitudeBallInstrument(): JSX.Element {
  const attitude = useTelemetryStore((s) => s.attitude);
  const heading = useTelemetryStore((s) => s.vfrHud.heading);
  // Without attitude the store holds roll 0 / pitch 0, which paints a perfectly
  // level horizon: the single most dangerous thing this instrument can do,
  // because a wrong reading here is indistinguishable from a healthy one. PX4
  // withholds ATTITUDE until its estimator is valid (~35 s from boot, and again
  // on any estimator dropout), so this is reached on every PX4 connection.
  const attitudeFresh = useTelemetryFresh('attitude');
  return (
    <div className="relative">
      {/* Dark background circle */}
      <div className="absolute inset-[-4px] rounded-full bg-surface-overlay-light shadow-xl" />
      <div className={`relative${attitudeFresh ? '' : ' opacity-30'}`}>
        <AttitudeIndicator roll={attitude.roll} pitch={attitude.pitch} heading={heading} size={140} />
      </div>
      {!attitudeFresh && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="px-1.5 py-0.5 rounded bg-surface-overlay-light text-[10px] font-semibold tracking-wide text-[var(--gauge-amber)]">
            NO ATT
          </span>
        </div>
      )}
    </div>
  );
}

// Static class strings (Tailwind only compiles literals): default drop spots
// for battery 2..9 stagger down the left gauge column.
const BATTERY_INSTANCE_DEFAULT_POS = [
  'absolute left-3 top-[288px] z-[1000]',
  'absolute left-3 top-[400px] z-[1000]',
  'absolute left-3 top-[512px] z-[1000]',
  'absolute left-3 top-[624px] z-[1000]',
  'absolute left-[124px] top-[288px] z-[1000]',
  'absolute left-[124px] top-[400px] z-[1000]',
  'absolute left-[124px] top-[512px] z-[1000]',
  'absolute left-[124px] top-[624px] z-[1000]',
];

export const MAP_INSTRUMENTS: MapInstrumentDef[] = [
  { id: 'attitude', round: true, profiles: ['air'], label: 'Attitude ball', defaultClassName: 'absolute bottom-3 left-1/2 -translate-x-1/2 z-[1000]', defaultVisible: true, Component: AttitudeBallInstrument },
  { id: 'flight-data', label: 'Flight data', defaultClassName: 'absolute bottom-2 left-2 z-[1000]', defaultVisible: true, Component: FlightDataInstrument },
  { id: 'battery', round: true, label: 'Battery', defaultClassName: 'absolute left-3 top-16 z-[1000]', defaultVisible: false, Component: BatteryInstrument, NumericComponent: BatteryNumeric, variants: [{ id: 'used', label: 'Battery + used', Component: BatteryUsedInstrument, round: true }, ...compactVariants('battery')] },
  // Fixed-monitor gauges (#126), one per possible ArduPilot instance: show a
  // specific pack regardless of the primary selection. The catalog surfaces
  // only the ones this vehicle actually streams.
  ...BATTERY_INSTANCE_DEFAULT_POS.map((cls, k): MapInstrumentDef => ({
    id: `battery${k + 2}`,
    monitorId: k + 1,
    round: true,
    label: `Battery ${k + 2}`,
    defaultClassName: cls,
    defaultVisible: false,
    Component: makeBatteryInstanceGauge(k + 1),
    NumericComponent: makeBatteryInstanceNumeric(k + 1),
  })),
  { id: 'gps', round: true, label: 'GPS', defaultClassName: 'absolute left-3 top-[176px] z-[1000]', defaultVisible: false, Component: GpsInstrument, NumericComponent: GpsNumeric, variants: compactVariants('gps') },
  { id: 'altitude', round: true, profiles: ['air'], label: 'Altitude', defaultClassName: 'absolute left-3 top-[288px] z-[1000]', defaultVisible: false, Component: AltitudeInstrument, NumericComponent: AltitudeNumeric, variants: compactVariants('altitude') },
  { id: 'speed', round: true, label: 'Speed', defaultClassName: 'absolute left-3 top-[400px] z-[1000]', defaultVisible: false, Component: SpeedInstrument, NumericComponent: SpeedNumeric, variants: compactVariants('speed') },
  { id: 'tilt', round: true, profiles: ['ground'], label: 'Tilt', defaultClassName: 'absolute bottom-3 left-1/2 -translate-x-1/2 z-[1000]', defaultVisible: false, Component: TiltInstrument },
  { id: 'steer', profiles: ['ground'], label: 'Steering', defaultClassName: 'absolute left-[124px] top-[344px] z-[1000]', defaultVisible: false, Component: SteerInstrument },
  { id: 'xtrack', profiles: ['ground'], label: 'Cross-track', defaultClassName: 'absolute left-[124px] top-[420px] z-[1000]', defaultVisible: false, Component: XtrackInstrument },
  { id: 'heading', round: true, label: 'Compass (HDG)', defaultClassName: 'absolute bottom-3 left-[calc(50%+88px)] z-[1000]', defaultVisible: true, Component: HeadingInstrument, NumericComponent: HeadingNumeric, variants: compactVariants('heading') },
  { id: 'vsi', round: true, profiles: ['air'], label: 'VSI', defaultClassName: 'absolute left-3 top-[512px] z-[1000]', defaultVisible: false, Component: VsiInstrument, NumericComponent: VsiNumeric, variants: compactVariants('vsi') },
  { id: 'home', round: true, label: 'Home', defaultClassName: 'absolute left-3 top-[624px] z-[1000]', defaultVisible: false, Component: HomeInstrument, NumericComponent: HomeNumeric, variants: compactVariants('home') },
  // Strips stack in a second column beside the left-edge gauges (gauge is
  // 104px wide at left-3, so 124px clears it) under the Instruments button.
  { id: 'flight-mode', label: 'Flight mode', defaultClassName: 'absolute left-[124px] top-16 z-[1000]', defaultVisible: false, Component: FlightModeInstrument },
  { id: 'link', label: 'Link', defaultClassName: 'absolute left-[124px] top-[128px] z-[1000]', defaultVisible: false, Component: LinkInstrument, variants: compactVariants('link') },
  { id: 'mission', label: 'Mission', defaultClassName: 'absolute left-[124px] top-[192px] z-[1000]', defaultVisible: false, Component: MissionInstrument },
  { id: 'annunciator', label: 'Annunciator', defaultClassName: 'absolute left-[124px] top-[268px] z-[1000]', defaultVisible: false, Component: AnnunciatorInstrument },
  { id: 'rtk', label: 'RTK', defaultClassName: 'absolute left-[124px] top-[600px] z-[1000]', defaultVisible: false, Component: RtkInstrument },
  { id: 'controls', label: 'Flight control', defaultClassName: 'absolute left-[124px] top-[420px] z-[1000]', defaultVisible: false, Component: FlightControlInstrument, variants: [
    { id: 'compact', label: 'Compact', Component: () => <FlightControlInstrument variant="compact" /> },
    { id: 'bar', label: 'Bar', Component: () => <FlightControlInstrument variant="bar" /> },
  ] },
];
