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
import { attachDrape } from './drape-material';
import { createSubjectMeshes, type SubjectMeshes } from './svt-subjects';
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
  /** Drape satellite imagery over the terrain; null returns to the elevation
      ramp. Disposes the textures of any previous rings. */
  setDrape: (rings: DrapeRing[] | null) => void;
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
  /** Moving test subjects around a ground point, or null to remove them. */
  setTestSubjects: (anchor: { lat: number; lon: number } | null) => void;
  /** True while something in the scene moves on its own, so the view must redraw every frame. */
  isAnimating: () => boolean;
  render: () => void;
  dispose: () => void;
}

export function createSvtScene(canvas: HTMLCanvasElement): SvtScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
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
  let grid: ElevationGrid | null = null;

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

  let subjects: SubjectMeshes | null = null;
  let subjectAnchor: { lat: number; lon: number } | null = null;
  const M_PER_DEG_LAT = 111_320;

  const placeSubjects = () => {
    if (!subjects || !subjectAnchor || !grid) return;
    const g = grid;
    const a = subjectAnchor;
    const base = lonLatToLocal(g, a.lat, a.lon);
    subjects.update(Date.now() / 1000, (north, east) => ({
      x: base.x + east,
      y: sampleElevation(g, a.lat + north / M_PER_DEG_LAT, a.lon + east / g.mPerDegLon),
      z: base.z - north,
    }));
  };

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

    setTestSubjects(anchor) {
      subjectAnchor = anchor;
      if (anchor && !subjects) {
        subjects = createSubjectMeshes();
        scene.add(subjects.group);
      } else if (!anchor && subjects) {
        scene.remove(subjects.group);
        subjects.dispose();
        subjects = null;
      }
    },

    isAnimating() {
      return subjects !== null;
    },

    render() {
      if (contextLost) return;
      placeSubjects();
      renderer.render(scene, camera);
    },

    dispose() {
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      drape.dispose();
      if (terrainMesh) {
        terrainMesh.geometry.dispose();
        terrainMesh = null;
      }
      terrainMat.dispose();
      if (terrainGrid) terrainGrid.geometry.dispose();
      terrainGridMat.dispose();
      subjects?.dispose();
      skyGeom.dispose();
      skyMat.dispose();
      renderer.dispose();
    },
  };
}
