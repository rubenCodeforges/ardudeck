import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DockviewReact,
  DockviewReadyEvent,
  IDockviewPanelProps,
  DockviewApi,
  SerializedDockview,
  Orientation,
  themeDark,
  themeLight,
} from 'dockview-react';
import 'dockview-react/dist/styles/dockview.css';
import { useResolvedTheme } from '../../hooks/useTheme';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// Resolve relative to the document: a leading-slash path 404s under file:// in
// packaged builds (see ObjectEditorMap.tsx), breaking the MapLibre worker.
maplibregl.setWorkerUrl(new URL('maplibre-worker.js', document.baseURI).href);
import { createFlightPathThreeJsLayer } from './flight-threejs-layer';
import { buildFlightTrack, frameBounds, groundAmsl, trackAltitudeRange, trackIndexNearTime, trackSpeeds } from './flight-track';
import { useLogStore } from '../../stores/log-store';
import { lowerBoundIdx, upperBoundIdx, columnStats, fmtStat, padRange, parseAxisRange, chartCsv, SERIES_COLORS, type FieldStats } from './log-chart-stats';
import { getModeName, MODE_COLORS } from './log-events';
import { publishHoverTime, subscribeHoverTime, subscribeTimeJump } from './log-hover-bus';
import { createCursorReadout, type ChartCursorReadout, type CursorRow } from './log-chart-cursor';
import { groupSeriesByScale, scaleKeyFor, unitOfLabel, Y_MODE_LABEL, Y_MODE_LABEL_KEY, Y_MODE_ORDER, Y_MODE_TIP, Y_MODE_TIP_KEY, type YMode } from './log-y-scales';
import { wheelDeltas, wheelZoomFactor } from './log-chart-gestures';
import { EventsPanel } from './EventsPanel';
import { LogParamsPanel } from './LogParamsPanel';
import { SpectrumPanel } from './SpectrumPanel';
import { px4ModeName } from '@ardudeck/ulog-parser';
import { fieldNames, logCount, logRows } from '../../utils/log-columns';
import { useTranslation } from 'react-i18next';

/** Prefer the i18n key; falls back to the literal. */
function lgText(t: (key: string) => string, key: string | undefined, fallback: string): string {
  return key ? t(key) : fallback;
}

// All chart panels share one uPlot cursor-sync group, keyed by x VALUE (time
// in seconds), so moving the mouse over any chart draws the crosshair at the
// same instant on every other chart - even when their zoom windows differ.
const X_CURSOR_SYNC_KEY = 'log-explorer-x';

// Style uPlot - uses CSS variables for theme support
const uplotStyle = document.createElement('style');
uplotStyle.textContent = `
  .u-select { background: rgba(59, 130, 246, 0.15) !important; border: 1px solid rgba(59, 130, 246, 0.5) !important; }
  .u-legend { font-size: 11px; padding: 4px 8px; }
  .u-legend .u-series { padding: 1px 4px; }
  .u-legend .u-label { color: var(--text-secondary); }
  .u-legend .u-value { color: var(--text-primary); font-variant-numeric: tabular-nums; }
  .u-legend .u-series > * { vertical-align: middle; }
  .u-legend .u-marker { border-radius: 50%; }
`;
document.head.appendChild(uplotStyle);

/** Color per event-marker type, used by the chart draw hook. */
const EVENT_TYPE_COLORS: Record<string, string> = {
  MODE: '#a855f7',
  MSG: '#10b981',
  CMD: '#f59e0b',
};

type ChartPreset = { label: string; desc: string; labelKey?: string; descKey?: string; types: string[]; fields: Record<string, string[]> };

const QUICK_PRESETS: ChartPreset[] = [
  { label: 'Attitude', labelKey: 'logs.presets.quick.attitude.label', desc: 'DesRoll vs Roll, DesPitch vs Pitch', descKey: 'logs.presets.quick.attitude.desc', types: ['ATT'], fields: { ATT: ['DesRoll', 'Roll', 'DesPitch', 'Pitch'] } },
  { label: 'Rate Tuning', labelKey: 'logs.presets.quick.rate-tuning.label', desc: 'Desired vs actual body rates', descKey: 'logs.presets.quick.rate-tuning.desc', types: ['RATE'], fields: { RATE: ['RDes', 'R', 'PDes', 'P', 'YDes', 'Y'] } },
  { label: 'Vibration', labelKey: 'logs.presets.quick.vibration.label', desc: 'X/Y/Z acceleration variance', descKey: 'logs.presets.quick.vibration.desc', types: ['VIBE'], fields: { VIBE: ['VibeX', 'VibeY', 'VibeZ'] } },
  { label: 'GPS', labelKey: 'logs.presets.quick.gps.label', desc: 'Satellite count & dilution', descKey: 'logs.presets.quick.gps.desc', types: ['GPS'], fields: { GPS: ['NSats', 'HDop'] } },
  { label: 'Battery', labelKey: 'logs.presets.quick.battery.label', desc: 'Voltage & current draw', descKey: 'logs.presets.quick.battery.desc', types: ['BAT'], fields: { BAT: ['Volt', 'Curr'] } },
  { label: 'Altitude', labelKey: 'logs.presets.quick.altitude.label', desc: 'Desired vs actual altitude', descKey: 'logs.presets.quick.altitude.desc', types: ['CTUN'], fields: { CTUN: ['DAlt', 'Alt', 'BAlt'] } },
  { label: 'Compass', labelKey: 'logs.presets.quick.compass.label', desc: 'Magnetic field X/Y/Z', descKey: 'logs.presets.quick.compass.desc', types: ['MAG'], fields: { MAG: ['MagX', 'MagY', 'MagZ'] } },
  { label: 'EKF', labelKey: 'logs.presets.quick.ekf.label', desc: 'Innovation test ratios', descKey: 'logs.presets.quick.ekf.desc', types: ['NKF4'], fields: { NKF4: ['SV', 'SP', 'SH'] } },
  { label: 'Power', labelKey: 'logs.presets.quick.power.label', desc: 'Board voltage', descKey: 'logs.presets.quick.power.desc', types: ['POWR'], fields: { POWR: ['Vcc'] } },
  { label: 'Motor Outputs', labelKey: 'logs.presets.quick.motor-outputs.label', desc: 'PWM out per motor (RCOU)', descKey: 'logs.presets.quick.motor-outputs.desc', types: ['RCOU'], fields: { RCOU: ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8'] } },
  { label: 'ESC RPM', labelKey: 'logs.presets.quick.esc-rpm.label', desc: 'RPM per motor: split by instance', descKey: 'logs.presets.quick.esc-rpm.desc', types: ['ESC'], fields: { ESC: ['RPM'] } },
  { label: 'ESC Temp', labelKey: 'logs.presets.quick.esc-temp.label', desc: 'Temperature per ESC', descKey: 'logs.presets.quick.esc-temp.desc', types: ['ESC'], fields: { ESC: ['Temp'] } },
  { label: 'ESC Power', labelKey: 'logs.presets.quick.esc-power.label', desc: 'Voltage & current per ESC', descKey: 'logs.presets.quick.esc-power.desc', types: ['ESC'], fields: { ESC: ['Volt', 'Curr'] } },
  { label: 'Position', labelKey: 'logs.presets.quick.position.label', desc: 'Desired vs actual XY position', descKey: 'logs.presets.quick.position.desc', types: ['PSCN', 'PSCE'], fields: { PSCN: ['DPN', 'PN'], PSCE: ['DPE', 'PE'] } },
  { label: 'Position (legacy)', labelKey: 'logs.presets.quick.position-legacy.label', desc: 'PSC desired vs actual', descKey: 'logs.presets.quick.position-legacy.desc', types: ['PSC'], fields: { PSC: ['TPX', 'PX', 'TPY', 'PY'] } },
  { label: 'Airspeed', labelKey: 'logs.presets.quick.airspeed.label', desc: 'Indicated vs true airspeed', descKey: 'logs.presets.quick.airspeed.desc', types: ['ARSP'], fields: { ARSP: ['Airspeed', 'DiffPress'] } },
  { label: 'Rangefinder', labelKey: 'logs.presets.quick.rangefinder.label', desc: 'Distance per sensor (RFND)', descKey: 'logs.presets.quick.rangefinder.desc', types: ['RFND'], fields: { RFND: ['Dist'] } },
  { label: 'Wind Estimate', labelKey: 'logs.presets.quick.wind-estimate.label', desc: 'Wind X/Y/Z (NKF2)', descKey: 'logs.presets.quick.wind-estimate.desc', types: ['NKF2'], fields: { NKF2: ['VWN', 'VWE'] } },
  { label: 'Inputs vs Outputs', labelKey: 'logs.presets.quick.inputs-vs-outputs.label', desc: 'RC in vs motor out', descKey: 'logs.presets.quick.inputs-vs-outputs.desc', types: ['RCIN', 'RCOU'], fields: { RCIN: ['C1', 'C2', 'C3', 'C4'], RCOU: ['C1', 'C2', 'C3', 'C4'] } },
];

// PX4 ULog quick presets. Keyed by PX4 topic name with flattened array fields
// (q[0], gyro_rad[0], ...). Preset-filtering by messageTypes.includes hides any
// preset whose topic a given log lacks.
const PX4_PRESETS: ChartPreset[] = [
  { label: 'Attitude', labelKey: 'logs.presets.px4.attitude.label', desc: 'Attitude quaternion', descKey: 'logs.presets.px4.attitude.desc', types: ['vehicle_attitude'], fields: { vehicle_attitude: ['q[0]', 'q[1]', 'q[2]', 'q[3]'] } },
  { label: 'Rates (gyro)', labelKey: 'logs.presets.px4.rates-gyro.label', desc: 'Body angular rates', descKey: 'logs.presets.px4.rates-gyro.desc', types: ['sensor_combined'], fields: { sensor_combined: ['gyro_rad[0]', 'gyro_rad[1]', 'gyro_rad[2]'] } },
  { label: 'Vibration', labelKey: 'logs.presets.px4.vibration.label', desc: 'Accel & gyro vibration', descKey: 'logs.presets.px4.vibration.desc', types: ['vehicle_imu_status'], fields: { vehicle_imu_status: ['accel_vibration_metric', 'gyro_vibration_metric'] } },
  { label: 'GPS', labelKey: 'logs.presets.px4.gps.label', desc: 'Satellite count & fix type', descKey: 'logs.presets.px4.gps.desc', types: ['vehicle_gps_position'], fields: { vehicle_gps_position: ['satellites_used', 'fix_type'] } },
  { label: 'Battery', labelKey: 'logs.presets.px4.battery.label', desc: 'Voltage & current draw', descKey: 'logs.presets.px4.battery.desc', types: ['battery_status'], fields: { battery_status: ['voltage_v', 'current_a'] } },
  { label: 'Local Position', labelKey: 'logs.presets.px4.local-position.label', desc: 'Local X/Y/Z position', descKey: 'logs.presets.px4.local-position.desc', types: ['vehicle_local_position'], fields: { vehicle_local_position: ['x', 'y', 'z'] } },
  { label: 'EKF', labelKey: 'logs.presets.px4.ekf.label', desc: 'Estimator test ratios', descKey: 'logs.presets.px4.ekf.desc', types: ['estimator_status'], fields: { estimator_status: ['mag_test_ratio', 'vel_test_ratio', 'pos_test_ratio'] } },
];

/**
 * Common non-numeric ("event") fields per ArduPilot message type. The field
 * picker shows these alongside numeric fields so users can render them as
 * vertical event markers on the chart instead of being silently dropped for
 * being non-numeric.
 */
const EVENT_FIELDS_BY_TYPE: Record<string, string[]> = {
  MODE: ['Name'],
  MSG: ['Message'],
  CMD: ['CName'],
};

function getModeTimeline(log: ReturnType<typeof useLogStore.getState>['currentLog']) {
  if (!log) return [];
  const modes = logRows(log, 'MODE');
  if (modes.length === 0) return [];
  const endTimeS = log.timeRange.endUs / 1_000_000;
  const segments: { startS: number; endS: number; name: string; color: string }[] = [];
  for (let i = 0; i < modes.length; i++) {
    const m = modes[i]!;
    const modeNum = (typeof m.fields['ModeNum'] === 'number' ? m.fields['ModeNum'] : m.fields['Mode']) as number;
    const name = getModeName(modeNum, log.metadata?.vehicleType);
    const startS = m.timeUs / 1_000_000;
    const endS = i + 1 < modes.length ? (modes[i + 1]!.timeUs / 1_000_000) : endTimeS;
    segments.push({ startS, endS, name, color: MODE_COLORS[name] ?? '#6b7280' });
  }
  return segments;
}

// Reject points before GPS lock (null island) or out of range so the track
// doesn't draw a line to 0,0.

/**
 * Build a (type, field) -> unit string lookup from the parsed log's UNIT/FMTU
 * metadata. Falls back gracefully when the log has no unit records (older
 * firmware): the returned function just yields undefined and labels render
 * unitless. Shared by the chart series labels, the y axes, and the field
 * picker so they always agree.
 */
function makeUnitLookup(log: ReturnType<typeof useLogStore.getState>['currentLog']): (type: string, field: string) => string | undefined {
  if (!log) return () => undefined;
  const unitLabels = log.unitLabels ?? {};
  if (Object.keys(unitLabels).length === 0) return () => undefined;
  const formatList = Object.values(log.formats);
  return (type, field) => {
    for (const fmt of formatList) {
      if (fmt.name !== type) continue;
      if (!fmt.unitChars) return undefined;
      const idx = fmt.fields.indexOf(field);
      if (idx === -1) return undefined;
      const ch = fmt.unitChars[idx];
      if (!ch || ch === '-') return undefined;
      const label = unitLabels[ch];
      if (!label || label === '-' || label === '') return undefined;
      return label;
    }
    return undefined;
  };
}

/**
 * PX4 mode timeline derived from vehicle_status.nav_state, mirroring the
 * ArduPilot getModeTimeline shape so the map legend/coloring can consume
 * either. nav_state is sampled on its own timeline; each segment runs from
 * its sample time to the next distinct sample (or log end).
 */
function getPx4ModeTimeline(log: ReturnType<typeof useLogStore.getState>['currentLog']) {
  if (!log) return [];
  const status = logRows(log, 'vehicle_status');
  if (status.length === 0) return [];
  const endTimeS = log.timeRange.endUs / 1_000_000;
  const segments: { startS: number; endS: number; name: string; color: string }[] = [];
  let lastNav: number | null = null;
  for (let i = 0; i < status.length; i++) {
    const m = status[i]!;
    const nav = m.fields['nav_state'];
    if (typeof nav !== 'number') continue;
    // Collapse consecutive identical nav_state samples into one segment, and
    // extend the open segment's end as we walk forward.
    const startS = m.timeUs / 1_000_000;
    if (nav === lastNav && segments.length > 0) {
      segments[segments.length - 1]!.endS = endTimeS;
      continue;
    }
    const name = px4ModeName(nav);
    segments.push({ startS, endS: endTimeS, name, color: MODE_COLORS[name.toUpperCase()] ?? '#6b7280' });
    const prev = segments[segments.length - 2];
    if (prev) prev.endS = startS;
    lastNav = nav;
  }
  return segments;
}

// ============================================================================
// Chart Panel
// ============================================================================

/**
 * `chartId` lets multiple ChartPanel instances coexist with independent
 * field selections (Mission Planner-style comparison view). Each panel
 * renders the slice of the store keyed by its own chartId; the global field
 * picker writes to whichever chart the user has selected as active.
 */
function ChartPanel({ chartId }: { chartId: string }) {
  const { t } = useTranslation('views');
  const currentLog = useLogStore((s) => s.currentLog);
  const selectedTypes = useLogStore((s) => s.selectedTypesByChart[chartId] ?? []);
  const selectedFields = useLogStore((s) => s.selectedFieldsByChart[chartId] ?? new Map());
  const activeChartId = useLogStore((s) => s.activeChartId);
  const setActiveChartId = useLogStore((s) => s.setActiveChartId);
  const chartIds = useLogStore((s) => s.chartIds);
  const isActive = activeChartId === chartId;
  const chartIndex = chartIds.indexOf(chartId);
  const resolvedTheme = useResolvedTheme();
  const isLight = resolvedTheme === 'light';
  // Cross-chart field application: presets here mutate THIS chart's state,
  // which means we briefly re-target the store's active id, write, then
  // restore. Saves callers from threading chartId through every store
  // action signature.
  const writeToThisChart = useCallback((fn: () => void) => {
    const store = useLogStore.getState();
    const prev = store.activeChartId;
    if (prev !== chartId) store.setActiveChartId(chartId);
    fn();
    if (prev !== chartId) store.setActiveChartId(prev);
  }, [chartId]);
  const setSelectedTypes = useCallback((types: string[]) => {
    writeToThisChart(() => useLogStore.getState().setSelectedTypes(types));
  }, [writeToThisChart]);
  const setSelectedFields = useCallback((type: string, fields: string[]) => {
    writeToThisChart(() => useLogStore.getState().setSelectedFields(type, fields));
  }, [writeToThisChart]);

  const chartRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);
  // Local zoom state used when sync is disabled. When sync is enabled the
  // effective xRange comes from the store (`syncedXRange`) so all charts
  // share one time window — drag-zoom on chart 1 also zooms chart 2.
  const [localXRange, setLocalXRange] = useState<{ min: number; max: number } | null>(null);
  const syncedXRange = useLogStore((s) => s.syncedXRange);
  const syncZoomEnabled = useLogStore((s) => s.syncZoomEnabled);
  const setSyncedXRange = useLogStore((s) => s.setSyncedXRange);
  const setSyncZoomEnabled = useLogStore((s) => s.setSyncZoomEnabled);
  const explorerTool = useLogStore((s) => s.explorerTool);
  const xRange = syncZoomEnabled ? syncedXRange : localXRange;
  const isZoomed = xRange !== null;
  // Stable broadcaster used inside uPlot hooks; avoids re-creating the chart
  // every time the store-derived flag flips.
  const applyZoom = useCallback((range: { min: number; max: number } | null) => {
    if (useLogStore.getState().syncZoomEnabled) {
      useLogStore.getState().setSyncedXRange(range);
    } else {
      setLocalXRange(range);
    }
  }, []);
  // Legend defaults to collapsed once it would exceed the inline-summary
  // threshold; user can pin it open per-chart.
  const [legendExpanded, setLegendExpanded] = useState(false);

  // Y-axis behaviour is PER-CHART local state (only the X window is synced
  // across charts).
  //   'unit'   one axis per unit, the way Mission Planner's log browser groups
  //            them: three altitudes in metres share a scale and stay directly
  //            comparable, while volts get their own axis.
  //   'shared' everything on one axis, including across units.
  //   'field'  every field on its own auto-scaled axis, for comparing the
  //            SHAPE of signals whose magnitudes have nothing in common.
  const [yMode, setYMode] = useState<YMode>('unit');
  // True once the user manually zoomed/panned Y (shift-scroll or right-drag),
  // which locks Y so the auto-refit-on-X-change stops fighting the manual view.
  const yPinnedRef = useRef(false);
  // Per-series Y range, keyed by series label. Split mode gives every field its
  // own axis but only the first two get a drawn gutter to drag, so typing the
  // range is the only control that reaches every series. A pinned series is
  // exempt from auto-fit until it is reset.
  const [seriesRanges, setSeriesRanges] = useState<Record<string, { min: number; max: number }>>({});
  const seriesRangesRef = useRef(seriesRanges);
  seriesRangesRef.current = seriesRanges;
  // Which axis the Y gestures act on. Null = all of them, which is the only
  // sensible default when there is one scale and the wrong one when there are
  // three: zooming every axis at once moves nothing relative to anything.
  const [activeScaleKey, setActiveScaleKey] = useState<string | null>(null);
  const activeScaleKeyRef = useRef(activeScaleKey);
  activeScaleKeyRef.current = activeScaleKey;
  const refitYRef = useRef<((u: uPlot) => void) | null>(null);
  const [yZoomed, setYZoomed] = useState(false);

  const messageTypes = currentLog?.messageTypes ?? [];
  const presets = currentLog?.format === 'ulog' ? PX4_PRESETS : QUICK_PRESETS;
  const modeTimeline = useMemo(() => getModeTimeline(currentLog), [currentLog]);
  const totalTimeS = currentLog ? (currentLog.timeRange.endUs - currentLog.timeRange.startUs) / 1_000_000 : 0;
  const startTimeS = currentLog ? currentLog.timeRange.startUs / 1_000_000 : 0;

  const chartData = useMemo(() => {
    if (!currentLog) return null;

    const lookupUnit = makeUnitLookup(currentLog);
    const labelWithUnit = (base: string, type: string, field: string): string => {
      const u = lookupUnit(type, field);
      return u ? `${base} (${u})` : base;
    };

    // Derive active types from selectedFields (don't depend on selectedTypes)
    const activeTypes: string[] = [];
    selectedFields.forEach((fields, type) => {
      if (fields.length > 0) activeTypes.push(type);
    });
    if (activeTypes.length === 0) return null;

    // Event markers — non-numeric fields (MODE.Name, MSG.Message, CMD.CName)
    // selected from the field picker. Rendered as vertical lines via the
    // uPlot draw hook below. Kept separate from numeric series so they don't
    // pollute the y-axis with NaN-only "data".
    const eventMarkers: { timeS: number; label: string; color: string }[] = [];

    // Collect per-type time+value arrays, then join onto a common time axis
    const perType: { time: number[]; label: string; values: number[] }[][] = [];
    for (const type of activeTypes) {
      const fields = selectedFields.get(type)!;
      const cols = currentLog.messages[type];
      if (!cols || cols.count === 0) continue;

      // Multi-instance message detection: ArduPilot dumps every ESC/IMU/MAG/
      // BARO/GPS/etc. into a single message bucket and identifies the source
      // sensor with an `Instance` (newer) or `I` (older) field. Plotting RPM
      // without splitting by instance produces a single zigzag line that
      // hops between motor 0..3 — useless. Split into one series per
      // instance so a quad shows 4 RPM lines.
      const instanceKey =
        cols.num['Instance'] !== undefined ? 'Instance'
        : cols.num['I'] !== undefined ? 'I'
        : null;
      const instCol = instanceKey ? cols.num[instanceKey] : undefined;
      const distinctInstances = new Set<number>();
      if (instCol) {
        // Cap the scan: 1024 messages is plenty to detect the typical 1-8
        // range and avoids walking million-row series for the check.
        const limit = Math.min(cols.count, 1024);
        for (let i = 0; i < limit; i++) {
          const v = instCol[i];
          if (v !== undefined) distinctInstances.add(v);
        }
      }
      const splitByInstance = instanceKey != null && distinctInstances.size > 1;

      const time = Array.from({ length: cols.count }, (_, i) => (cols.timeUs[i] ?? 0) / 1_000_000);
      const typeSeries: { time: number[]; label: string; values: number[] }[] = [];
      const eventAllow = EVENT_FIELDS_BY_TYPE[type];
      for (const field of fields) {
        // Per-instance field selection: a stored name like `RPM[2]` means
        // "only instance 2 of RPM" (Mission Planner parity). Bare `RPM`
        // means "all instances" (legacy behavior). Both can coexist.
        const instMatch = field.match(/^(.+?)\[(\d+)\]$/);
        const baseField = instMatch ? instMatch[1]! : field;
        const targetInst = instMatch ? Number(instMatch[2]) : null;

        // Event-marker fields are extracted as discrete (timeS, label) tuples
        // and drawn separately. We dedupe consecutive identical labels so a
        // chatty MSG stream doesn't render thousands of identical markers.
        if (eventAllow?.includes(baseField) && cols.num[baseField] === undefined) {
          const textCol = cols.txt[baseField];
          let lastLabel: string | null = null;
          const color = EVENT_TYPE_COLORS[type] ?? '#9ca3af';
          for (let i = 0; i < cols.count; i++) {
            const label = textCol?.[i] ?? '';
            if (!label || label === lastLabel) continue;
            eventMarkers.push({ timeS: (cols.timeUs[i] ?? 0) / 1_000_000, label: `${type}: ${label}`, color });
            lastLabel = label;
          }
          continue;
        }
        const valueCol = cols.num[baseField];
        if (targetInst !== null && instCol) {
          // Single instance pick — emit one series for just this instance.
          const ti: number[] = [];
          const vi: number[] = [];
          for (let i = 0; i < cols.count; i++) {
            if (instCol[i] !== targetInst) continue;
            ti.push((cols.timeUs[i] ?? 0) / 1_000_000);
            vi.push(valueCol?.[i] ?? NaN);
          }
          typeSeries.push({ time: ti, label: labelWithUnit(`${type}[${targetInst}].${baseField}`, type, baseField), values: vi });
        } else if (splitByInstance) {
          // Bucket messages by instance value, preserving per-instance time
          // axes (different sample rates per sensor are common).
          const byInst = new Map<number, { time: number[]; values: number[] }>();
          for (let i = 0; i < cols.count; i++) {
            const inst = instCol?.[i];
            if (inst === undefined) continue;
            let bucket = byInst.get(inst);
            if (!bucket) { bucket = { time: [], values: [] }; byInst.set(inst, bucket); }
            bucket.time.push((cols.timeUs[i] ?? 0) / 1_000_000);
            bucket.values.push(valueCol?.[i] ?? NaN);
          }
          for (const [inst, bucket] of [...byInst.entries()].sort((a, b) => a[0] - b[0])) {
            typeSeries.push({
              time: bucket.time,
              label: labelWithUnit(`${type}[${inst}].${baseField}`, type, baseField),
              values: bucket.values,
            });
          }
        } else {
          const values = valueCol ? Array.from(valueCol) : new Array<number>(cols.count).fill(NaN);
          typeSeries.push({ time, label: labelWithUnit(`${type}.${baseField}`, type, baseField), values });
        }
      }
      if (typeSeries.length > 0) perType.push(typeSeries);
    }

    // No numeric series? If event markers were picked, render an empty chart
    // spanning the full log so the markers still show up. Without this, picking
    // only MODE.Name (very common workflow) would silently render nothing.
    if (perType.length === 0) {
      if (eventMarkers.length === 0) return null;
      const startS = currentLog.timeRange.startUs / 1_000_000;
      const endS = currentLog.timeRange.endUs / 1_000_000;
      const time = new Float64Array([startS, endS]);
      const empty = new Float64Array([NaN, NaN]);
      return {
        data: [time, empty] as uPlot.AlignedData,
        series: [{ label: t('logs.chart.events-only'), data: [NaN, NaN] }],
        eventMarkers,
      };
    }

    // If all series share the same time axis (single type), use it directly
    const allSeries = perType.flat();
    const firstTime = allSeries[0]!.time;
    const allSameTime = allSeries.every((s) => s.time === firstTime || s.time.length === firstTime.length);

    if (allSameTime && perType.length === 1) {
      return {
        data: [new Float64Array(firstTime), ...allSeries.map((s) => new Float64Array(s.values))] as uPlot.AlignedData,
        series: allSeries.map((s) => ({ label: s.label, data: s.values })),
        eventMarkers,
      };
    }

    // Multiple types with different sample rates: merge onto union time axis
    const timeSet = new Set<number>();
    for (const s of allSeries) for (const t of s.time) timeSet.add(t);
    const unionTime = Float64Array.from(timeSet).sort();

    const aligned = allSeries.map((s) => {
      const out = new Float64Array(unionTime.length).fill(NaN);
      let j = 0;
      for (let i = 0; i < unionTime.length && j < s.time.length; i++) {
        if (Math.abs(unionTime[i]! - s.time[j]!) < 0.0001) {
          out[i] = s.values[j]!;
          j++;
        }
      }
      return out;
    });

    return {
      data: [unionTime, ...aligned] as uPlot.AlignedData,
      series: allSeries.map((s) => ({ label: s.label, data: s.values })),
      eventMarkers,
    };
  }, [currentLog, selectedFields, t]);

  // Per-series min/avg/max/last over the CURRENTLY VISIBLE x window. Recomputes
  // as the user zooms/pans so the numbers always describe what is on screen -
  // this is the Mission Planner "min/max/avg" readout, but live and windowed.
  const seriesStats = useMemo<(FieldStats | null)[]>(() => {
    if (!chartData) return [];
    const xCol = chartData.data[0] as ArrayLike<number>;
    const n = xCol.length;
    if (n === 0) return chartData.series.map(() => null);
    const lo = xRange ? Math.max(0, upperBoundIdx(xCol, xRange.min)) : 0;
    const hi = xRange ? Math.min(n - 1, lowerBoundIdx(xCol, xRange.max)) : n - 1;
    if (hi < lo) return chartData.series.map(() => null);
    return chartData.series.map((_, i) => columnStats(chartData.data[i + 1] as ArrayLike<number>, lo, hi));
    // xRange is intentionally a dep: stats track the visible window.
  }, [chartData, xRange]);

  useEffect(() => {
    if (!chartRef.current || !chartData) {
      if (plotRef.current) { plotRef.current.destroy(); plotRef.current = null; }
      return;
    }

    const container = chartRef.current;
    const { width, height } = container.getBoundingClientRect();

    // A fresh uPlot auto-ranges Y from the data, so any prior manual Y pin no
    // longer applies - clear it so auto-fit-to-visible-window resumes.
    yPinnedRef.current = false;
    setYZoomed(false);

    // Snapshot mode + event data into closure-stable refs so the draw hooks
    // don't have to re-read the React store on every paint (the chart
    // re-creates itself when chartData changes anyway, picking up new data).
    const modeSegments = modeTimeline;
    const markers = chartData.eventMarkers ?? [];

    const seriesCount = chartData.series.length;
    const xData0 = chartData.data[0] as ArrayLike<number>;
    const seriesColor = (i: number) => SERIES_COLORS[i % SERIES_COLORS.length]!;
    // Series indexes grouped by the scale they ride, in first-appearance order.
    const scaleGroups = groupSeriesByScale(yMode, chartData.series.map((sr) => sr.label));
    const scaleKeys = [...scaleGroups.keys()];
    const perSeriesScale = yMode !== 'shared';
    const panTool = explorerTool === 'pan';

    // Auto-fit Y to the DATA WITHIN THE VISIBLE X WINDOW. Runs whenever X
    // changes (via the setScale hook below) so panning/zooming time keeps the
    // trace filling the panel - the single biggest readability win over MP,
    // whose Y stays fixed while you scrub X. Skipped once the user takes manual
    // control of Y (shift-scroll / right-drag / vertical box), which pins it.
    let refitting = false;
    const refitY = (u: uPlot) => {
      if (refitting) return;
      const pins = seriesRangesRef.current;
      const anyPinned = scaleKeys.some((k) => pins[k]);
      // A globally pinned Y (shift-scroll / box drag) stops auto-fit, but typed
      // per-series ranges still have to be re-applied or a rebuild loses them.
      if (yPinnedRef.current && !anyPinned) return;
      const xn = xData0.length;
      if (xn === 0) return;
      const xmin = u.scales.x?.min ?? xData0[0]!;
      const xmax = u.scales.x?.max ?? xData0[xn - 1]!;
      const lo = Math.max(0, upperBoundIdx(xData0, xmin));
      const hi = Math.min(xn - 1, lowerBoundIdx(xData0, xmax));
      if (hi < lo) return;
      refitting = true;
      u.batch(() => {
        for (const [key, members] of scaleGroups) {
          const pin = pins[key];
          if (pin) { u.setScale(key, { min: pin.min, max: pin.max }); continue; }
          if (yPinnedRef.current) continue;
          // A scale spans every series sharing it, so same-unit fields keep a
          // common frame of reference instead of each filling the panel.
          let mn = Infinity;
          let mx = -Infinity;
          for (const i of members) {
            const st = columnStats(u.data[i + 1] as ArrayLike<number>, lo, hi);
            if (st) { if (st.min < mn) mn = st.min; if (st.max > mx) mx = st.max; }
          }
          if (mn > mx) continue;
          const [a, b] = padRange({ min: mn, max: mx, avg: 0, last: 0, count: 1 });
          u.setScale(key, { min: a, max: b });
        }
      });
      refitting = false;
    };

    const axisTheme = {
      stroke: isLight ? '#4b5563' : '#9ca3af',
      grid: { stroke: isLight ? '#e5e7eb' : '#1f2937', width: 1 },
      ticks: { stroke: isLight ? '#d1d5db' : '#374151', width: 1 },
      font: '11px system-ui',
    };
    const xAxis: uPlot.Axis = { label: t('logs.chart.axis-time'), ...axisTheme };

    // One drawn axis per scale, alternating left/right the way Mission Planner
    // stacks its YAxisList / Y2AxisList. Every scale gets a gutter: an axis a
    // series rides but that is nowhere on screen is unreadable by definition.
    const scales: uPlot.Scales = { x: { time: false } };
    for (const key of scaleKeys) scales[key] = { auto: true };

    const axisLabelFor = (key: string, members: number[]): string | undefined => {
      if (yMode === 'field') return chartData.series[members[0]!]!.label;
      const unit = key.startsWith('u_') ? key.slice(2) : undefined;
      if (unit) return unit;
      // Shared mode names the axis only when every series agrees on one unit;
      // labelling a mixed-unit axis would be labelling it with a lie.
      const units = members.map((i) => unitOfLabel(chartData.series[i]!.label));
      return units.length > 0 && units[0] && units.every((u) => u === units[0]) ? units[0] : undefined;
    };

    const axes: uPlot.Axis[] = [xAxis];
    [...scaleGroups.entries()].forEach(([key, members], n) => {
      axes.push({
        ...axisTheme,
        scale: key,
        side: n % 2 === 0 ? 3 : 1,
        // Colour the gutter to its series only when it carries just one, else
        // the colour would claim the axis belongs to one of several fields.
        stroke: members.length === 1 && perSeriesScale ? seriesColor(members[0]!) : axisTheme.stroke,
        label: axisLabelFor(key, members),
        // Only the first axis draws gridlines; several overlaid grids on
        // different scales is visual noise that lines up with nothing.
        ...(n === 0 ? {} : { grid: { show: false, stroke: 'transparent', width: 0 } }),
      });
    });

    const seriesOpts: uPlot.Series[] = [
      { label: t('logs.chart.series-time') },
      ...chartData.series.map((s, i) => ({
        label: s.label,
        stroke: seriesColor(i),
        width: 1.5,
        scale: scaleKeyFor(yMode, s.label, i),
        points: { show: false },
      })),
    ];

    // Null until the plot exists: the readout attaches to plot.over, and uPlot
    // fires setCursor during construction, before that assignment can happen.
    let readout: ChartCursorReadout | null = null;

    const opts: uPlot.Options = {
      width: Math.max(width, 300),
      height: Math.max(height, 200),
      cursor: {
        // uni: a mostly-horizontal drag zooms X, a mostly-vertical drag zooms Y
        // (fit mode only), a big diagonal drag box-zooms both. Independent mode
        // keeps drag X-only since a single Y box is ambiguous across scales.
        // setScale:false — we apply the zoom ourselves in the setSelect hook so
        // we can broadcast the X window to sibling charts and pin Y correctly;
        // letting uPlot also auto-zoom would double-apply and race the hook.
        // Pan tool: left-drag pans instead (handled below), so box-select is off.
        drag: panTool
          ? { x: false, y: false, setScale: false }
          : scaleKeys.length > 1 ? { x: true, y: false, uni: 50, setScale: false } : { x: true, y: true, uni: 40, setScale: false },
        // Crosshair follows the same time value on every chart panel.
        sync: { key: X_CURSOR_SYNC_KEY, setSeries: false, scales: ['x', null] },
      },
      select: { show: true, left: 0, top: 0, width: 0, height: 0 },
      hooks: {
        setScale: [(u, key) => { if (key === 'x') refitY(u); }],
        // Broadcast the hovered time so the flight-path map can walk a marker
        // along the trajectory. Only the chart actually under the mouse
        // publishes - synced charts re-fire this hook and must stay silent.
        setCursor: [(u) => {
          // Values under the crosshair. Runs on synced siblings too, so every
          // chart shows its own numbers, but only the hovered one owns the
          // shared hover time.
          const idx = u.cursor.idx;
          const left = u.cursor.left ?? -1;
          const top = u.cursor.top ?? -1;
          if (idx == null || left < 0 || top < 0) {
            readout?.update(null, 0, []);
          } else {
            const xs = u.data[0] as ArrayLike<number>;
            const rows: CursorRow[] = [];
            for (let si = 1; si < u.series.length; si++) {
              const ser = u.series[si]!;
              if (ser.show === false) continue;
              rows.push({
                label: String(ser.label ?? `s${si}`),
                color: typeof ser.stroke === 'string' ? ser.stroke : seriesColor(si - 1),
                value: (u.data[si] as ArrayLike<number> | undefined)?.[idx],
              });
            }
            readout?.update({ left, top }, xs[idx] ?? 0, rows);
          }

          if (!u.over.matches(':hover')) return;
          publishHoverTime(left < 0 ? null : u.posToVal(left, 'x'));
        }],
        setSelect: [(u) => {
          const zoomX = u.select.width > 10;
          const zoomY = u.select.height > 10 && scaleKeys.length === 1;
          if (zoomY) {
            // Pin Y BEFORE touching X so the X setScale hook's auto-refit does
            // not clobber the box we are about to set.
            yPinnedRef.current = true;
            setYZoomed(true);
            const a = u.posToVal(u.select.top, 'y');
            const b = u.posToVal(u.select.top + u.select.height, 'y');
            u.setScale('y', { min: Math.min(a, b), max: Math.max(a, b) });
          }
          if (zoomX) {
            const minX = u.posToVal(u.select.left, 'x');
            const maxX = u.posToVal(u.select.left + u.select.width, 'x');
            u.setScale('x', { min: minX, max: maxX });
            applyZoom({ min: minX, max: maxX });
          }
          u.setSelect({ left: 0, top: 0, width: 0, height: 0 }, false);
        }],
        // Render mode bands BEFORE series so they sit underneath the chart
        // lines and act as a tinted backdrop. drawClear runs right after the
        // canvas wipe and before any series stroke - perfect for backdrops.
        drawClear: [(u) => {
          if (modeSegments.length === 0) return;
          const ctx = u.ctx;
          const xMin = u.scales.x?.min ?? 0;
          const xMax = u.scales.x?.max ?? 0;
          const top = u.bbox.top;
          const bottom = u.bbox.top + u.bbox.height;
          ctx.save();
          ctx.beginPath();
          ctx.rect(u.bbox.left, top, u.bbox.width, u.bbox.height);
          ctx.clip();
          for (const seg of modeSegments) {
            if (seg.endS < xMin || seg.startS > xMax) continue;
            const x1 = u.valToPos(Math.max(seg.startS, xMin), 'x', true);
            const x2 = u.valToPos(Math.min(seg.endS, xMax), 'x', true);
            ctx.fillStyle = seg.color + '14'; // ~8% alpha
            ctx.fillRect(x1, top, x2 - x1, bottom - top);
          }
          ctx.restore();
        }],
        // Render event markers AFTER series so they sit on top with crisp
        // labels visible against the chart content.
        draw: [(u) => {
          if (markers.length === 0) return;
          const ctx = u.ctx;
          const xMin = u.scales.x?.min ?? 0;
          const xMax = u.scales.x?.max ?? 0;
          const top = u.bbox.top;
          const bottom = u.bbox.top + u.bbox.height;
          ctx.save();
          ctx.beginPath();
          ctx.rect(u.bbox.left, top, u.bbox.width, u.bbox.height);
          ctx.clip();
          ctx.font = '10px system-ui';
          ctx.textBaseline = 'top';
          // Cull labels that would visually overlap (within 6px of the
          // previous one) so a flurry of MSGs doesn't render as a black bar.
          let lastLabelX = -Infinity;
          for (const m of markers) {
            if (m.timeS < xMin || m.timeS > xMax) continue;
            const x = u.valToPos(m.timeS, 'x', true);
            ctx.strokeStyle = m.color + 'cc';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, top);
            ctx.lineTo(x, bottom);
            ctx.stroke();
            if (x - lastLabelX > 6) {
              ctx.fillStyle = m.color;
              ctx.fillText(m.label, x + 3, top + 2);
              lastLabelX = x;
            }
          }
          ctx.restore();
        }],
      },
      scales,
      legend: { show: true },
      axes,
      series: seriesOpts,
    };

    if (plotRef.current) plotRef.current.destroy();
    const plot = new uPlot(opts, chartData.data, container);
    plotRef.current = plot;
    refitYRef.current = refitY;
    refitY(plot);

    // Direct manipulation on each Y axis: scroll over a gutter to zoom that
    // scale, drag it to pan, double-click to hand it back to auto-fit. uPlot
    // gives every axis its own positioned `.u-axis` element in axes-array
    // order, so this needs no hit-testing and no private fields.
    const axisCleanups: (() => void)[] = [];
    {
      const axisEls = plot.root.querySelectorAll<HTMLElement>('.u-axis');
      // Index 0 is the time axis; the rest follow scaleKeys in order.
      scaleKeys.forEach((key, n) => {
        const el = axisEls[n + 1];
        if (!el) return;
        el.style.cursor = 'ns-resize';
        el.style.pointerEvents = 'auto';
        el.title = t('logs.chart.axis-hint');

        // Pin as we go: without recording the range, the next auto-refit on an
        // X change would immediately undo the gesture. The ref is written
        // alongside the state so a refit before React re-renders still sees it.
        const applyRange = (min: number, max: number) => {
          if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) return;
          plot.setScale(key, { min, max });
          seriesRangesRef.current = { ...seriesRangesRef.current, [key]: { min, max } };
          setSeriesRanges((prev) => ({ ...prev, [key]: { min, max } }));
        };

        const onWheel = (e: WheelEvent) => {
          e.preventDefault();
          e.stopPropagation();
          const sc = plot.scales[key];
          if (!sc || sc.min == null || sc.max == null) return;
          const rect = plot.over.getBoundingClientRect();
          const pct = rect.height > 0
            ? Math.min(Math.max((e.clientY - rect.top) / rect.height, 0), 1)
            : 0.5;
          const range = sc.max - sc.min;
          const anchor = sc.max - pct * range;
          // Same exponential response as the plot's own wheel handling: a fixed
          // step per event is unusable on a trackpad's stream of small deltas.
          const next = range * wheelZoomFactor(e);
          const nMax = anchor + pct * next;
          applyRange(nMax - next, nMax);
        };

        const onDown = (e: MouseEvent) => {
          if (e.button !== 0) return;
          e.preventDefault();
          e.stopPropagation();
          const sc = plot.scales[key];
          if (!sc || sc.min == null || sc.max == null) return;
          const startY = e.clientY;
          const startMin = sc.min;
          const startMax = sc.max;
          const height = plot.over.getBoundingClientRect().height || 1;
          const move = (ev: MouseEvent) => {
            // Dragging down pulls the trace down, so the window moves up.
            const shift = ((ev.clientY - startY) / height) * (startMax - startMin);
            applyRange(startMin + shift, startMax + shift);
          };
          const up = () => {
            window.removeEventListener('mousemove', move);
            window.removeEventListener('mouseup', up);
          };
          window.addEventListener('mousemove', move);
          window.addEventListener('mouseup', up);
        };

        const onDblClick = (e: MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          const { [key]: _dropped, ...rest } = seriesRangesRef.current;
          seriesRangesRef.current = rest;
          setSeriesRanges(rest);
        };

        el.addEventListener('wheel', onWheel, { passive: false });
        el.addEventListener('mousedown', onDown);
        el.addEventListener('dblclick', onDblClick);
        axisCleanups.push(() => {
          el.removeEventListener('wheel', onWheel);
          el.removeEventListener('mousedown', onDown);
          el.removeEventListener('dblclick', onDblClick);
        });
      });
    }
    readout = createCursorReadout(plot.over);

    // A rebuild (Y-mode switch, theme change, new fields) resets the plot to
    // the full time range. Re-apply the active zoom window so the user's view
    // survives; the setScale('x') hook then auto-fits Y to that window.
    if (xRange && xRange.max > xRange.min) {
      plot.setScale('x', { min: xRange.min, max: xRange.max });
    }

    const yScaleKeys = scaleKeys;

    const xExtent = (): [number, number] => {
      const xd = chartData.data[0] as Float64Array;
      return [xd[0]!, xd[xd.length - 1]!];
    };

    // Apply an X window clamped to the data extent, so zoom-out/pan can never
    // overshoot into empty space. Landing on the full extent clears the zoom
    // state entirely (Reset button hides, stats read "full log").
    const setXWindow = (min: number, max: number) => {
      const [x0, x1] = xExtent();
      let nMin = Math.max(min, x0);
      let nMax = Math.min(max, x1);
      if (nMax <= nMin) { nMin = x0; nMax = x1; }
      plot.setScale('x', { min: nMin, max: nMax });
      applyZoom(nMin <= x0 && nMax >= x1 ? null : { min: nMin, max: nMax });
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = plot.over.getBoundingClientRect();
      const { dx, dy } = wheelDeltas(e);
      const zoomFactor = wheelZoomFactor(e);

      // Shift+scroll zooms Y (anchored under the cursor), leaving the time
      // window untouched - MP has no equivalent quick vertical zoom.
      if (e.shiftKey) {
        const pctTop = rect.height > 0 ? Math.min(Math.max((e.clientY - rect.top) / rect.height, 0), 1) : 0.5;
        const active = activeScaleKeyRef.current;
        const targets = active && yScaleKeys.includes(active) ? [active] : yScaleKeys;
        plot.batch(() => {
          for (const k of targets) {
            const s = plot.scales[k];
            if (!s || s.min == null || s.max == null) continue;
            const r = s.max - s.min;
            const anchor = s.max - pctTop * r; // value currently under the cursor (top = max)
            const nr = r * zoomFactor;
            const nMax = anchor + pctTop * nr;
            plot.setScale(k, { min: nMax - nr, max: nMax });
          }
        });
        yPinnedRef.current = true;
        setYZoomed(true);
        return;
      }

      const xMin = plot.scales.x?.min ?? 0;
      const xMax = plot.scales.x?.max ?? 1;
      const range = xMax - xMin;

      // Two-finger horizontal scroll pans time - the natural touchpad gesture.
      if (!e.ctrlKey && Math.abs(dx) > Math.abs(dy) && rect.width > 0) {
        const shift = (dx / rect.width) * range;
        setXWindow(xMin + shift, xMax + shift);
        return;
      }

      // Keep a zoom-in floor so a runaway gesture can't collapse the window
      // below ~1ms and strand the user in a degenerate scale.
      const pctLeft = rect.width > 0 ? Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1) : 0.5;
      const newRange = Math.max(range * zoomFactor, 0.001);
      const newMin = xMin + (range - newRange) * pctLeft;
      setXWindow(newMin, newMin + newRange);
    };

    // Right-drag pans both axes (grab-and-drag). Left-drag stays box-zoom, so
    // pan needs its own button; we swallow the context menu while over the plot.
    let pan: { cx: number; cy: number; xMin: number; xMax: number; y: Record<string, { min: number; max: number }> } | null = null;
    const onPanMove = (e: MouseEvent) => {
      if (!pan) return;
      const rect = plot.over.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const dx = e.clientX - pan.cx;
      const dy = e.clientY - pan.cy;
      const xr = pan.xMax - pan.xMin;
      // Clamp the shift so the window stops at the data edges instead of
      // sailing off into empty space.
      const [x0, x1] = xExtent();
      const xShift = Math.min(Math.max(-(dx / rect.width) * xr, x0 - pan.xMin), x1 - pan.xMax);
      const nxMin = pan.xMin + xShift;
      const nxMax = pan.xMax + xShift;
      yPinnedRef.current = true; // hold Y while panning so the X hook won't refit
      plot.batch(() => {
        plot.setScale('x', { min: nxMin, max: nxMax });
        for (const k of Object.keys(pan!.y)) {
          const r = pan!.y[k]!;
          const yShift = (dy / rect.height) * (r.max - r.min);
          plot.setScale(k, { min: r.min + yShift, max: r.max + yShift });
        }
      });
      setYZoomed(true);
      applyZoom({ min: nxMin, max: nxMax });
    };
    const onPanUp = () => {
      pan = null;
      plot.over.style.cursor = panTool ? 'grab' : '';
      window.removeEventListener('mousemove', onPanMove);
      window.removeEventListener('mouseup', onPanUp);
    };
    const onPanDown = (e: MouseEvent) => {
      // Right-drag always pans; left-drag pans too when the Pan tool is
      // active (touchpads have no comfortable right-button drag).
      if (e.button !== 2 && !(panTool && e.button === 0)) return;
      e.preventDefault();
      plot.over.style.cursor = 'grabbing';
      const y: Record<string, { min: number; max: number }> = {};
      for (const k of yScaleKeys) {
        const s = plot.scales[k];
        if (s && s.min != null && s.max != null) y[k] = { min: s.min, max: s.max };
      }
      pan = { cx: e.clientX, cy: e.clientY, xMin: plot.scales.x?.min ?? 0, xMax: plot.scales.x?.max ?? 1, y };
      window.addEventListener('mousemove', onPanMove);
      window.addEventListener('mouseup', onPanUp);
    };
    const onContextMenu = (e: Event) => e.preventDefault();

    const handleDblClick = () => {
      // Reset both axes: release the Y pin, restore full time range; the X
      // setScale hook then auto-refits Y to the whole log.
      yPinnedRef.current = false;
      setYZoomed(false);
      const xData = chartData.data[0] as Float64Array;
      plot.setScale('x', { min: xData[0]!, max: xData[xData.length - 1]! });
      applyZoom(null);
    };

    // The setCursor hook can't see the mouse leave (uPlot parks the cursor at
    // -10 without :hover matching), so clear the map hover marker explicitly.
    const onLeave = () => { publishHoverTime(null); readout?.update(null, 0, []); };
    plot.over.addEventListener('mouseleave', onLeave);
    if (panTool) plot.over.style.cursor = 'grab';

    container.addEventListener('wheel', handleWheel, { passive: false });
    container.addEventListener('mousedown', onPanDown);
    container.addEventListener('contextmenu', onContextMenu);
    container.addEventListener('dblclick', handleDblClick);

    return () => {
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('mousedown', onPanDown);
      container.removeEventListener('contextmenu', onContextMenu);
      container.removeEventListener('dblclick', handleDblClick);
      plot.over.removeEventListener('mouseleave', onLeave);
      for (const off of axisCleanups) off();
      readout?.destroy();
      window.removeEventListener('mousemove', onPanMove);
      window.removeEventListener('mouseup', onPanUp);
      if (plotRef.current) { plotRef.current.destroy(); plotRef.current = null; }
    };
    // xRange is read from the closure at rebuild time only (to restore the view);
    // it is deliberately NOT a dep - listing it would recreate the chart on every
    // zoom tick. The synced-range effect below drives live zoom updates instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartData, isLight, modeTimeline, applyZoom, yMode, explorerTool, t]);

  // A typed range applies through the same refit path the chart already uses,
  // so it survives X zoom/pan without rebuilding the plot.
  useEffect(() => {
    const plot = plotRef.current;
    if (plot) refitYRef.current?.(plot);
  }, [seriesRanges]);


  // Apply the synchronized zoom range to this chart's plot whenever the
  // store value changes (i.e. another chart drove the zoom). Local zoom is
  // already applied imperatively in the user-gesture handlers above, so this
  // only fires for *external* updates and during initial render.
  //
  // When sync is enabled but no explicit range is set, we use the full *log*
  // time range rather than each chart's own data extent — otherwise a chart
  // showing ESC RPM (data only at 290-340s) and one showing RCOU (data at
  // 0-340s) start out visually misaligned even though sync is "on".
  useEffect(() => {
    if (!syncZoomEnabled || !plotRef.current || !chartData) return;
    if (syncedXRange) {
      plotRef.current.setScale('x', { min: syncedXRange.min, max: syncedXRange.max });
    } else if (currentLog) {
      const min = currentLog.timeRange.startUs / 1_000_000;
      const max = currentLog.timeRange.endUs / 1_000_000;
      if (max > min) plotRef.current.setScale('x', { min, max });
    }
  }, [syncedXRange, syncZoomEnabled, chartData, currentLog]);

  useEffect(() => {
    const el = chartRef.current;
    if (!el || !plotRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        plotRef.current?.setSize({ width: entry.contentRect.width, height: Math.max(entry.contentRect.height, 150) });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [chartData]);

  // Jump requests from the events/params panels ("show me this moment"):
  // apply to this chart regardless of sync mode - applyZoom routes to the
  // shared store or local state as configured.
  useEffect(() => subscribeTimeJump((range) => {
    const plot = plotRef.current;
    if (!plot) return;
    plot.setScale('x', range);
    applyZoom(range);
  }), [applyZoom]);

  const resetZoom = useCallback(() => {
    if (plotRef.current && chartData) {
      yPinnedRef.current = false;
      setYZoomed(false);
      // "Reset both axes" includes typed per-axis ranges and the axis the Y
      // gestures were aimed at; leaving either would make the button look like
      // it did nothing for those fields.
      setSeriesRanges({});
      setActiveScaleKey(null);
      const xData = chartData.data[0] as Float64Array;
      // Clears the X window; the setScale('x') hook auto-refits Y to full log.
      plotRef.current.setScale('x', { min: xData[0]!, max: xData[xData.length - 1]! });
      applyZoom(null);
    }
  }, [chartData, applyZoom]);

  // CSV of the visible window (or whole log when not zoomed) - the "hand the
  // slice to a spreadsheet / script" escape hatch MP users keep asking for.
  const exportCsv = useCallback(() => {
    if (!chartData) return;
    const xCol = chartData.data[0] as ArrayLike<number>;
    const n = xCol.length;
    if (n === 0) return;
    const lo = xRange ? Math.max(0, upperBoundIdx(xCol, xRange.min)) : 0;
    const hi = xRange ? Math.min(n - 1, lowerBoundIdx(xCol, xRange.max)) : n - 1;
    if (hi < lo) return;
    const csv = chartCsv(chartData.data as unknown as ArrayLike<number>[], chartData.series.map((s) => s.label), lo, hi);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = xRange
      ? `chart-${chartIndex + 1}-${xRange.min.toFixed(1)}s-${xRange.max.toFixed(1)}s.csv`
      : `chart-${chartIndex + 1}-full.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [chartData, xRange, chartIndex]);

  const applyPreset = useCallback((preset: typeof QUICK_PRESETS[number]) => {
    const validTypes = preset.types.filter((t) => messageTypes.includes(t));
    if (validTypes.length === 0) return;
    setSelectedTypes(validTypes);
    for (const [type, fields] of Object.entries(preset.fields)) {
      if (messageTypes.includes(type)) setSelectedFields(type, fields);
    }
  }, [messageTypes, setSelectedTypes, setSelectedFields]);

  // Auto-load first available preset on initial mount only
  const autoLoaded = useRef(false);
  useEffect(() => {
    if (autoLoaded.current) return;
    autoLoaded.current = true;
    if (selectedTypes.length > 0) return; // already has selection
    const preferred = ['Altitude', 'Attitude'];
    for (const name of preferred) {
      const preset = presets.find((p) => p.label === name && p.types.some((t) => messageTypes.includes(t)));
      if (preset) { applyPreset(preset); return; }
    }
    const first = presets.find((p) => p.types.some((t) => messageTypes.includes(t)));
    if (first) applyPreset(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!chartData) {
    return (
      <div
        className={`h-full flex flex-col items-center justify-center gap-4 p-6 ${isActive ? 'ring-1 ring-blue-500/40 rounded-sm' : ''}`}
        onMouseDown={() => { if (!isActive) setActiveChartId(chartId); }}
      >
        <div className={`text-[10px] uppercase tracking-wider ${isActive ? 'text-blue-400 font-semibold' : 'text-content-tertiary'}`}>
          {t('logs.chart.title-n', { n: chartIndex + 1 })}{chartIds.length > 1 ? (isActive ? t('logs.chart.picker-target') : t('logs.chart.click-to-target')) : ''}
        </div>
        <div className="text-content-secondary text-sm">{t('logs.chart.empty-hint')}</div>
        <div className="flex flex-wrap justify-center gap-2">
          {presets.filter((p) => p.types.some((t) => messageTypes.includes(t))).map((preset) => (
            <button
              key={preset.label}
              onClick={() => applyPreset(preset)}
              className="flex flex-col items-start px-3 py-2 rounded-lg bg-surface hover:bg-blue-500/10 hover:border-blue-500/30 border border-subtle transition-colors text-left"
            >
              <span className="text-xs text-content font-medium">{lgText(t, preset.labelKey, preset.label)}</span>
              <span className="text-[10px] text-content-secondary">{lgText(t, preset.descKey, preset.desc)}</span>
            </button>
          ))}
        </div>
        <p className="text-[10px] text-content-tertiary mt-1">{t('logs.chart.gesture-hint')}</p>
      </div>
    );
  }

  // Compute visible mode segments clipped to current x range
  const visibleXMin = xRange?.min ?? startTimeS;
  const visibleXMax = xRange?.max ?? (startTimeS + totalTimeS);
  const visibleRange = visibleXMax - visibleXMin;

  return (
    <div
      className={`h-full flex flex-col relative ${isActive ? 'ring-1 ring-blue-500/40 rounded-sm' : ''}`}
      onMouseDown={() => { if (!isActive) setActiveChartId(chartId); }}
    >
      {(() => {
        // Group series by message type so the legend reads as a structured
        // table rather than a flat run-on list. With many series this is
        // dramatically denser — 26 items become 8 type rows, and the user
        // can still see every field name and its line color.
        type SeriesEntry = {
          label: string; field: string; color: string; stats: FieldStats | null;
          /** uPlot scale this row rides; rows sharing one move together. */
          scaleKey: string;
          /** Axis range currently in force: the typed one, else the auto fit. */
          range: { min: number; max: number } | null;
          pinned: boolean;
        };
        // Auto range per scale, over every series riding it, so the number the
        // editor shows is the one the axis is actually using.
        const scaleAutoRanges = new Map<string, { min: number; max: number }>();
        chartData.series.forEach((s, i) => {
          const st = seriesStats[i];
          if (!st) return;
          const key = scaleKeyFor(yMode, s.label, i);
          const prev = scaleAutoRanges.get(key);
          scaleAutoRanges.set(key, prev
            ? { min: Math.min(prev.min, st.min), max: Math.max(prev.max, st.max) }
            : { min: st.min, max: st.max });
        });
        for (const [key, r] of scaleAutoRanges) {
          const [a, b] = padRange({ min: r.min, max: r.max, avg: 0, last: 0, count: 1 });
          scaleAutoRanges.set(key, { min: a, max: b });
        }

        const groups = new Map<string, SeriesEntry[]>();
        chartData.series.forEach((s, i) => {
          const color = SERIES_COLORS[i % SERIES_COLORS.length]!;
          // Label format is `TYPE.field` or `TYPE[N].field` (per-instance).
          // Strip the leading TYPE off so the field name reads cleanly inside
          // its group; the type is shown once as the row label.
          const m = s.label.match(/^([A-Z][A-Z0-9_]*)(\[\d+\])?\.(.+)$/);
          const type = m?.[1] ?? s.label;
          const inst = m?.[2] ?? '';
          const field = m?.[3] ?? s.label;
          const display = inst ? `${field}${inst}` : field;
          const stats = seriesStats[i] ?? null;
          const key = scaleKeyFor(yMode, s.label, i);
          const pin = seriesRanges[key];
          const auto = scaleAutoRanges.get(key) ?? null;
          if (!groups.has(type)) groups.set(type, []);
          groups.get(type)!.push({
            label: s.label,
            field: display,
            color,
            stats,
            scaleKey: key,
            range: pin ?? auto,
            pinned: pin !== undefined,
          });
        });
        const legendColumns = yMode !== 'shared'
          ? '1fr 3.4rem 3.4rem 3.4rem 9.5rem'
          : '1fr 3.4rem 3.4rem 3.4rem';
        const groupCount = groups.size;
        const seriesCount = chartData.series.length;
        // Inline summary fits comfortably up to ~6 series; past that, default
        // to collapsed and let the user expand per chart. The threshold is
        // intentional: 6 chips fit on a single line at typical panel widths.
        const shouldAutoCollapse = seriesCount > 6;
        const isCollapsed = shouldAutoCollapse && !legendExpanded;
        return (
          <div className="flex flex-col flex-shrink-0 border-b border-subtle bg-surface-overlay-subtle">
            {/* Header row — chart label + summary + expand/collapse */}
            <div className="flex items-center gap-2 px-3 py-1 text-[10px] min-h-[22px]">
              <span className={`uppercase tracking-wider shrink-0 ${isActive ? 'text-blue-400 font-semibold' : 'text-content-tertiary'}`}>
                {t('logs.chart.title-n', { n: chartIndex + 1 })}{chartIds.length > 1 && isActive ? t('logs.chart.picker-target') : ''}
              </span>
              {seriesCount === 0 ? (
                <span className="text-content-tertiary italic">{t('logs.chart.no-fields')}</span>
              ) : (
                <>
                  <span className="w-px h-3 bg-subtle shrink-0" />
                  {isCollapsed ? (
                    // Collapsed: type names with per-type counts. User sees
                    // *what kinds* of data are plotted without the chart
                    // legend hijacking half the panel.
                    <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                      {[...groups.entries()].map(([type, items]) => (
                        <button
                          key={type}
                          onClick={() => setLegendExpanded(true)}
                          className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-surface-raised hover:bg-blue-500/10 text-content transition-colors"
                          title={items.map((it) => it.field).join(', ')}
                        >
                          <span className="font-medium">{type}</span>
                          <span className="text-content-tertiary tabular-nums">{items.length}</span>
                          <span className="flex items-center gap-[2px]">
                            {items.slice(0, 4).map((it) => (
                              <span key={it.label} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: it.color }} />
                            ))}
                            {items.length > 4 && (
                              <span className="text-[9px] text-content-tertiary">+{items.length - 4}</span>
                            )}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <span className="text-[9px] text-content-tertiary tabular-nums shrink-0">
                      {groupCount === 1
                        ? t('logs.chart.series-summary-one-group', { n: seriesCount, m: groupCount })
                        : t('logs.chart.series-summary', { n: seriesCount, m: groupCount })}
                    </span>
                  )}
                </>
              )}
              {/* Right-side action cluster lives IN the header row - floating
                  it over the panel corner collided with the stats columns. */}
              <div className="ml-auto flex items-center gap-1 shrink-0" data-tour="log-chart-actions">
                {shouldAutoCollapse && (
                  <button
                    onClick={() => setLegendExpanded(!legendExpanded)}
                    className="text-[10px] px-1.5 py-0.5 rounded text-content-secondary hover:text-content hover:bg-surface-raised transition-colors flex items-center gap-1"
                    data-tip={legendExpanded ? t('logs.chart.collapse-legend') : t('logs.chart.show-field-names')}
                  >
                    {legendExpanded ? t('logs.chart.collapse') : t('logs.chart.expand')}
                    <svg className={`w-2.5 h-2.5 transition-transform ${legendExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                )}
                <button
                  onClick={exportCsv}
                  className="px-1.5 py-0.5 rounded border bg-surface hover:bg-surface-raised text-content-secondary hover:text-content border-subtle transition-colors"
                  data-tip={t('logs.chart.export-csv')}
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0 0l-4-4m4 4l4-4" />
                  </svg>
                </button>
                <button
                  onClick={() => setYMode(Y_MODE_ORDER[(Y_MODE_ORDER.indexOf(yMode) + 1) % Y_MODE_ORDER.length]!)}
                  className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors flex items-center gap-1 ${
                    yMode !== 'shared'
                      ? 'bg-blue-500/15 hover:bg-blue-500/25 text-blue-400 border-blue-500/40'
                      : 'bg-surface hover:bg-surface-raised text-content-secondary hover:text-content border-subtle'
                  }`}
                  data-tip={lgText(t, Y_MODE_TIP_KEY[yMode], Y_MODE_TIP[yMode])}
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v16M4 20h16M8 16l3-6 3 4 4-8" />
                  </svg>
                  <span>{lgText(t, Y_MODE_LABEL_KEY[yMode], Y_MODE_LABEL[yMode])}</span>
                </button>
                {chartIds.length > 1 && (
                  <button
                    onClick={() => setSyncZoomEnabled(!syncZoomEnabled)}
                    className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors flex items-center gap-1 ${
                      syncZoomEnabled
                        ? 'bg-blue-500/15 hover:bg-blue-500/25 text-blue-400 border-blue-500/40'
                        : 'bg-surface hover:bg-surface-raised text-content-secondary hover:text-content border-subtle'
                    }`}
                    data-tip={syncZoomEnabled ? t('logs.chart.sync-on') : t('logs.chart.sync-off')}
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      {syncZoomEnabled ? (
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      ) : (
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101M3 3l18 18" />
                      )}
                    </svg>
                    <span>{syncZoomEnabled ? t('logs.chart.synced') : t('logs.chart.unsynced')}</span>
                  </button>
                )}
                {(isZoomed || yZoomed) && (
                  <button
                    onClick={resetZoom}
                    className="text-[10px] px-1.5 py-0.5 rounded border bg-surface hover:bg-surface-raised text-content border-subtle transition-colors"
                    data-tip={t('logs.chart.reset-tip')}
                  >
                    {t('logs.chart.reset-zoom')}
                  </button>
                )}
              </div>
            </div>

            {/* Detail rows — only when expanded OR when few enough series fit
                inline. A compact per-field stats table (min / avg / max over
                the visible time window), grouped by message type. This is the
                Mission Planner legend readout, but the numbers track whatever
                slice of time is currently on screen. */}
            {(!shouldAutoCollapse || legendExpanded) && seriesCount > 0 && (
              <div className="px-3 pb-1.5 max-h-[160px] overflow-y-auto">
                <div
                  className="grid items-center text-[9px] uppercase tracking-wider text-content-tertiary pb-0.5 sticky top-0 bg-surface-overlay-subtle"
                  style={{ gridTemplateColumns: legendColumns }}
                >
                  <span>{xRange ? t('logs.chart.col-field-visible') : t('logs.chart.col-field-full')}</span>
                  <span className="text-right">{t('logs.chart.col-min')}</span>
                  <span className="text-right">{t('logs.chart.col-avg')}</span>
                  <span className="text-right">{t('logs.chart.col-max')}</span>
                  {yMode !== 'shared' && <span className="text-center">{t('logs.chart.col-y-axis')}</span>}
                </div>
                {[...groups.entries()].map(([type, items]) => (
                  <div key={type}>
                    <div className="text-[9px] font-semibold text-content-tertiary uppercase tracking-wider pt-0.5">{type}</div>
                    {items.map((it) => (
                      <div
                        key={it.label}
                        onClick={() => setActiveScaleKey((k) => (k === it.scaleKey ? null : it.scaleKey))}
                        className={`grid items-center gap-x-1 text-[10px] leading-tight py-[1px] rounded-sm cursor-pointer ${
                          activeScaleKey === it.scaleKey ? 'bg-blue-500/15' : 'hover:bg-surface-raised'
                        }`}
                        style={{ gridTemplateColumns: legendColumns }}
                        data-tip={activeScaleKey === it.scaleKey
                          ? t('logs.chart.axis-y-tip-on')
                          : t('logs.chart.axis-y-tip-off')}
                      >
                        <span className="inline-flex items-center gap-1.5 min-w-0">
                          <span className="w-3 h-[3px] rounded-full shrink-0" style={{ backgroundColor: it.color }} />
                          <span className="text-content-secondary truncate">{it.field}</span>
                        </span>
                        <span className="text-right tabular-nums text-content-tertiary">{it.stats ? fmtStat(it.stats.min) : '-'}</span>
                        <span className="text-right tabular-nums text-content">{it.stats ? fmtStat(it.stats.avg) : '-'}</span>
                        <span className="text-right tabular-nums text-content-tertiary">{it.stats ? fmtStat(it.stats.max) : '-'}</span>
                        {yMode !== 'shared' && (
                          <AxisRangeEditor
                            range={it.range}
                            active={activeScaleKey === it.scaleKey}
                            pinned={it.pinned}
                            onCommit={(min, max) => setSeriesRanges((prev) => ({ ...prev, [it.scaleKey]: { min, max } }))}
                            onReset={() => setSeriesRanges((prev) => {
                              const next = { ...prev };
                              delete next[it.scaleKey];
                              return next;
                            })}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* Mode timeline — synced with chart X axis */}
      {modeTimeline.length > 0 && visibleRange > 0 && (
        <div className="h-5 mx-2 mt-1 flex-shrink-0 rounded overflow-hidden relative bg-surface">
          {modeTimeline
            .filter((seg) => seg.endS > visibleXMin && seg.startS < visibleXMax)
            .map((seg, i) => {
              const clampStart = Math.max(seg.startS, visibleXMin);
              const clampEnd = Math.min(seg.endS, visibleXMax);
              const widthPct = ((clampEnd - clampStart) / visibleRange) * 100;
              const leftPct = ((clampStart - visibleXMin) / visibleRange) * 100;
              return (
                <div
                  key={i}
                  className="h-full absolute"
                  style={{ left: `${leftPct}%`, width: `${widthPct}%`, background: seg.color }}
                  title={t('logs.chart.mode-segment-title', { name: seg.name, start: seg.startS.toFixed(0), end: seg.endS.toFixed(0) })}
                >
                  {widthPct > 8 && (
                    <span className="absolute inset-0 flex items-center justify-center text-[9px] text-content/80 font-medium truncate px-0.5">
                      {seg.name}
                    </span>
                  )}
                </div>
              );
            })}
        </div>
      )}

      {/* Chart */}
      <div ref={chartRef} className="flex-1 min-h-0" />
    </div>
  );
}

// ============================================================================
// Flight Path Map Panel
// ============================================================================

const FLIGHT_MAP_LAYERS: Record<string, { name: string; nameKey?: string; tiles: string[]; maxZoom: number }> = {
  satellite: { name: 'Satellite', nameKey: 'logs.flight.layer.satellite', tiles: ['https://mt0.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', 'https://mt2.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', 'https://mt3.google.com/vt/lyrs=s&x={x}&y={y}&z={z}'], maxZoom: 22 },
  hybrid: { name: 'Hybrid', nameKey: 'logs.flight.layer.hybrid', tiles: ['https://mt0.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', 'https://mt2.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', 'https://mt3.google.com/vt/lyrs=y&x={x}&y={y}&z={z}'], maxZoom: 22 },
  // Bing aerial for regions where Google tiles are unreachable (China).
  // MapLibre substitutes {quadkey} natively.
  bing: { name: 'Bing Sat', nameKey: 'logs.flight.layer.bing-sat', tiles: ['https://ecn.t0.tiles.virtualearth.net/tiles/a{quadkey}.jpeg?g=14364&n=z', 'https://ecn.t1.tiles.virtualearth.net/tiles/a{quadkey}.jpeg?g=14364&n=z', 'https://ecn.t2.tiles.virtualearth.net/tiles/a{quadkey}.jpeg?g=14364&n=z', 'https://ecn.t3.tiles.virtualearth.net/tiles/a{quadkey}.jpeg?g=14364&n=z'], maxZoom: 19 },
  street: { name: 'Street', nameKey: 'logs.flight.layer.street', tiles: ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png', 'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png', 'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'], maxZoom: 19 },
  terrain: { name: 'Terrain', nameKey: 'logs.flight.layer.terrain', tiles: ['https://a.tile.opentopomap.org/{z}/{x}/{y}.png', 'https://b.tile.opentopomap.org/{z}/{x}/{y}.png', 'https://c.tile.opentopomap.org/{z}/{x}/{y}.png'], maxZoom: 17 },
};

/**
 * Min/max entry for one series' Y axis in split mode. Shows the auto-fitted
 * range until the user types over it; a pinned axis is exempt from auto-fit
 * and shows a reset back to it.
 */
function AxisRangeEditor({
  range,
  pinned,
  active,
  onCommit,
  onReset,
}: {
  range: { min: number; max: number } | null;
  pinned: boolean;
  active: boolean;
  onCommit: (min: number, max: number) => void;
  onReset: () => void;
}) {
  const { t } = useTranslation('views');
  const [draft, setDraft] = useState<{ min: string; max: string } | null>(null);
  const shown = draft ?? {
    min: range ? fmtStat(range.min) : '',
    max: range ? fmtStat(range.max) : '',
  };

  const commit = (next: { min: string; max: string }) => {
    setDraft(null);
    const parsed = parseAxisRange(next.min, next.max);
    if (parsed) onCommit(parsed.min, parsed.max);
  };

  const cell =
    'w-[3.05rem] px-1 py-[1px] rounded border bg-surface text-[10px] tabular-nums text-right ' +
    'text-content focus:outline-none focus:border-blue-500/60 ' +
    (active ? 'border-blue-500/50' : 'border-subtle');

  return (
    <span
      className="flex items-center gap-0.5 justify-end"
      onClick={(e) => e.stopPropagation()}
    >
      <input
        aria-label={t('logs.axis.min')}
        className={cell}
        value={shown.min}
        onChange={(e) => setDraft({ ...shown, min: e.target.value })}
        onBlur={() => commit(shown)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') setDraft(null);
        }}
      />
      <input
        aria-label={t('logs.axis.max')}
        className={cell}
        value={shown.max}
        onChange={(e) => setDraft({ ...shown, max: e.target.value })}
        onBlur={() => commit(shown)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') setDraft(null);
        }}
      />
      <button
        onClick={onReset}
        disabled={!pinned}
        className={`px-1 rounded text-[10px] leading-none transition-colors ${
          pinned
            ? 'text-blue-400 hover:text-blue-300'
            : 'text-content-tertiary opacity-40 cursor-default'
        }`}
        data-tip={pinned ? t('logs.axis.reset-tip') : t('logs.axis.auto-tip')}
      >
        {t('logs.axis.auto')}
      </button>
    </span>
  );
}

type PathColorMode = 'solid' | 'mode' | 'altitude' | 'speed';

/** Smallest ground area the camera frames, so a short hover still has context. */
const FRAME_MIN_SPAN_M = 90;
/** Zoom ceiling: past this the camera sits on (or in) the terrain surface. */
const FRAME_MAX_ZOOM = 18.5;

/** Blue to cyan to green to yellow to red, for a normalised 0-1 value. */
function rampColor(t: number): string {
  const c = Math.min(1, Math.max(0, t));
  let r: number, g: number, b: number;
  if (c < 0.25) { r = 0; g = Math.round(c * 4 * 255); b = 255; }
  else if (c < 0.5) { r = 0; g = 255; b = Math.round((1 - (c - 0.25) * 4) * 255); }
  else if (c < 0.75) { r = Math.round((c - 0.5) * 4 * 255); g = 255; b = 0; }
  else { r = 255; g = Math.round((1 - (c - 0.75) * 4) * 255); b = 0; }
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function FlightPathPanel() {
  const { t } = useTranslation('views');
  const currentLog = useLogStore((s) => s.currentLog);
  const isUlog = currentLog?.format === 'ulog';
  const track = useMemo(() => buildFlightTrack(currentLog), [currentLog]);
  const points = track.points;
  // ArduPilot colors by MODE records; PX4 ULogs color by vehicle_status.nav_state.
  const modeTimeline = useMemo(
    () => (isUlog ? getPx4ModeTimeline(currentLog) : getModeTimeline(currentLog)),
    [currentLog, isUlog],
  );
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const threeLayerRef = useRef<ReturnType<typeof createFlightPathThreeJsLayer> | null>(null);
  const [activeLayer, setActiveLayer] = useState('satellite');
  const [colorMode, setColorMode] = useState<PathColorMode>('mode');

  // Compute per-segment colors based on color mode
  const segmentColors = useMemo(() => {
    if (points.length < 2) return undefined;

    if (colorMode === 'solid') return undefined; // default amber

    if (colorMode === 'mode' && modeTimeline.length > 0) {
      const colors: string[] = [];
      // Every point carries its own timestamp, so modes align by time rather
      // than by index: the mode source and the position source run on their own
      // clocks and at their own rates.
      for (let i = 0; i < points.length - 1; i++) {
        const timeS = points[i]!.timeS;
        let color = '#6b7280';
        for (const seg of modeTimeline) {
          if (timeS >= seg.startS && timeS < seg.endS) {
            color = seg.color;
            break;
          }
        }
        colors.push(color);
      }
      return colors;
    }

    if (colorMode === 'altitude') {
      // Color by altitude: blue (low) → green → yellow → red (high)
      const { min: minAlt, max: maxAlt } = trackAltitudeRange(points);
      const range = maxAlt - minAlt || 1;
      const colors: string[] = [];
      for (let i = 0; i < points.length - 1; i++) {
        colors.push(rampColor((points[i]!.altRel - minAlt) / range));
      }
      return colors;
    }

    if (colorMode === 'speed') {
      const speeds = trackSpeeds(points);
      const maxSpd = Math.max(...speeds, 1);
      const colors: string[] = [];
      for (let i = 0; i < points.length - 1; i++) {
        colors.push(rampColor((speeds[i] ?? 0) / maxSpd));
      }
      return colors;
    }

    return undefined;
  }, [points, colorMode, modeTimeline]);

  const mapCenter = useMemo((): [number, number] => {
    if (points.length === 0) return [0, 0];
    const mid = points[Math.floor(points.length / 2)]!;
    return [mid.lon, mid.lat];
  }, [points]);

  // Store ground elevation and points for reuse across effects
  const groundElevRef = useRef(0);
  const terrainListenersRef = useRef<(() => void) | null>(null);
  const pointsRef = useRef<{ lon: number; lat: number; alt: number }[]>([]);

  // Map initialization — only re-runs on the track or layer change
  useEffect(() => {
    if (!mapContainerRef.current || points.length < 2) return;

    const layerDef = FLIGHT_MAP_LAYERS[activeLayer] ?? FLIGHT_MAP_LAYERS['satellite']!;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        sources: {
          'raster-tiles': {
            type: 'raster',
            tiles: layerDef.tiles,
            tileSize: 256,
            maxzoom: layerDef.maxZoom,
          },
        },
        layers: [{ id: 'raster-layer', type: 'raster', source: 'raster-tiles' }],
      },
      center: mapCenter as [number, number],
      zoom: 15,
      pitch: 50,
      bearing: 0,
      maxPitch: 85,
      canvasContextAttributes: { antialias: true },
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-left');

    map.on('load', () => {
      // Terrain DEM
      map.addSource('terrain-dem', {
        type: 'raster-dem',
        tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
        tileSize: 256,
        encoding: 'terrarium',
        maxzoom: 15,
      });
      map.setTerrain({ source: 'terrain-dem', exaggeration: 1.0 });

      map.setSky({
        'sky-color': '#1a1d2e',
        'horizon-color': '#2d3148',
        'fog-color': '#1a1d2e',
        'fog-ground-blend': 0.5,
        'horizon-fog-blend': 0.8,
        'sky-horizon-blend': 0.9,
        'atmosphere-blend': 0.7,
      });

      // Ground shadow
      map.addSource('ground-shadow', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: points.map((p) => [p.lon, p.lat]) },
        },
      });
      map.addLayer({
        id: 'ground-shadow-line',
        type: 'line',
        source: 'ground-shadow',
        paint: { 'line-color': '#000000', 'line-width': 2, 'line-opacity': 0.3, 'line-dasharray': [2, 2] },
      });

      // 3D flight path
      const threeLayer = createFlightPathThreeJsLayer();
      threeLayerRef.current = threeLayer;
      threeLayer.onHoverScreen(reportHoverScreen);
      map.addLayer(threeLayer.layer);

      pointsRef.current = points.map((p) => ({ lon: p.lon, lat: p.lat, alt: p.altRel }));
      const startLngLat = new maplibregl.LngLat(points[0]!.lon, points[0]!.lat);

      // Ground level comes from the log first, and only then from the DEM.
      // queryTerrainElevation returns null until the tile under the takeoff
      // point has loaded, and the old code took that as 0 and drew the whole
      // flight at sea level, buried under the hill it was flown on.
      const loggedGround = groundAmsl(points);
      groundElevRef.current = loggedGround ?? 0;

      function renderPath() {
        threeLayer.updateData({
          points: pointsRef.current,
          groundElevation: groundElevRef.current,
          segmentColors,
        });
      }
      renderPath();

      // The DEM is what actually gets drawn and a GPS altitude can sit metres
      // off it, so seat the path on the terrain once it is genuinely available.
      // Tiles keep arriving and refining, so this tracks the value until the map
      // goes idle rather than latching the first coarse parent tile.
      const adoptTerrainGround = () => {
        const elev = map.queryTerrainElevation(startLngLat);
        if (elev == null || !Number.isFinite(elev)) return;
        if (Math.abs(elev - groundElevRef.current) < 0.25) return;
        groundElevRef.current = elev;
        renderPath();
      };
      map.on('data', adoptTerrainGround);

      const frame = frameBounds(points, FRAME_MIN_SPAN_M);
      const bounds = frame
        ? new maplibregl.LngLatBounds([frame.west, frame.south], [frame.east, frame.north])
        : (() => {
            const b = new maplibregl.LngLatBounds();
            for (const p of points) b.extend([p.lon, p.lat]);
            return b;
          })();
      // maxZoom matters: fitting a few metres of track literally pins the
      // camera to the ground and the viewpoint ends up inside the terrain.
      const fitOpts = { padding: 60, pitch: 55, maxZoom: FRAME_MAX_ZOOM } as const;
      map.fitBounds(bounds, { ...fitOpts, duration: 0 });

      // Start/end markers
      const first = points[0]!;
      const last = points[points.length - 1]!;
      new maplibregl.Marker({ color: '#22c55e', scale: 0.7 })
        .setLngLat([first.lon, first.lat])
        .setPopup(new maplibregl.Popup({ offset: 20 }).setText(t('logs.flight.takeoff')))
        .addTo(map);
      new maplibregl.Marker({ color: '#ef4444', scale: 0.7 })
        .setLngLat([last.lon, last.lat])
        .setPopup(new maplibregl.Popup({ offset: 20 }).setText(t('logs.flight.landing')))
        .addTo(map);

      map.once('idle', () => {
        adoptTerrainGround();
        map.off('data', adoptTerrainGround);
        map.fitBounds(bounds, { ...fitOpts, duration: 500 });
      });

      terrainListenersRef.current = () => { map.off('data', adoptTerrainGround); };
    });

    // Chart-hover position marker: the dot is drawn INSIDE the path's own 3D
    // scene, because a map marker lives on the ground plane while the path is
    // drawn at altitude over terrain, and the two land in different places.
    const hoverLabel = document.createElement('div');
    hoverLabel.style.cssText = [
      'position:absolute', 'z-index:2', 'pointer-events:none', 'display:none',
      'white-space:pre', 'transform:translate(14px,-130%)',
      'font:11px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace',
      'padding:4px 7px', 'border-radius:6px',
      'background:rgba(17,24,39,0.82)', 'color:#e5e7eb',
      'border:1px solid rgba(255,255,255,0.12)',
    ].join(';');
    mapContainerRef.current.appendChild(hoverLabel);

    const hoverSpeeds = trackSpeeds(points);
    let hoverIdx: number | null = null;

    // The layer reports where it actually drew the dot, so the label rides the
    // same projection instead of guessing at one.
    const reportHoverScreen = (pos: { x: number; y: number } | null) => {
      const p = hoverIdx == null ? null : points[hoverIdx];
      if (!pos || !p) {
        hoverLabel.style.display = 'none';
        return;
      }
      hoverLabel.style.display = 'block';
      hoverLabel.style.left = `${pos.x}px`;
      hoverLabel.style.top = `${pos.y}px`;
      hoverLabel.textContent =
        `${p.timeS.toFixed(2)} s   ${p.altRel.toFixed(1)} m   ${(hoverSpeeds[hoverIdx!] ?? 0).toFixed(1)} m/s`;
    };
    threeLayerRef.current?.onHoverScreen(reportHoverScreen);

    const unsubHover = subscribeHoverTime((timeS) => {
      hoverIdx = timeS == null || points.length === 0 ? null : trackIndexNearTime(points, timeS);
      if (hoverIdx != null && hoverIdx < 0) hoverIdx = null;
      threeLayerRef.current?.setHoverIndex(hoverIdx);
      if (hoverIdx == null) hoverLabel.style.display = 'none';
    });

    mapRef.current = map;
    return () => {
      unsubHover();
      threeLayerRef.current?.onHoverScreen(null);
      hoverLabel.remove();
      terrainListenersRef.current?.();
      terrainListenersRef.current = null;
      threeLayerRef.current?.dispose();
      threeLayerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [points, activeLayer, mapCenter, t]);

  // Update colors without rebuilding the map
  useEffect(() => {
    if (!threeLayerRef.current || pointsRef.current.length === 0) return;
    threeLayerRef.current.updateData({
      points: pointsRef.current,
      groundElevation: groundElevRef.current,
      segmentColors,
    });
  }, [segmentColors]);

  if (points.length < 2) {
    return (
      <div className="h-full flex items-center justify-center text-content-tertiary text-xs">
        {t('logs.flight.no-gps')}
      </div>
    );
  }

  return (
    <div className="h-full relative">
      <div ref={mapContainerRef} className="h-full w-full" />
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 px-2 py-1 rounded-md bg-surface-overlay backdrop-blur-sm text-[10px] text-content-secondary whitespace-nowrap">
        {t('logs.flight.altitude-summary', { peak: trackAltitudeRange(points).max.toFixed(1), source: track.source })}
        {track.altitudeBasis === 'derived' && <span className="text-content-tertiary">{t('logs.flight.ground-inferred')}</span>}
      </div>
      {/* Controls overlay */}
      <div className="absolute top-2 right-2 z-10 flex flex-col items-stretch gap-1.5">
        {/* Layer switcher */}
        <div className="flex bg-surface-overlay rounded-md backdrop-blur-sm overflow-hidden">
          {Object.entries(FLIGHT_MAP_LAYERS).map(([key, l]) => (
            <button
              key={key}
              onClick={() => setActiveLayer(key)}
              className={`flex-1 text-[10px] px-2 py-1 transition-colors ${
                activeLayer === key
                  ? 'bg-blue-500/30 text-blue-300'
                  : 'text-content-secondary hover:text-content'
              }`}
            >
              {lgText(t, l.nameKey, l.name)}
            </button>
          ))}
        </div>
        {/* Path color mode */}
        <div className="flex bg-surface-overlay rounded-md backdrop-blur-sm overflow-hidden">
          {([
            ['solid', 'Solid', 'logs.flight.color.solid'],
            ['mode', 'Modes', 'logs.flight.color.modes'],
            ['altitude', 'Altitude', 'logs.flight.color.altitude'],
            ['speed', 'Speed', 'logs.flight.color.speed'],
          ] as [PathColorMode, string, string][]).map(([key, label, labelKey]) => (
            <button
              key={key}
              onClick={() => setColorMode(key)}
              className={`flex-1 text-[10px] px-2 py-1 transition-colors ${
                colorMode === key
                  ? 'bg-blue-500/30 text-blue-300'
                  : 'text-content-secondary hover:text-content'
              }`}
            >
              {lgText(t, labelKey, label)}
            </button>
          ))}
        </div>
      </div>
      {/* Center on flight path FAB */}
      <button
        onClick={() => {
          if (!mapRef.current || points.length < 2) return;
          const lngs = points.map((p) => p.lon);
          const lats = points.map((p) => p.lat);
          mapRef.current.fitBounds(
            [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
            { padding: 80, pitch: 50, duration: 800 },
          );
        }}
        className="absolute bottom-3 right-3 z-10 w-8 h-8 rounded-full bg-surface-overlay text-content-secondary hover:text-content hover:bg-surface-overlay-light shadow-lg flex items-center justify-center transition-all"
        title={t('logs.flight.center')}
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <line x1="12" y1="2" x2="12" y2="6" />
          <line x1="12" y1="18" x2="12" y2="22" />
          <line x1="2" y1="12" x2="6" y2="12" />
          <line x1="18" y1="12" x2="22" y2="12" />
        </svg>
      </button>
    </div>
  );
}

// ============================================================================
// Field Picker Panel
// ============================================================================

function FieldPickerPanel() {
  const { t } = useTranslation('views');
  const currentLog = useLogStore((s) => s.currentLog);
  const unitFor = useMemo(() => makeUnitLookup(currentLog), [currentLog]);
  // Picker always operates on the active chart so writes go to the panel
  // the user just clicked. ChartPanel components read from their OWN chartId
  // (not activeChartId) so each chart updates independently.
  const activeChartId = useLogStore((s) => s.activeChartId);
  const chartIds = useLogStore((s) => s.chartIds);
  const selectedFieldsByChart = useLogStore((s) => s.selectedFieldsByChart);
  const selectedFields = selectedFieldsByChart[activeChartId] ?? new Map();
  const selectedTypes = useLogStore((s) => s.selectedTypesByChart[s.activeChartId] ?? []);
  const isLightTheme = useResolvedTheme() === 'light';
  const setSelectedTypes = useLogStore((s) => s.setSelectedTypes);
  const setSelectedFields = useLogStore((s) => s.setSelectedFields);
  const setActiveChartId = useLogStore((s) => s.setActiveChartId);
  // removeChart is intentionally not used here — chart removal goes through
  // dockview's panel close button, which fires onDidRemovePanel and the
  // explorer cleans up the store entry. Keeping a single removal path
  // avoids "tab gone but panel still rendering" desync.
  const [search, setSearch] = useState('');
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set());
  // Tracks which `${type}.${field}` combos have their per-instance picker
  // expanded — only relevant for multi-instance types (ESC, IMU, MAG, ...).
  const [expandedInstanceFields, setExpandedInstanceFields] = useState<Set<string>>(new Set());

  const messageTypes = currentLog?.messageTypes ?? [];
  const presets = currentLog?.format === 'ulog' ? PX4_PRESETS : QUICK_PRESETS;

  const filteredTypes = useMemo(() => {
    if (!search.trim()) return messageTypes;
    const q = search.trim().toLowerCase();
    return messageTypes.filter((type) => type.toLowerCase().includes(q));
  }, [messageTypes, search]);

  // Get fields for any message type (not just selected ones).
  // We hide the instance discriminator ("Instance" / "I") because it carries
  // no signal worth plotting — it's the per-row sensor index, not data.
  // Numeric fields become normal series; whitelisted non-numeric fields
  // (MODE.Name, MSG.Message, CMD.CName) become event markers — Mission
  // Planner overlays these as vertical labels and the user wanted parity.
  // Other non-numeric fields stay hidden because they're noise (FMT names,
  // raw byte buffers, etc.).
  const typeFields = useMemo(() => {
    if (!currentLog) return {};
    const result: Record<string, string[]> = {};
    for (const type of messageTypes) {
      const cols = currentLog.messages[type];
      if (cols && cols.count > 0) {
        const eventAllow = new Set(EVENT_FIELDS_BY_TYPE[type] ?? []);
        result[type] = fieldNames(cols).filter(
          (f) => f !== 'TimeUS' && f !== 'Instance' && f !== 'I'
            && (cols.num[f] !== undefined || eventAllow.has(f)),
        );
      }
    }
    return result;
  }, [currentLog, messageTypes]);

  // Per-(type, field) flag: is this an event-marker (string) field?
  const isEventField = useCallback(
    (type: string, field: string): boolean => {
      const allow = EVENT_FIELDS_BY_TYPE[type];
      if (!allow || !allow.includes(field)) return false;
      const cols = currentLog?.messages[type];
      if (!cols || cols.count === 0) return false;
      return cols.num[field] === undefined;
    },
    [currentLog],
  );

  // Per-type sorted list of distinct instance numbers (e.g. ESC → [0,1,2,3]).
  // Empty array for single-instance types. Drives both the "× N" header chip
  // and the per-instance sub-checkboxes under each field row.
  const typeInstances = useMemo(() => {
    if (!currentLog) return new Map<string, number[]>();
    const out = new Map<string, number[]>();
    for (const type of messageTypes) {
      const cols = currentLog.messages[type];
      if (!cols || cols.count === 0) continue;
      const instCol = cols.num['Instance'] ?? cols.num['I'];
      if (!instCol) continue;
      const distinct = new Set<number>();
      const limit = Math.min(cols.count, 1024);
      for (let i = 0; i < limit; i++) {
        const v = instCol[i];
        if (v !== undefined) distinct.add(v);
      }
      if (distinct.size > 1) out.set(type, [...distinct].sort((a, b) => a - b));
    }
    return out;
  }, [currentLog, messageTypes]);

  const applyPreset = useCallback((preset: typeof QUICK_PRESETS[number]) => {
    const validTypes = preset.types.filter((t) => messageTypes.includes(t));
    if (validTypes.length === 0) return;
    setSelectedTypes(validTypes);
    setExpandedTypes(new Set(validTypes));
    for (const [type, fields] of Object.entries(preset.fields)) {
      if (messageTypes.includes(type)) setSelectedFields(type, fields);
    }
  }, [messageTypes, setSelectedTypes, setSelectedFields]);

  const toggleExpanded = useCallback((type: string) => {
    setExpandedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  const handleFieldToggle = useCallback((type: string, field: string) => {
    const store = useLogStore.getState();
    const activeId = store.activeChartId;
    const currentFields: Map<string, string[]> = store.selectedFieldsByChart[activeId] ?? new Map();
    const currentTypes: string[] = store.selectedTypesByChart[activeId] ?? [];
    const current: string[] = currentFields.get(type) ?? [];
    const isRemoving = current.includes(field);
    const newFields = isRemoving ? current.filter((f) => f !== field) : [...current, field];
    store.setSelectedFields(type, newFields);

    if (!isRemoving && !currentTypes.includes(type)) {
      store.setSelectedTypes([...currentTypes, type]);
    } else if (isRemoving && newFields.length === 0) {
      store.setSelectedTypes(currentTypes.filter((t) => t !== type));
    }
  }, []);

  // Stable color per message type group (based on position in the full list)
  const typeColorMap = useMemo(() => {
    const map = new Map<string, string>();
    const groupColors = [
      '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
      '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
      '#14b8a6', '#e879f9', '#fb923c', '#a3e635', '#38bdf8',
    ];
    messageTypes.forEach((type, i) => {
      map.set(type, groupColors[i % groupColors.length]!);
    });
    return map;
  }, [messageTypes]);

  // Map each selected field to its chart series color (matches chart line colors)
  const seriesColorMap = useMemo(() => {
    const map = new Map<string, string>();
    let idx = 0;
    selectedFields.forEach((fields, type) => {
      if (fields.length === 0) return;
      for (const field of fields) {
        map.set(`${type}.${field}`, SERIES_COLORS[idx % SERIES_COLORS.length]!);
        idx++;
      }
    });
    return map;
  }, [selectedFields]);

  return (
    <div className="h-full flex flex-col">
      {/* Chart-target tabs (only shown if more than one chart exists). Each
          tab is the destination for picker checkboxes; clicking switches
          which chart the picker writes to. The dockview also broadcasts
          panel focus, so clicking a chart panel directly does the same. */}
      {chartIds.length > 1 && (
        <div className="flex items-center gap-1 px-2 py-1.5 border-b border-subtle bg-surface-overlay-subtle overflow-x-auto">
          <span className="text-[10px] uppercase tracking-wider text-content-tertiary mr-1 shrink-0">{t('logs.picker.target')}</span>
          {chartIds.map((cid, idx) => {
            const isActive = cid === activeChartId;
            const m = selectedFieldsByChart[cid] ?? new Map();
            let fieldsCount = 0;
            m.forEach((arr: string[]) => { fieldsCount += arr.length; });
            return (
              <button
                key={cid}
                onClick={() => setActiveChartId(cid)}
                className={`text-[10px] px-2 py-0.5 rounded transition-colors flex items-center gap-1 shrink-0 ${
                  isActive
                    ? 'bg-blue-500/25 text-blue-400 border border-blue-500/40'
                    : 'bg-surface-raised hover:bg-blue-500/10 text-content-secondary border border-transparent'
                }`}
                title={isActive ? t('logs.picker.write-chart') : t('logs.picker.switch-target')}
              >
                {t('logs.chart.title-n', { n: idx + 1 })}
                {fieldsCount > 0 && (
                  <span className="text-[9px] text-content-tertiary tabular-nums">{fieldsCount}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
      {/* Search + presets (sticky top) */}
      <div className="p-3 pb-2 space-y-2 border-b border-subtle" data-tour="log-field-picker">
        <div className="relative">
          <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-content-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('logs.picker.filter-placeholder')}
            className="w-full bg-surface-input border border-subtle rounded text-[11px] pl-6 pr-2 py-1 text-content placeholder-content-tertiary focus:outline-none focus:border-blue-500/50"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-content-secondary hover:text-content"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        {/* Quick presets + clear */}
        <div className="flex flex-wrap gap-1">
          {presets.filter((p) => p.types.some((t) => messageTypes.includes(t))).map((preset) => (
            <button
              key={preset.label}
              onClick={() => applyPreset(preset)}
              className="text-[10px] px-1.5 py-0.5 rounded bg-surface-raised hover:bg-blue-500/20 hover:text-blue-400 text-content-secondary transition-colors"
            >
              {lgText(t, preset.labelKey, preset.label)}
            </button>
          ))}
          {Array.from(selectedFields.values()).some((f) => f.length > 0) && (
            <button
              onClick={() => {
                const s = useLogStore.getState();
                const fields = s.selectedFieldsByChart[s.activeChartId] ?? new Map();
                fields.forEach((_v, type) => s.setSelectedFields(type, []));
                s.setSelectedTypes([]);
              }}
              className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors"
            >
              {t('logs.picker.clear-all')}
            </button>
          )}
        </div>
      </div>

      {/* Message types and fields (scrollable) */}
      <div className="flex-1 overflow-y-auto p-3 space-y-0.5">
        {filteredTypes.map((type) => {
          const isExpanded = expandedTypes.has(type);
          const fields = typeFields[type] ?? [];
          const groupColor = typeColorMap.get(type) ?? '#6b7280';
          const activeFieldCount = selectedFields.get(type)?.length ?? 0;
          const hasSelection = activeFieldCount > 0;
          const instances = typeInstances.get(type);
          const instanceCount = instances?.length;
          return (
            <div key={type}>
              <button
                onClick={() => toggleExpanded(type)}
                className={`flex items-center gap-2 text-xs w-full rounded px-2 py-1.5 transition-colors hover:bg-surface-overlay-subtle`}
                style={{ backgroundColor: hasSelection ? `${groupColor}${isLightTheme ? '20' : '18'}` : undefined, opacity: hasSelection ? 1 : (isLightTheme ? 0.6 : 0.45) }}
                title={instanceCount ? t('logs.picker.instances-hint', { count: instanceCount }) : undefined}
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: groupColor }} />
                <span className={hasSelection ? 'font-semibold' : 'font-medium'} style={{ color: groupColor }}>{type}</span>
                {instanceCount && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-surface-raised text-content-secondary">
                    × {instanceCount}
                  </span>
                )}
                {activeFieldCount > 0 && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: `${groupColor}25`, color: groupColor }}>
                    {activeFieldCount}
                  </span>
                )}
                <span className="text-[10px] text-content-tertiary ml-auto tabular-nums">{logCount(currentLog, type)}</span>
                <svg className={`w-3 h-3 text-content-secondary transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
              {isExpanded && fields.length > 0 && (
                <div className="ml-3 mt-0.5 mb-1 pl-2 space-y-0.5" style={{ borderLeft: `2px solid ${groupColor}40` }}>
                  {fields.map((field) => {
                    const selectedForType = selectedFields.get(type) ?? [];
                    const isChecked = selectedForType.includes(field);
                    const lineColor = seriesColorMap.get(`${type}.${field}`);
                    const isEvent = isEventField(type, field);
                    const showInstancePicker = !!instances && !isEvent;
                    const fieldKey = `${type}.${field}`;
                    const isInstanceExpanded = expandedInstanceFields.has(fieldKey);
                    // Count which specific instances are picked for this field
                    // (e.g. user selected RPM[0] and RPM[2]) so the row chip
                    // can show "2/4" instead of just hiding the state.
                    const pickedInstances = showInstancePicker
                      ? instances.filter((i) => selectedForType.includes(`${field}[${i}]`))
                      : [];
                    return (
                      <div key={field}>
                        <div
                          className={`flex items-center gap-2 text-[11px] rounded px-2 py-1 transition-colors ${
                            isChecked ? 'bg-surface' : 'hover:bg-surface-overlay-subtle'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleFieldToggle(type, field)}
                            className="rounded border bg-surface-raised text-blue-500 w-3 h-3 cursor-pointer"
                            title={isEvent ? t('logs.picker.event-marker-tip') : showInstancePicker ? t('logs.picker.plot-all-instances') : undefined}
                          />
                          {isChecked && !isEvent && lineColor && (
                            <span className="w-3 h-[3px] rounded-full flex-shrink-0" style={{ backgroundColor: lineColor }} />
                          )}
                          {isEvent && (
                            <span className="w-[2px] h-3 flex-shrink-0" style={{ backgroundColor: groupColor }} title={t('logs.picker.event-marker')} />
                          )}
                          <span
                            className={`${isChecked || pickedInstances.length > 0 ? 'text-content' : 'text-content-secondary'} cursor-pointer flex-1`}
                            onClick={() => handleFieldToggle(type, field)}
                          >
                            {field}
                            {(() => {
                              const unit = unitFor(type, field);
                              return unit ? <span className="text-content-tertiary ml-1 text-[10px]">({unit})</span> : null;
                            })()}
                          </span>
                          {isEvent && (
                            <span className="text-[8px] uppercase tracking-wider text-content-tertiary">{t('logs.picker.event')}</span>
                          )}
                          {showInstancePicker && (
                            <button
                              onClick={() => setExpandedInstanceFields((prev) => {
                                const next = new Set(prev);
                                if (next.has(fieldKey)) next.delete(fieldKey); else next.add(fieldKey);
                                return next;
                              })}
                              className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-surface-raised hover:bg-surface-overlay text-content-secondary flex items-center gap-1"
                              title={t('logs.picker.pick-instances')}
                            >
                              {pickedInstances.length > 0 ? `${pickedInstances.length}/${instanceCount}` : `× ${instanceCount}`}
                              <svg className={`w-2.5 h-2.5 transition-transform ${isInstanceExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
                            </button>
                          )}
                        </div>
                        {showInstancePicker && isInstanceExpanded && (
                          <div className="ml-5 my-0.5 grid grid-cols-4 gap-1">
                            {instances.map((inst) => {
                              const compositeKey = `${field}[${inst}]`;
                              const instChecked = selectedForType.includes(compositeKey);
                              // seriesColorMap keys by the *stored* field name
                              // (`field[N]`), not the human-readable chart label.
                              const instLineColor = seriesColorMap.get(`${type}.${compositeKey}`);
                              return (
                                <label
                                  key={inst}
                                  className={`flex items-center gap-1 text-[10px] cursor-pointer rounded px-1.5 py-0.5 transition-colors ${
                                    instChecked ? 'bg-surface' : 'hover:bg-surface-overlay-subtle'
                                  }`}
                                  title={t('logs.picker.plot-instance', { n: inst })}
                                >
                                  <input
                                    type="checkbox"
                                    checked={instChecked}
                                    onChange={() => handleFieldToggle(type, compositeKey)}
                                    className="rounded border bg-surface-raised text-blue-500 w-2.5 h-2.5"
                                  />
                                  {instChecked && instLineColor && (
                                    <span className="w-2 h-[2px] rounded-full flex-shrink-0" style={{ backgroundColor: instLineColor }} />
                                  )}
                                  <span className={instChecked ? 'text-content' : 'text-content-secondary'}>[{inst}]</span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {filteredTypes.length === 0 && search && (
          <p className="text-[11px] text-content-tertiary text-center py-4">{t('logs.picker.no-matches', { query: search })}</p>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Dockview Setup
// ============================================================================

const dockviewComponents: Record<string, React.FC<IDockviewPanelProps>> = {
  ChartPanel: (props) => {
    // Dockview hands params via props; default to 'chart' for the original panel
    // and any panels in older saved layouts that pre-date the per-chart refactor.
    const chartId = (props.params as { chartId?: string } | undefined)?.chartId ?? 'chart';
    return <ChartPanel chartId={chartId} />;
  },
  FlightPathPanel: () => <FlightPathPanel />,
  FieldPickerPanel: () => <FieldPickerPanel />,
  EventsPanel: () => <EventsPanel />,
  LogParamsPanel: () => <LogParamsPanel />,
  SpectrumPanel: () => <SpectrumPanel />,
};

// ============================================================================
// Main Explorer Panel
// ============================================================================

const PANEL_DEFS = [
  { id: 'chart', component: 'ChartPanel', title: 'Chart', titleKey: 'logs.panel.chart' },
  { id: 'map', component: 'FlightPathPanel', title: 'Flight Path', titleKey: 'logs.panel.flight-path' },
  { id: 'fields', component: 'FieldPickerPanel', title: 'Fields', titleKey: 'logs.panel.fields' },
  { id: 'events', component: 'EventsPanel', title: 'Events', titleKey: 'logs.panel.events' },
  { id: 'params', component: 'LogParamsPanel', title: 'Params', titleKey: 'logs.panel.params' },
  { id: 'spectrum', component: 'SpectrumPanel', title: 'Spectrum', titleKey: 'logs.panel.spectrum' },
];

function makeDefaultLayout(t: (key: string) => string): SerializedDockview {
  return {
    grid: {
      root: {
        type: 'branch',
        data: [
          {
            type: 'branch',
            data: [
              { type: 'leaf', data: { views: ['map'], activeView: 'map', id: '1' }, size: 500 },
              { type: 'leaf', data: { views: ['chart'], activeView: 'chart', id: '2' }, size: 350 },
            ],
            size: 850,
          },
          {
            type: 'leaf',
            data: { views: ['fields'], activeView: 'fields', id: '3' },
            size: 200,
          },
        ],
        size: 800,
      },
      width: 1200,
      height: 800,
      orientation: Orientation.HORIZONTAL,
    },
    panels: {
      map: { id: 'map', contentComponent: 'FlightPathPanel', title: t('logs.panel.flight-path') },
      chart: { id: 'chart', contentComponent: 'ChartPanel', title: t('logs.panel.chart-1'), params: { chartId: 'chart' } },
      fields: { id: 'fields', contentComponent: 'FieldPickerPanel', title: t('logs.panel.fields') },
    },
    activeGroup: '1',
  };
}

// Session-scoped layout memory: leaving the Flight Logs tab unmounts the
// whole explorer, and reopening it used to slam the user back to the default
// layout - infuriating after arranging panels. Module scope survives tab
// switches; a fresh app start intentionally begins from the default.
let savedLayout: SerializedDockview | null = null;

/** openPanels derived from what the dockview actually contains. */
function panelIdsFromApi(api: DockviewApi): Set<string> {
  const open = new Set<string>();
  for (const p of api.panels) {
    const def = PANEL_DEFS.find((d) => p.id.startsWith(d.id));
    if (def) open.add(def.id);
  }
  return open;
}

export function LogExplorerPanel() {
  const { t } = useTranslation('views');
  const resolvedTheme = useResolvedTheme();
  const apiRef = useRef<DockviewApi | null>(null);
  const [openPanels, setOpenPanels] = useState<Set<string>>(new Set(['chart', 'map', 'fields']));
  const setActiveChartId = useLogStore((s) => s.setActiveChartId);
  const removeChart = useLogStore((s) => s.removeChart);
  const addChart = useLogStore((s) => s.addChart);
  const explorerTool = useLogStore((s) => s.explorerTool);
  const setExplorerTool = useLogStore((s) => s.setExplorerTool);
  const [helpOpen, setHelpOpen] = useState(false);

  const onReady = useCallback((event: DockviewReadyEvent) => {
    apiRef.current = event.api;
    // Restore the user's arrangement from earlier in this session; if their
    // saved layout fails to load (e.g. a stale panel id), fall back cleanly.
    try {
      event.api.fromJSON(savedLayout ?? makeDefaultLayout(t));
    } catch {
      savedLayout = null;
      event.api.fromJSON(makeDefaultLayout(t));
    }
    setOpenPanels(panelIdsFromApi(event.api));
    // Restored chart panels need their store slots back (e.g. after a store
    // reset while the layout memory survived).
    for (const p of event.api.panels) {
      const cid = (p.params as { chartId?: string } | undefined)?.chartId;
      if (cid) useLogStore.getState().ensureChart(cid);
    }
    // Persist every subsequent arrangement change for the next mount.
    event.api.onDidLayoutChange(() => {
      savedLayout = event.api.toJSON();
    });

    // Track panel open/close
    event.api.onDidRemovePanel((e) => {
      setOpenPanels((prev) => {
        const next = new Set(prev);
        // Match by component name since IDs can have suffixes
        const def = PANEL_DEFS.find((d) => e.id.startsWith(d.id));
        if (def) next.delete(def.id);
        return next;
      });
      // If a chart panel was closed, drop its store slot too. The store
      // refuses to remove the last chart, which keeps the field picker from
      // ever pointing at nothing.
      const removedChartId = (e.params as { chartId?: string } | undefined)?.chartId;
      if (removedChartId) removeChart(removedChartId);
    });

    event.api.onDidAddPanel((e) => {
      setOpenPanels((prev) => {
        const next = new Set(prev);
        const def = PANEL_DEFS.find((d) => e.id.startsWith(d.id));
        if (def) next.add(def.id);
        return next;
      });
    });

    // When the user focuses a chart panel, the field picker should now
    // target that chart. Single source of truth = the dockview's active
    // panel; the picker just reads activeChartId.
    event.api.onDidActivePanelChange((p) => {
      const cid = (p?.params as { chartId?: string } | undefined)?.chartId;
      if (cid) setActiveChartId(cid);
    });
  }, [removeChart, setActiveChartId, t]);

  const handleAddPanel = useCallback((id: string, component: string, title: string) => {
    if (!apiRef.current) return;
    apiRef.current.addPanel({ id: `${id}-${Date.now()}`, component, title });
  }, []);

  const handleAddChart = useCallback(() => {
    if (!apiRef.current) return;
    const newId = addChart();
    const idx = useLogStore.getState().chartIds.indexOf(newId);
    apiRef.current.addPanel({
      id: newId,
      component: 'ChartPanel',
      title: t('logs.chart.title-n', { n: idx + 1 }),
      params: { chartId: newId },
    });
  }, [addChart, t]);

  const handleResetLayout = useCallback(() => {
    if (!apiRef.current) return;
    savedLayout = null;
    apiRef.current.fromJSON(makeDefaultLayout(t));
    setOpenPanels(new Set(['chart', 'map', 'fields']));
  }, [t]);

  const closedPanels = PANEL_DEFS.filter((d) => !openPanels.has(d.id));

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Toolbar: pointer tool + panels + reset */}
      <div className="flex items-center gap-2 px-4 pt-2.5 pb-2 flex-shrink-0">
        {/* Pointer tool for all charts: mouse users live in Zoom (right-drag
            still pans); touchpad users flip to Pan for one-finger dragging. */}
        <div className="flex rounded-md border border-subtle overflow-hidden">
          <button
            onClick={() => setExplorerTool('zoom')}
            className={`text-[10px] px-2 py-1 transition-colors flex items-center gap-1 ${
              explorerTool === 'zoom' ? 'bg-blue-500/20 text-blue-400' : 'bg-surface text-content-secondary hover:text-content'
            }`}
            data-tip={t('logs.tool.zoom-tip')}
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="11" cy="11" r="7" /><path strokeLinecap="round" d="M21 21l-4.35-4.35M8 11h6M11 8v6" />
            </svg>
            {t('logs.tool.zoom')}
          </button>
          <button
            onClick={() => setExplorerTool('pan')}
            className={`text-[10px] px-2 py-1 transition-colors flex items-center gap-1 border-l border-subtle ${
              explorerTool === 'pan' ? 'bg-blue-500/20 text-blue-400' : 'bg-surface text-content-secondary hover:text-content'
            }`}
            data-tip={t('logs.tool.pan-tip')}
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v20M2 12h20M12 2l-3 3m3-3l3 3M12 22l-3-3m3 3l3-3M2 12l3-3m-3 3l3 3M22 12l-3-3m3 3l-3 3" />
            </svg>
            {t('logs.tool.pan')}
          </button>
        </div>
        <div className="relative">
          <button
            onClick={() => setHelpOpen(!helpOpen)}
            className={`text-[10px] w-6 h-6 rounded-md border transition-colors ${
              helpOpen ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' : 'bg-surface text-content-secondary hover:text-content border-subtle'
            }`}
            data-tip={t('logs.help.title')}
          >
            ?
          </button>
          {helpOpen && (
            <div className="absolute left-0 top-8 z-30 w-72 rounded-lg bg-surface-overlay backdrop-blur-md border border-subtle shadow-xl p-3">
              <div className="text-[10px] uppercase tracking-wider text-content-tertiary mb-2">{t('logs.help.title')}</div>
              <div className="grid gap-y-1 text-[11px]" style={{ gridTemplateColumns: 'max-content 1fr', columnGap: '12px' }}>
                <span className="text-content font-medium">{t('logs.help.scroll-pinch')}</span><span className="text-content-secondary">{t('logs.help.scroll-pinch-desc')}</span>
                <span className="text-content font-medium">{t('logs.help.two-finger')}</span><span className="text-content-secondary">{t('logs.help.two-finger-desc')}</span>
                <span className="text-content font-medium">{t('logs.help.axis-scroll')}</span><span className="text-content-secondary">{t('logs.help.axis-scroll-desc')}</span>
                <span className="text-content font-medium">{t('logs.help.axis-drag')}</span><span className="text-content-secondary">{t('logs.help.axis-drag-desc')}</span>
                <span className="text-content font-medium">{t('logs.help.axis-dblclick')}</span><span className="text-content-secondary">{t('logs.help.axis-dblclick-desc')}</span>
                <span className="text-content font-medium">{t('logs.help.shift-scroll')}</span><span className="text-content-secondary">{t('logs.help.shift-scroll-desc')}</span>
                <span className="text-content font-medium">{t('logs.help.legend-row')}</span><span className="text-content-secondary">{t('logs.help.legend-row-desc')}</span>
                <span className="text-content font-medium">{t('logs.help.legend-range')}</span><span className="text-content-secondary">{t('logs.help.legend-range-desc')}</span>
                <span className="text-content font-medium">{t('logs.help.drag')}</span><span className="text-content-secondary">{explorerTool === 'zoom' ? t('logs.help.drag-box-zoom') : t('logs.help.drag-pan')}</span>
                <span className="text-content font-medium">{t('logs.help.right-drag')}</span><span className="text-content-secondary">{t('logs.help.right-drag-desc')}</span>
                <span className="text-content font-medium">{t('logs.help.dblclick')}</span><span className="text-content-secondary">{t('logs.help.dblclick-desc')}</span>
              </div>
              <div className="text-[10px] text-content-tertiary mt-2 pt-2 border-t border-subtle">
                {t('logs.help.footer')}
              </div>
            </div>
          )}
        </div>
        <span className="w-px h-4 bg-subtle" />
        <button
          onClick={handleAddChart}
          className="text-[10px] px-2 py-1 rounded-md bg-blue-500/15 hover:bg-blue-500/25 text-blue-400 border border-blue-500/30 transition-colors flex items-center gap-1"
          data-tip={t('logs.toolbar.add-chart-tip')}
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          {t('logs.toolbar.add-chart')}
        </button>
        {closedPanels.length > 0 && (
          <>
            <span className="text-[10px] text-content-tertiary ml-1">{t('logs.toolbar.panels')}</span>
            {closedPanels.map((def) => (
              <button
                key={def.id}
                onClick={() => handleAddPanel(def.id, def.component, lgText(t, def.titleKey, def.title))}
                className="text-[10px] px-2 py-1 rounded-md bg-surface hover:bg-blue-500/20 hover:text-blue-400 text-content-secondary border border-subtle transition-colors"
              >
                {lgText(t, def.titleKey, def.title)}
              </button>
            ))}
          </>
        )}
        <button
          onClick={handleResetLayout}
          className="text-[10px] px-2 py-1 rounded-md bg-surface hover:bg-surface-raised text-content-secondary hover:text-content border border-subtle transition-colors ml-auto"
          data-tip={t('logs.toolbar.reset-layout-tip')}
        >
          {t('logs.toolbar.reset-layout')}
        </button>
      </div>

      {/* Dockview panels */}
      <div className="flex-1 log-explorer-dock">
        <DockviewReact
          components={dockviewComponents}
          onReady={onReady}
          theme={resolvedTheme === 'light' ? themeLight : themeDark}
          className="h-full"
        />
      </div>
    </div>
  );
}
