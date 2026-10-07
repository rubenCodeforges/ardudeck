import { describe, it, expect } from 'vitest';
import { clampSwarmSize, layoutSwarmHomes, swarmInstanceArgs, swarmInstanceParams, swarmTcpPort, type SwarmLaunch } from './swarm';

const home = { lat: -35.3632, lng: 149.1652, alt: 584, heading: 0 };
const metersBetween = (a: { lat: number; lng: number }, b: { lat: number; lng: number }): number => {
  const north = (b.lat - a.lat) * 111_320;
  const east = (b.lng - a.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(north, east);
};

describe('layoutSwarmHomes', () => {
  it('centres a line on the home point with the requested spacing', () => {
    const homes = layoutSwarmHomes({ count: 3, spacingM: 10, formation: 'line', home });
    expect(homes[1]).toEqual(home);
    expect(metersBetween(homes[0]!, homes[1]!)).toBeCloseTo(10, 3);
    expect(homes.every((h) => h.lat === home.lat)).toBe(true);
  });

  it('keeps circle neighbours about one spacing apart', () => {
    const homes = layoutSwarmHomes({ count: 8, spacingM: 15, formation: 'circle', home });
    expect(metersBetween(homes[0]!, homes[1]!)).toBeCloseTo(15, 0);
  });

  it('packs a grid into a square lattice', () => {
    const homes = layoutSwarmHomes({ count: 4, spacingM: 20, formation: 'grid', home });
    expect(new Set(homes.map((h) => h.lat)).size).toBe(2);
    expect(new Set(homes.map((h) => h.lng)).size).toBe(2);
  });
});

describe('swarm instance setup', () => {
  it('gives each instance its own port and sysid', () => {
    expect([0, 1, 2].map(swarmTcpPort)).toEqual([5760, 5770, 5780]);
    expect(swarmInstanceParams(3)).toEqual(expect.arrayContaining(['MAV_SYSID 3', 'SYSID_THISMAV 3']));
  });

  it('limits the swarm to 2..20 vehicles', () => {
    expect(clampSwarmSize(1)).toBe(2);
    expect(clampSwarmSize(50)).toBe(20);
  });

  it('wipes the EEPROM so the sysid from --defaults applies', () => {
    const launch = { model: 'quad', speedup: 1 } as SwarmLaunch;
    const args = swarmInstanceArgs(launch, 2, home, '/tmp/d.parm');
    expect(args).toEqual(expect.arrayContaining(['-Mquad', '-I2', '--wipe', '--defaults', '/tmp/d.parm']));
  });
});
