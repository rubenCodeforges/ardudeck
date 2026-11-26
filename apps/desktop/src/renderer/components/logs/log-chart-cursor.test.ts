import { describe, it, expect } from 'vitest';
import { fmtElapsedMs, placeReadout, readoutText } from './log-chart-cursor';

const PLOT = { width: 800, height: 400 };
const BOX = { width: 140, height: 60 };

describe('cursor readout placement', () => {
  it('sits to the lower right of the cursor with room to spare', () => {
    expect(placeReadout({ left: 100, top: 100 }, BOX, PLOT)).toEqual({ left: 114, top: 114 });
  });

  it('flips left instead of hanging off the right edge', () => {
    const pos = placeReadout({ left: 780, top: 100 }, BOX, PLOT);
    expect(pos.left).toBe(780 - 14 - BOX.width);
    expect(pos.left + BOX.width).toBeLessThanOrEqual(PLOT.width);
  });

  it('flips up instead of hanging off the bottom edge', () => {
    const pos = placeReadout({ left: 100, top: 380 }, BOX, PLOT);
    expect(pos.top).toBe(380 - 14 - BOX.height);
  });

  it('stays inside the plot when the box barely fits', () => {
    const pos = placeReadout({ left: 10, top: 10 }, { width: 790, height: 390 }, PLOT);
    expect(pos.left).toBeGreaterThanOrEqual(0);
    expect(pos.top).toBeGreaterThanOrEqual(0);
  });
});

describe('cursor readout content', () => {
  it('formats the time and each series value', () => {
    const text = readoutText(107.5, [
      { label: 'Roll (deg)', color: '#ef4444', value: -8.732 },
      { label: 'Pitch (deg)', color: '#f59e0b', value: 0.5 },
    ]);
    expect(text.time).toBe('107.500 s');
    expect(text.rows.map((r) => r.value)).toEqual(['-8.73', '0.500']);
    expect(text.rows[0]!.color).toBe('#ef4444');
  });

  it('shows elapsed HH:MM:SS.mmm since the log start when an origin is given', () => {
    expect(readoutText(412.4, [], 320)?.time).toBe('00:01:32.400');
    expect(fmtElapsedMs(3144.5)).toBe('00:52:24.500');
  });

  it('shows a dash where a series has no sample at the cursor', () => {
    // Charts merge message types onto a union time axis, so a slower series is
    // NaN at instants that only the faster one sampled.
    const text = readoutText(1, [
      { label: 'DesRoll', color: '#3b82f6', value: NaN },
      { label: 'Roll', color: '#ef4444', value: undefined },
      { label: 'Pitch', color: '#10b981', value: null },
    ]);
    expect(text.rows.map((r) => r.value)).toEqual(['-', '-', '-']);
  });
});
