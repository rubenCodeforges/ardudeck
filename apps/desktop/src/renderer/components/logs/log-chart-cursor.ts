// Cursor value readout for the log charts. The chart already draws a synced
// crosshair; this puts the numbers under it so a spike can be read off without
// eyeballing it against the axis.
//
// DOM-only on purpose: setCursor fires on every mousemove and on every synced
// sibling chart, so React state here would re-render the whole explorer per
// frame. Layout maths is split into pure helpers so it can be tested.

import { fmtStat } from './log-chart-stats';

export interface CursorRow {
  label: string;
  color: string;
  value: number | null | undefined;
}

const OFFSET = 14;
const EDGE_PAD = 6;

/**
 * Places the readout beside the cursor, flipping to the other side when it
 * would overflow the plot rather than letting it hang off the edge.
 */
export function placeReadout(
  cursor: { left: number; top: number },
  box: { width: number; height: number },
  plot: { width: number; height: number },
): { left: number; top: number } {
  let left = cursor.left + OFFSET;
  if (left + box.width > plot.width - EDGE_PAD) {
    left = cursor.left - OFFSET - box.width;
  }
  left = Math.max(EDGE_PAD, Math.min(left, Math.max(EDGE_PAD, plot.width - box.width - EDGE_PAD)));

  let top = cursor.top + OFFSET;
  if (top + box.height > plot.height - EDGE_PAD) {
    top = cursor.top - OFFSET - box.height;
  }
  top = Math.max(EDGE_PAD, Math.min(top, Math.max(EDGE_PAD, plot.height - box.height - EDGE_PAD)));

  return { left, top };
}

/** HH:MM:SS.mmm elapsed time, e.g. 00:05:20.412. */
export function fmtElapsedMs(elapsedS: number): string {
  const total = Math.max(0, Math.round(elapsedS * 1000));
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  const ms = total % 1000, sec = Math.floor(total / 1000);
  return `${p(Math.floor(sec / 3600))}:${p(Math.floor((sec % 3600) / 60))}:${p(sec % 60)}.${p(ms, 3)}`;
}

/**
 * One row per series, plus the time the cursor is sitting on. With `originS` (the log's start, in seconds) the
 * time is elapsed since the log started as HH:MM:SS.mmm, matching the Events list; without it, raw seconds.
 */
export function readoutText(timeS: number, rows: CursorRow[], originS?: number): { time: string; rows: { label: string; color: string; value: string }[] } {
  return {
    time: originS === undefined ? `${timeS.toFixed(3)} s` : fmtElapsedMs(timeS - originS),
    rows: rows.map((r) => ({
      label: r.label,
      color: r.color,
      value: r.value == null || !Number.isFinite(r.value) ? '-' : fmtStat(r.value),
    })),
  };
}

export interface ChartCursorReadout {
  el: HTMLElement;
  update: (cursor: { left: number; top: number } | null, timeS: number, rows: CursorRow[]) => void;
  destroy: () => void;
}

/** Attaches a floating readout to a uPlot `over` element. */
export function createCursorReadout(parent: HTMLElement, originS?: number): ChartCursorReadout {
  const el = document.createElement('div');
  el.className = 'log-chart-readout';
  el.style.cssText = [
    'position:absolute', 'z-index:10', 'pointer-events:none', 'display:none',
    'padding:5px 7px', 'border-radius:5px',
    'font:11px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace',
    'background:var(--color-surface-overlay,rgba(17,24,39,0.92))',
    'color:var(--color-content,#e5e7eb)',
    'border:1px solid var(--color-border-subtle,rgba(255,255,255,0.14))',
    'box-shadow:0 4px 14px rgba(0,0,0,0.35)',
    'white-space:nowrap',
  ].join(';');
  parent.appendChild(el);

  const timeEl = document.createElement('div');
  timeEl.style.cssText = 'opacity:0.65;margin-bottom:2px';
  el.appendChild(timeEl);

  const table = document.createElement('div');
  table.style.cssText = 'display:grid;grid-template-columns:auto 1fr auto;gap:0 8px;align-items:center';
  el.appendChild(table);

  // Reading offsetWidth forces a reflow, and setCursor fires per mousemove on
  // every synced chart. The box only changes size when the label set or the
  // value width changes, so measure on that instead of every frame.
  let sizeKey = '';
  let size = { width: 0, height: 0 };

  let rowCount = 0;
  function ensureRows(n: number): void {
    while (rowCount < n) {
      const swatch = document.createElement('span');
      swatch.style.cssText = 'width:8px;height:2px;border-radius:1px;display:inline-block';
      const label = document.createElement('span');
      label.style.cssText = 'opacity:0.8';
      const value = document.createElement('span');
      value.style.cssText = 'text-align:right;font-variant-numeric:tabular-nums';
      table.append(swatch, label, value);
      rowCount++;
    }
  }

  function update(cursor: { left: number; top: number } | null, timeS: number, rows: CursorRow[]): void {
    if (!cursor || rows.length === 0) {
      el.style.display = 'none';
      return;
    }
    const text = readoutText(timeS, rows, originS);
    timeEl.textContent = text.time;
    ensureRows(text.rows.length);

    const cells = table.children;
    for (let i = 0; i < rowCount; i++) {
      const swatch = cells[i * 3] as HTMLElement;
      const label = cells[i * 3 + 1] as HTMLElement;
      const value = cells[i * 3 + 2] as HTMLElement;
      const row = text.rows[i];
      const show = row !== undefined;
      swatch.style.display = show ? 'inline-block' : 'none';
      label.style.display = show ? '' : 'none';
      value.style.display = show ? '' : 'none';
      if (!row) continue;
      swatch.style.backgroundColor = row.color;
      label.textContent = row.label;
      value.textContent = row.value;
    }

    el.style.display = 'block';

    const key = `${text.rows.map((r) => r.label).join('|')}#${text.rows.reduce((n, r) => Math.max(n, r.value.length), 0)}#${text.time.length}`;
    if (key !== sizeKey) {
      sizeKey = key;
      size = { width: el.offsetWidth, height: el.offsetHeight };
    }

    const pos = placeReadout(cursor, size, {
      width: parent.clientWidth,
      height: parent.clientHeight,
    });
    el.style.left = `${pos.left}px`;
    el.style.top = `${pos.top}px`;
  }

  return {
    el,
    update,
    destroy: () => { el.remove(); },
  };
}
