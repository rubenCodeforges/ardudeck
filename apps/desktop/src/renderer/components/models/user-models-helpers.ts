import type { UserModelImportResult, UserModelPlacement } from '../../../shared/scene-models/user-models';

export const MODEL_DROP_EXTENSIONS = ['.glb', '.gltf', '.kmz', '.kml', '.json', '.cityjson', '.las', '.laz', '.ply'] as const;

export function isModelFileName(name: string): boolean {
  const lower = name.toLowerCase();
  return MODEL_DROP_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** Only external file drags count: internal drags (waypoints, vehicles) carry no 'Files' type. */
export function carriesFiles(types: ArrayLike<string> | null | undefined): boolean {
  return !!types && Array.from(types).includes('Files');
}

export function filterModelFiles<T extends { name: string }>(files: ArrayLike<T> | null | undefined): T[] {
  if (!files) return [];
  return Array.from(files).filter((f) => isModelFileName(f.name));
}

export type PlacementField = 'lat' | 'lng' | 'alt' | 'yawDeg' | 'pitchDeg' | 'rollDeg' | 'scale';

export const PLACEMENT_LIMITS: Record<PlacementField, { min: number; max: number }> = {
  lat: { min: -90, max: 90 },
  lng: { min: -180, max: 180 },
  alt: { min: -500, max: 9000 },
  yawDeg: { min: -360, max: 360 },
  pitchDeg: { min: -90, max: 90 },
  rollDeg: { min: -180, max: 180 },
  scale: { min: 0.001, max: 10000 },
};

export function normalizeYaw(deg: number): number {
  const r = ((deg % 360) + 360) % 360;
  return Math.round(r * 10) / 10;
}

/** Applies one edited field to a placement, normalising yaw; null when the value is outside the field's range. */
export function applyPlacementField(
  placement: UserModelPlacement,
  field: PlacementField,
  value: number,
): UserModelPlacement | null {
  const { min, max } = PLACEMENT_LIMITS[field];
  if (!Number.isFinite(value) || value < min || value > max) return null;
  return { ...placement, [field]: field === 'yawDeg' ? normalizeYaw(value) : value };
}

/** Initial bearing from a to b in degrees, 0 = north, clockwise. */
export function bearingDeg(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = Math.PI / 180;
  const p1 = a.lat * toRad;
  const p2 = b.lat * toRad;
  const dl = (b.lng - a.lng) * toRad;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return normalizeYaw((Math.atan2(y, x) / toRad));
}

/** Screen offset (y down) of a handle `radius` pixels from the origin along a compass bearing. */
export function handleOffsetPx(yawDeg: number, radius: number): { x: number; y: number } {
  const r = (yawDeg * Math.PI) / 180;
  return { x: Math.sin(r) * radius, y: -Math.cos(r) * radius };
}

/** Compass bearing of a screen-space vector (y down). */
export function bearingFromOffsetPx(dx: number, dy: number): number {
  return normalizeYaw((Math.atan2(dx, -dy) * 180) / Math.PI);
}

export interface ImportSummary {
  imported: number;
  failed: number;
  needsPlacement: number;
  warnings: number;
  tone: 'success' | 'warning' | 'error';
  /** The model to open in the dialog when something needs a position. */
  focusId: string | null;
}

export function summarizeImport(result: UserModelImportResult): ImportSummary {
  const imported = result.imported.length;
  const failed = result.failed.length;
  const needsPlacement = result.needsPlacement.length;
  const warnings = result.warnings?.length ?? 0;
  const tone = imported === 0 && failed > 0 ? 'error' : failed > 0 || needsPlacement > 0 || warnings > 0 ? 'warning' : 'success';
  return { imported, failed, needsPlacement, warnings, tone, focusId: result.needsPlacement[0] ?? null };
}

export function fileBaseName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}
