import { describe, it, expect } from 'vitest';
import { MAP_INSTRUMENTS, isRoundInMode } from './registry';

const byId = (id: string) => MAP_INSTRUMENTS.find((d) => d.id === id)!;

describe('isRoundInMode', () => {
  it('is round in analog, flat as a numeric card', () => {
    expect(isRoundInMode(byId('battery'), 'analog')).toBe(true);
    expect(isRoundInMode(byId('battery'), 'numeric')).toBe(false);
  });

  // The docked group shapes its card around round members. 'used' draws a dial,
  // so before it declared that the bar ended in a square corner next to it.
  it('follows the variant, not the instrument, when a variant is showing', () => {
    expect(isRoundInMode(byId('battery'), 'used')).toBe(true);
    expect(isRoundInMode(byId('battery'), 'strip')).toBe(false);
  });

  it('treats an unknown mode as the analog face', () => {
    expect(isRoundInMode(byId('battery'), 'hologram')).toBe(false);
    expect(isRoundInMode(byId('flight-data'), 'analog')).toBe(false);
  });
});
