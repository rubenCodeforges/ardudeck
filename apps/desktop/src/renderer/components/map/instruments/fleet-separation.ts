import { haversineMeters } from '../traffic/proximity';

export interface SeparationInput {
  key: string;
  label: string;
  position: [number, number] | null;
  /** Altitude above mean sea level (m); a shared datum so pairs compare honestly. */
  altitudeMsl: number;
  lastUpdate: number | null;
}

export interface SeparationPair {
  a: string;
  b: string;
  aLabel: string;
  bLabel: string;
  horizontalM: number;
  verticalM: number;
  /** Slant (3D) distance in metres. */
  distanceM: number;
}

/** A vehicle silent this long has a stale position and is left out of the check. */
export const SEPARATION_STALE_MS = 5000;

/** Every pair of live, positioned vehicles, closest first. */
export function separationPairs(vehicles: SeparationInput[], now: number): SeparationPair[] {
  const live = vehicles.filter((v) => v.position !== null && v.lastUpdate !== null && now - v.lastUpdate < SEPARATION_STALE_MS);
  const pairs: SeparationPair[] = [];
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i]!;
      const b = live[j]!;
      const [aLat, aLon] = a.position!;
      const [bLat, bLon] = b.position!;
      const horizontalM = haversineMeters(aLat, aLon, bLat, bLon);
      const verticalM = Math.abs(a.altitudeMsl - b.altitudeMsl);
      pairs.push({
        a: a.key,
        b: b.key,
        aLabel: a.label,
        bLabel: b.label,
        horizontalM,
        verticalM,
        distanceM: Math.hypot(horizontalM, verticalM),
      });
    }
  }
  return pairs.sort((p, q) => p.distanceM - q.distanceM);
}

export type SeparationTone = 'ok' | 'warn' | 'danger';

/** Red inside the minimum, amber inside one and a half times it. */
export function separationTone(distanceM: number, minM: number): SeparationTone {
  if (distanceM < minM) return 'danger';
  if (distanceM < minM * 1.5) return 'warn';
  return 'ok';
}

/** The selected vehicle's nearest neighbour, from pairs sorted closest first. */
export function nearestNeighbour(pairs: SeparationPair[], key: string): { otherLabel: string; pair: SeparationPair } | null {
  const pair = pairs.find((p) => p.a === key || p.b === key);
  if (!pair) return null;
  return { otherLabel: pair.a === key ? pair.bLabel : pair.aLabel, pair };
}
