import { describe, it, expect } from 'vitest';
import { ROUTES } from './svt-subjects';

const SPEED: Record<string, number> = { 'red-car': 8, 'yellow-van': 12, walker: 1.5 };

describe('test subject routes', () => {
  it.each(ROUTES.map((r) => [r.id, r] as const))('%s moves at its speed, without jumps, facing where it goes', (id, route) => {
    const dt = 0.05;
    for (let t = 0; t < 120; t += dt) {
      const a = route.at(t);
      const b = route.at(t + dt);
      const dn = b.north - a.north;
      const de = b.east - a.east;
      const step = Math.hypot(dn, de);
      // the walker turns around at each end; skip the sample that spans the turn
      if (Math.abs(a.headingDeg - b.headingDeg) > 90 && Math.abs(a.headingDeg - b.headingDeg) < 270) continue;
      expect(step).toBeCloseTo(SPEED[id]! * dt, 1);
      const travel = ((Math.atan2(de, dn) * 180) / Math.PI + 360) % 360;
      const diff = Math.abs(((a.headingDeg - travel + 540) % 360) - 180);
      expect(diff).toBeLessThan(5);
    }
  });
});
