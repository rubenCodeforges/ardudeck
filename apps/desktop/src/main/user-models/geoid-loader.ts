import { app } from 'electron';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseGeoidPgm, type Geoid } from '../../shared/scene-models/geoid.js';

let cached: Geoid | null | undefined;

export function loadGeoid(): Geoid | null {
  if (cached !== undefined) return cached;
  try {
    cached = parseGeoidPgm(new Uint8Array(readFileSync(join(app.getAppPath(), 'resources', 'geoids', 'egm96-15.pgm'))));
  } catch (err) {
    console.warn('[user-models] EGM96 grid unavailable, ellipsoid heights pass through:', err);
    cached = null;
  }
  return cached;
}

export function ellipsoidToMsl(geoid: Geoid | null, lat: number, lng: number, hEll: number): number {
  return geoid ? hEll - geoid.undulation(lat, lng) : hEll;
}
