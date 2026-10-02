/**
 * FieldGraph — live time-series plot for one MAVLink message. It starts on one
 * (sysid, compid, msgid, fieldName) tuple; the inspector tree adds and removes
 * further fields of the same message as extra traces on the same axes.
 *
 * Drawn with uPlot and the log explorer's chart helpers (palette, cursor
 * readout, CSV) so a live plot and a log plot behave identically: crosshair
 * with values, real axes, drag to zoom, double click to reset.
 */

import { useTranslation } from 'react-i18next';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import {
  acquireInspectorFields,
  appendSample,
  getFieldValue,
  getMessageStats,
  getSamples,
  overlayBufferId,
  panelIdForGraph,
  useInspectorStore,
} from '../../stores/inspector-store';
import { useResolvedTheme } from '../../hooks/useTheme';
import { chartCsv, columnStats, fmtStat, seriesColor } from '../logs/log-chart-stats';
import { createCursorReadout, type ChartCursorReadout } from '../logs/log-chart-cursor';

interface FieldGraphProps {
  sysid: number;
  compid: number;
  msgid: number;
  messageName: string;
  fieldName: string;
}

const EMPTY_FIELDS: string[] = [];

export function FieldGraph(propsIn: Record<string, unknown>): JSX.Element {
  const { t } = useTranslation();
  const props = propsIn as unknown as FieldGraphProps;
  const sysid = Number(props.sysid);
  const compid = Number(props.compid);
  const msgid = Number(props.msgid);
  const messageName = String(props.messageName ?? `MSG_${msgid}`);
  const fieldName = String(props.fieldName ?? '');

  // Samples live at the module level (sampleBuffers in inspector-store) so
  // they survive component unmounts — view switches AND popout seeding both
  // work without losing history.
  const panelId = panelIdForGraph({ sysid, compid, msgid, messageName, fieldName });
  const overlayFields = useInspectorStore((s) => s.overlays[panelId]) ?? EMPTY_FIELDS;
  const fields = [fieldName, ...overlayFields];

  const isLight = useResolvedTheme() === 'light';
  const hostRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);
  const readoutRef = useRef<ChartCursorReadout | null>(null);
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;
  const [sampleCount, setSampleCount] = useState(0);

  useEffect(() => acquireInspectorFields(), []);
  const tick = useInspectorStore((s) => s.tick);

  useEffect(() => {
    const stats = getMessageStats(sysid, compid, msgid);
    if (!stats) return;
    // Skip the tick if the message hasn't advanced: this is what makes Pause
    // freeze the plot, and handles a message that simply stops arriving.
    const existing = getSamples(panelId);
    const lastT = existing.length > 0 ? existing[existing.length - 1]!.t : 0;
    if (stats.lastRxtime <= lastT) return;
    const v = getFieldValue(sysid, compid, msgid, fieldName);
    if (v === null) return;
    appendSample(panelId, stats.lastRxtime, v);
    for (const f of overlayFields) {
      const ov = getFieldValue(sysid, compid, msgid, f);
      if (ov !== null) appendSample(overlayBufferId(panelId, f), stats.lastRxtime, ov);
    }
    plotRef.current?.setData(buildData(panelId, fieldsRef.current));
    setSampleCount(getSamples(panelId).length);
  }, [tick, sysid, compid, msgid, fieldName, panelId, overlayFields]);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    // Canvas strokes are literal colours: a CSS variable here silently falls
    // back to the last colour set, which is the series line.
    const axisTheme = {
      stroke: isLight ? '#4b5563' : '#9ca3af',
      grid: { stroke: isLight ? '#e5e7eb' : '#1f2937', width: 1 },
      ticks: { stroke: isLight ? '#d1d5db' : '#374151', width: 1 },
      font: '11px system-ui',
    };

    const plot = new uPlot({
      width: host.clientWidth || 600,
      height: host.clientHeight || 300,
      padding: [12, 12, 0, 0],
      legend: { show: false },
      cursor: { drag: { x: true, y: false }, focus: { prox: 24 } },
      scales: { x: { time: false } },
      axes: [
        { label: t('inspector:fieldGraph.timeAxis'), ...axisTheme },
        { ...axisTheme, size: 60 },
      ],
      series: [
        {},
        ...fieldsRef.current.map((f, i) => ({
          label: f,
          stroke: seriesColor(i),
          width: 1.6,
          points: { show: false },
        })),
      ],
      hooks: {
        ready: [(u) => { readoutRef.current = createCursorReadout(u.over); }],
        setCursor: [(u) => {
          const readout = readoutRef.current;
          if (!readout) return;
          const idx = u.cursor.idx;
          if (idx === null || idx === undefined || u.cursor.left === undefined || u.cursor.left < 0) {
            readout.update(null, 0, []);
            return;
          }
          readout.update(
            { left: u.cursor.left, top: u.cursor.top ?? 0 },
            (u.data[0]![idx] as number) ?? 0,
            fieldsRef.current.map((f, i) => ({
              label: f,
              color: seriesColor(i),
              value: u.data[i + 1]?.[idx] as number | null | undefined,
            })),
          );
        }],
      },
    }, buildData(panelId, fieldsRef.current), host);

    plotRef.current = plot;

    const ro = new ResizeObserver(() => {
      plot.setSize({ width: host.clientWidth, height: host.clientHeight });
    });
    ro.observe(host);

    return () => {
      ro.disconnect();
      readoutRef.current?.destroy();
      readoutRef.current = null;
      plot.destroy();
      plotRef.current = null;
    };
    // Rebuilt whenever the set of plotted fields changes: uPlot series are
    // fixed at construction.
  }, [panelId, fields.join(','), isLight]);

  const resetZoom = () => {
    const plot = plotRef.current;
    if (!plot) return;
    const xs = plot.data[0];
    if (!xs || xs.length === 0) return;
    plot.setScale('x', { min: xs[0] as number, max: xs[xs.length - 1] as number });
  };

  const handleClear = () => {
    for (const f of fields) {
      const list = f === fieldName ? getSamples(panelId) : getSamples(overlayBufferId(panelId, f));
      list.length = 0;
    }
    plotRef.current?.setData(buildData(panelId, fields), true);
    setSampleCount(0);
  };

  const handleExport = () => {
    const data = buildData(panelId, fields);
    if (data[0]!.length === 0) return;
    const csv = chartCsv(data as unknown as ArrayLike<number>[], fields, 0, data[0]!.length - 1);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${messageName}-${fields.join('-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const legend = fields.map((f, i) => {
    const list = f === fieldName ? getSamples(panelId) : getSamples(overlayBufferId(panelId, f));
    const col = list.map((s) => s.v);
    return {
      field: f,
      color: seriesColor(i),
      stats: columnStats(col, 0, col.length - 1),
    };
  });

  return (
    <div className="h-full flex flex-col bg-surface-base text-content">
      <div className="px-3 pt-2 pb-1 flex items-center gap-2 text-[11px]">
        <span className="font-mono font-semibold text-content uppercase tracking-wider">{messageName}</span>
        <span className="text-[9px] text-content-tertiary tabular-nums shrink-0">
          {t('inspector:fieldGraph.summary', { count: fields.length, sysid, msgid, samples: sampleCount })}
        </span>

        <div className="ml-auto flex items-center gap-1 shrink-0">
          <button
            onClick={handleExport}
            className="px-1.5 py-0.5 rounded border bg-surface hover:bg-surface-raised text-content-secondary hover:text-content border-subtle transition-colors"
            data-tip={t('inspector:fieldGraph.exportTip')}
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0 0l-4-4m4 4l4-4" />
            </svg>
          </button>
          <button
            onClick={handleClear}
            className="text-[10px] px-1.5 py-0.5 rounded border bg-surface hover:bg-surface-raised text-content-secondary hover:text-content border-subtle transition-colors"
            data-tip={t('inspector:fieldGraph.clearTip')}
          >
            {t('common:clear')}
          </button>
        </div>
      </div>

      <div className="px-3 pb-1.5 max-w-[560px]">
        <div
          className="grid items-center text-[9px] uppercase tracking-wider text-content-tertiary pb-0.5"
          style={{ gridTemplateColumns: LEGEND_COLUMNS }}
        >
          <span>{t('inspector:fieldGraph.colField')}</span>
          <span className="text-right">{t('inspector:fieldGraph.colMin')}</span>
          <span className="text-right">{t('inspector:fieldGraph.colAvg')}</span>
          <span className="text-right">{t('inspector:fieldGraph.colMax')}</span>
          <span className="text-right">{t('inspector:fieldGraph.colNow')}</span>
        </div>
        {legend.map((it) => (
          <div
            key={it.field}
            className="grid items-center gap-x-1 text-[10px] leading-tight py-[1px]"
            style={{ gridTemplateColumns: LEGEND_COLUMNS }}
          >
            <span className="inline-flex items-center gap-1.5 min-w-0">
              <span className="w-3 h-[3px] rounded-full shrink-0" style={{ backgroundColor: it.color }} />
              <span className="text-content-secondary truncate">{it.field}</span>
            </span>
            <span className="text-right tabular-nums text-content-tertiary">{it.stats ? fmtStat(it.stats.min) : '-'}</span>
            <span className="text-right tabular-nums text-content">{it.stats ? fmtStat(it.stats.avg) : '-'}</span>
            <span className="text-right tabular-nums text-content-tertiary">{it.stats ? fmtStat(it.stats.max) : '-'}</span>
            <span className="text-right tabular-nums text-content">{it.stats ? fmtStat(it.stats.last) : '-'}</span>
          </div>
        ))}
      </div>

      <div
        className="flex-1 min-h-0 px-2 pb-2"
        onDoubleClick={resetZoom}
      >
        <div ref={hostRef} className="h-full w-full" />
      </div>
    </div>
  );
}

const LEGEND_COLUMNS = 'minmax(0,1fr) 62px 62px 62px 62px';

/**
 * uPlot columns for the plotted fields: x is seconds since the oldest sample
 * still in the buffer, and every series is appended on the same tick from the
 * same message, so the rows line up by index.
 */
function buildData(panelId: string, fields: string[]): uPlot.AlignedData {
  const primary = getSamples(panelId);
  const t0 = primary.length > 0 ? primary[0]!.t : 0;
  const xs = primary.map((s) => (s.t - t0) / 1000);
  const cols = fields.map((f, i) => {
    if (i === 0) return primary.map((s) => s.v);
    // A field added later has a shorter buffer, so match on the sample's own
    // timestamp: by index its history would be drawn from the graph's start.
    // null, not NaN: a NaN in any column makes uPlot's range calculation NaN
    // and the whole plot renders blank with no axis labels.
    const byTime = new Map<number, number>();
    for (const s of getSamples(overlayBufferId(panelId, f))) byTime.set(s.t, s.v);
    return primary.map((s) => byTime.get(s.t) ?? null);
  });
  return [xs, ...cols] as uPlot.AlignedData;
}
