import { useEffect, useMemo, useRef, useState } from 'react';
import uPlot from 'uplot';
import { useLogStore } from '../../stores/log-store';
import { useResolvedTheme } from '../../hooks/useTheme';
import { SERIES_COLORS } from './log-chart-stats';
import { computeSpectrum, estimateSampleRate, resampleUniform, peakIndex, type Spectrum } from './log-fft';
import { numericFieldNames } from '../../utils/log-columns';

// Sensible defaults per message type: what a tuner actually wants to see first.
// Dataflash names first, then the PX4 ULog topics that carry the same signal.
const TYPE_PREFERENCE: { type: string; field: string }[] = [
  { type: 'IMU', field: 'GyrX' },
  { type: 'GYR', field: 'GyrX' },
  { type: 'ACC', field: 'AccX' },
  { type: 'VIBE', field: 'VibeX' },
  { type: 'RATE', field: 'R' },
  { type: 'sensor_combined', field: 'gyro_rad[0]' },
  { type: 'sensor_gyro_fifo', field: 'x[0]' },
  { type: 'sensor_accel', field: 'x' },
  { type: 'vehicle_imu_status', field: 'gyro_vibration_metric' },
  { type: 'vehicle_angular_velocity', field: 'xyz[0]' },
];

interface InstanceSpectrum {
  inst: number | null;
  rateHz: number;
  sampleCount: number;
  spec: Spectrum;
}

/**
 * FFT spectrum of any log signal - the vibration / harmonic-notch tuning view
 * (MP hides this in a separate FFT tool; here it lives next to the charts and
 * follows their zoom). Welch-averaged, Hann-windowed, amplitude-calibrated.
 * Multi-instance types (per-IMU) render one series per instance so a bad
 * sensor stands out immediately.
 */
export function SpectrumPanel() {
  const currentLog = useLogStore((s) => s.currentLog);
  const syncedXRange = useLogStore((s) => s.syncedXRange);
  const syncZoomEnabled = useLogStore((s) => s.syncZoomEnabled);
  const isLight = useResolvedTheme() === 'light';

  const [msgType, setMsgType] = useState<string | null>(null);
  const [field, setField] = useState<string | null>(null);
  const [followZoom, setFollowZoom] = useState(true);
  const [dbScale, setDbScale] = useState(false);

  // Message types that have at least one numeric field to transform.
  const numericTypes = useMemo(() => {
    if (!currentLog) return [];
    return currentLog.messageTypes.filter((t) => {
      const cols = currentLog.messages[t];
      if (!cols || cols.count < 64) return false;
      return numericFieldNames(cols).some((k) => k !== 'TimeUS' && k !== 'Instance' && k !== 'I');
    });
  }, [currentLog]);

  // Auto-pick the most useful source when a log loads.
  const effectiveType = msgType && numericTypes.includes(msgType)
    ? msgType
    : (TYPE_PREFERENCE.find((p) => numericTypes.includes(p.type))?.type ?? numericTypes[0] ?? null);

  const fieldsForType = useMemo(() => {
    if (!currentLog || !effectiveType) return [];
    const cols = currentLog.messages[effectiveType];
    if (!cols || cols.count === 0) return [];
    return numericFieldNames(cols).filter((k) => k !== 'TimeUS' && k !== 'Instance' && k !== 'I');
  }, [currentLog, effectiveType]);

  const effectiveField = field && fieldsForType.includes(field)
    ? field
    : (TYPE_PREFERENCE.find((p) => p.type === effectiveType && fieldsForType.includes(p.field))?.field ?? fieldsForType[0] ?? null);

  const xWindow = followZoom && syncZoomEnabled ? syncedXRange : null;

  const spectra = useMemo<InstanceSpectrum[]>(() => {
    if (!currentLog || !effectiveType || !effectiveField) return [];
    const cols = currentLog.messages[effectiveType];
    if (!cols || cols.count === 0) return [];

    const instKey = ['Instance', 'I'].find((k) => cols.num[k] !== undefined) ?? null;
    const instCol = instKey ? cols.num[instKey] : undefined;
    const valueCol = cols.num[effectiveField];
    if (!valueCol) return [];
    const instances: (number | null)[] = instCol
      ? [...new Set(Array.from(instCol))].sort((a, b) => a - b)
      : [null];

    const out: InstanceSpectrum[] = [];
    for (const inst of instances) {
      const times: number[] = [];
      const values: number[] = [];
      for (let i = 0; i < cols.count; i++) {
        if (inst !== null && instCol && instCol[i] !== inst) continue;
        const t = (cols.timeUs[i] ?? 0) / 1_000_000;
        if (xWindow && (t < xWindow.min || t > xWindow.max)) continue;
        const v = valueCol[i];
        if (v === undefined || !Number.isFinite(v)) continue;
        times.push(t);
        values.push(v);
      }
      if (times.length < 128) continue;
      const rateHz = estimateSampleRate(times);
      if (!rateHz) continue;
      const uniform = resampleUniform(times, values, rateHz);
      const spec = computeSpectrum(uniform, rateHz);
      if (spec) out.push({ inst, rateHz, sampleCount: times.length, spec });
    }
    return out;
  }, [currentLog, effectiveType, effectiveField, xWindow]);

  const chartRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);

  useEffect(() => {
    const container = chartRef.current;
    if (!container || spectra.length === 0) {
      if (plotRef.current) { plotRef.current.destroy(); plotRef.current = null; }
      return;
    }

    // Align all instances onto the first spectrum's frequency axis. Instances
    // of one sensor type log at (near-)identical rates; a mismatch just
    // truncates to the shortest.
    const minLen = Math.min(...spectra.map((s) => s.spec.freqHz.length));
    const xFreq = spectra[0]!.spec.freqHz.slice(0, minLen);
    const toY = (amp: number) => (dbScale ? 20 * Math.log10(amp + 1e-9) : amp);
    const data = [
      xFreq,
      ...spectra.map((s) => Float64Array.from(s.spec.amplitude.slice(0, minLen), toY)),
    ] as uPlot.AlignedData;

    const axisTheme = {
      stroke: isLight ? '#4b5563' : '#9ca3af',
      grid: { stroke: isLight ? '#e5e7eb' : '#1f2937', width: 1 },
      ticks: { stroke: isLight ? '#d1d5db' : '#374151', width: 1 },
      font: '11px system-ui',
    };

    const { width, height } = container.getBoundingClientRect();
    const opts: uPlot.Options = {
      width: Math.max(width, 300),
      height: Math.max(height, 160),
      cursor: { drag: { x: true, y: false, uni: 50 } },
      scales: { x: { time: false }, y: { auto: true } },
      legend: { show: true },
      axes: [
        { label: 'Frequency (Hz)', ...axisTheme },
        { label: dbScale ? 'Amplitude (dB)' : 'Amplitude', ...axisTheme },
      ],
      series: [
        { label: 'Hz' },
        ...spectra.map((s, i) => ({
          label: s.inst !== null ? `${effectiveType}[${s.inst}].${effectiveField}` : `${effectiveType}.${effectiveField}`,
          stroke: SERIES_COLORS[i % SERIES_COLORS.length]!,
          width: 1.5,
          points: { show: false },
        })),
      ],
      hooks: {
        // Mark the dominant peak: this is the number that goes into notch tuning.
        draw: [(u) => {
          const first = spectra[0]!.spec;
          const pk = peakIndex(first, 5);
          if (pk < 0 || pk >= minLen) return;
          const fx = first.freqHz[pk]!;
          const x = u.valToPos(fx, 'x', true);
          const ctx = u.ctx;
          ctx.save();
          ctx.strokeStyle = '#f59e0b88';
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(x, u.bbox.top);
          ctx.lineTo(x, u.bbox.top + u.bbox.height);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = '#f59e0b';
          ctx.font = '10px system-ui';
          ctx.textBaseline = 'top';
          ctx.fillText(`${fx.toFixed(1)} Hz`, x + 4, u.bbox.top + 2);
          ctx.restore();
        }],
      },
    };

    if (plotRef.current) plotRef.current.destroy();
    plotRef.current = new uPlot(opts, data, container);

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        plotRef.current?.setSize({ width: entry.contentRect.width, height: Math.max(entry.contentRect.height, 120) });
      }
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
      if (plotRef.current) { plotRef.current.destroy(); plotRef.current = null; }
    };
    // effectiveType/effectiveField only feed series labels and always change
    // together with `spectra`, which IS a dep - listing them would just force
    // a second identical rebuild.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spectra, dbScale, isLight]);

  if (!currentLog) {
    return <div className="h-full flex items-center justify-center text-content-tertiary text-xs">No log loaded</div>;
  }

  const first = spectra[0];
  const selectCls = 'text-[11px] px-1.5 py-0.5 rounded bg-input text-content border border-subtle focus:outline-none focus:border-blue-500/50';

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 px-3 pt-2 pb-1.5 border-b border-subtle flex items-center gap-2 flex-wrap">
        <select value={effectiveType ?? ''} onChange={(e) => { setMsgType(e.target.value); setField(null); }} className={selectCls}>
          {numericTypes.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={effectiveField ?? ''} onChange={(e) => setField(e.target.value)} className={selectCls}>
          {fieldsForType.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <button
          onClick={() => setFollowZoom(!followZoom)}
          disabled={!syncZoomEnabled}
          className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
            !syncZoomEnabled
              ? 'bg-surface text-content-tertiary border-subtle opacity-50 cursor-not-allowed'
              : followZoom
                ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                : 'bg-surface text-content-tertiary border-subtle hover:text-content-secondary'
          }`}
          data-tip={syncZoomEnabled ? 'Analyse only the time window the charts are zoomed to' : 'Enable chart sync to follow zoom'}
        >
          Follow zoom
        </button>
        <button
          onClick={() => setDbScale(!dbScale)}
          className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
            dbScale
              ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
              : 'bg-surface text-content-tertiary border-subtle hover:text-content-secondary'
          }`}
          data-tip="Logarithmic amplitude (dB)"
        >
          dB
        </button>
        {first && (
          <span className="text-[10px] text-content-tertiary ml-auto tabular-nums">
            {first.rateHz.toFixed(0)} Hz sample rate · Δf {first.spec.resolutionHz.toFixed(2)} Hz · {first.spec.segments} seg
          </span>
        )}
      </div>
      {spectra.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-content-tertiary text-xs px-6 text-center">
          Not enough samples in this window - zoom out or pick a higher-rate message (IMU, ACC, GYR on ArduPilot; sensor_combined or sensor_gyro_fifo on PX4)
        </div>
      ) : (
        <div ref={chartRef} className="flex-1 min-h-0" />
      )}
    </div>
  );
}
