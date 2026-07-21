/**
 * Three.js scene helper for the in-app simulator world.
 *
 * Standalone WebGL scene (its own renderer + canvas, unlike the MapLibre custom
 * layers which share the map's GL context) holding: a daytime sky dome + sun,
 * a soft ground plane with a faint grid, concentric range rings and a home pad,
 * one quadcopter mesh + ground shadow + trail per vehicle, plus mission, fence
 * and obstacle overlays. A camera with several follow modes drives the view.
 * Driven from SimWorldView via update().
 *
 * Coordinate mapping — sim/telemetry streams NED (North, East, Down) metres from
 * home; three.js is Y-up. We map to match the existing vehicle/flight three
 * layers:
 *   three.x =  East  =  position[1]
 *   three.y =  Up    = -position[2]   (NED down is +z, so up is -z)
 *   three.z =  South = -position[0]   (North is -z)
 * Attitude is applied from euler (roll/pitch/yaw, RADIANS) with the same
 * convention used by vehicle-threejs-layer: rotation.order 'YXZ', y = -yaw,
 * x = pitch, z = -roll.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { type ModelKey, FALLBACK_MODEL, CLASS_MODEL, modelKeyForClass } from './sim-models';
import type { SimDiagnostics, SimLoad } from '../../stores/sim-state-store';

/** Per-airframe 3D models (Tripo-generated, textured). Each model's spinnable
    rotors are grouped under `prop_*` pivot nodes so they spin in place; the spin
    axis differs by airframe (copters spin their rotors about local Y, a plane's
    tractor prop about the fuselage Z). Loaded once, cloned per vehicle. */
interface ModelDef {
  url: string;
  /** Yaw (rad) so the model's nose faces -Z (forward) at yaw 0. */
  yaw: number;
  /** Local axis the `prop_*` nodes spin about. */
  spinAxis: 'x' | 'y' | 'z';
}
const MODEL_DEFS: Record<ModelKey, ModelDef> = {
  quad: { url: new URL('../../assets/models/quadrotor-split.glb', import.meta.url).href, yaw: 0, spinAxis: 'y' },
  plane: { url: new URL('../../assets/models/plane.glb', import.meta.url).href, yaw: Math.PI, spinAxis: 'z' },
  hexa: { url: new URL('../../assets/models/hexacopter.glb', import.meta.url).href, yaw: 0, spinAxis: 'y' },
  // Rover: single fused mesh (no spinnable parts); long axis is +X, so yaw +90°
  // points it forward (-Z). Tweak to -π/2 if it drives tail-first.
  rover: { url: new URL('../../assets/models/rover.glb', import.meta.url).href, yaw: Math.PI / 2, spinAxis: 'y' },
};
/** Models actually loaded up front: the fallback plus every mapped model. */
const ACTIVE_MODELS: ModelKey[] = Array.from(new Set<ModelKey>([FALLBACK_MODEL, ...(Object.values(CLASS_MODEL) as ModelKey[])]));
/** Target largest-horizontal span in metres (exaggerated so it reads at distance). */
const MODEL_TARGET_SPAN = 3.0;

export type SimCameraMode = 'chase' | 'orbit' | 'topdown' | 'fpv';

export interface SimVehicleFrame {
  id: string;
  /** NED metres from home. */
  position: [number, number, number];
  /** Body→world quaternion [w, x, y, z] (unused; euler drives orientation). */
  quaternion: [number, number, number, number];
  euler: { roll: number; pitch: number; yaw: number };
  armed?: boolean;
  /** Identity colour (hex) — the body + trail tint, matching the fleet markers.
      The state ring/LED keeps the armed/disarmed accent. Defaults to disarmed blue. */
  color?: string;
  /** Short label rendered on a billboard above the vehicle (e.g. "SYS 1"). */
  label?: string;
  /** The active/selected vehicle — camera follows it and a ground ring marks it. */
  active?: boolean;
  /** ArduPilot vehicle class ('copter' | 'plane' | 'vtol' | 'rover' | 'sub'),
      picks the 3D model (quad fallback). Undefined → quad. */
  vehicleClass?: string;
  /** Normalized motor activity 0..1 (from real throttle / motor PWM). When set,
      it drives prop spin - scaling the rate and turning props even while
      disarmed (compassmot, motor test). Omit to fall back to the armed flag. */
  throttle01?: number;
  /** Force-budget X-ray for this vehicle (engine-only). Rendered as thrust
      arrows + net-thrust vector + CG markers when the X-ray overlay is on. */
  diagnostics?: SimDiagnostics;
  /** Suspended-load state (engine-only). Rendered as a cable line + load mesh,
      tinted by tension. Always shown when present (it is real motion). */
  load?: SimLoad;
}

/** A mission waypoint expressed in local NED metres from home. */
export interface SimWaypoint {
  position: [number, number, number];
  /** Sequence index, for labelling. */
  seq: number;
}

/** A geofence ring (inclusion or exclusion) in local NED metres. */
export interface SimFence {
  id: string;
  /** Polygon vertices in NED metres (closed implicitly). */
  points: Array<[number, number]>;
  kind: 'inclusion' | 'exclusion';
}

/** A user-authored obstacle in local NED metres. */
export interface SimObstacle {
  id: string;
  /** Centre in NED metres (north, east). */
  center: [number, number];
  shape: 'cylinder' | 'box';
  /** Radius (cylinder) or half-extent (box) in metres. */
  radius: number;
  /** Height in metres. */
  height: number;
}

export interface SimWorldUpdate {
  vehicles: SimVehicleFrame[];
  waypoints?: SimWaypoint[];
  fences?: SimFence[];
  obstacles?: SimObstacle[];
  /** "Physics X-ray": when true, engine vehicles show thrust arrows, the net
      lift vector and CG markers. Off by default so the flight view stays clean. */
  showDiagnostics?: boolean;
}

export interface SimWorldScene {
  resize: (width: number, height: number) => void;
  update: (data: SimWorldUpdate) => void;
  render: () => void;
  setCameraMode: (mode: SimCameraMode) => void;
  /**
   * Show real synthetic-vision terrain in place of the flat ground, or clear it
   * (pass null). `yOffset` shifts the (MSL-referenced) mesh so the home surface
   * sits at y = 0, matching the NED vehicle frame.
   */
  setTerrain: (geometry: THREE.BufferGeometry | null, yOffset?: number) => void;
  /** Orbit-mode interaction: drag to orbit, wheel to zoom. */
  onPointerDown: (x: number, y: number) => void;
  onPointerMove: (x: number, y: number) => void;
  onPointerUp: () => void;
  onWheel: (deltaY: number) => void;
  /** Raycast a normalized device coord onto the ground; returns [north, east] m. */
  pickGround: (ndcX: number, ndcY: number) => [number, number] | null;
  dispose: () => void;
}

const COLOR_ARMED = 0xf97316; // orange
const COLOR_DISARMED = 0x38bdf8; // sky blue
const TRAIL_MAX_POINTS = 800;
/** Visual scale of the quad in metres (exaggerated so it reads at distance). */
const QUAD_SCALE = 2.2;
/** Use the loaded GLB models (with spinning props); false falls back to the
    procedural quad for every vehicle. */
const USE_VEHICLE_MODEL = true;
/** Prop spin rate (rad/frame) when armed; alternate sign gives counter-rotation. */
const PROP_SPIN = 1.1;

function nedToThree(pos: [number, number, number], out: THREE.Vector3): THREE.Vector3 {
  return out.set(pos[1], -pos[2], -pos[0]);
}

/** Map a body-frame FRD vector (x fwd, y right, z down) into the vehicle group's
    local three axes. Identical mapping to nedToThree: (right, -down, -fwd). The
    diag overlay lives under `group`, so this feeds thrust arrows that inherit the
    vehicle's attitude and tilt with it. */
function bodyToThreeLocal(v: [number, number, number], out: THREE.Vector3): THREE.Vector3 {
  return out.set(v[1], -v[2], -v[0]);
}

/** Cool (low load) -> hot (high load) ramp for the thrust arrows / arm colouring. */
const DIAG_COOL = new THREE.Color(0x38bdf8);
const DIAG_HOT = new THREE.Color(0xef4444);
function loadColor(ratio: number, out: THREE.Color): THREE.Color {
  return out.copy(DIAG_COOL).lerp(DIAG_HOT, Math.max(0, Math.min(1, ratio)));
}

/** Map an (north, east) NED pair to ground-plane three coords (y = 0). */
function nedGroundToThree(north: number, east: number, out: THREE.Vector3): THREE.Vector3 {
  return out.set(east, 0, -north);
}

interface VehicleObjects {
  group: THREE.Group;
  /** Sub-group holding the frame visual (model or primitives); child of `group`. */
  frame: THREE.Group;
  usesModel: boolean;
  /** Model this vehicle's frame is currently showing (which template to swap in). */
  modelKey: ModelKey;
  /** Local axis the model's prop nodes spin about ('y' for the procedural quad). */
  spinAxis: 'x' | 'y' | 'z';
  bodyMat: THREE.MeshStandardMaterial;
  ledMat: THREE.MeshStandardMaterial;
  props: THREE.Object3D[];
  shadow: THREE.Mesh;
  trail: THREE.Line;
  trailGeom: THREE.BufferGeometry;
  trailPositions: Float32Array;
  trailCount: number;
  trailMat: THREE.LineBasicMaterial;
  dropLine: THREE.Line;
  dropGeom: THREE.BufferGeometry;
  /** Billboard label (SYS id) hovering above the vehicle. */
  labelSprite: THREE.Sprite;
  labelTexture: THREE.CanvasTexture;
  labelCanvas: HTMLCanvasElement;
  labelText: string;
  /** Identity colour applied to body + trail + label, as a hex string. */
  colorHex: string;
  /** Ground ring drawn only under the active/selected vehicle. */
  selRing: THREE.Mesh;
  disposables: Array<{ dispose: () => void }>;
  /** Physics X-ray overlay group (child of `group`, so it inherits attitude).
      Lazily created on the first diagnostics frame; hidden when the toggle is off. */
  diagGroup: THREE.Group | null;
  /** One thrust arrow per motor, index-aligned to diagnostics.motors. */
  motorArrows: THREE.ArrowHelper[];
  /** Bold net-lift arrow through the CG. */
  netArrow: THREE.ArrowHelper | null;
  /** Force-budget arrows through the CG: weight (world down), aero+momentum drag
      (body), and the net-force resultant (world). Built lazily with the X-ray. */
  weightArrow: THREE.ArrowHelper | null;
  dragArrow: THREE.ArrowHelper | null;
  netForceArrow: THREE.ArrowHelper | null;
  /** Thrust-weighted centroid marker (where lift is centred right now). */
  cgHoverMarker: THREE.Mesh | null;
  /** Slung-load cable line (world-space, hardpoint -> load). */
  cableLine: THREE.Line | null;
  cableGeom: THREE.BufferGeometry | null;
  cableMat: THREE.LineBasicMaterial | null;
  /** Slung-load mesh (world-space), tinted by tension. */
  loadMesh: THREE.Mesh | null;
  loadMat: THREE.MeshStandardMaterial | null;
  lastPos: THREE.Vector3;
  armed: boolean;
  /** Normalized motor activity 0..1 driving prop spin; -1 = unknown (fall back
      to the armed flag). Updated from telemetry each frame. */
  motorActivity: number;
}

/** Draw a vehicle's label text into its canvas texture (tinted to its colour). */
function drawLabel(canvas: HTMLCanvasElement, texture: THREE.CanvasTexture, text: string, colorHex: string): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = 'bold 44px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const metrics = ctx.measureText(text);
  const padX = 26;
  const w = Math.min(canvas.width, metrics.width + padX * 2);
  const h = 64;
  const x = (canvas.width - w) / 2;
  const y = (canvas.height - h) / 2;
  // Rounded translucent pill so the label reads against any background.
  ctx.fillStyle = 'rgba(15,18,24,0.72)';
  const r = 16;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = colorHex;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  texture.needsUpdate = true;
}

export function createSimWorldScene(canvas: HTMLCanvasElement): SimWorldScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const HORIZON = new THREE.Color(0xbcd4ec);
  scene.background = HORIZON.clone();
  scene.fog = new THREE.Fog(HORIZON.getHex(), 400, 2600);

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 8000);
  camera.position.set(-30, 25, 30);
  camera.lookAt(0, 0, 0);

  // ─── Lighting ────────────────────────────────────────────────────────────────
  const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x4a5d3f, 1.0);
  const sun = new THREE.DirectionalLight(0xfff6e6, 1.3);
  sun.position.set(120, 200, 80);
  const fill = new THREE.AmbientLight(0xffffff, 0.25);
  scene.add(hemi, sun, fill);

  // ─── Sky dome (daytime gradient) ─────────────────────────────────────────────
  const skyGeom = new THREE.SphereGeometry(4000, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
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
        sky += sunColor * pow(s, 350.0) * 1.2;        // sun disc
        sky += sunColor * pow(s, 6.0) * 0.10;         // glow
        gl_FragColor = vec4(sky, 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(skyGeom, skyMat);
  scene.add(sky);

  // ─── Ground ──────────────────────────────────────────────────────────────────
  const groundGeom = new THREE.PlaneGeometry(8000, 8000);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x55663f, roughness: 1, metalness: 0 });
  const ground = new THREE.Mesh(groundGeom, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  scene.add(ground);

  // Faint reference grid (10 m cells over 1 km).
  const grid = new THREE.GridHelper(1000, 100, 0x6f7f57, 0x60704b);
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.25;
  scene.add(grid);

  // ─── Optional synthetic-vision terrain (replaces the flat ground) ─────────
  const DEFAULT_FOG_FAR = (scene.fog as THREE.Fog).far;
  const terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  let terrainMesh: THREE.Mesh | null = null;

  function setTerrain(geometry: THREE.BufferGeometry | null, yOffset = 0): void {
    if (terrainMesh) {
      scene.remove(terrainMesh);
      terrainMesh.geometry.dispose();
      terrainMesh = null;
    }
    if (geometry) {
      terrainMesh = new THREE.Mesh(geometry, terrainMat);
      terrainMesh.frustumCulled = false;
      terrainMesh.position.y = yOffset;
      scene.add(terrainMesh);
      ground.visible = false;
      grid.visible = false;
      (scene.fog as THREE.Fog).far = 7000; // see across real terrain, not 2.6 km
    } else {
      ground.visible = true;
      grid.visible = true;
      (scene.fog as THREE.Fog).far = DEFAULT_FOG_FAR;
    }
  }

  // Concentric range rings + home pad at the origin.
  const ringGroup = new THREE.Group();
  const ringMat = new THREE.LineBasicMaterial({ color: 0xeef3ff, transparent: true, opacity: 0.28 });
  for (const r of [25, 50, 100, 200]) {
    const pts: THREE.Vector3[] = [];
    for (let a = 0; a <= 64; a++) {
      const t = (a / 64) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(t) * r, 0.03, Math.sin(t) * r));
    }
    ringGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), ringMat));
  }
  const padGeom = new THREE.CircleGeometry(3, 48);
  const padMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.9, transparent: true, opacity: 0.85 });
  const pad = new THREE.Mesh(padGeom, padMat);
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.02;
  ringGroup.add(pad);
  const padRing = new THREE.Mesh(
    new THREE.RingGeometry(2.7, 3, 48),
    new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.9 }),
  );
  padRing.rotation.x = -Math.PI / 2;
  padRing.position.y = 0.03;
  ringGroup.add(padRing);
  scene.add(ringGroup);

  // ─── Shared quad geometry (built once, reused per vehicle) ────────────────────
  const armGeom = new THREE.BoxGeometry(QUAD_SCALE * 1.4, QUAD_SCALE * 0.07, QUAD_SCALE * 0.14);
  const motorGeom = new THREE.CylinderGeometry(QUAD_SCALE * 0.1, QUAD_SCALE * 0.12, QUAD_SCALE * 0.16, 12);
  const propGeom = new THREE.CylinderGeometry(QUAD_SCALE * 0.42, QUAD_SCALE * 0.42, QUAD_SCALE * 0.02, 16);
  const bodyGeom = new THREE.BoxGeometry(QUAD_SCALE * 0.5, QUAD_SCALE * 0.18, QUAD_SCALE * 0.6);
  const canopyGeom = new THREE.SphereGeometry(QUAD_SCALE * 0.22, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const legGeom = new THREE.BoxGeometry(QUAD_SCALE * 0.05, QUAD_SCALE * 0.28, QUAD_SCALE * 0.05);
  const noseGeom = new THREE.ConeGeometry(QUAD_SCALE * 0.09, QUAD_SCALE * 0.22, 8);
  const sharedGeoms = [armGeom, motorGeom, propGeom, bodyGeom, canopyGeom, legGeom, noseGeom];

  const darkMat = new THREE.MeshStandardMaterial({ color: 0x222831, roughness: 0.6, metalness: 0.3 });
  const propMat = new THREE.MeshStandardMaterial({ color: 0x0f1115, roughness: 0.4, transparent: true, opacity: 0.55 });
  const sharedMats = [darkMat, propMat];

  // ─── Loaded vehicle model (replaces the procedural frame once it's ready) ─────
  // Small per-vehicle extras layered onto the model: an armed/disarmed state
  // beacon and a faint identity-coloured underglow disc (the model's own colours
  // are fixed, so these carry state + fleet identity).
  const stateLedGeom = new THREE.SphereGeometry(QUAD_SCALE * 0.09, 12, 10);
  const glowGeom = new THREE.CircleGeometry(QUAD_SCALE * 0.7, 28);
  const modelSharedGeoms = [stateLedGeom, glowGeom];
  /** A loaded model: centred horizontally + rested on the ground (bottom at y=0),
      scaled to the target span. `topY` is the scaled height (for the state beacon). */
  interface Template { group: THREE.Group; spinAxis: 'x' | 'y' | 'z'; topY: number }
  const templates = new Map<ModelKey, Template>();
  /** Vehicles still on the procedural fallback, waiting for their model to load. */
  const pendingModels: VehicleObjects[] = [];

  /** Fill a frame with a clone of a model template, collect its spinnable prop
      nodes, and add the state beacon (at the model's top) + identity underglow. */
  function buildModelFrame(
    frame: THREE.Group,
    bodyMat: THREE.MeshStandardMaterial,
    ledMat: THREE.MeshStandardMaterial,
    props: THREE.Object3D[],
    template: Template,
  ): void {
    const model = template.group.clone(true);
    frame.add(model);
    // Prop discs are separate `prop_*` nodes with hub-centred pivots; collect the
    // outermost match per prop so render() can spin each in place (skip nested
    // matches to avoid double-spin).
    model.traverse((o) => {
      if (!/^prop_/i.test(o.name)) return;
      for (let p = o.parent; p && p !== model; p = p.parent) {
        if (/^prop_/i.test(p.name)) return;
      }
      props.push(o);
    });
    // State beacon just above the model's top (scales with the model, not fixed).
    const led = new THREE.Mesh(stateLedGeom, ledMat);
    led.position.set(0, template.topY + QUAD_SCALE * 0.12, 0);
    frame.add(led);
    // Identity underglow at the base (model rests on the ground plane).
    const glow = new THREE.Mesh(glowGeom, bodyMat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.05;
    frame.add(glow);
  }

  /** Fallback frame built from primitives — shown until the model loads, or if it fails. */
  function buildProceduralFrame(
    frame: THREE.Group,
    bodyMat: THREE.MeshStandardMaterial,
    ledMat: THREE.MeshStandardMaterial,
    props: THREE.Object3D[],
  ): void {
    // Central body + canopy + nose (nose points -Z = forward/north at yaw 0).
    const body = new THREE.Mesh(bodyGeom, bodyMat);
    frame.add(body);
    const canopy = new THREE.Mesh(canopyGeom, darkMat);
    canopy.position.y = QUAD_SCALE * 0.09;
    frame.add(canopy);
    const nose = new THREE.Mesh(noseGeom, ledMat);
    nose.rotation.x = Math.PI / 2; // point -Z
    nose.position.set(0, 0, -QUAD_SCALE * 0.42);
    frame.add(nose);

    // Two crossing arms (X config); motors + props at the four ends.
    const corners: Array<[number, number, boolean]> = [
      [1, -1, true], // front-right (forward = -z)
      [-1, -1, true], // front-left
      [1, 1, false], // rear-right
      [-1, 1, false], // rear-left
    ];
    for (const ang of [Math.PI / 4, -Math.PI / 4]) {
      const arm = new THREE.Mesh(armGeom, darkMat);
      arm.rotation.y = ang;
      frame.add(arm);
    }
    const r = QUAD_SCALE * 0.49;
    for (const [sx, sz, front] of corners) {
      const motor = new THREE.Mesh(motorGeom, darkMat);
      motor.position.set(sx * r, QUAD_SCALE * 0.06, sz * r);
      frame.add(motor);
      const prop = new THREE.Mesh(propGeom, front ? ledMat : propMat);
      prop.position.set(sx * r, QUAD_SCALE * 0.16, sz * r);
      props.push(prop);
      frame.add(prop);
    }

    // Landing legs.
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as Array<[number, number]>) {
      const leg = new THREE.Mesh(legGeom, darkMat);
      leg.position.set(sx * QUAD_SCALE * 0.2, -QUAD_SCALE * 0.2, sz * QUAD_SCALE * 0.2);
      frame.add(leg);
    }
  }

  /** Swap a vehicle from its current frame onto model `key` (must be loaded). */
  function installModel(v: VehicleObjects, key: ModelKey): boolean {
    const tpl = templates.get(key);
    if (!tpl) return false;
    for (let i = v.frame.children.length - 1; i >= 0; i--) v.frame.remove(v.frame.children[i]!);
    v.props.length = 0;
    buildModelFrame(v.frame, v.bodyMat, v.ledMat, v.props, tpl);
    v.usesModel = true;
    v.spinAxis = tpl.spinAxis;
    v.modelKey = key;
    return true;
  }

  if (USE_VEHICLE_MODEL) {
    const loader = new GLTFLoader();
    for (const key of ACTIVE_MODELS) {
      const def = MODEL_DEFS[key];
      loader.load(
        def.url,
        (gltf) => {
          const model = gltf.scene;
          model.rotation.y = def.yaw;
          model.updateMatrixWorld(true);
          // Centre at the origin and scale to the target span (children keep their
          // local transforms, so prop hubs stay put and spin in place).
          const box = new THREE.Box3().setFromObject(model);
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());
          const s = MODEL_TARGET_SPAN / Math.max(size.x, size.z, 1e-3);
          model.scale.setScalar(s);
          // Centre horizontally, but rest the model ON the ground (bottom at y=0)
          // rather than centring it vertically - else tall models (rover mast,
          // hexa gimbal) sink half-underground when landed and read as a pole.
          model.position.set(-center.x * s, -box.min.y * s, -center.z * s);
          templates.set(key, { group: model, spinAxis: def.spinAxis, topY: size.y * s });
          // Swap this model into any vehicles that spawned before it loaded.
          for (let i = pendingModels.length - 1; i >= 0; i--) {
            const v = pendingModels[i]!;
            if (v.modelKey !== key) continue;
            installModel(v, key);
            pendingModels.splice(i, 1);
          }
        },
        undefined,
        (err) => console.error(`[sim-world] model '${key}' failed to load; using fallback`, err),
      );
    }
  }

  const vehicles = new Map<string, VehicleObjects>();

  // ─── Physics X-ray overlay (thrust arrows, net-lift vector, CG marker) ────
  const cgMarkerGeom = new THREE.SphereGeometry(QUAD_SCALE * 0.13, 12, 10);
  const cgHoverMat = new THREE.MeshBasicMaterial({ color: 0xfacc15, depthTest: false });
  const diagShared: Array<{ dispose: () => void }> = [cgMarkerGeom, cgHoverMat];
  const tmpOrigin = new THREE.Vector3();
  const tmpDir = new THREE.Vector3();
  const tmpColor = new THREE.Color();
  const tmpQuat = new THREE.Quaternion();
  // Force-budget arrow colours.
  const COLOR_WEIGHT = 0x9ca3af; // slate: gravity
  const COLOR_DRAG = 0xf97316; // orange: aero + momentum drag
  const COLOR_NETF = 0xffffff; // white: net resultant

  /** Create-once / update an ArrowHelper under the (rotated) diag group. `dir` is
      already in the group's local three frame; `len` is the world length. */
  function setArrow(
    arrow: THREE.ArrowHelper,
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    len: number,
    color: number,
  ): void {
    arrow.position.copy(origin);
    if (dir.lengthSq() > 1e-12) arrow.setDirection(dir);
    arrow.setLength(Math.max(QUAD_SCALE * 0.15, len), QUAD_SCALE * 0.32, QUAD_SCALE * 0.18);
    arrow.setColor(color);
    arrow.visible = true;
  }

  /** Build/update/hide the X-ray overlay for one vehicle from its diagnostics.
      Arrows and markers live under `v.group` so they inherit position + attitude. */
  function updateDiagnostics(v: VehicleObjects, diag: SimDiagnostics | undefined, show: boolean): void {
    if (!show || !diag) {
      if (v.diagGroup) v.diagGroup.visible = false;
      return;
    }
    if (!v.diagGroup) {
      v.diagGroup = new THREE.Group();
      v.group.add(v.diagGroup);
    }
    v.diagGroup.visible = true;

    // Auto-range so the strongest rotor arrow reads at ~2x the frame scale.
    let maxMag = 1e-6;
    for (const m of diag.motors) maxMag = Math.max(maxMag, m.thrustMag);
    const lenScale = (QUAD_SCALE * 2.2) / maxMag;

    // Per-motor thrust arrows (create lazily to match the motor count).
    for (let i = 0; i < diag.motors.length; i++) {
      const m = diag.motors[i]!;
      let arrow = v.motorArrows[i];
      if (!arrow) {
        arrow = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 1, 0xffffff, QUAD_SCALE * 0.28, QUAD_SCALE * 0.16);
        v.diagGroup.add(arrow);
        v.motorArrows[i] = arrow;
      }
      bodyToThreeLocal(m.position, tmpOrigin);
      arrow.position.copy(tmpOrigin);
      const dirLen = Math.hypot(m.thrust[0], m.thrust[1], m.thrust[2]);
      if (dirLen > 1e-9) {
        bodyToThreeLocal(m.thrust, tmpDir).multiplyScalar(1 / dirLen);
        arrow.setDirection(tmpDir);
      }
      arrow.setLength(Math.max(QUAD_SCALE * 0.15, m.thrustMag * lenScale), QUAD_SCALE * 0.28, QUAD_SCALE * 0.16);
      arrow.setColor(loadColor(m.armLoadRatio, tmpColor));
      arrow.visible = true;
    }
    // Hide any surplus arrows (motor count shrank).
    for (let i = diag.motors.length; i < v.motorArrows.length; i++) v.motorArrows[i]!.visible = false;

    // Net-lift vector through the CG (fixed visible length; the tilt is the story).
    const netMag = Math.hypot(diag.netThrustBody[0], diag.netThrustBody[1], diag.netThrustBody[2]);
    if (!v.netArrow) {
      v.netArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 1, 0xfef08a, QUAD_SCALE * 0.5, QUAD_SCALE * 0.28);
      v.diagGroup.add(v.netArrow);
    }
    bodyToThreeLocal(diag.cgBody, tmpOrigin);
    v.netArrow.position.copy(tmpOrigin);
    if (netMag > 1e-9) {
      bodyToThreeLocal(diag.netThrustBody, tmpDir).multiplyScalar(1 / netMag);
      v.netArrow.setDirection(tmpDir);
    }
    v.netArrow.setLength(QUAD_SCALE * 3.2, QUAD_SCALE * 0.5, QUAD_SCALE * 0.28);
    v.netArrow.visible = true;

    // Thrust-weighted centroid marker (diverges from CG under an imbalance).
    if (!v.cgHoverMarker) {
      v.cgHoverMarker = new THREE.Mesh(cgMarkerGeom, cgHoverMat);
      v.cgHoverMarker.renderOrder = 998;
      v.diagGroup.add(v.cgHoverMarker);
    }
    bodyToThreeLocal(diag.cgHoverEst, tmpOrigin);
    v.cgHoverMarker.position.copy(tmpOrigin);
    v.cgHoverMarker.visible = true;

    // ─── Force budget through the CG: weight, drag, net resultant ────────────
    // Scale referenced to weight so a full-length arrow ~= the vehicle's weight,
    // making thrust/drag/net directly comparable to gravity. Weight + net force
    // are world (NED); rotate them into the group's local frame via inverse-Q.
    const forceScale = (QUAD_SCALE * 3.0) / Math.max(diag.weight, 1e-6);
    const invQ = tmpQuat.copy(v.group.quaternion).invert();
    bodyToThreeLocal(diag.cgBody, tmpOrigin);

    // Weight (world down, NED [0,0,1]).
    if (!v.weightArrow) {
      v.weightArrow = new THREE.ArrowHelper(new THREE.Vector3(0, -1, 0), new THREE.Vector3(), 1, COLOR_WEIGHT, QUAD_SCALE * 0.32, QUAD_SCALE * 0.18);
      v.diagGroup.add(v.weightArrow);
    }
    if (diag.weight > 1e-6) {
      nedToThree([0, 0, 1], tmpDir).applyQuaternion(invQ);
      setArrow(v.weightArrow, tmpOrigin, tmpDir, diag.weight * forceScale, COLOR_WEIGHT);
    } else {
      v.weightArrow.visible = false;
    }

    // Aero + rotor-momentum drag (body frame).
    const dragX = diag.airframeDragBody[0] + diag.momentumDragBody[0];
    const dragY = diag.airframeDragBody[1] + diag.momentumDragBody[1];
    const dragZ = diag.airframeDragBody[2] + diag.momentumDragBody[2];
    const dragMag = Math.hypot(dragX, dragY, dragZ);
    if (!v.dragArrow) {
      v.dragArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 1, COLOR_DRAG, QUAD_SCALE * 0.32, QUAD_SCALE * 0.18);
      v.diagGroup.add(v.dragArrow);
    }
    if (dragMag > 1e-6) {
      bodyToThreeLocal([dragX, dragY, dragZ], tmpDir).multiplyScalar(1 / dragMag);
      setArrow(v.dragArrow, tmpOrigin, tmpDir, dragMag * forceScale, COLOR_DRAG);
    } else {
      v.dragArrow.visible = false;
    }

    // Net-force resultant (world). Near zero in a steady hover; grows under accel.
    const nf = diag.netForceWorld;
    const nfMag = Math.hypot(nf[0], nf[1], nf[2]);
    if (!v.netForceArrow) {
      v.netForceArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 1, COLOR_NETF, QUAD_SCALE * 0.4, QUAD_SCALE * 0.22);
      v.diagGroup.add(v.netForceArrow);
    }
    if (nfMag > 1e-3) {
      nedToThree(nf, tmpDir).multiplyScalar(1 / nfMag).applyQuaternion(invQ);
      setArrow(v.netForceArrow, tmpOrigin, tmpDir, nfMag * forceScale, COLOR_NETF);
    } else {
      v.netForceArrow.visible = false;
    }
  }

  // ─── Slung load (cable line + load mesh, world-space, tension-tinted) ─────
  const loadGeom = new THREE.IcosahedronGeometry(QUAD_SCALE * 0.35, 0);
  const diagSharedLoad: Array<{ dispose: () => void }> = [loadGeom];
  const tmpLoad = new THREE.Vector3();
  const tmpHard = new THREE.Vector3();

  /** Build/update/hide the slung-load cable + mesh for one vehicle. World-space
      (load position and hardpoint are world NED), so these live in the scene. */
  function updateLoad(v: VehicleObjects, load: SimLoad | undefined): void {
    if (!load) {
      if (v.cableLine) v.cableLine.visible = false;
      if (v.loadMesh) v.loadMesh.visible = false;
      return;
    }
    nedToThree(load.hardpoint, tmpHard);
    nedToThree(load.position, tmpLoad);
    if (!v.cableLine) {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const mat = new THREE.LineBasicMaterial({ color: 0xd4d4d8, transparent: true, opacity: 0.9 });
      const line = new THREE.Line(geom, mat);
      line.frustumCulled = false;
      scene.add(line);
      v.cableGeom = geom;
      v.cableMat = mat;
      v.cableLine = line;
    }
    const cp = v.cableGeom!.getAttribute('position') as THREE.BufferAttribute;
    cp.setXYZ(0, tmpHard.x, tmpHard.y, tmpHard.z);
    cp.setXYZ(1, tmpLoad.x, tmpLoad.y, tmpLoad.z);
    cp.needsUpdate = true;
    // A released (detached) cable goes limp: dim it.
    v.cableMat!.opacity = load.attached ? 0.9 : 0.2;
    v.cableLine.visible = true;

    if (!v.loadMesh) {
      const mat = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.6, metalness: 0.2 });
      const mesh = new THREE.Mesh(loadGeom, mat);
      scene.add(mesh);
      v.loadMat = mat;
      v.loadMesh = mesh;
    }
    v.loadMesh.position.copy(tmpLoad);
    v.loadMesh.visible = true;
    // Tension tint: grey (slack/light) -> hot (heavily loaded). Normalise against
    // the load's own weight (tension ~ m*g at a straight hang) via cableLength as
    // a rough scale-free proxy; clamp so it reads without a calibrated limit.
    const t = Math.max(0, Math.min(1, load.tension / 1500));
    loadColor(t, tmpColor);
    v.loadMat!.color.copy(load.attached ? tmpColor : DIAG_COOL.clone().multiplyScalar(0.5));
  }

  function createVehicle(id: string, armed: boolean, colorHex: string, label: string, vehicleClass?: string): VehicleObjects {
    const group = new THREE.Group();
    group.rotation.order = 'YXZ';

    const accent = armed ? COLOR_ARMED : COLOR_DISARMED;
    const identity = new THREE.Color(colorHex);
    // Identity colour drives the body / underglow disc; the LED beacon keeps the
    // armed/disarmed accent so state still reads at a glance against the model.
    const bodyMat = new THREE.MeshStandardMaterial({
      color: identity.clone().multiplyScalar(0.7),
      emissive: identity.clone().multiplyScalar(0.45),
      emissiveIntensity: 0.7,
      roughness: 0.5,
      metalness: 0.35,
    });
    const ledMat = new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.9 });

    // The frame visual lives under `group` (which carries position + attitude):
    // the loaded model once ready, otherwise the primitive fallback + a swap request.
    const frame = new THREE.Group();
    group.add(frame);
    const props: THREE.Object3D[] = [];
    // Pick the model for this airframe class (quad fallback). Build it now if the
    // template is loaded, else show the procedural quad and queue a swap-in.
    const modelKey = modelKeyForClass(vehicleClass);
    const tpl = USE_VEHICLE_MODEL ? templates.get(modelKey) : undefined;
    let usesModel = false;
    let spinAxis: 'x' | 'y' | 'z' = 'y';
    if (tpl) {
      buildModelFrame(frame, bodyMat, ledMat, props, tpl);
      usesModel = true;
      spinAxis = tpl.spinAxis;
    } else {
      buildProceduralFrame(frame, bodyMat, ledMat, props);
    }

    scene.add(group);

    // Ground shadow (a soft dark disc that tracks the vehicle's x/z, fades with alt).
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false });
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(QUAD_SCALE * 0.9, 24), shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.04;
    scene.add(shadow);

    // Trail (tinted to the vehicle's identity colour).
    const trailPositions = new Float32Array(TRAIL_MAX_POINTS * 3);
    const trailGeom = new THREE.BufferGeometry();
    trailGeom.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
    trailGeom.setDrawRange(0, 0);
    const trailMat = new THREE.LineBasicMaterial({ color: identity.clone(), transparent: true, opacity: 0.85 });
    const trail = new THREE.Line(trailGeom, trailMat);
    trail.frustumCulled = false;
    scene.add(trail);

    // Drop line to ground.
    const dropPositions = new Float32Array(6);
    const dropGeom = new THREE.BufferGeometry();
    dropGeom.setAttribute('position', new THREE.BufferAttribute(dropPositions, 3));
    const dropMat = new THREE.LineBasicMaterial({ color: 0x1f2937, transparent: true, opacity: 0.5 });
    const dropLine = new THREE.Line(dropGeom, dropMat);
    dropLine.frustumCulled = false;
    scene.add(dropLine);

    // Billboard SYS-id label.
    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 256;
    labelCanvas.height = 128;
    const labelTexture = new THREE.CanvasTexture(labelCanvas);
    labelTexture.colorSpace = THREE.SRGBColorSpace;
    drawLabel(labelCanvas, labelTexture, label, colorHex);
    const labelMat = new THREE.SpriteMaterial({ map: labelTexture, transparent: true, depthTest: false, depthWrite: false });
    const labelSprite = new THREE.Sprite(labelMat);
    labelSprite.scale.set(QUAD_SCALE * 4, QUAD_SCALE * 2, 1);
    labelSprite.renderOrder = 999;
    scene.add(labelSprite);

    // Active-vehicle ground ring (hidden unless selected).
    const selRingGeom = new THREE.RingGeometry(QUAD_SCALE * 1.7, QUAD_SCALE * 2.1, 40);
    const selRingMat = new THREE.MeshBasicMaterial({ color: identity.clone(), transparent: true, opacity: 0.9, side: THREE.DoubleSide });
    const selRing = new THREE.Mesh(selRingGeom, selRingMat);
    selRing.rotation.x = -Math.PI / 2;
    selRing.position.y = 0.06;
    selRing.visible = false;
    scene.add(selRing);

    const v: VehicleObjects = {
      group, frame, usesModel, modelKey, spinAxis, bodyMat, ledMat, props, shadow,
      trail, trailGeom, trailPositions, trailCount: 0, trailMat,
      dropLine, dropGeom,
      labelSprite, labelTexture, labelCanvas, labelText: label, colorHex,
      selRing,
      disposables: [bodyMat, ledMat, shadowMat, shadow.geometry, trailMat, dropMat, trailGeom, dropGeom,
        labelMat, labelTexture, selRingGeom, selRingMat],
      diagGroup: null,
      motorArrows: [],
      netArrow: null,
      weightArrow: null,
      dragArrow: null,
      netForceArrow: null,
      cgHoverMarker: null,
      cableLine: null,
      cableGeom: null,
      cableMat: null,
      loadMesh: null,
      loadMat: null,
      lastPos: new THREE.Vector3(),
      armed,
      motorActivity: -1,
    };
    // If its model wasn't ready, keep the procedural frame and queue a swap-in.
    if (USE_VEHICLE_MODEL && !usesModel) pendingModels.push(v);
    return v;
  }

  function disposeVehicle(v: VehicleObjects): void {
    const pi = pendingModels.indexOf(v);
    if (pi >= 0) pendingModels.splice(pi, 1); // don't swap a model into a disposed vehicle
    // X-ray arrows own their geometry/material (CG marker uses shared assets).
    for (const a of v.motorArrows) a.dispose();
    v.netArrow?.dispose();
    // Slung-load cable + mesh are world-space scene children.
    if (v.cableLine) scene.remove(v.cableLine);
    if (v.loadMesh) scene.remove(v.loadMesh);
    v.cableGeom?.dispose();
    v.cableMat?.dispose();
    v.loadMat?.dispose();
    scene.remove(v.group, v.trail, v.dropLine, v.shadow, v.labelSprite, v.selRing);
    for (const d of v.disposables) d.dispose();
  }

  /** Re-tint a vehicle's identity colour (body + trail + label + ring). */
  function retintVehicle(v: VehicleObjects, colorHex: string): void {
    if (v.colorHex === colorHex) return;
    v.colorHex = colorHex;
    const identity = new THREE.Color(colorHex);
    v.bodyMat.color.copy(identity).multiplyScalar(0.7);
    v.bodyMat.emissive.copy(identity).multiplyScalar(0.45);
    v.trailMat.color.copy(identity);
    (v.selRing.material as THREE.MeshBasicMaterial).color.copy(identity);
    drawLabel(v.labelCanvas, v.labelTexture, v.labelText, colorHex);
  }

  // ─── Mission / fence / obstacle overlays ─────────────────────────────────────
  const overlay = new THREE.Group();
  scene.add(overlay);

  function clearOverlay(): void {
    for (let i = overlay.children.length - 1; i >= 0; i--) {
      const c = overlay.children[i] as THREE.Mesh | THREE.Line;
      overlay.remove(c);
      (c.geometry as THREE.BufferGeometry)?.dispose?.();
    }
  }

  const wpMat = new THREE.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x0891b2, emissiveIntensity: 0.5, roughness: 0.4 });
  const wpLineMat = new THREE.LineBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.8 });
  const fenceIncMat = new THREE.LineBasicMaterial({ color: 0x4ade80, transparent: true, opacity: 0.85 });
  const fenceExcMat = new THREE.LineBasicMaterial({ color: 0xf87171, transparent: true, opacity: 0.85 });
  const obstacleMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, transparent: true, opacity: 0.4, roughness: 0.7 });
  const obstacleEdgeMat = new THREE.LineBasicMaterial({ color: 0xfca5a5, transparent: true, opacity: 0.9 });
  const wpGeom = new THREE.SphereGeometry(QUAD_SCALE * 0.45, 12, 10);
  const overlayMats = [wpMat, wpLineMat, fenceIncMat, fenceExcMat, obstacleMat, obstacleEdgeMat, wpGeom];

  const tmpV = new THREE.Vector3();

  function rebuildOverlay(data: SimWorldUpdate): void {
    clearOverlay();

    // Mission waypoints: markers + connecting polyline.
    if (data.waypoints && data.waypoints.length > 0) {
      const linePts: THREE.Vector3[] = [];
      for (const wp of data.waypoints) {
        nedToThree(wp.position, tmpV);
        const m = new THREE.Mesh(wpGeom, wpMat);
        m.position.copy(tmpV);
        overlay.add(m);
        const drop = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([tmpV.clone(), new THREE.Vector3(tmpV.x, 0, tmpV.z)]),
          wpLineMat,
        );
        overlay.add(drop);
        linePts.push(tmpV.clone());
      }
      if (linePts.length > 1) {
        overlay.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(linePts), wpLineMat));
      }
    }

    // Geofences: closed ground polygons.
    for (const f of data.fences ?? []) {
      if (f.points.length < 2) continue;
      const pts = f.points.map(([n, e]) => nedGroundToThree(n, e, new THREE.Vector3()).setY(0.06));
      pts.push(pts[0]!.clone());
      overlay.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        f.kind === 'exclusion' ? fenceExcMat : fenceIncMat,
      ));
    }

    // Obstacles: translucent volumes + bright base outline.
    for (const o of data.obstacles ?? []) {
      nedGroundToThree(o.center[0], o.center[1], tmpV);
      const geom = o.shape === 'box'
        ? new THREE.BoxGeometry(o.radius * 2, o.height, o.radius * 2)
        : new THREE.CylinderGeometry(o.radius, o.radius, o.height, 24);
      const mesh = new THREE.Mesh(geom, obstacleMat);
      mesh.position.set(tmpV.x, o.height / 2, tmpV.z);
      overlay.add(mesh);
      // Base outline ring.
      const ringPts: THREE.Vector3[] = [];
      const segs = o.shape === 'box' ? 4 : 32;
      for (let i = 0; i <= segs; i++) {
        const t = (i / segs) * Math.PI * 2 + (o.shape === 'box' ? Math.PI / 4 : 0);
        const rr = o.shape === 'box' ? o.radius * Math.SQRT2 : o.radius;
        ringPts.push(new THREE.Vector3(tmpV.x + Math.cos(t) * rr, 0.07, tmpV.z + Math.sin(t) * rr));
      }
      overlay.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ringPts), obstacleEdgeMat));
    }
  }

  // ─── Camera follow state ─────────────────────────────────────────────────────
  // Which vehicle the camera tracks — the active/selected one, set each update().
  let activeId: string | null = null;
  let cameraMode: SimCameraMode = 'chase';
  let orbitYaw = Math.PI * 0.75;
  let orbitPitch = 0.5;
  let orbitDist = 50;
  const orbitTarget = new THREE.Vector3();

  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  const tmp = new THREE.Vector3();
  const tmpForward = new THREE.Vector3();

  function primaryVehicle(): VehicleObjects | null {
    if (activeId) {
      const a = vehicles.get(activeId);
      if (a) return a;
    }
    const first = vehicles.values().next();
    return first.done ? null : first.value;
  }

  function updateCamera(): void {
    const v = primaryVehicle();
    if (!v) return;
    const p = v.group.position;
    orbitTarget.copy(p);

    if (cameraMode === 'orbit') {
      const sinP = Math.sin(orbitPitch);
      const cosP = Math.cos(orbitPitch);
      tmp.set(orbitDist * cosP * Math.sin(orbitYaw), orbitDist * sinP, orbitDist * cosP * Math.cos(orbitYaw));
      camera.position.copy(p).add(tmp);
      camera.lookAt(p);
    } else if (cameraMode === 'topdown') {
      camera.position.set(p.x, p.y + Math.max(60, orbitDist), p.z + 0.001);
      camera.lookAt(p);
    } else if (cameraMode === 'chase') {
      const yaw = v.group.rotation.y;
      tmpForward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
      camera.position.copy(p).addScaledVector(tmpForward, -18).add(tmp.set(0, 7, 0));
      camera.lookAt(p.x, p.y + 2, p.z);
    } else {
      const yaw = v.group.rotation.y;
      tmpForward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
      camera.position.copy(p).addScaledVector(tmpForward, 1.5).add(tmp.set(0, 0.8, 0));
      camera.lookAt(p.clone().addScaledVector(tmpForward, 50));
    }
  }

  const posVec = new THREE.Vector3();

  // Ground picking for obstacle placement.
  const raycaster = new THREE.Raycaster();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const pickNdc = new THREE.Vector2();
  const pickHit = new THREE.Vector3();

  return {
    resize(width: number, height: number) {
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
    },

    update(data: SimWorldUpdate) {
      const seen = new Set<string>();
      activeId = null;
      for (const f of data.vehicles) {
        seen.add(f.id);
        const colorHex = f.color ?? '#38bdf8';
        let v = vehicles.get(f.id);
        if (!v) {
          v = createVehicle(f.id, !!f.armed, colorHex, f.label ?? f.id, f.vehicleClass);
          vehicles.set(f.id, v);
        } else {
          retintVehicle(v, colorHex);
          if (f.label && f.label !== v.labelText) {
            v.labelText = f.label;
            drawLabel(v.labelCanvas, v.labelTexture, f.label, v.colorHex);
          }
          // Class can arrive/refine after first sighting (mavType + Q_ENABLE settle
          // a beat after connect); upgrade the model in place when it changes.
          const wantKey = modelKeyForClass(f.vehicleClass);
          if (v.modelKey !== wantKey && templates.has(wantKey)) installModel(v, wantKey);
        }
        if (f.active) activeId = f.id;

        nedToThree(f.position, posVec);
        v.group.position.copy(posVec);
        v.group.rotation.set(f.euler.pitch, -f.euler.yaw, -f.euler.roll);

        // Label hovers above the vehicle (sprite ignores rotation, faces camera).
        v.labelSprite.position.set(posVec.x, posVec.y + QUAD_SCALE * 1.6, posVec.z);
        v.labelSprite.visible = v.labelText.length > 0;
        // Active ground ring tracks x/z.
        v.selRing.position.set(posVec.x, 0.06, posVec.z);
        v.selRing.visible = !!f.active;

        if (!!f.armed !== v.armed) {
          v.armed = !!f.armed;
          const accent = v.armed ? COLOR_ARMED : COLOR_DISARMED;
          v.ledMat.color.setHex(accent);
          v.ledMat.emissive.setHex(accent);
        }

        v.motorActivity = typeof f.throttle01 === 'number' ? Math.max(0, Math.min(1, f.throttle01)) : -1;

        // Ground shadow tracks x/z; grows + fades with altitude.
        const alt = Math.max(0, posVec.y);
        v.shadow.position.set(posVec.x, 0.04, posVec.z);
        const s = 1 + alt * 0.03;
        v.shadow.scale.set(s, s, s);
        (v.shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.05, 0.35 - alt * 0.004);

        // Trail (append after meaningful movement).
        if (v.trailCount === 0 || v.lastPos.distanceToSquared(posVec) > 0.25) {
          if (v.trailCount >= TRAIL_MAX_POINTS) {
            v.trailPositions.copyWithin(0, 3);
            v.trailCount = TRAIL_MAX_POINTS - 1;
          }
          const o = v.trailCount * 3;
          v.trailPositions[o] = posVec.x;
          v.trailPositions[o + 1] = posVec.y;
          v.trailPositions[o + 2] = posVec.z;
          v.trailCount += 1;
          v.trailGeom.setDrawRange(0, v.trailCount);
          (v.trailGeom.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
          v.lastPos.copy(posVec);
        }

        const dp = v.dropGeom.getAttribute('position') as THREE.BufferAttribute;
        dp.setXYZ(0, posVec.x, posVec.y, posVec.z);
        dp.setXYZ(1, posVec.x, 0, posVec.z);
        dp.needsUpdate = true;

        // Physics X-ray overlay (engine vehicles only carry diagnostics).
        updateDiagnostics(v, f.diagnostics, data.showDiagnostics === true);
        // Slung load: cable + payload mesh (always shown when present).
        updateLoad(v, f.load);
      }

      for (const [id, v] of vehicles) {
        if (!seen.has(id)) {
          disposeVehicle(v);
          vehicles.delete(id);
        }
      }

      rebuildOverlay(data);
    },

    render() {
      // Spin props to reflect real motor output. When telemetry supplies motor
      // activity (0..1) the rate scales with it and the props turn even while
      // disarmed - so compassmot and motor test show real spin-up. Without that
      // signal we fall back to a fixed spin on armed vehicles (counter-rotate
      // alternates) for a sense of life.
      for (const v of vehicles.values()) {
        let rate: number;
        if (v.motorActivity >= 0) {
          if (v.motorActivity <= 0.005) continue; // motors idle -> still props
          // Floor keeps a slow idle spin visible; scales up to full at 100%.
          rate = PROP_SPIN * (0.12 + 0.88 * v.motorActivity);
        } else {
          if (!v.armed) continue;
          rate = PROP_SPIN;
        }
        for (let i = 0; i < v.props.length; i++) {
          v.props[i]!.rotation[v.spinAxis] += i % 2 === 0 ? rate : -rate;
        }
      }
      updateCamera();
      renderer.render(scene, camera);
    },

    setCameraMode(mode: SimCameraMode) {
      cameraMode = mode;
    },

    setTerrain,

    onPointerDown(x: number, y: number) {
      if (cameraMode !== 'orbit') return;
      dragging = true;
      lastX = x;
      lastY = y;
    },
    onPointerMove(x: number, y: number) {
      if (!dragging) return;
      orbitYaw -= (x - lastX) * 0.01;
      orbitPitch = Math.max(-1.4, Math.min(1.4, orbitPitch + (y - lastY) * 0.01));
      lastX = x;
      lastY = y;
    },
    onPointerUp() {
      dragging = false;
    },
    onWheel(deltaY: number) {
      orbitDist = Math.max(5, Math.min(800, orbitDist + deltaY * 0.05));
    },

    pickGround(ndcX: number, ndcY: number): [number, number] | null {
      pickNdc.set(ndcX, ndcY);
      raycaster.setFromCamera(pickNdc, camera);
      const hit = raycaster.ray.intersectPlane(groundPlane, pickHit);
      if (!hit) return null;
      // three.x = east, three.z = -north
      return [-pickHit.z, pickHit.x];
    },

    dispose() {
      if (terrainMesh) terrainMesh.geometry.dispose();
      terrainMat.dispose();
      for (const v of vehicles.values()) disposeVehicle(v);
      vehicles.clear();
      clearOverlay();
      for (const g of sharedGeoms) g.dispose();
      for (const m of sharedMats) m.dispose();
      for (const g of modelSharedGeoms) g.dispose();
      for (const d of diagShared) d.dispose();
      for (const d of diagSharedLoad) d.dispose();
      // Release each loaded template's shared geometry/materials (cloned per vehicle).
      for (const { group } of templates.values()) {
        group.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.geometry.dispose();
          const mat = mesh.material;
          (Array.isArray(mat) ? mat : [mat]).forEach((m) => m.dispose());
        });
      }
      for (const m of overlayMats) (m as THREE.Material | THREE.BufferGeometry).dispose();
      skyGeom.dispose();
      skyMat.dispose();
      groundGeom.dispose();
      groundMat.dispose();
      (grid.material as THREE.Material).dispose();
      grid.geometry.dispose();
      ringMat.dispose();
      padGeom.dispose();
      padMat.dispose();
      (padRing.material as THREE.Material).dispose();
      padRing.geometry.dispose();
      ringGroup.traverse((o) => {
        if (o instanceof THREE.Line) o.geometry.dispose();
      });
      renderer.dispose();
    },
  };
}
