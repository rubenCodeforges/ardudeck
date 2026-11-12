import { useTranslation } from 'react-i18next';
import { create } from 'zustand';
import { useFleetVehicles, selectActiveVehicle, type FleetVehicle } from '../../../hooks/useFleet';
import { useFleetTelemetryStore } from '../../../stores/fleet-telemetry-store';
import { useFormationStore } from '../../../stores/formation-store';
import { useActiveVehicleStore } from '../../../stores/active-vehicle-store';
import { useVehicleColor, useVehicleAppearanceStore, defaultVehicleColor } from '../../../stores/vehicle-appearance-store';
import { useSettingsStore } from '../../../stores/settings-store';
import { altitudeValueFromMeters, toMetersFromAltitudeUnit, UNIT_LABELS } from '../../../../shared/user-units.js';
import { getModeCategoryVar } from '../tactical-icon-pool';
import { Stepper } from '../Stepper';
import { useFormationControl } from '../../../hooks/useFormationControl';
import { FleetCoordination } from '../../fleet/FleetCoordination';
import { FleetGroupActions } from '../../fleet/FleetGroupActions';
import { FleetRadar } from '../../fleet/FleetMinimap';
import { GAUGE_COLORS } from './RoundGauge';
import { FillBehind, gaugeTint } from './ReadoutPrimitives';
import { Card, mono, useNow } from './SensorInstruments';
import { HEARTBEAT_STALE_MS } from './useLinkUp';
import { separationPairs, separationTone, nearestNeighbour, type SeparationTone } from './fleet-separation';

const LINK_LOST_MS = 10_000;

function openFleetMenu(e: React.MouseEvent, vehicleKey: string): void {
  e.preventDefault();
  e.stopPropagation();
  useFormationStore.getState().openContextMenu({ x: e.clientX, y: e.clientY, vehicleKey });
}

function batteryTone(pct: number | null): string {
  if (pct === null) return GAUGE_COLORS.textDim;
  return pct < 20 ? GAUGE_COLORS.red : pct < 40 ? GAUGE_COLORS.amber : GAUGE_COLORS.green;
}

function knownPct(v: FleetVehicle): number | null {
  return v.batteryPct !== null && v.batteryPct >= 0 ? v.batteryPct : null;
}

function NoFleet({ label, width }: { label: string; width: number }): JSX.Element {
  const { t } = useTranslation();
  return (
    <Card label={label} width={width}>
      <div className="text-[10px] leading-snug" style={{ color: GAUGE_COLORS.textDim }}>{t('map:fleetInstruments.noFleet')}</div>
    </Card>
  );
}

// ─── Fleet matrix ────────────────────────────────────────────────────────────

type MatrixRole = 'leader' | 'wingman' | undefined;

function MatrixRow({ v, now, worstBattery, role, leaderColor, groupStart }: {
  v: FleetVehicle;
  now: number;
  worstBattery: boolean;
  role: MatrixRole;
  leaderColor?: string;
  groupStart: boolean;
}): JSX.Element {
  const { t } = useTranslation();
  const color = useVehicleColor(v.key, v.sysid);
  const gps = useFleetTelemetryStore((s) => s.byVehicle[v.key]?.gps);
  const altUnit = useSettingsStore((s) => s.unitPreferences.altitude);
  const pct = knownPct(v);
  const age = v.lastUpdate === null ? null : now - v.lastUpdate;
  const linkTone = age === null || age > LINK_LOST_MS ? GAUGE_COLORS.red : age > HEARTBEAT_STALE_MS ? GAUGE_COLORS.amber : GAUGE_COLORS.green;
  const fix = gps?.fixType ?? 0;
  const gpsTone = fix < 2 ? GAUGE_COLORS.red : fix < 3 ? GAUGE_COLORS.amber : GAUGE_COLORS.text;
  const cell = `${mono} px-1 py-[3px] text-[10px]`;
  return (
    <tr
      onClick={() => selectActiveVehicle(v.key, v.transportId)}
      onContextMenu={(e) => openFleetMenu(e, v.key)}
      className="cursor-pointer"
      style={{
        ...(v.isActive ? { background: gaugeTint(GAUGE_COLORS.green, 12) } : {}),
        ...(groupStart ? { borderTop: `1px solid ${GAUGE_COLORS.bezelEdge}` } : {}),
      }}
      data-tip={t('map:fleetInstruments.selectTip', { label: v.label })}
    >
      <td className={`${cell} font-semibold`} style={{ color: GAUGE_COLORS.text, borderLeft: `2px solid ${role === 'wingman' && leaderColor ? leaderColor : color}` }}>
        <span className="inline-flex items-center gap-1" style={role === 'wingman' ? { paddingLeft: 8 } : undefined}>
          {role === 'wingman' && <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: color }} />}
          {v.sysid}
          {role === 'leader' && (
            <span className="rounded-sm px-0.5 text-[7.5px] font-bold" style={{ color: GAUGE_COLORS.amber, border: `1px solid ${gaugeTint(GAUGE_COLORS.amber, 55)}` }}>
              {t('fleet:fleetStrip.lead')}
            </span>
          )}
        </span>
      </td>
      <td className={`${cell} max-w-[72px] truncate font-semibold`} style={{ color: getModeCategoryVar(v.mode) }}>{v.mode}</td>
      <td className={cell}>
        <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: v.armed ? GAUGE_COLORS.amber : GAUGE_COLORS.bezelEdge }} />
      </td>
      <td className={`${cell} text-right font-semibold`} style={{ color: batteryTone(pct), textDecoration: worstBattery ? 'underline' : undefined }}>
        {pct === null ? '--' : Math.round(pct)}
      </td>
      <td className={`${cell} text-right`} style={{ color: gpsTone }}>{gps ? gps.satellites : '--'}</td>
      <td className={`${cell} text-right`} style={{ color: GAUGE_COLORS.text }}>{Math.round(altitudeValueFromMeters(v.altitudeAgl, altUnit))}</td>
      <td className={`${cell} text-right`}>
        <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: linkTone }} />
      </td>
    </tr>
  );
}

interface MatrixRowSpec { v: FleetVehicle; role: MatrixRole; leaderColor?: string; groupStart: boolean }

/** Formations first (leader, then its wingmen), free vehicles after, same order as the fleet strip. */
function matrixRows(sorted: FleetVehicle[], formations: Record<string, string[]>, colorOf: (v: FleetVehicle) => string): MatrixRowSpec[] {
  const rows: MatrixRowSpec[] = [];
  const placed = new Set<string>();
  const groups = Object.entries(formations)
    .map(([leaderKey, members]) => ({ leader: sorted.find((v) => v.key === leaderKey), members }))
    .filter((g): g is { leader: FleetVehicle; members: string[] } => !!g.leader)
    .sort((a, b) => a.leader.sysid - b.leader.sysid);
  for (const g of groups) {
    rows.push({ v: g.leader, role: 'leader', groupStart: rows.length > 0 });
    placed.add(g.leader.key);
    const leaderColor = colorOf(g.leader);
    for (const w of sorted) {
      if (w.key !== g.leader.key && g.members.includes(w.key) && !placed.has(w.key)) {
        rows.push({ v: w, role: 'wingman', leaderColor, groupStart: false });
        placed.add(w.key);
      }
    }
  }
  let first = true;
  for (const v of sorted) {
    if (placed.has(v.key)) continue;
    rows.push({ v, role: undefined, groupStart: first && rows.length > 0 });
    first = false;
  }
  return rows;
}

export function FleetMatrixInstrument(): JSX.Element {
  const { t } = useTranslation();
  const vehicles = useFleetVehicles();
  const now = useNow(1000);
  const altUnit = useSettingsStore((s) => s.unitPreferences.altitude);
  const formations = useActiveVehicleStore((s) => s.formations);
  const colorOverrides = useVehicleAppearanceStore((s) => s.overrides);
  const colorOf = (v: FleetVehicle) => colorOverrides[v.key] ?? defaultVehicleColor(v.sysid);
  const label = t('map:fleetInstruments.matrix');
  if (vehicles.length < 2) return <NoFleet label={label} width={260} />;
  const sorted = [...vehicles].sort((a, b) => a.sysid - b.sysid);
  let worstKey: string | null = null;
  let worstPct = Infinity;
  for (const v of sorted) {
    const pct = knownPct(v);
    if (pct !== null && pct < worstPct) { worstPct = pct; worstKey = v.key; }
  }
  const rows = matrixRows(sorted, formations, colorOf);
  const armed = vehicles.filter((v) => v.armed).length;
  const head = `${mono} px-1 pb-1 text-[8px] font-semibold tracking-wider`;
  return (
    <Card
      label={label}
      width={260}
      right={<span className={`${mono} text-[8.5px]`} style={{ color: GAUGE_COLORS.textDim }}>{t('map:fleetInstruments.armedCount', { armed, total: vehicles.length })}</span>}
    >
      <table className="w-full border-collapse">
        <thead>
          <tr style={{ color: GAUGE_COLORS.textDim }}>
            <th className={`${head} text-left`}>{t('map:fleetInstruments.colId')}</th>
            <th className={`${head} text-left`}>{t('map:fleetInstruments.colMode')}</th>
            <th className={`${head} text-left`}>{t('map:fleetInstruments.colArm')}</th>
            <th className={`${head} text-right`}>{t('map:fleetInstruments.colBattery')}</th>
            <th className={`${head} text-right`}>{t('map:fleetInstruments.colSats')}</th>
            <th className={`${head} text-right`}>{t('map:fleetInstruments.colAlt', { unit: UNIT_LABELS.altitude[altUnit] })}</th>
            <th className={`${head} text-right`}>{t('map:fleetInstruments.colLink')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <MatrixRow key={r.v.key} v={r.v} now={now} worstBattery={r.v.key === worstKey} role={r.role} leaderColor={r.leaderColor} groupStart={r.groupStart} />
          ))}
        </tbody>
      </table>
    </Card>
  );
}

// ─── Fleet battery ───────────────────────────────────────────────────────────

function BatteryRow({ v }: { v: FleetVehicle }): JSX.Element {
  const color = useVehicleColor(v.key, v.sysid);
  const voltage = useFleetTelemetryStore((s) => s.byVehicle[v.key]?.battery?.voltage);
  const pct = knownPct(v);
  const tone = batteryTone(pct);
  return (
    <div className="flex items-center gap-1.5">
      <span className="h-2.5 w-0.5 rounded-full" style={{ background: color }} />
      <span className={`${mono} w-6 text-[10px] font-semibold`} style={{ color: GAUGE_COLORS.text }}>{v.sysid}</span>
      <FillBehind fraction={pct === null ? null : pct / 100} fill={gaugeTint(tone, 60)} trough={GAUGE_COLORS.bezel} edge={GAUGE_COLORS.bezelEdge} style={{ height: 6, flex: 1 }} />
      <span className={`${mono} w-7 text-right text-[10px] font-semibold`} style={{ color: tone }}>{pct === null ? '--' : Math.round(pct)}</span>
      <span className={`${mono} w-9 text-right text-[9px]`} style={{ color: GAUGE_COLORS.textDim }}>{voltage ? `${voltage.toFixed(1)}V` : ''}</span>
    </div>
  );
}

export function FleetBatteryInstrument(): JSX.Element {
  const { t } = useTranslation();
  const vehicles = useFleetVehicles();
  const label = t('map:fleetInstruments.battery');
  if (vehicles.length < 2) return <NoFleet label={label} width={200} />;
  // Weakest first: the lowest pack decides when the fleet comes home.
  const sorted = [...vehicles].sort((a, b) => (knownPct(a) ?? 101) - (knownPct(b) ?? 101));
  const weakest = sorted[0]!;
  const weakestPct = knownPct(weakest);
  return (
    <Card
      label={label}
      width={200}
      right={weakestPct !== null
        ? <span className={`${mono} text-[8.5px] font-bold`} style={{ color: batteryTone(weakestPct) }}>{t('map:fleetInstruments.lowest', { label: weakest.label })}</span>
        : undefined}
    >
      <div className="flex flex-col gap-1">
        {sorted.map((v) => <BatteryRow key={v.key} v={v} />)}
      </div>
    </Card>
  );
}

// ─── Separation ──────────────────────────────────────────────────────────────

const SEPARATION_KEY = 'map-fleet-separation-min-m';
const DEFAULT_SEPARATION_M = 10;

function loadSeparation(): number {
  try {
    const n = Number(localStorage.getItem(SEPARATION_KEY));
    if (Number.isFinite(n) && n > 0) return n;
  } catch {
    // storage blocked: use the default
  }
  return DEFAULT_SEPARATION_M;
}

export const useFleetSeparationStore = create<{ minM: number; setMinM: (m: number) => void }>((set) => ({
  minM: loadSeparation(),
  setMinM: (minM) => {
    try { localStorage.setItem(SEPARATION_KEY, String(minM)); } catch { /* blocked */ }
    set({ minM });
  },
}));

const TONE_COLOR: Record<SeparationTone, string> = {
  ok: GAUGE_COLORS.green,
  warn: GAUGE_COLORS.amber,
  danger: GAUGE_COLORS.red,
};

function useSeparationState() {
  const vehicles = useFleetVehicles();
  const now = useNow(500);
  const minM = useFleetSeparationStore((s) => s.minM);
  const activeKey = useActiveVehicleStore((s) => s.activeVehicleKey);
  const altUnit = useSettingsStore((s) => s.unitPreferences.altitude);
  const pairs = vehicles.length >= 2 ? separationPairs(vehicles, now) : [];
  const active = activeKey ? vehicles.find((v) => v.key === activeKey) : undefined;
  const mine = active ? nearestNeighbour(pairs, active.key) : null;
  const worst = pairs[0];
  // The fleet line only speaks up when some other pair is getting close.
  const worstAlert = worst && separationTone(worst.distanceM, minM) !== 'ok' && worst !== mine?.pair ? worst : null;
  return {
    vehicles,
    minM,
    altUnit,
    active,
    mine,
    worstAlert,
    unit: UNIT_LABELS.altitude[altUnit],
    fmt: (m: number) => String(Math.round(altitudeValueFromMeters(m, altUnit) * 10) / 10),
  };
}

export function FleetSeparationInstrument(): JSX.Element {
  const { t } = useTranslation();
  const setMinM = useFleetSeparationStore((s) => s.setMinM);
  const { vehicles, minM, altUnit, active, mine, worstAlert, unit, fmt } = useSeparationState();
  const label = t('map:fleetInstruments.separation');
  if (vehicles.length < 2) return <NoFleet label={label} width={190} />;

  const tone = mine ? separationTone(mine.pair.distanceM, minM) : 'ok';
  const color = mine ? TONE_COLOR[tone] : GAUGE_COLORS.textDim;
  return (
    <Card
      label={label}
      width={190}
      right={mine && tone !== 'ok'
        ? <span className={`${mono} text-[8.5px] font-bold tracking-wider`} style={{ color }}>{tone === 'danger' ? t('map:fleetInstruments.tooClose') : t('map:fleetInstruments.closing')}</span>
        : undefined}
    >
      <div className={`${mono} text-[8.5px]`} style={{ color: GAUGE_COLORS.textDim }}>
        {active ? t('map:fleetInstruments.nearestTo', { label: active.label }) : t('map:fleetInstruments.noSelection')}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className={`${mono} text-[22px] font-bold`} style={{ color: mine ? color : GAUGE_COLORS.textDim }}>{mine ? fmt(mine.pair.distanceM) : '--'}</span>
        <span className="text-[10px]" style={{ color: GAUGE_COLORS.textDim }}>{unit}</span>
        <span className={`${mono} ml-auto text-[9px] font-semibold`} style={{ color }}>
          {mine ? mine.otherLabel : active ? t('map:fleetInstruments.noPositions') : ''}
        </span>
      </div>
      {mine && (
        <div className={`${mono} mt-1 text-[8.5px]`} style={{ color: GAUGE_COLORS.textDim }}>
          {t('map:fleetInstruments.horizVert', { h: fmt(mine.pair.horizontalM), v: fmt(mine.pair.verticalM), unit })}
        </div>
      )}
      <div className={`${mono} mt-1.5 flex text-[9px]`} style={{ color: worstAlert ? TONE_COLOR[separationTone(worstAlert.distanceM, minM)] : GAUGE_COLORS.textDim }}>
        <span>{worstAlert ? t('map:fleetInstruments.fleetWorst', { a: worstAlert.aLabel, b: worstAlert.bLabel }) : t('map:fleetInstruments.fleetClear')}</span>
        {worstAlert && <span className="ml-auto">{fmt(worstAlert.distanceM)} {unit}</span>}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className={`${mono} text-[8px] font-semibold`} style={{ color: GAUGE_COLORS.tickMinor }}>{t('map:fleetInstruments.minimum')}</span>
        <div className="flex-1" onPointerDown={(e) => e.stopPropagation()}>
          <Stepper
            value={Math.round(altitudeValueFromMeters(minM, altUnit))}
            onChange={(v) => setMinM(Math.max(1, toMetersFromAltitudeUnit(v, altUnit)))}
            min={1}
            max={1000}
            step={1}
            unit={unit}
          />
        </div>
      </div>
    </Card>
  );
}

// ─── Fleet ops and radar (the former floating Fleet Ops panel) ─────────────

export function FleetOpsInstrument(): JSX.Element {
  const { t } = useTranslation();
  const { hasServer, vehicles, canTakeoff, canFollow } = useFormationControl();
  const selected = useActiveVehicleStore((s) => s.selectedVehicleKeys.length);
  const label = t('fleet:draggableFleetActions.title');
  if (vehicles.length < 2) return <NoFleet label={label} width={240} />;
  const engineOps = hasServer && (canTakeoff || canFollow);
  return (
    <Card label={label} width={240}>
      <div className="-mx-3 -mb-2.5">
        <FleetCoordination />
        <FleetGroupActions />
        {!engineOps && selected === 0 && (
          <div className="px-3 pb-2.5 text-[10px] leading-snug" style={{ color: GAUGE_COLORS.textDim }}>{t('map:fleetInstruments.opsHint')}</div>
        )}
      </div>
    </Card>
  );
}

export function FleetRadarInstrument(): JSX.Element {
  const { t } = useTranslation();
  const vehicles = useFleetVehicles();
  const label = t('map:fleetInstruments.radar');
  if (vehicles.length < 2) return <NoFleet label={label} width={176} />;
  return (
    <Card label={label} width={176}>
      <div className="-mx-1.5 -my-1.5">
        <FleetRadar />
      </div>
    </Card>
  );
}

// ─── Compact variants ────────────────────────────────────────────────────────

function vehicleTone(v: FleetVehicle, now: number): string {
  const age = v.lastUpdate === null ? null : now - v.lastUpdate;
  const pct = knownPct(v);
  if (age === null || age > LINK_LOST_MS || (pct !== null && pct < 20) || v.state === 'critical') return GAUGE_COLORS.red;
  if (age > HEARTBEAT_STALE_MS || (pct !== null && pct < 40)) return GAUGE_COLORS.amber;
  return GAUGE_COLORS.green;
}

function MatrixChip({ v, now, lead }: { v: FleetVehicle; now: number; lead: boolean }): JSX.Element {
  const { t } = useTranslation();
  const color = useVehicleColor(v.key, v.sysid);
  const tone = vehicleTone(v, now);
  const pct = knownPct(v);
  return (
    <button
      type="button"
      onClick={() => selectActiveVehicle(v.key, v.transportId)}
      onContextMenu={(e) => openFleetMenu(e, v.key)}
      data-tip={t('map:fleetInstruments.chipTip', { label: v.label, mode: v.mode, pct: pct === null ? '--' : Math.round(pct) })}
      className="flex flex-col items-center rounded px-1 py-0.5"
      style={{
        border: `1px solid ${v.isActive ? GAUGE_COLORS.text : gaugeTint(tone, 55)}`,
        background: v.armed ? gaugeTint(GAUGE_COLORS.amber, 14) : undefined,
        borderTop: `2px solid ${color}`,
      }}
    >
      <span className={`${mono} text-[10px] font-semibold`} style={{ color: lead ? GAUGE_COLORS.amber : GAUGE_COLORS.text }}>{v.sysid}</span>
      <span className={`${mono} text-[8.5px]`} style={{ color: tone }}>{pct === null ? '--' : Math.round(pct)}</span>
    </button>
  );
}

export function FleetMatrixCompact(): JSX.Element {
  const { t } = useTranslation();
  const vehicles = useFleetVehicles();
  const now = useNow(1000);
  const formations = useActiveVehicleStore((s) => s.formations);
  const label = t('map:fleetInstruments.matrix');
  if (vehicles.length < 2) return <NoFleet label={label} width={200} />;
  const rows = matrixRows([...vehicles].sort((a, b) => a.sysid - b.sysid), formations, () => '');
  const armed = vehicles.filter((v) => v.armed).length;
  return (
    <Card
      label={label}
      width={200}
      right={<span className={`${mono} text-[8.5px]`} style={{ color: GAUGE_COLORS.textDim }}>{t('map:fleetInstruments.armedCount', { armed, total: vehicles.length })}</span>}
    >
      <div className="grid grid-cols-5 gap-1">
        {rows.map((r) => <MatrixChip key={r.v.key} v={r.v} now={now} lead={r.role === 'leader'} />)}
      </div>
    </Card>
  );
}

export function FleetBatteryCompact(): JSX.Element {
  const { t } = useTranslation();
  const vehicles = useFleetVehicles();
  const label = t('map:fleetInstruments.battery');
  if (vehicles.length < 2) return <NoFleet label={label} width={170} />;
  const sorted = [...vehicles].sort((a, b) => a.sysid - b.sysid);
  const weakest = [...vehicles].sort((a, b) => (knownPct(a) ?? 101) - (knownPct(b) ?? 101))[0]!;
  const weakestPct = knownPct(weakest);
  return (
    <Card
      label={label}
      width={170}
      right={weakestPct !== null
        ? <span className={`${mono} text-[8.5px] font-bold`} style={{ color: batteryTone(weakestPct) }}>{t('map:fleetInstruments.lowestPct', { label: weakest.label, pct: Math.round(weakestPct) })}</span>
        : undefined}
    >
      <div className="flex items-end gap-[3px]" style={{ height: 34 }}>
        {sorted.map((v) => {
          const pct = knownPct(v);
          return (
            <div key={v.key} className="flex-1 flex flex-col items-center gap-0.5" data-tip={`${v.label} ${pct === null ? '--' : Math.round(pct)}%`}>
              <div className="w-full rounded-sm" style={{ height: 24, background: GAUGE_COLORS.bezel, position: 'relative', overflow: 'hidden' }}>
                <div className="absolute bottom-0 left-0 right-0" style={{ height: `${pct ?? 0}%`, background: batteryTone(pct) }} />
              </div>
              <span className={`${mono} text-[7.5px]`} style={{ color: GAUGE_COLORS.textDim }}>{v.sysid}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export function FleetSeparationCompact(): JSX.Element {
  const { t } = useTranslation();
  const { vehicles, minM, mine, worstAlert, unit, fmt } = useSeparationState();
  const label = t('map:fleetInstruments.separation');
  if (vehicles.length < 2) return <NoFleet label={label} width={150} />;
  const color = mine ? TONE_COLOR[separationTone(mine.pair.distanceM, minM)] : GAUGE_COLORS.textDim;
  return (
    <Card label={label} width={150}>
      <div className="flex items-baseline gap-1">
        <span className={`${mono} text-[18px] font-bold`} style={{ color }}>{mine ? fmt(mine.pair.distanceM) : '--'}</span>
        <span className="text-[10px]" style={{ color: GAUGE_COLORS.textDim }}>{unit}</span>
        <span className={`${mono} ml-auto text-[8.5px]`} style={{ color: GAUGE_COLORS.textDim }}>{mine ? mine.otherLabel : ''}</span>
      </div>
      {worstAlert && (
        <div className={`${mono} mt-1 text-[8.5px]`} style={{ color: TONE_COLOR[separationTone(worstAlert.distanceM, minM)] }}>
          {t('map:fleetInstruments.fleetWorstShort', { a: worstAlert.aLabel, b: worstAlert.bLabel, d: fmt(worstAlert.distanceM), unit })}
        </div>
      )}
    </Card>
  );
}

export function FleetOpsCompact(): JSX.Element {
  const { t } = useTranslation();
  const { vehicles } = useFormationControl();
  const label = t('fleet:draggableFleetActions.title');
  if (vehicles.length < 2) return <NoFleet label={label} width={210} />;
  return (
    <Card label={label} width={210}>
      <div className="-mx-3 -mb-2.5">
        <FleetCoordination compact />
        <FleetGroupActions />
      </div>
    </Card>
  );
}
