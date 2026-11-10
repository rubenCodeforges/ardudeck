// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { acquirePicking, isPicking } from './map-picking';

describe('isPicking', () => {
  it('is true while any tool holds the map, false once all release', () => {
    const el = document.createElement('div');
    expect(isPicking(el)).toBe(false);
    const a = acquirePicking(el);
    const b = acquirePicking(el);
    a();
    expect(isPicking(el)).toBe(true);
    b();
    expect(isPicking(el)).toBe(false);
  });
});
