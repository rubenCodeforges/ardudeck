export interface LatLon {
  lat: number;
  lon: number;
}

export type ZoneShape =
  | { kind: 'polygon'; points: LatLon[] }
  | { kind: 'circle'; center: LatLon; radiusM: number };

/** A no-fly hazard (power line, tower, airport, school): planning and upload refuse routes through it. */
export interface Hazard {
  id: string;
  name: string;
  reason?: string;
  shape: ZoneShape;
  /** Metres kept clear around the shape. */
  bufferM: number;
  /** Also upload it to the vehicle as an exclusion fence. */
  uploadAsFence: boolean;
  createdAt: number;
}

/** The admin PIN as stored: scrypt hash, never the PIN. It travels inside the hazards file. */
export interface HazardPin {
  salt: string;
  hash: string;
}

/** The hazards file, on disk and for export and import. */
export interface HazardsFile {
  format: 'ardudeck-hazards';
  version: 1;
  pin: HazardPin | null;
  hazards: Hazard[];
  updatedAt: number;
}

export interface HazardsStatus {
  hasPin: boolean;
  /** This session entered the PIN, so hazards can be edited. */
  unlocked: boolean;
}

export const HAZARDS_FILE_EXTENSION = 'ardudeck-hazards';
export const MIN_PIN_LENGTH = 4;

export function isHazard(x: unknown): x is Hazard {
  if (!x || typeof x !== 'object') return false;
  const z = x as Partial<Hazard>;
  const shapeOk = !!z.shape && (
    (z.shape.kind === 'polygon' && Array.isArray(z.shape.points) && z.shape.points.length >= 3)
    || (z.shape.kind === 'circle' && !!z.shape.center && typeof z.shape.radiusM === 'number')
  );
  return typeof z.id === 'string' && typeof z.name === 'string' && shapeOk
    && typeof z.bufferM === 'number' && typeof z.createdAt === 'number';
}

export function isHazardsFile(x: unknown): x is HazardsFile {
  if (!x || typeof x !== 'object') return false;
  const f = x as Partial<HazardsFile>;
  const pinOk = f.pin === null || (!!f.pin && typeof f.pin.salt === 'string' && typeof f.pin.hash === 'string');
  return f.format === 'ardudeck-hazards' && f.version === 1 && pinOk && Array.isArray(f.hazards) && f.hazards.every(isHazard);
}
