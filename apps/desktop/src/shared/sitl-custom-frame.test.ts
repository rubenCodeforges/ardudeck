import { describe, it, expect } from 'vitest';
import {
  SITL_FRAME_TEMPLATES,
  validateFrame,
  type SitlCustomFrame,
} from './sitl-custom-frame';

describe('validateFrame', () => {
  it('accepts a frame without slungLoad', () => {
    const result = validateFrame(SITL_FRAME_TEMPLATES.small_quad?.frame);
    expect(result.ok).toBe(true);
  });

  it('round-trips the heavy_octa template with slungLoad through JSON', () => {
    const frame = SITL_FRAME_TEMPLATES.heavy_octa?.frame;
    expect(frame?.slungLoad).toBeDefined();
    const parsed = JSON.parse(JSON.stringify(frame)) as unknown;
    const result = validateFrame(parsed);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.frame.slungLoad?.loadMass).toBe(8);
    }
  });

  it('emits the exact engine key names in the serialized slungLoad', () => {
    const frame = SITL_FRAME_TEMPLATES.heavy_industrial_14s?.frame;
    const json = JSON.parse(JSON.stringify(frame)) as { slungLoad?: Record<string, unknown> };
    const keys = Object.keys(json.slungLoad ?? {}).sort();
    // These camelCase keys must match crates/ardudeck-sim-engine/src/frame.rs
    // SlungLoadFrame serde renames exactly.
    // winchChannel is intentionally omitted from the templates (fixed-length
    // default), so it does not appear in the serialized keys.
    expect(keys).toEqual(
      [
        'cableLength',
        'damping',
        'hardpoint',
        'loadDragCda',
        'loadMass',
        'releaseChannel',
        'stiffness',
        'winchMax',
        'winchMin',
      ].sort(),
    );
  });

  it('rejects a slungLoad missing a required numeric field', () => {
    const base = SITL_FRAME_TEMPLATES.heavy_octa?.frame;
    const bad = {
      ...base,
      slungLoad: { ...base?.slungLoad, stiffness: undefined },
    };
    const result = validateFrame(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes('stiffness'))).toBe(true);
    }
  });

  it('rejects a slungLoad with a malformed hardpoint', () => {
    const base = SITL_FRAME_TEMPLATES.heavy_octa?.frame;
    const bad = {
      ...base,
      slungLoad: { ...base?.slungLoad, hardpoint: [0, 0] },
    };
    const result = validateFrame(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes('hardpoint'))).toBe(true);
    }
  });

  it('rejects a non-object', () => {
    const result = validateFrame(null);
    expect(result.ok).toBe(false);
  });
});

describe('heavy templates', () => {
  it('populate slungLoad only on the heavy frames', () => {
    expect(SITL_FRAME_TEMPLATES.small_quad?.frame.slungLoad).toBeUndefined();
    expect(SITL_FRAME_TEMPLATES.hexa?.frame.slungLoad).toBeUndefined();
    expect(SITL_FRAME_TEMPLATES.heavy_octa?.frame.slungLoad).toBeDefined();
    expect(SITL_FRAME_TEMPLATES.heavy_industrial_14s?.frame.slungLoad).toBeDefined();
  });

  it('hang a fixed-length load (no winch channel) but keep release on channel 10', () => {
    const frames: (SitlCustomFrame | undefined)[] = [
      SITL_FRAME_TEMPLATES.heavy_octa?.frame,
      SITL_FRAME_TEMPLATES.heavy_industrial_14s?.frame,
    ];
    for (const frame of frames) {
      // No winchChannel: the cable holds at a fixed length so the load hangs and
      // swings predictably instead of tracking a stray servo output.
      expect(frame?.slungLoad?.winchChannel).toBeUndefined();
      expect(frame?.slungLoad?.releaseChannel).toBe(10);
    }
  });
});
