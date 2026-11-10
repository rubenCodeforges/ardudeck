import * as THREE from 'three';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';

export const DEFAULT_POINT_SIZE_PX = 2;
const UNCOLOURED = 0xb8c4d0;

interface CacheEntry {
  promise: Promise<THREE.BufferGeometry>;
  refs: number;
}

const cache = new Map<string, CacheEntry>();

function loadSource(url: string): Promise<THREE.BufferGeometry> {
  return new PLYLoader().loadAsync(url).then((g) => {
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  });
}

/** One load per url and version, shared by every view; each call holds a reference until releasePointCloud. */
export function loadPointCloudGeometry(url: string, version: number): Promise<THREE.BufferGeometry> {
  const key = `${url}@${version}`;
  let entry = cache.get(key);
  if (!entry) {
    entry = { promise: loadSource(url), refs: 0 };
    cache.set(key, entry);
  }
  entry.refs++;
  return entry.promise;
}

/** Drops one reference; the last one frees the geometry. Dispose the Points' own material separately. */
export async function releasePointCloud(url: string, version: number): Promise<void> {
  const key = `${url}@${version}`;
  const entry = cache.get(key);
  if (!entry) return;
  entry.refs--;
  if (entry.refs > 0) return;
  cache.delete(key);
  try {
    (await entry.promise).dispose();
  } catch {
    // a load that failed has nothing to free
  }
}

/** Fixed CSS-pixel points over a shared geometry, with vertex colours when the file has them. Size lives in userData.pointSizePx. */
export function createPointCloudObject(geometry: THREE.BufferGeometry, sizePx?: number): THREE.Points {
  const colored = geometry.hasAttribute('color');
  const material = new THREE.PointsMaterial({
    size: DEFAULT_POINT_SIZE_PX,
    sizeAttenuation: false,
    vertexColors: colored,
    color: colored ? 0xffffff : UNCOLOURED,
  });
  const pts = new THREE.Points(geometry, material);
  pts.userData.pointSizePx = sizePx && sizePx > 0 ? sizePx : DEFAULT_POINT_SIZE_PX;
  // three scales size by its own pixel ratio; a view sharing a DPR-sized canvas at ratio 1 (MapLibre) needs the rest
  pts.onBeforeRender = (renderer) => {
    const css = renderer.domElement.clientWidth;
    const pr = renderer.getPixelRatio();
    const ratio = css > 0 ? renderer.getContext().drawingBufferWidth / css : pr;
    material.size = (pts.userData.pointSizePx as number) * (ratio / pr);
  };
  return pts;
}
