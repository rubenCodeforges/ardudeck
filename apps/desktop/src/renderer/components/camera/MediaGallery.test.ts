import { describe, it, expect } from 'vitest';
import { formatDuration, formatSize } from './MediaGallery';

describe('gallery labels', () => {
  it('formats durations like a player', () => {
    expect(formatDuration(5.4)).toBe('0:05');
    expect(formatDuration(125)).toBe('2:05');
    expect(formatDuration(3725)).toBe('1:02:05');
    expect(formatDuration(Infinity)).toBe('');
  });

  it('formats sizes', () => {
    expect(formatSize(300)).toBe('1 KB');
    expect(formatSize(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatSize(3 * 1024 ** 3)).toBe('3.00 GB');
  });
});
