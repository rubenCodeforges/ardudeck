import * as THREE from 'three';
import type { SceneAltitudeMode } from '@ardudeck/module-sdk';

/** Local frame of every 3D view: x east, y up, z south, metres. */

export const DEFAULT_MODEL_RADIUS_M = 30;
const M_PER_DEG_LAT = 111_320;
const DEG = Math.PI / 180;

export type LatLng = { lat: number; lng: number };
/** Ground elevation in metres MSL, or null where the view has no ground data. */
export type GroundAt = (lat: number, lng: number) => number | null;

export interface PlacementInput {
  origin: { lat: number; lng: number; altMsl: number };
  yawDeg?: number;
  pitchDeg?: number;
  rollDeg?: number;
  scale?: number;
  altitudeMode?: SceneAltitudeMode;
  footprints?: LatLng[][];
  /** Set for a point cloud: its own points hold the ground, so the floor rule only stops it sinking whole. */
  pointCloud?: string;
}

/** Horizontal extent of the placed model about its origin, metres east (x) and south (z). */
export interface LocalBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Yaw clockwise from north, then pitch nose up about the yawed east axis, then roll right side down about the nose. */
export function modelQuaternion(yawDeg = 0, pitchDeg = 0, rollDeg = 0, out = new THREE.Quaternion()): THREE.Quaternion {
  return out.setFromEuler(new THREE.Euler(pitchDeg * DEG, -yawDeg * DEG, -rollDeg * DEG, 'YXZ'));
}

export function offsetLatLng(origin: LatLng, eastM: number, northM: number): LatLng {
  const cos = Math.max(1e-6, Math.cos(origin.lat * DEG));
  return { lat: origin.lat + northM / M_PER_DEG_LAT, lng: origin.lng + eastM / (M_PER_DEG_LAT * cos) };
}

/** Placed model's vertical extent about its origin, metres up. */
export interface VerticalExtent {
  minY: number;
  maxY: number;
}

/** The model's box corners after rotation and scale, as bounds and the farthest corner's horizontal distance from the origin. */
export function rotatedBounds(box: THREE.Box3, quaternion: THREE.Quaternion, scale: number): LocalBounds & VerticalExtent & { radiusM: number } {
  const b = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity, radiusM: 0 };
  if (box.isEmpty()) return { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0, radiusM: 0 };
  const p = new THREE.Vector3();
  for (let i = 0; i < 8; i++) {
    p.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z)
      .applyQuaternion(quaternion)
      .multiplyScalar(scale);
    b.minX = Math.min(b.minX, p.x);
    b.maxX = Math.max(b.maxX, p.x);
    b.minY = Math.min(b.minY, p.y);
    b.maxY = Math.max(b.maxY, p.y);
    b.minZ = Math.min(b.minZ, p.z);
    b.maxZ = Math.max(b.maxZ, p.z);
    b.radiusM = Math.max(b.radiusM, Math.hypot(p.x, p.z));
  }
  return b;
}

/** Where the ground is sampled: the origin plus every footprint vertex, or the bounds' corners without footprints. */
export function groundSamplePoints(input: PlacementInput, bounds?: LocalBounds | null): LatLng[] {
  const origin = { lat: input.origin.lat, lng: input.origin.lng };
  const pts: LatLng[] = [origin];
  const rings = (input.footprints ?? []).filter((r) => r.length > 0);
  if (rings.length > 0) {
    for (const ring of rings) for (const p of ring) pts.push({ lat: p.lat, lng: p.lng });
  } else if (bounds) {
    for (const x of [bounds.minX, bounds.maxX]) for (const z of [bounds.minZ, bounds.maxZ]) pts.push(offsetLatLng(origin, x, -z));
  }
  return pts;
}

export function lowestGround(points: LatLng[], groundAt: GroundAt): number | null {
  let low: number | null = null;
  for (const p of points) {
    const g = groundAt(p.lat, p.lng);
    if (g == null || !Number.isFinite(g)) continue;
    if (low == null || g < low) low = g;
  }
  return low;
}

/** Origin altitude MSL for a mode, never below the lowest ground; with an extent (a point cloud) clamp rests its lowest point and the floor keeps its highest point above ground. */
export function modelAltitude(
  mode: SceneAltitudeMode | undefined, altMsl: number, groundOrigin: number | null, groundLowest: number | null, extent?: VerticalExtent | null,
): number {
  let y: number;
  if (mode === 'clamp') {
    const g = groundLowest ?? groundOrigin;
    y = g != null ? g - (extent?.minY ?? 0) : altMsl;
  } else if (mode === 'agl') y = groundOrigin != null ? groundOrigin + altMsl : altMsl;
  else y = altMsl;
  return groundLowest != null ? Math.max(y, groundLowest - (extent?.maxY ?? 0)) : y;
}

export interface ModelPlacement {
  altMsl: number;
  quaternion: THREE.Quaternion;
  scale: number;
}

export function resolvePlacement(input: PlacementInput, groundAt: GroundAt, bounds?: (LocalBounds & Partial<VerticalExtent>) | null): ModelPlacement {
  const groundOrigin = groundAt(input.origin.lat, input.origin.lng);
  const lowest = lowestGround(groundSamplePoints(input, bounds), groundAt);
  const extent = input.pointCloud && bounds?.minY != null && bounds.maxY != null ? { minY: bounds.minY, maxY: bounds.maxY } : null;
  return {
    altMsl: modelAltitude(input.altitudeMode, input.origin.altMsl, groundOrigin != null && Number.isFinite(groundOrigin) ? groundOrigin : null, lowest, extent),
    quaternion: modelQuaternion(input.yawDeg, input.pitchDeg, input.rollDeg),
    scale: input.scale && input.scale > 0 ? input.scale : 1,
  };
}
