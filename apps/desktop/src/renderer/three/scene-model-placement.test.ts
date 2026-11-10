import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  groundSamplePoints,
  lowestGround,
  modelAltitude,
  modelQuaternion,
  offsetLatLng,
  resolvePlacement,
  rotatedBounds,
  type GroundAt,
} from './scene-model-placement';

const origin = { lat: 47, lng: 8, altMsl: 500 };
// ground rises 1 m per metre east of the origin, 400 m at the origin
const slope: GroundAt = (_lat, lng) => 400 + (lng - 8) * 111_320 * Math.cos((47 * Math.PI) / 180);

describe('modelAltitude', () => {
  it('amsl keeps altMsl, agl adds the ground at the origin, clamp sits on the lowest ground', () => {
    expect(modelAltitude('amsl', 500, 400, 390)).toBe(500);
    expect(modelAltitude(undefined, 500, 400, 390)).toBe(500);
    expect(modelAltitude('agl', 20, 400, 390)).toBe(420);
    expect(modelAltitude('clamp', 500, 400, 390)).toBe(390);
  });

  it('never goes below the lowest ground in any mode', () => {
    expect(modelAltitude('amsl', 100, 400, 390)).toBe(390);
    expect(modelAltitude('agl', -50, 400, 390)).toBe(390);
  });

  it('leaves altMsl alone when the ground is unknown', () => {
    expect(modelAltitude('clamp', 500, null, null)).toBe(500);
    expect(modelAltitude('agl', 20, null, null)).toBe(20);
  });
});

describe('point clouds', () => {
  const extent = { minY: -15, maxY: 25 };

  it('keeps an amsl cloud whose highest point is above the lowest ground, even when its centre is below it', () => {
    expect(modelAltitude('amsl', 410, 450, 420, extent)).toBe(410);
    expect(modelAltitude('amsl', 500, 450, 420, extent)).toBe(500);
  });

  it('lifts an amsl cloud only when it is wholly underground, until its top meets the ground', () => {
    expect(modelAltitude('amsl', 300, 450, 420, extent)).toBe(395);
  });

  it('rests a clamped cloud on its lowest point', () => {
    expect(modelAltitude('clamp', 0, 450, 420, extent)).toBe(435);
    expect(modelAltitude('clamp', 77, null, null, extent)).toBe(77);
  });

  it('applies only when the entry is a point cloud and its bounds carry heights', () => {
    const bounds = { minX: -15, maxX: 15, minZ: -15, maxZ: 15, minY: -10, maxY: 30 };
    const flat: GroundAt = () => 400;
    expect(resolvePlacement({ origin: { ...origin, altMsl: 395 }, pointCloud: '/p.ply' }, flat, bounds).altMsl).toBe(395);
    expect(resolvePlacement({ origin: { ...origin, altMsl: 395 } }, flat, bounds).altMsl).toBe(400);
  });

  it('reports vertical bounds after rotation and scale', () => {
    const b = rotatedBounds(new THREE.Box3(new THREE.Vector3(-1, -2, -1), new THREE.Vector3(1, 3, 1)), modelQuaternion(45), 2);
    expect(b.minY).toBeCloseTo(-4, 9);
    expect(b.maxY).toBeCloseTo(6, 9);
  });
});

describe('meshes with their own heights (Locus survey surface)', () => {
  const flat: GroundAt = () => 1;
  // Locus GLB: vertex heights are ellipsoidal (25 to 64 m), origin altMsl is 0 minus the geoid (-40.2 m at 53.3 N 8.5 E)
  const surface = { minX: 182, maxX: 1285, minZ: -963, maxZ: -130, minY: 25, maxY: 64 };

  it('keeps the datum origin below the ground instead of flooring it up by the geoid offset', () => {
    const p = resolvePlacement({ origin: { lat: 53.27, lng: 8.45, altMsl: -40.22 } }, flat, surface);
    expect(p.altMsl).toBeCloseTo(-40.22, 6);
  });

  it('still lifts such a mesh when all of it would be underground', () => {
    const p = resolvePlacement({ origin: { lat: 53.27, lng: 8.45, altMsl: -100 } }, flat, surface);
    expect(p.altMsl).toBe(1 - 64);
  });

  it('leaves ordinary models (geometry starting at the origin) on the old floor rule', () => {
    const p = resolvePlacement({ origin: { lat: 53.27, lng: 8.45, altMsl: -5 } }, flat, { minX: -5, maxX: 5, minZ: -5, maxZ: 5, minY: 0, maxY: 10 });
    expect(p.altMsl).toBe(1);
  });
});

describe('ground under the footprint', () => {
  it('samples every footprint vertex and the origin', () => {
    const ring = [offsetLatLng(origin, -10, 0), offsetLatLng(origin, 10, 0), offsetLatLng(origin, 0, 10)];
    const pts = groundSamplePoints({ origin, footprints: [ring] });
    expect(pts).toHaveLength(4);
    expect(lowestGround(pts, slope)).toBeCloseTo(390, 3);
  });

  it('uses the bounds corners without footprints', () => {
    const pts = groundSamplePoints({ origin }, { minX: -20, maxX: 20, minZ: -5, maxZ: 5 });
    expect(pts).toHaveLength(5);
    expect(lowestGround(pts, slope)).toBeCloseTo(380, 3);
  });

  it('ignores points without ground data', () => {
    expect(lowestGround([origin, { lat: 1, lng: 1 }], (lat) => (lat === 1 ? null : 7))).toBe(7);
    expect(lowestGround([origin], () => null)).toBeNull();
  });

  it('clamps a model on a slope to its downhill edge so no side floats', () => {
    const p = resolvePlacement({ origin, altitudeMode: 'clamp' }, slope, { minX: -15, maxX: 15, minZ: -15, maxZ: 15 });
    expect(p.altMsl).toBeCloseTo(385, 3);
    const agl = resolvePlacement({ origin: { ...origin, altMsl: 10 }, altitudeMode: 'agl' }, slope, null);
    expect(agl.altMsl).toBeCloseTo(410, 3);
  });
});

describe('modelQuaternion', () => {
  const nose = () => new THREE.Vector3(0, 0, -1);
  const right = () => new THREE.Vector3(1, 0, 0);

  it('yaws clockwise from north', () => {
    const v = nose().applyQuaternion(modelQuaternion(90, 0, 0));
    expect(v.x).toBeCloseTo(1, 9);
    expect(v.z).toBeCloseTo(0, 9);
  });

  it('pitches nose up about the yawed east axis', () => {
    const v = nose().applyQuaternion(modelQuaternion(90, 30, 0));
    expect(v.y).toBeCloseTo(0.5, 9);
    expect(v.x).toBeCloseTo(Math.cos(Math.PI / 6), 9);
    expect(v.z).toBeCloseTo(0, 9);
  });

  it('rolls right side down after pitch', () => {
    const r = right().applyQuaternion(modelQuaternion(0, 0, 30));
    expect(r.y).toBeCloseTo(-0.5, 9);
    const n = nose().applyQuaternion(modelQuaternion(0, 30, 90));
    expect(n.y).toBeCloseTo(0.5, 9);
    const r2 = right().applyQuaternion(modelQuaternion(0, 30, 90));
    expect(r2.y).toBeCloseTo(-Math.cos(Math.PI / 6), 9);
  });

  it('rotates and scales the bounds', () => {
    const box = new THREE.Box3(new THREE.Vector3(-10, 0, -1), new THREE.Vector3(10, 5, 1));
    const b = rotatedBounds(box, modelQuaternion(90), 2);
    expect(b.minX).toBeCloseTo(-2, 9);
    expect(b.maxZ).toBeCloseTo(20, 9);
    expect(b.radiusM).toBeCloseTo(Math.hypot(20, 2), 9);
  });
});
