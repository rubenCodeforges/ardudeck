import * as THREE from 'three';
import type { SceneMeshEntry } from '../../shared/tile-source-types';
import { loadGltfScene, releaseGltf } from './gltf-cache';
import { createSceneTileset, type SceneTileset } from './scene-tileset';
import { createPointCloudObject, loadPointCloudGeometry, releasePointCloud } from './point-cloud-cache';
import { resolvePlacement, rotatedBounds, modelQuaternion, type GroundAt } from './scene-model-placement';

export interface SceneModelHandle {
  entry: SceneMeshEntry;
  /** The view positions this one (and may scale it, e.g. terrain exaggeration), and shows it once placed. */
  holder: THREE.Group;
  /** Orientation and entry scale, set by place(). */
  orient: THREE.Group;
  /** Model-frame bounds once loaded. */
  box: THREE.Box3 | null;
  /** Horizontal radius about the origin, once loaded. */
  radiusM: number | undefined;
  loaded: boolean;
  tiles: SceneTileset | null;
  points: THREE.Points | null;
}

export interface SceneModelSet {
  setEntries(entries: SceneMeshEntry[]): void;
  handles(): SceneModelHandle[];
  /** Orients and scales the handle; returns the origin altitude MSL for the view to convert. */
  place(h: SceneModelHandle, groundAt: GroundAt): number;
  radiusOf(key: string): number | undefined;
  /** Tileset LOD for this frame. */
  update(camera: THREE.Camera, width: number, height: number): void;
  dispose(): void;
}

interface SceneModelSetOptions {
  parent: THREE.Object3D;
  /** A model loaded: position it. */
  onLoaded: (h: SceneModelHandle) => void;
  /** Anything new to draw. */
  onChange: () => void;
  /** Fixed screen-space error for tilesets, when the view cannot give the tiles a true camera. */
  tilesErrorTarget?: number;
}

const handleKey = (e: SceneMeshEntry) => `${e.key}@${e.version ?? 0}|${e.url}`;
const isTileset = (e: SceneMeshEntry) => Boolean(e.tileset) || /tileset\.json(?:[?#].*)?$/i.test(e.url);
const isPointCloud = (e: SceneMeshEntry) => Boolean(e.pointCloud);

// A model that fails to load says so once in the in-app console.
const loggedFailures = new Set<string>();
function logFailure(e: SceneMeshEntry, err: unknown): void {
  const k = handleKey(e);
  if (loggedFailures.has(k)) return;
  loggedFailures.add(k);
  const reason = err instanceof Error ? err.message : String(err);
  // loaded lazily: the console store reads localStorage at import
  void import('../stores/console-store').then(({ useConsoleStore }) =>
    useConsoleStore.getState().addLog({ id: Date.now(), timestamp: Date.now(), level: 'warn', message: `[SceneMesh] could not load ${e.url}: ${reason}` }), // i18n-exempt: diagnostic log
  );
}

function tagMeshes(o: THREE.Object3D, entryKey: string): void {
  o.traverse((c) => { c.userData.entryKey = entryKey; });
}

export function createSceneModelSet(opts: SceneModelSetOptions): SceneModelSet {
  const handles = new Map<string, SceneModelHandle>();
  let disposed = false;

  const drop = (k: string, h: SceneModelHandle) => {
    opts.parent.remove(h.holder);
    handles.delete(k);
    if (h.tiles) h.tiles.dispose();
    else if (isPointCloud(h.entry)) {
      (h.points?.material as THREE.Material | undefined)?.dispose();
      void releasePointCloud(h.entry.url, h.entry.version ?? 0);
    } else void releaseGltf(h.entry.url, h.entry.version ?? 0);
  };

  return {
    setEntries(entries) {
      const wanted = new Map(entries.map((e) => [handleKey(e), e]));
      for (const [k, h] of handles) if (!wanted.has(k)) drop(k, h);
      for (const [k, e] of wanted) {
        const existing = handles.get(k);
        if (existing) {
          existing.entry = e;
          const pts = existing.points;
          if (pts && e.pointSizePx && e.pointSizePx > 0 && pts.userData.pointSizePx !== e.pointSizePx) {
            pts.userData.pointSizePx = e.pointSizePx;
            opts.onChange();
          }
          continue;
        }
        const holder = new THREE.Group();
        const orient = new THREE.Group();
        holder.add(orient);
        holder.userData.entryKey = e.key;
        holder.visible = false;
        const h: SceneModelHandle = { entry: e, holder, orient, box: null, radiusM: undefined, loaded: false, tiles: null, points: null };
        handles.set(k, h);
        opts.parent.add(holder);
        if (isTileset(e)) {
          h.tiles = createSceneTileset(e.url, e.origin, {
            entryKey: e.key,
            errorTarget: opts.tilesErrorTarget,
            onChange: () => { if (!disposed) opts.onChange(); },
            onRoot: () => {
              if (disposed || handles.get(k) !== h) return;
              h.box = h.tiles?.box ?? null;
              h.loaded = true;
              opts.onLoaded(h);
            },
            onError: (err) => logFailure(e, err),
          });
          orient.add(h.tiles.object);
          continue;
        }
        if (isPointCloud(e)) {
          void loadPointCloudGeometry(e.url, e.version ?? 0)
            .then((geometry) => {
              if (disposed || handles.get(k) !== h) return;
              const pts = createPointCloudObject(geometry, e.pointSizePx);
              pts.userData.entryKey = e.key;
              h.points = pts;
              h.box = geometry.boundingBox?.clone() ?? new THREE.Box3().setFromBufferAttribute(geometry.getAttribute('position') as THREE.BufferAttribute);
              orient.add(pts);
              h.loaded = true;
              opts.onLoaded(h);
              opts.onChange();
            })
            .catch((err: unknown) => logFailure(e, err));
          continue;
        }
        void loadGltfScene(e.url, e.version ?? 0)
          .then((g) => {
            // dropped meanwhile: drop() already gave the reference back
            if (disposed || handles.get(k) !== h) return;
            g.updateMatrixWorld(true);
            h.box = new THREE.Box3().setFromObject(g);
            tagMeshes(g, e.key);
            orient.add(g);
            h.loaded = true;
            opts.onLoaded(h);
            opts.onChange();
          })
          .catch((err: unknown) => logFailure(e, err));
      }
    },
    handles: () => [...handles.values()],
    place(h, groundAt) {
      const e = h.entry;
      const q = modelQuaternion(e.yawDeg, e.pitchDeg, e.rollDeg);
      const scale = e.scale && e.scale > 0 ? e.scale : 1;
      const bounds = h.box ? rotatedBounds(h.box, q, scale) : null;
      h.radiusM = bounds ? bounds.radiusM : undefined;
      const p = resolvePlacement(e, groundAt, bounds);
      h.orient.quaternion.copy(p.quaternion);
      h.orient.scale.setScalar(p.scale);
      return p.altMsl;
    },
    radiusOf(key) {
      let r: number | undefined;
      for (const h of handles.values()) if (h.entry.key === key && h.radiusM != null) r = Math.max(r ?? 0, h.radiusM);
      return r;
    },
    update(camera, width, height) {
      for (const h of handles.values()) h.tiles?.update(camera, width, height);
    },
    dispose() {
      disposed = true;
      for (const [k, h] of [...handles]) drop(k, h);
    },
  };
}
