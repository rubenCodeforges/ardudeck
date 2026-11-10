import maplibregl from 'maplibre-gl';
import * as THREE from 'three';
import type { SceneMeshEntry } from '../../../shared/tile-source-types';
import { initGltfDecoders } from '../../three/gltf-cache';
import { createSceneModelSet, type SceneModelHandle } from '../../three/scene-model-set';
import { exclusionGeoJson, exclusionZonesFor } from '../../three/scene-model-exclusion';

interface Ref { x: number; y: number; s: number }

/** A model origin in the layer frame: metres east (x) and south (z) of the reference, and the factor from its own metres to the reference's. */
export function meshLocalOffset(origin: { lat: number; lng: number }, ref: Ref): { x: number; z: number; f: number } {
  const mc = maplibregl.MercatorCoordinate.fromLngLat([origin.lng, origin.lat], 0);
  return { x: (mc.x - ref.x) / ref.s, z: (mc.y - ref.y) / ref.s, f: mc.meterInMercatorCoordinateUnits() / ref.s };
}

/** Splits local-to-clip into a rigid view and a metric projection (equal up to a homogeneous factor), so lighting and tile LOD see a real camera. */
export function splitLayerCamera(full: THREE.Matrix4, projection: THREE.Matrix4): { view: THREE.Matrix4; projection: THREE.Matrix4 } | null {
  const v = projection.clone().invert().multiply(full);
  const e = v.elements;
  const k = Math.hypot(e[0]!, e[1]!, e[2]!);
  if (!Number.isFinite(k) || k <= 0) return null;
  const view = v.clone();
  for (let i = 0; i < 15; i++) if (i !== 3 && i !== 7 && i !== 11) view.elements[i]! /= k;
  const proj = projection.clone();
  proj.elements[12]! /= k;
  proj.elements[13]! /= k;
  proj.elements[14]! /= k;
  proj.elements[15]! /= k;
  return { view, projection: proj };
}

export interface MeshThreeJsLayer {
  layer: maplibregl.CustomLayerInterface;
  setMeshes(entries: SceneMeshEntry[], exaggeration: number): void;
  /** Ground in metres MSL where the map has no terrain loaded yet. */
  setFallbackGround(ground: ((lat: number, lng: number) => number) | null): void;
  dispose(): void;
}

interface MeshLayerOptions {
  id?: string;
  /** A fill-extrusion layer whose buildings give way to the models, with the filter it normally has. */
  buildings?: { layerId: string; baseFilter: maplibregl.FilterSpecification };
}

/** Same frame as mission-threejs-layer: Translation * Scale(s, -s, s) * RotateX(pi/2), metres x east, y up, z south. */
export function createMeshThreeJsLayer(opts: MeshLayerOptions = {}): MeshThreeJsLayer {
  const scene = new THREE.Scene();
  // the synthetic-vision daylight: sky and ground bounce, a warm sun, a little fill
  const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x4a5d3f, 1.0);
  const sun = new THREE.DirectionalLight(0xfff6e6, 1.4);
  sun.position.set(120, 200, 80);
  scene.add(hemi, sun, new THREE.AmbientLight(0xffffff, 0.25));

  const camera = new THREE.Camera();
  camera.matrixAutoUpdate = false;
  camera.matrixWorldAutoUpdate = false;
  let renderer: THREE.WebGLRenderer | null = null;
  let map: maplibregl.Map | null = null;
  let ref: Ref | null = null;
  let exaggeration = 1;
  let entries: SceneMeshEntry[] = [];
  let fallbackGround: ((lat: number, lng: number) => number) | null = null;
  const rotationX = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  const mainM = new THREE.Matrix4();
  const projM = new THREE.Matrix4();

  const groundAt = (lat: number, lng: number): number | null => {
    const fb = fallbackGround ? fallbackGround(lat, lng) : null;
    if (!map) return fb;
    const q = map.queryTerrainElevation([lng, lat]);
    // 0 is what an unloaded DEM tile answers; trust the panel's own ground over it
    if (q == null || (q === 0 && fb != null)) return fb;
    const ex = map.getTerrain()?.exaggeration ?? 1;
    return ex > 0 ? q / ex : q;
  };

  /** True when the model moved, so an idle map is only repainted for a real change. */
  const placeModel = (h: SceneModelHandle): boolean => {
    if (!ref || !h.loaded) return false;
    const o = meshLocalOffset(h.entry.origin, ref);
    const altMsl = models.place(h, groundAt);
    const y = altMsl * exaggeration * o.f;
    const p = h.holder.position;
    const moved = !h.holder.visible || Math.abs(p.x - o.x) > 1e-3 || Math.abs(p.y - y) > 1e-3 || Math.abs(p.z - o.z) > 1e-3 || h.holder.scale.y !== o.f * exaggeration;
    p.set(o.x, y, o.z);
    h.holder.scale.set(o.f, o.f * exaggeration, o.f);
    h.holder.visible = true;
    return moved;
  };

  const applyExclusion = () => {
    const b = opts.buildings;
    if (!b || !map || !map.getLayer(b.layerId)) return;
    const zones = exclusionZonesFor(entries, (k) => models.radiusOf(k));
    const filter = zones.length === 0
      ? b.baseFilter
      : (['all', b.baseFilter, ['!', ['<=', ['distance', exclusionGeoJson(zones)], 0]]] as unknown as maplibregl.FilterSpecification);
    map.setFilter(b.layerId, filter);
  };

  const models = createSceneModelSet({
    parent: scene,
    onLoaded: (h) => {
      placeModel(h);
      applyExclusion();
    },
    onChange: () => map?.triggerRepaint(),
  });

  const placeAll = (always = true) => {
    let moved = false;
    for (const h of models.handles()) moved = placeModel(h) || moved;
    if (always || moved) map?.triggerRepaint();
  };

  let reclampQueued = false;
  const reclamp = () => {
    if (reclampQueued || models.handles().length === 0) return;
    reclampQueued = true;
    requestAnimationFrame(() => {
      reclampQueued = false;
      placeAll(false);
    });
  };
  const onSourceData = (e: maplibregl.MapSourceDataEvent) => {
    if (map && e.sourceId === map.getTerrain()?.source) reclamp();
  };
  const detach = (m: maplibregl.Map) => {
    m.off('sourcedata', onSourceData);
    m.off('idle', reclamp);
    m.off('terrain', reclamp);
  };

  const layer: maplibregl.CustomLayerInterface = {
    id: opts.id ?? 'module-scene-meshes',
    type: 'custom',
    renderingMode: '3d',
    onAdd(m, gl) {
      map = m;
      renderer = new THREE.WebGLRenderer({ canvas: m.getCanvas(), context: gl, antialias: true });
      renderer.autoClear = false;
      initGltfDecoders(renderer);
      m.on('sourcedata', onSourceData);
      m.on('idle', reclamp);
      m.on('terrain', reclamp);
      placeAll();
      applyExclusion();
    },
    onRemove(m) {
      detach(m);
    },
    render(gl, args) {
      if (!renderer || !map || !ref || models.handles().length === 0) return;
      const l = new THREE.Matrix4().makeTranslation(ref.x, ref.y, 0).scale(new THREE.Vector3(ref.s, -ref.s, ref.s)).multiply(rotationX);
      const full = mainM.fromArray(args.defaultProjectionData.mainMatrix as unknown as number[]).multiply(l);
      const split = args.projectionMatrix ? splitLayerCamera(full, projM.fromArray(args.projectionMatrix as unknown as number[])) : null;
      if (split) {
        camera.projectionMatrix.copy(split.projection);
        camera.matrixWorldInverse.copy(split.view);
        camera.matrixWorld.copy(split.view).invert();
      } else {
        camera.projectionMatrix.copy(full);
        camera.matrixWorldInverse.identity();
        camera.matrixWorld.identity();
      }
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      scene.updateMatrixWorld();
      models.update(camera, gl.drawingBufferWidth, gl.drawingBufferHeight);
      renderer.resetState();
      renderer.render(scene, camera);
    },
  };

  return {
    layer,
    setMeshes(next, ex) {
      entries = next;
      exaggeration = ex;
      models.setEntries(next);
      if (next.length === 0) {
        ref = null;
      } else {
        const first = next[0]!.origin;
        const mc = maplibregl.MercatorCoordinate.fromLngLat([first.lng, first.lat], 0);
        ref = { x: mc.x, y: mc.y, s: mc.meterInMercatorCoordinateUnits() };
      }
      placeAll();
      applyExclusion();
    },
    setFallbackGround(ground) {
      fallbackGround = ground;
      placeAll();
    },
    dispose() {
      models.dispose();
      if (map) detach(map);
      renderer?.dispose();
      map = null;
    },
  };
}
