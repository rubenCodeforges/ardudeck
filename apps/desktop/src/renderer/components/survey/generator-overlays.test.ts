import { describe, it, expect } from 'vitest';
import { extractGeneratorOverlays } from './generator-overlays';

const cell = {
  type: 'polygon',
  points: [
    { lat: 53.1, lng: 8.84 },
    { lat: 53.1, lng: 8.85 },
    { lat: 53.11, lng: 8.85 },
  ],
  color: 'hsl(94 70% 55%)',
  dashed: true,
};

describe('extractGeneratorOverlays', () => {
  it('returns empty for null / non-overlay generatorResult', () => {
    expect(extractGeneratorOverlays(null)).toEqual([]);
    expect(extractGeneratorOverlays(undefined)).toEqual([]);
    expect(extractGeneratorOverlays({ cells: [] })).toEqual([]);
    expect(extractGeneratorOverlays({ overlays: 'nope' })).toEqual([]);
  });

  it('passes valid polygon and polyline overlays through', () => {
    const out = extractGeneratorOverlays({
      overlays: [cell, { type: 'polyline', points: cell.points.slice(0, 2) }],
    });
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual(cell);
    expect(out[1]!.type).toBe('polyline');
    expect(out[1]!.color).toBeUndefined();
  });

  it('drops malformed entries instead of throwing', () => {
    const out = extractGeneratorOverlays({
      overlays: [
        { type: 'circle', points: cell.points },
        { type: 'polygon', points: [{ lat: 53.1, lng: 8.84 }, { lat: 53.1, lng: 8.85 }] },
        { type: 'polygon', points: [{ lat: 'x', lng: 8.84 }, ...cell.points] },
        { type: 'polygon', points: [{ lat: 953.1, lng: 8.84 }, ...cell.points] },
        { type: 'polyline' },
        cell,
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual(cell);
  });

  it('caps overlay count', () => {
    const out = extractGeneratorOverlays({ overlays: Array.from({ length: 600 }, () => cell) });
    expect(out).toHaveLength(480);
  });

  it('rejects oversized color strings', () => {
    const out = extractGeneratorOverlays({ overlays: [{ ...cell, color: 'x'.repeat(64) }] });
    expect(out).toHaveLength(1);
    expect(out[0]!.color).toBeUndefined();
  });
});
