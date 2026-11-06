/**
 * Synthetic-vision Three.js scene: a daytime sky dome + sun, distance haze, a
 * far sea-level ground plane, and a replaceable vertex-colored terrain mesh. A
 * single perspective camera is locked to the vehicle's position and attitude so
 * the view banks and pitches with the airframe (Garmin SVT style).
 *
 * Sky/fog/lighting mirror the in-app simulator world (sim-world-scene) for a
 * consistent look. Coordinate + euler conventions also match it:
 *   three.x = East, three.y = Up (elevation), three.z = -North
 *   camera euler order 'YXZ': y = -heading, x = pitch, z = -roll  (radians)
 */

import * as THREE from 'three';
import type { DrapeRing } from './svt-satellite';
import type { SceneMeshEntry } from '../../../../shared/tile-source-types';
import { initGltfDecoders } from '../../../three/gltf-cache';
import { createSceneModelSet, type SceneModelHandle } from '../../../three/scene-model-set';
import { attachDrape } from './drape-material';
import {
  type ElevationGrid,
  buildTerrainGridGeometry,
  lonLatToLocal,
  sampleElevation,
  SVT_HALF_SIZE_M,
  SVT_REBUILD_DISTANCE_M,
} from './svt-terrain';

const DEG = Math.PI / 180;

// Floor under the camera, so a landed vehicle does not sit exactly ON the
// surface (the terrain would collapse to an edge-on sliver). It is a RENDER
// floor only: the true clearance is reported separately, or the display would
// quietly hide the aircraft being below the terrain it is drawing.
const MIN_EYE_M = 2;

// Subtle atmospheric haze near the far horizon only. Terrain reads crisply for
// most of the patch and fades into the sky just before its nearest possible
// edge (half-size minus how far the vehicle can drift from the patch centre),
// so the square boundary is never a visible wall.
const FOG_END = SVT_HALF_SIZE_M - SVT_REBUILD_DISTANCE_M - 1_000;
const FOG_START = Math.max(8_000, FOG_END - 9_000);

export interface SvtPose {
  lat: number;
  lon: number;
  /** Height above terrain at the vehicle (metres). */
  agl: number;
  /** Altitude above mean sea level (metres), as the vehicle reports it. */
  altMsl: number;
  /** Eye altitude in the DEM's own datum: the vehicle's MSL shifted by the
      measured offset between its altitude reference and the terrain data.
      This, not AGL, is what the camera flies at, so rising ground rises in
      the view exactly as it does in the world. */
  eyeMsl: number;
  /** Render floor above the terrain. A rover's camera sits under a metre, an
      aircraft's is held clear of the surface so the ground never goes edge-on. */
  eyeFloorM?: number;
  rollDeg: number;
  pitchDeg: number;
  /** True heading, degrees (0 = North, 90 = East). */
  headingDeg: number;
}

export interface SvtScene {
  resize: (width: number, height: number) => void;
  /** Swap in a freshly built terrain mesh; disposes the previous one. */
  setTerrain: (geometry: THREE.BufferGeometry, grid: ElevationGrid) => void;
  /** Scene models placed in the terrain grid's frame; entries not listed are removed. */
  setMeshes: (entries: SceneMeshEntry[]) => void;
  /** A loaded model's horizontal radius about its origin, metres. */
  modelRadius: (key: string) => number | undefined;
  /** Drape satellite imagery over the terrain; null returns to the elevation
      ramp. Disposes the textures of any previous rings. */
  setDrape: (rings: DrapeRing[] | null) => void;
  /** Swap in a building mesh (null removes it); disposes the previous one. */
  setBuildings: (geometry: THREE.BufferGeometry | null) => void;
  /** Roofs from the satellite drape, and a window pattern on the walls. */
  setBuildingStyle: (style: { roofImagery: boolean; facades: boolean }) => void;
  /** Position + orient the camera from a vehicle pose. */
  setPose: (pose: SvtPose) => void;
  /** Metres between the eye and the terrain directly below it, from the last
      setPose. Negative means the aircraft is below the DEM surface. NaN until
      terrain exists. */
  getClearanceM: () => number;
  /** The perspective camera's vertical FOV (degrees). The HUD world overlay uses
      the SAME fov so its world-locked symbology aligns with the SVT terrain. */
  getFov: () => number;
  hasTerrain: () => boolean;
  render: () => void;
  dispose: () => void;
}

export interface SvtSceneOptions {
  /** Something changed that needs a new frame (a model or tile loaded). */
  onDirty?: () => void;
  /** A model finished loading, so its footprint radius is known. */
  onModelsLoaded?: () => void;
}

export function createSvtScene(canvas: HTMLCanvasElement, opts: SvtSceneOptions = {}): SvtScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  initGltfDecoders(renderer);
  // Without preventDefault a lost context is fatal to the whole renderer
  // process; swallowing it leaves a frozen view that recovers on restore.
  let contextLost = false;
  const onLost = (e: Event) => { e.preventDefault(); contextLost = true; };
  const onRestored = () => { contextLost = false; };
  canvas.addEventListener('webglcontextlost', onLost, false);
  canvas.addEventListener('webglcontextrestored', onRestored, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const HORIZON = new THREE.Color(0xbcd4ec);
  scene.background = HORIZON.clone();
  // Haze fully hides the square terrain boundary before the vehicle can reach it.
  scene.fog = new THREE.Fog(HORIZON.getHex(), FOG_START, FOG_END);

  // Far plane clears the patch corners AND the camera-centred sky dome below.
  const camera = new THREE.PerspectiveCamera(62, 1, 1, SVT_HALF_SIZE_M * 2);
  camera.rotation.order = 'YXZ';

  // ─── Lighting (matches the sim world) ────────────────────────────────────
  const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x4a5d3f, 1.0);
  const sun = new THREE.DirectionalLight(0xfff6e6, 1.4);
  sun.position.set(120, 200, 80);
  const fill = new THREE.AmbientLight(0xffffff, 0.25);
  scene.add(hemi, sun, fill);

  // ─── Sky dome ─────────────────────────────────────────────────────────────
  // Radius stays inside `far`; the dome is re-centred on the camera each frame
  // (see setPose) so it never crosses the far plane and clips into a "hemisphere".
  const skyGeom = new THREE.SphereGeometry(SVT_HALF_SIZE_M * 1.6, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topColor: { value: new THREE.Color(0x3b74c4) },
      bottomColor: { value: HORIZON.clone() },
      sunDir: { value: sun.position.clone().normalize() },
      sunColor: { value: new THREE.Color(0xfff3da) },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      uniform vec3 sunDir;
      uniform vec3 sunColor;
      varying vec3 vDir;
      void main() {
        float h = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 sky = mix(bottomColor, topColor, pow(h, 0.8));
        float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
        sky += sunColor * pow(s, 350.0) * 1.2;
        sky += sunColor * pow(s, 6.0) * 0.10;
        gl_FragColor = vec4(sky, 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(skyGeom, skyMat);
  // No depth interaction — it's purely the backdrop; terrain always draws over it.
  sky.renderOrder = -1;
  scene.add(sky);

  // ─── Replaceable terrain mesh ─────────────────────────────────────────────
  // DoubleSide on purpose: with FrontSide a camera that dips below the surface
  // sees straight through it into the sky dome, which reads as the world
  // vanishing rather than as a clipped view.
  const terrainMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    metalness: 0,
    side: THREE.DoubleSide,
  });

  const drape = attachDrape(terrainMat);

  let terrainMesh: THREE.Mesh | null = null;
  let buildingsMesh: THREE.Mesh | null = null;
  // both sides lit: footprint winding varies between OSM sources
  const buildingsMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const buildingStyle = { uRoofImagery: { value: 1 }, uFacades: { value: 1 } };
  drape.share(buildingsMat, 'vSvtRoof > 0.5 && uRoofImagery > 0.5', (shader) => {
    Object.assign(shader.uniforms, buildingStyle);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aRoof;\nattribute vec2 aWall;\nvarying float vSvtRoof;\nvarying vec2 vSvtWall;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSvtRoof = aRoof;\nvSvtWall = aWall;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vSvtRoof;\nvarying vec2 vSvtWall;\nuniform float uRoofImagery;\nuniform float uFacades;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        // windows: one row per 3 m floor, one column per 3.5 m of wall, none in the top half metre
        if (uFacades > 0.5 && vSvtRoof < 0.5 && vSvtWall.y > 0.8) {
          vec2 cell = fract(vSvtWall / vec2(3.5, 3.0));
          float win = step(0.22, cell.x) * step(cell.x, 0.78) * step(0.32, cell.y) * step(cell.y, 0.78);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.18, 0.22, 0.28), win * 0.75);
        }`,
      );
  });
  let grid: ElevationGrid | null = null;
  const placeModel = (h: SceneModelHandle) => {
    if (!grid || !h.loaded) return;
    const g = grid;
    const { x, z } = lonLatToLocal(g, h.entry.origin.lat, h.entry.origin.lng);
    h.holder.position.set(x, models.place(h, (lat, lng) => sampleElevation(g, lat, lng)), z);
    h.holder.visible = true;
  };
  const models = createSceneModelSet({
    parent: scene,
    onLoaded: (h) => {
      placeModel(h);
      opts.onModelsLoaded?.();
    },
    onChange: () => opts.onDirty?.(),
  });
  const placeMeshes = () => {
    for (const h of models.handles()) placeModel(h);
    opts.onDirty?.();
  };
  const bufferSize = new THREE.Vector2();

  // ─── Terrain-draped reference grid ────────────────────────────────────────
  // Rebuilt from each ElevationGrid in setTerrain so the grid lines ride the
  // hills (a flat plane grid just buries itself in the terrain). Gives the pilot
  // a topographic reference and the lines converge to the horizon = depth cue.
  const GRID_OPACITY = 0.3;
  // Over imagery the reference grid is a distraction, not a depth cue.
  const GRID_OPACITY_DRAPED = 0.12;
  const terrainGridMat = new THREE.LineBasicMaterial({ color: 0xbfe6c8, transparent: true, opacity: GRID_OPACITY, depthWrite: false });
  let terrainGrid: THREE.LineSegments | null = null;
  let clearanceM = NaN;


  return {
    resize(width: number, height: number) {
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
    },

    setTerrain(geometry: THREE.BufferGeometry, nextGrid: ElevationGrid) {
      if (terrainMesh) {
        scene.remove(terrainMesh);
        terrainMesh.geometry.dispose();
      }
      terrainMesh = new THREE.Mesh(geometry, terrainMat);
      terrainMesh.frustumCulled = false;
      scene.add(terrainMesh);
      grid = nextGrid;

      // Rebuild the draped reference grid so it conforms to (rides) the new
      // terrain surface instead of hovering as a flat plane.
      if (terrainGrid) { scene.remove(terrainGrid); terrainGrid.geometry.dispose(); }
      terrainGrid = new THREE.LineSegments(buildTerrainGridGeometry(nextGrid), terrainGridMat);
      terrainGrid.frustumCulled = false;
      terrainGrid.renderOrder = 1;
      scene.add(terrainGrid);
      placeMeshes();
    },

    setMeshes(entries: SceneMeshEntry[]) {
      models.setEntries(entries);
      placeMeshes();
    },

    modelRadius(key: string) {
      return models.radiusOf(key);
    },

    setBuildings(geometry: THREE.BufferGeometry | null) {
      if (buildingsMesh) {
        scene.remove(buildingsMesh);
        buildingsMesh.geometry.dispose();
        buildingsMesh = null;
      }
      if (!geometry) return;
      buildingsMesh = new THREE.Mesh(geometry, buildingsMat);
      scene.add(buildingsMesh);
    },
    setBuildingStyle(style) {
      buildingStyle.uRoofImagery.value = style.roofImagery ? 1 : 0;
      buildingStyle.uFacades.value = style.facades ? 1 : 0;
    },
    setDrape(rings: DrapeRing[] | null) {
      drape.setDrape(rings, renderer);
      terrainGridMat.opacity = drape.hasDrape() ? GRID_OPACITY_DRAPED : GRID_OPACITY;
    },

    setPose(pose: SvtPose) {
      const local = grid ? lonLatToLocal(grid, pose.lat, pose.lon) : { x: 0, z: 0 };
      const groundElev = grid ? sampleElevation(grid, pose.lat, pose.lon) : 0;
      clearanceM = grid ? pose.eyeMsl - groundElev : NaN;
      camera.position.set(local.x, Math.max(pose.eyeMsl, groundElev + (pose.eyeFloorM ?? MIN_EYE_M)), local.z);
      camera.rotation.set(pose.pitchDeg * DEG, -pose.headingDeg * DEG, -pose.rollDeg * DEG);
      // Keep the sky dome centred on the camera so it never crosses the far plane.
      sky.position.copy(camera.position);
    },

    getFov() {
      return camera.fov;
    },

    getClearanceM() {
      return clearanceM;
    },

    hasTerrain() {
      return terrainMesh !== null;
    },

    render() {
      if (contextLost) return;
      camera.updateMatrixWorld();
      renderer.getDrawingBufferSize(bufferSize);
      models.update(camera, bufferSize.x, bufferSize.y);
      renderer.render(scene, camera);
    },

    dispose() {
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      drape.dispose();
      models.dispose();
      if (terrainMesh) {
        terrainMesh.geometry.dispose();
        terrainMesh = null;
      }
      terrainMat.dispose();
      buildingsMesh?.geometry.dispose();
      buildingsMat.dispose();
      if (terrainGrid) terrainGrid.geometry.dispose();
      terrainGridMat.dispose();
      skyGeom.dispose();
      skyMat.dispose();
      renderer.dispose();
    },
  };
}
