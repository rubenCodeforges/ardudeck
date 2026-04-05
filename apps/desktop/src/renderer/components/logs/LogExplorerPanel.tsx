import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DockviewReact,
  DockviewReadyEvent,
  IDockviewPanelProps,
  DockviewApi,
  SerializedDockview,
  Orientation,
} from 'dockview-react';
import 'dockview-react/dist/styles/dockview.css';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

maplibregl.setWorkerUrl('/maplibre-worker.js');
import { createFlightPathThreeJsLayer } from './flight-threejs-layer';
import { useLogStore } from '../../stores/log-store';

// Style uPlot for dark backgrounds
const uplotStyle = document.createElement('style');
uplotStyle.textContent = `
  .u-select { background: rgba(59, 130, 246, 0.15) !important; border: 1px solid rgba(59, 130, 246, 0.5) !important; }
  .u-legend { font-size: 11px; padding: 4px 8px; }
  .u-legend .u-series { padding: 1px 4px; }
  .u-legend .u-label { color: #9ca3af; }
  .u-legend .u-value { color: #e5e7eb; font-variant-numeric: tabular-nums; }
  .u-legend .u-series > * { vertical-align: middle; }
  .u-legend .u-marker { border-radius: 50%; }
`;
document.head.appendChild(uplotStyle);

const SERIES_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
];

const MODE_COLORS: Record<string, string> = {
  STABILIZE: '#6b7280', ALT_HOLD: '#3b82f6', LOITER: '#10b981', AUTO: '#8b5cf6',
  RTL: '#f59e0b', LAND: '#ef4444', GUIDED: '#ec4899', POSHOLD: '#06b6d4',
  ACRO: '#f97316', CIRCLE: '#84cc16', BRAKE: '#6366f1', SMART_RTL: '#fbbf24',
};

const COPTER_MODES: Record<number, string> = {
  0: 'STABILIZE', 1: 'ACRO', 2: 'ALT_HOLD', 3: 'AUTO', 4: 'GUIDED',
  5: 'LOITER', 6: 'RTL', 7: 'CIRCLE', 9: 'LAND', 11: 'DRIFT',
  13: 'SPORT', 14: 'FLIP', 15: 'AUTOTUNE', 16: 'POSHOLD', 17: 'BRAKE',
  18: 'THROW', 21: 'SMART_RTL', 22: 'FLOWHOLD', 23: 'FOLLOW', 24: 'ZIGZAG', 27: 'AUTO_RTL',
};

function getModeName(modeNum: number): string {
  return COPTER_MODES[modeNum] ?? `MODE_${modeNum}`;
}

const QUICK_PRESETS = [
  { label: 'Attitude', desc: 'DesRoll vs Roll, DesPitch vs Pitch', types: ['ATT'], fields: { ATT: ['DesRoll', 'Roll', 'DesPitch', 'Pitch'] } },
  { label: 'Vibration', desc: 'X/Y/Z acceleration variance', types: ['VIBE'], fields: { VIBE: ['VibeX', 'VibeY', 'VibeZ'] } },
  { label: 'GPS', desc: 'Satellite count & dilution', types: ['GPS'], fields: { GPS: ['NSats', 'HDop'] } },
  { label: 'Battery', desc: 'Voltage & current draw', types: ['BAT'], fields: { BAT: ['Volt', 'Curr'] } },
  { label: 'Altitude', desc: 'Desired vs actual altitude', types: ['CTUN'], fields: { CTUN: ['DAlt', 'Alt', 'BAlt'] } },
  { label: 'Compass', desc: 'Magnetic field X/Y/Z', types: ['MAG'], fields: { MAG: ['MagX', 'MagY', 'MagZ'] } },
  { label: 'EKF', desc: 'Innovation test ratios', types: ['NKF4'], fields: { NKF4: ['SV', 'SP', 'SH'] } },
  { label: 'Power', desc: 'Board voltage', types: ['POWR'], fields: { POWR: ['Vcc'] } },
];

function getModeTimeline(log: ReturnType<typeof useLogStore.getState>['currentLog']) {
  if (!log) return [];
  const modes = log.messages['MODE'];
  if (!modes || modes.length === 0) return [];
  const endTimeS = log.timeRange.endUs / 1_000_000;
  const segments: { startS: number; endS: number; name: string; color: string }[] = [];
  for (let i = 0; i < modes.length; i++) {
    const m = modes[i]!;
    const modeNum = (typeof m.fields['ModeNum'] === 'number' ? m.fields['ModeNum'] : m.fields['Mode']) as number;
    const name = getModeName(modeNum);
    const startS = m.timeUs / 1_000_000;
    const endS = i + 1 < modes.length ? (modes[i + 1]!.timeUs / 1_000_000) : endTimeS;
    segments.push({ startS, endS, name, color: MODE_COLORS[name] ?? '#6b7280' });
  }
  return segments;
}

function getFlightPath(log: ReturnType<typeof useLogStore.getState>['currentLog']): [number, number, number][] {
  if (!log) return [];
  const gps = log.messages['GPS'];
  if (!gps) return [];
  const path: [number, number, number][] = [];
  for (const msg of gps) {
    const lat = msg.fields['Lat'];
    const lng = msg.fields['Lng'];
    const alt = msg.fields['Alt'];
    if (typeof lat === 'number' && typeof lng === 'number' && lat !== 0 && lng !== 0) {
      path.push([lat, lng, typeof alt === 'number' ? alt : 0]);
    }
  }
  return path;
}

// ============================================================================
// Chart Panel
// ============================================================================

function ChartPanel() {
  const currentLog = useLogStore((s) => s.currentLog);
  const selectedTypes = useLogStore((s) => s.selectedTypes);
  const selectedFields = useLogStore((s) => s.selectedFields);
  const setSelectedTypes = useLogStore((s) => s.setSelectedTypes);
  const setSelectedFields = useLogStore((s) => s.setSelectedFields);

  const chartRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);
  const [isZoomed, setIsZoomed] = useState(false);
  const [xRange, setXRange] = useState<{ min: number; max: number } | null>(null);

  const messageTypes = currentLog?.messageTypes ?? [];
  const modeTimeline = useMemo(() => getModeTimeline(currentLog), [currentLog]);
  const totalTimeS = currentLog ? (currentLog.timeRange.endUs - currentLog.timeRange.startUs) / 1_000_000 : 0;
  const startTimeS = currentLog ? currentLog.timeRange.startUs / 1_000_000 : 0;

  const chartData = useMemo(() => {
    if (!currentLog) return null;

    // Derive active types from selectedFields (don't depend on selectedTypes)
    const activeTypes: string[] = [];
    selectedFields.forEach((fields, type) => {
      if (fields.length > 0) activeTypes.push(type);
    });
    if (activeTypes.length === 0) return null;

    // Collect per-type time+value arrays, then join onto a common time axis
    const perType: { time: number[]; label: string; values: number[] }[][] = [];
    for (const type of activeTypes) {
      const fields = selectedFields.get(type)!;
      const msgs = currentLog.messages[type];
      if (!msgs || msgs.length === 0) continue;

      const time = msgs.map((m) => m.timeUs / 1_000_000);
      const typeSeries: { time: number[]; label: string; values: number[] }[] = [];
      for (const field of fields) {
        const values = msgs.map((m) => {
          const v = m.fields[field];
          return typeof v === 'number' ? v : NaN;
        });
        typeSeries.push({ time, label: `${type}.${field}`, values });
      }
      if (typeSeries.length > 0) perType.push(typeSeries);
    }

    if (perType.length === 0) return null;

    // If all series share the same time axis (single type), use it directly
    const allSeries = perType.flat();
    const firstTime = allSeries[0]!.time;
    const allSameTime = allSeries.every((s) => s.time === firstTime || s.time.length === firstTime.length);

    if (allSameTime && perType.length === 1) {
      return {
        data: [new Float64Array(firstTime), ...allSeries.map((s) => new Float64Array(s.values))] as uPlot.AlignedData,
        series: allSeries.map((s) => ({ label: s.label, data: s.values })),
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
    };
  }, [currentLog, selectedFields]);

  useEffect(() => {
    if (!chartRef.current || !chartData) {
      if (plotRef.current) { plotRef.current.destroy(); plotRef.current = null; }
      return;
    }

    const container = chartRef.current;
    const { width, height } = container.getBoundingClientRect();

    const opts: uPlot.Options = {
      width: Math.max(width, 300),
      height: Math.max(height, 200),
      cursor: {
        drag: { x: true, y: false, uni: 50 },
      },
      select: { show: true, left: 0, top: 0, width: 0, height: 0 },
      hooks: {
        setSelect: [(u) => {
          if (u.select.width > 10) {
            const minX = u.posToVal(u.select.left, 'x');
            const maxX = u.posToVal(u.select.left + u.select.width, 'x');
            u.setScale('x', { min: minX, max: maxX });
            setIsZoomed(true);
            setXRange({ min: minX, max: maxX });
          }
          u.setSelect({ left: 0, top: 0, width: 0, height: 0 }, false);
        }],
      },
      scales: { x: { time: false }, y: { auto: true } },
      legend: { show: true },
      axes: [
        {
          label: 'Time (s)',
          stroke: '#9ca3af',
          grid: { stroke: '#1f2937', width: 1 },
          ticks: { stroke: '#374151', width: 1 },
          font: '11px system-ui',
        },
        {
          stroke: '#9ca3af',
          grid: { stroke: '#1f2937', width: 1 },
          ticks: { stroke: '#374151', width: 1 },
          font: '11px system-ui',
        },
      ],
      series: [
        { label: 'Time' },
        ...chartData.series.map((s, i) => ({
          label: s.label,
          stroke: SERIES_COLORS[i % SERIES_COLORS.length]!,
          width: 1.5,
          points: { show: false },
        })),
      ],
    };

    if (plotRef.current) plotRef.current.destroy();
    const plot = new uPlot(opts, chartData.data, container);
    plotRef.current = plot;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const xMin = plot.scales.x?.min ?? 0;
      const xMax = plot.scales.x?.max ?? 1;
      const range = xMax - xMin;
      const cursor = plot.cursor.left ?? 0;
      const pctLeft = cursor / (plot.bbox.width / devicePixelRatio);
      const zoomFactor = e.deltaY > 0 ? 1.3 : 0.7;
      const newRange = range * zoomFactor;
      const newMin = xMin + (range - newRange) * pctLeft;
      const newMax = newMin + newRange;
      plot.setScale('x', { min: newMin, max: newMax });
      setIsZoomed(true);
      setXRange({ min: newMin, max: newMax });
    };

    const handleDblClick = () => {
      const xData = chartData.data[0] as Float64Array;
      plot.setScale('x', { min: xData[0]!, max: xData[xData.length - 1]! });
      setIsZoomed(false);
      setXRange(null);
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    container.addEventListener('dblclick', handleDblClick);

    return () => {
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('dblclick', handleDblClick);
      if (plotRef.current) { plotRef.current.destroy(); plotRef.current = null; }
    };
  }, [chartData]);

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

  const resetZoom = useCallback(() => {
    if (plotRef.current && chartData) {
      const xData = chartData.data[0] as Float64Array;
      plotRef.current.setScale('x', { min: xData[0]!, max: xData[xData.length - 1]! });
      setIsZoomed(false);
      setXRange(null);
    }
  }, [chartData]);

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
      const preset = QUICK_PRESETS.find((p) => p.label === name && p.types.some((t) => messageTypes.includes(t)));
      if (preset) { applyPreset(preset); return; }
    }
    const first = QUICK_PRESETS.find((p) => p.types.some((t) => messageTypes.includes(t)));
    if (first) applyPreset(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!chartData) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 p-6">
        <div className="text-gray-500 text-sm">Pick a quick plot or select fields</div>
        <div className="flex flex-wrap justify-center gap-2">
          {QUICK_PRESETS.filter((p) => p.types.some((t) => messageTypes.includes(t))).map((preset) => (
            <button
              key={preset.label}
              onClick={() => applyPreset(preset)}
              className="flex flex-col items-start px-3 py-2 rounded-lg bg-gray-800/40 hover:bg-blue-500/10 hover:border-blue-500/30 border border-gray-700/30 transition-colors text-left"
            >
              <span className="text-xs text-gray-200 font-medium">{preset.label}</span>
              <span className="text-[10px] text-gray-500">{preset.desc}</span>
            </button>
          ))}
        </div>
        <p className="text-[10px] text-gray-600 mt-1">Drag to select range &middot; Scroll to zoom &middot; Double-click to reset</p>
      </div>
    );
  }

  // Compute visible mode segments clipped to current x range
  const visibleXMin = xRange?.min ?? startTimeS;
  const visibleXMax = xRange?.max ?? (startTimeS + totalTimeS);
  const visibleRange = visibleXMax - visibleXMin;

  return (
    <div className="h-full flex flex-col relative">
      {/* Mode timeline — synced with chart X axis */}
      {modeTimeline.length > 0 && visibleRange > 0 && (
        <div className="h-5 mx-2 mt-1 flex-shrink-0 rounded overflow-hidden relative bg-gray-800/50">
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
                  title={`${seg.name} (${seg.startS.toFixed(0)}s - ${seg.endS.toFixed(0)}s)`}
                >
                  {widthPct > 8 && (
                    <span className="absolute inset-0 flex items-center justify-center text-[9px] text-white/80 font-medium truncate px-0.5">
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

      {isZoomed && (
        <button
          onClick={resetZoom}
          className="absolute top-1 right-2 z-10 text-[10px] px-2 py-1 bg-gray-800/90 hover:bg-gray-700 text-gray-300 hover:text-white rounded border border-gray-600/50 transition-colors backdrop-blur-sm"
        >
          Reset Zoom
        </button>
      )}
    </div>
  );
}

// ============================================================================
// Flight Path Map Panel
// ============================================================================

const FLIGHT_MAP_LAYERS: Record<string, { name: string; tiles: string[]; maxZoom: number }> = {
  satellite: { name: 'Satellite', tiles: ['https://mt0.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', 'https://mt2.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', 'https://mt3.google.com/vt/lyrs=s&x={x}&y={y}&z={z}'], maxZoom: 22 },
  hybrid: { name: 'Hybrid', tiles: ['https://mt0.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', 'https://mt2.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', 'https://mt3.google.com/vt/lyrs=y&x={x}&y={y}&z={z}'], maxZoom: 22 },
  street: { name: 'Street', tiles: ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png', 'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png', 'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'], maxZoom: 19 },
  terrain: { name: 'Terrain', tiles: ['https://a.tile.opentopomap.org/{z}/{x}/{y}.png', 'https://b.tile.opentopomap.org/{z}/{x}/{y}.png', 'https://c.tile.opentopomap.org/{z}/{x}/{y}.png'], maxZoom: 17 },
};

type PathColorMode = 'solid' | 'mode' | 'altitude' | 'speed';

function FlightPathPanel() {
  const currentLog = useLogStore((s) => s.currentLog);
  const flightPath = useMemo(() => getFlightPath(currentLog), [currentLog]);
  const modeTimeline = useMemo(() => getModeTimeline(currentLog), [currentLog]);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const threeLayerRef = useRef<ReturnType<typeof createFlightPathThreeJsLayer> | null>(null);
  const [activeLayer, setActiveLayer] = useState('satellite');
  const [colorMode, setColorMode] = useState<PathColorMode>('mode');

  // Compute per-segment colors based on color mode
  const segmentColors = useMemo(() => {
    if (flightPath.length < 2) return undefined;

    if (colorMode === 'solid') return undefined; // default amber

    if (colorMode === 'mode' && modeTimeline.length > 0) {
      const colors: string[] = [];
      for (let i = 0; i < flightPath.length - 1; i++) {
        const gps = currentLog?.messages['GPS'];
        const timeUs = gps?.[i]?.timeUs ?? 0;
        const timeS = timeUs / 1_000_000;
        // Find which mode segment this point falls in
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
      const alts = flightPath.map(p => p[2]);
      const minAlt = Math.min(...alts);
      const maxAlt = Math.max(...alts);
      const range = maxAlt - minAlt || 1;
      const colors: string[] = [];
      for (let i = 0; i < flightPath.length - 1; i++) {
        const t = (flightPath[i]![2] - minAlt) / range; // 0-1
        // Blue → Cyan → Green → Yellow → Red
        let r: number, g: number, b: number;
        if (t < 0.25) { r = 0; g = Math.round(t * 4 * 255); b = 255; }
        else if (t < 0.5) { r = 0; g = 255; b = Math.round((1 - (t - 0.25) * 4) * 255); }
        else if (t < 0.75) { r = Math.round((t - 0.5) * 4 * 255); g = 255; b = 0; }
        else { r = 255; g = Math.round((1 - (t - 0.75) * 4) * 255); b = 0; }
        colors.push(`#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`);
      }
      return colors;
    }

    if (colorMode === 'speed') {
      const gps = currentLog?.messages['GPS'];
      if (gps && gps.length > 1) {
        const speeds = gps.map(m => {
          const spd = m.fields['Spd'];
          return typeof spd === 'number' ? spd : 0;
        });
        const maxSpd = Math.max(...speeds, 1);
        const colors: string[] = [];
        for (let i = 0; i < flightPath.length - 1; i++) {
          const t = (speeds[i] ?? 0) / maxSpd;
          let r: number, g: number, b: number;
          if (t < 0.25) { r = 0; g = Math.round(t * 4 * 255); b = 255; }
          else if (t < 0.5) { r = 0; g = 255; b = Math.round((1 - (t - 0.25) * 4) * 255); }
          else if (t < 0.75) { r = Math.round((t - 0.5) * 4 * 255); g = 255; b = 0; }
          else { r = 255; g = Math.round((1 - (t - 0.75) * 4) * 255); b = 0; }
          colors.push(`#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`);
        }
        return colors;
      }
    }

    return undefined;
  }, [flightPath, colorMode, modeTimeline, currentLog]);

  const mapCenter = useMemo((): [number, number] => {
    if (flightPath.length === 0) return [0, 0];
    const mid = flightPath[Math.floor(flightPath.length / 2)]!;
    return [mid[1], mid[0]];
  }, [flightPath]);

  // Store ground elevation and points for reuse across effects
  const groundElevRef = useRef(0);
  const pointsRef = useRef<{ lon: number; lat: number; alt: number }[]>([]);

  // Map initialization — only re-runs on flightPath or layer change
  useEffect(() => {
    if (!mapContainerRef.current || flightPath.length < 2) return;

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
          geometry: { type: 'LineString', coordinates: flightPath.map(([lat, lng]) => [lng, lat]) },
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
      map.addLayer(threeLayer.layer);

      pointsRef.current = flightPath.map(([lat, lng, alt]) => ({ lon: lng, lat, alt }));
      const startLngLat = new maplibregl.LngLat(flightPath[0]![1], flightPath[0]![0]);

      function renderPath() {
        groundElevRef.current = map.queryTerrainElevation(startLngLat) ?? 0;
        threeLayer.updateData({
          points: pointsRef.current,
          groundElevation: groundElevRef.current,
          segmentColors,
        });
      }

      // Fit bounds first, then render after terrain settles
      const bounds = new maplibregl.LngLatBounds();
      for (const [lat, lng] of flightPath) bounds.extend([lng, lat]);
      map.fitBounds(bounds, { padding: 80, pitch: 50, duration: 0 });

      // Start/end markers
      const first = flightPath[0]!;
      const last = flightPath[flightPath.length - 1]!;
      new maplibregl.Marker({ color: '#22c55e', scale: 0.7 })
        .setLngLat([first[1], first[0]])
        .setPopup(new maplibregl.Popup({ offset: 20 }).setText('Takeoff'))
        .addTo(map);
      new maplibregl.Marker({ color: '#ef4444', scale: 0.7 })
        .setLngLat([last[1], last[0]])
        .setPopup(new maplibregl.Popup({ offset: 20 }).setText('Landing'))
        .addTo(map);

      // Wait for terrain to load, then render + re-fit
      map.once('idle', () => {
        renderPath();
        map.fitBounds(bounds, { padding: 80, pitch: 50, duration: 500 });
      });
    });

    mapRef.current = map;
    return () => {
      threeLayerRef.current?.dispose();
      threeLayerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [flightPath, activeLayer, mapCenter]);

  // Update colors without rebuilding the map
  useEffect(() => {
    if (!threeLayerRef.current || pointsRef.current.length === 0) return;
    threeLayerRef.current.updateData({
      points: pointsRef.current,
      groundElevation: groundElevRef.current,
      segmentColors,
    });
  }, [segmentColors]);

  if (flightPath.length < 2) {
    return (
      <div className="h-full flex items-center justify-center text-gray-600 text-xs">
        No GPS data available
      </div>
    );
  }

  return (
    <div className="h-full relative">
      <div ref={mapContainerRef} className="h-full w-full" />
      {/* Controls overlay */}
      <div className="absolute top-2 right-2 z-10 flex flex-col items-stretch gap-1.5">
        {/* Layer switcher */}
        <div className="flex bg-gray-900/80 rounded-md backdrop-blur-sm overflow-hidden">
          {Object.entries(FLIGHT_MAP_LAYERS).map(([key, l]) => (
            <button
              key={key}
              onClick={() => setActiveLayer(key)}
              className={`flex-1 text-[10px] px-2 py-1 transition-colors ${
                activeLayer === key
                  ? 'bg-blue-500/30 text-blue-300'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {l.name}
            </button>
          ))}
        </div>
        {/* Path color mode */}
        <div className="flex bg-gray-900/80 rounded-md backdrop-blur-sm overflow-hidden">
          {([
            ['solid', 'Solid'],
            ['mode', 'Modes'],
            ['altitude', 'Altitude'],
            ['speed', 'Speed'],
          ] as [PathColorMode, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setColorMode(key)}
              className={`flex-1 text-[10px] px-2 py-1 transition-colors ${
                colorMode === key
                  ? 'bg-blue-500/30 text-blue-300'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {/* Center on flight path FAB */}
      <button
        onClick={() => {
          if (!mapRef.current || flightPath.length < 2) return;
          const lngs = flightPath.map(p => p[1]);
          const lats = flightPath.map(p => p[0]);
          mapRef.current.fitBounds(
            [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
            { padding: 80, pitch: 50, duration: 800 },
          );
        }}
        className="absolute bottom-3 right-3 z-10 w-8 h-8 rounded-full bg-gray-800/90 text-gray-400 hover:text-white hover:bg-gray-700/90 shadow-lg flex items-center justify-center transition-all"
        title="Center on flight path"
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
  const currentLog = useLogStore((s) => s.currentLog);
  const selectedTypes = useLogStore((s) => s.selectedTypes);
  const selectedFields = useLogStore((s) => s.selectedFields);
  const setSelectedTypes = useLogStore((s) => s.setSelectedTypes);
  const setSelectedFields = useLogStore((s) => s.setSelectedFields);
  const [search, setSearch] = useState('');
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set());

  const messageTypes = currentLog?.messageTypes ?? [];

  const filteredTypes = useMemo(() => {
    if (!search.trim()) return messageTypes;
    const q = search.trim().toLowerCase();
    return messageTypes.filter((type) => type.toLowerCase().includes(q));
  }, [messageTypes, search]);

  // Get fields for any message type (not just selected ones)
  const typeFields = useMemo(() => {
    if (!currentLog) return {};
    const result: Record<string, string[]> = {};
    for (const type of messageTypes) {
      const msgs = currentLog.messages[type];
      if (msgs && msgs.length > 0) {
        const firstMsg = msgs[0]!;
        result[type] = Object.keys(firstMsg.fields).filter(
          (f) => f !== 'TimeUS' && typeof firstMsg.fields[f] === 'number',
        );
      }
    }
    return result;
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
    const current = store.selectedFields.get(type) ?? [];
    const isRemoving = current.includes(field);
    const newFields = isRemoving ? current.filter((f) => f !== field) : [...current, field];
    store.setSelectedFields(type, newFields);

    // Auto-manage selectedTypes based on whether any fields are checked
    if (!isRemoving && !store.selectedTypes.includes(type)) {
      store.setSelectedTypes([...store.selectedTypes, type]);
    } else if (isRemoving && newFields.length === 0) {
      store.setSelectedTypes(store.selectedTypes.filter((t) => t !== type));
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
      {/* Search + presets (sticky top) */}
      <div className="p-3 pb-2 space-y-2 border-b border-gray-700/30">
        <div className="relative">
          <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter messages..."
            className="w-full bg-gray-900/50 border border-gray-700/40 rounded text-[11px] pl-6 pr-2 py-1 text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500/50"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 text-xs"
            >
              x
            </button>
          )}
        </div>
        {/* Quick presets + clear */}
        <div className="flex flex-wrap gap-1">
          {QUICK_PRESETS.filter((p) => p.types.some((t) => messageTypes.includes(t))).map((preset) => (
            <button
              key={preset.label}
              onClick={() => applyPreset(preset)}
              className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800/60 hover:bg-blue-500/20 hover:text-blue-400 text-gray-400 transition-colors"
            >
              {preset.label}
            </button>
          ))}
          {Array.from(selectedFields.values()).some((f) => f.length > 0) && (
            <button
              onClick={() => {
                const s = useLogStore.getState();
                s.selectedFields.forEach((_fields, type) => s.setSelectedFields(type, []));
                s.setSelectedTypes([]);
              }}
              className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors"
            >
              Clear All
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
          return (
            <div key={type}>
              <button
                onClick={() => toggleExpanded(type)}
                className={`flex items-center gap-2 text-xs w-full rounded px-2 py-1.5 transition-colors hover:bg-gray-800/40`}
                style={{ backgroundColor: hasSelection ? `${groupColor}18` : undefined, opacity: hasSelection ? 1 : 0.45 }}
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: groupColor }} />
                <span className={hasSelection ? 'font-semibold' : 'font-medium'} style={{ color: groupColor }}>{type}</span>
                {activeFieldCount > 0 && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: `${groupColor}25`, color: groupColor }}>
                    {activeFieldCount}
                  </span>
                )}
                <span className="text-[10px] text-gray-600 ml-auto tabular-nums">{currentLog?.messages[type]?.length ?? 0}</span>
                <svg className={`w-3 h-3 text-gray-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
              {isExpanded && fields.length > 0 && (
                <div className="ml-3 mt-0.5 mb-1 pl-2 space-y-0.5" style={{ borderLeft: `2px solid ${groupColor}40` }}>
                  {fields.map((field) => {
                    const isChecked = selectedFields.get(type)?.includes(field) ?? false;
                    const lineColor = seriesColorMap.get(`${type}.${field}`);
                    return (
                      <label
                        key={field}
                        className={`flex items-center gap-2 text-[11px] cursor-pointer rounded px-2 py-1 transition-colors ${
                          isChecked ? 'bg-gray-800/50' : 'hover:bg-gray-800/30'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleFieldToggle(type, field)}
                          className="rounded border-gray-600 bg-gray-800 text-blue-500 w-3 h-3"
                        />
                        {isChecked && lineColor && (
                          <span className="w-3 h-[3px] rounded-full flex-shrink-0" style={{ backgroundColor: lineColor }} />
                        )}
                        <span className={isChecked ? 'text-gray-200' : 'text-gray-500'}>{field}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {filteredTypes.length === 0 && search && (
          <p className="text-[11px] text-gray-600 text-center py-4">No matches for "{search}"</p>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Dockview Setup
// ============================================================================

const dockviewComponents: Record<string, React.FC<IDockviewPanelProps>> = {
  ChartPanel: () => <ChartPanel />,
  FlightPathPanel: () => <FlightPathPanel />,
  FieldPickerPanel: () => <FieldPickerPanel />,
};

const DEFAULT_LAYOUT: SerializedDockview = {
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
    map: { id: 'map', contentComponent: 'FlightPathPanel', title: 'Flight Path' },
    chart: { id: 'chart', contentComponent: 'ChartPanel', title: 'Chart' },
    fields: { id: 'fields', contentComponent: 'FieldPickerPanel', title: 'Fields' },
  },
  activeGroup: '1',
};

// ============================================================================
// Main Explorer Panel
// ============================================================================

const PANEL_DEFS = [
  { id: 'chart', component: 'ChartPanel', title: 'Chart' },
  { id: 'map', component: 'FlightPathPanel', title: 'Flight Path' },
  { id: 'fields', component: 'FieldPickerPanel', title: 'Fields' },
];

export function LogExplorerPanel() {
  const apiRef = useRef<DockviewApi | null>(null);
  const [openPanels, setOpenPanels] = useState<Set<string>>(new Set(['chart', 'map', 'fields']));

  const onReady = useCallback((event: DockviewReadyEvent) => {
    apiRef.current = event.api;
    event.api.fromJSON(DEFAULT_LAYOUT);

    // Track panel open/close
    event.api.onDidRemovePanel((e) => {
      setOpenPanels((prev) => {
        const next = new Set(prev);
        // Match by component name since IDs can have suffixes
        const def = PANEL_DEFS.find((d) => e.id.startsWith(d.id));
        if (def) next.delete(def.id);
        return next;
      });
    });

    event.api.onDidAddPanel((e) => {
      setOpenPanels((prev) => {
        const next = new Set(prev);
        const def = PANEL_DEFS.find((d) => e.id.startsWith(d.id));
        if (def) next.add(def.id);
        return next;
      });
    });
  }, []);

  const handleAddPanel = useCallback((id: string, component: string, title: string) => {
    if (!apiRef.current) return;
    apiRef.current.addPanel({ id: `${id}-${Date.now()}`, component, title });
  }, []);

  const handleResetLayout = useCallback(() => {
    if (!apiRef.current) return;
    apiRef.current.fromJSON(DEFAULT_LAYOUT);
    setOpenPanels(new Set(['chart', 'map', 'fields']));
  }, []);

  const closedPanels = PANEL_DEFS.filter((d) => !openPanels.has(d.id));

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Toolbar: re-add panels + reset */}
      <div className="flex items-center gap-2 px-4 pt-2 pb-1 flex-shrink-0">
        {closedPanels.length > 0 && (
          <>
            <span className="text-[10px] text-gray-500">Add panel:</span>
            {closedPanels.map((def) => (
              <button
                key={def.id}
                onClick={() => handleAddPanel(def.id, def.component, def.title)}
                className="text-[10px] px-2 py-0.5 rounded bg-gray-800/60 hover:bg-blue-500/20 hover:text-blue-400 text-gray-400 border border-gray-700/30 transition-colors"
              >
                {def.title}
              </button>
            ))}
          </>
        )}
        <button
          onClick={handleResetLayout}
          className="text-[10px] px-2 py-0.5 rounded bg-gray-800/60 hover:bg-gray-700 text-gray-500 hover:text-gray-300 border border-gray-700/30 transition-colors ml-auto"
          title="Reset panel layout"
        >
          Reset Layout
        </button>
      </div>

      {/* Dockview panels */}
      <div className="flex-1 dockview-theme-dark log-explorer-dock">
        <DockviewReact
          components={dockviewComponents}
          onReady={onReady}
          className="h-full"
        />
      </div>
    </div>
  );
}
