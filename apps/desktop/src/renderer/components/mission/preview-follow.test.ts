import { describe, it, expect } from 'vitest';
import { shouldRecenter, FollowState, FOLLOW_MARGIN } from './preview-follow';

const view = { width: 1000, height: 600 };

describe('shouldRecenter', () => {
  it('leaves the map alone while the aircraft is near the middle', () => {
    expect(shouldRecenter({ x: 500, y: 300 }, view).recenter).toBe(false);
    expect(shouldRecenter({ x: 620, y: 360 }, view).recenter).toBe(false);
  });

  it('recentres once it nears an edge', () => {
    expect(shouldRecenter({ x: 900, y: 300 }, view).recenter).toBe(true);
    expect(shouldRecenter({ x: 500, y: 560 }, view).recenter).toBe(true);
  });

  // The case that made the preview useless: on a 50 km corridor the aircraft
  // is off the map within a second of pressing play.
  it('recentres when it has left the viewport entirely', () => {
    expect(shouldRecenter({ x: -4000, y: 300 }, view).recenter).toBe(true);
    expect(shouldRecenter({ x: 500, y: 9000 }, view).recenter).toBe(true);
  });

  it('holds the stated margin at the boundary', () => {
    const justInside = view.width / 2 + view.width * (FOLLOW_MARGIN - 0.01);
    const justOutside = view.width / 2 + view.width * (FOLLOW_MARGIN + 0.01);
    expect(shouldRecenter({ x: justInside, y: 300 }, view).recenter).toBe(false);
    expect(shouldRecenter({ x: justOutside, y: 300 }, view).recenter).toBe(true);
  });

  it('does nothing before the map has a size', () => {
    expect(shouldRecenter({ x: 0, y: 0 }, { width: 0, height: 0 }).recenter).toBe(false);
  });
});

describe('FollowState', () => {
  it('follows from the start', () => {
    expect(new FollowState().active).toBe(true);
  });

  // Chasing the aircraft while the pilot is dragging the map to look at
  // something else would make the map unusable.
  it('stops following when the pilot moves the map', () => {
    const s = new FollowState();
    s.userMoved();
    expect(s.active).toBe(false);
  });

  it('resumes only when playback restarts', () => {
    const s = new FollowState();
    s.userMoved();
    expect(s.active).toBe(false);
    s.restart();
    expect(s.active).toBe(true);
  });
});
