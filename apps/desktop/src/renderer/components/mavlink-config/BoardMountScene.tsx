import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { applyAttitude } from '../calibration/shared/OrientationScene';
import { buildVehicleModel, vehiclePalette, type VehicleKind } from '../calibration/shared/vehicle-models';
import { useResolvedTheme } from '../../hooks/useTheme';
import type { Mat3 } from './board-mount-pose';

interface BoardMountSceneProps {
  pose: Mat3;
  kind: VehicleKind;
  /** Live attitude in degrees; only drawn when `tilt` is set. */
  roll: number;
  pitch: number;
  tilt: boolean;
  size?: number;
  onUnavailable?: () => void;
}

const ACCENT = 0xa855f7;

function label(text: string, color: string, scale = 0.55): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext('2d')!;
  ctx.font = '600 56px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, 128, 48);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false }));
  sprite.scale.set(scale * 2.67, scale, 1);
  return sprite;
}

function arrowMesh(length: number, color: number): THREE.Mesh {
  const w = length * 0.22;
  const shape = new THREE.Shape();
  shape.moveTo(length / 2, 0);
  shape.lineTo(0, w * 1.6);
  shape.lineTo(0, w * 0.6);
  shape.lineTo(-length / 2, w * 0.6);
  shape.lineTo(-length / 2, -w * 0.6);
  shape.lineTo(0, -w * 0.6);
  shape.lineTo(0, -w * 1.6);
  shape.closePath();
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
  // Shape is drawn in XY; lay it flat so it points along +X on a top face.
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

/** Scene axes for the unrotated mounting: arrow +X, top +Y, right +Z. */
function buildBoard(): THREE.Group {
  const board = new THREE.Group();
  const caseMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.3, roughness: 0.45 });
  const pcb = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.18, 1.1), caseMat);
  board.add(pcb);
  const top = arrowMesh(0.8, ACCENT);
  top.position.y = 0.092;
  board.add(top);
  // Same arrow seen through the board, so an upside-down mount still shows its direction.
  const under = arrowMesh(0.8, 0x94a3b8);
  under.position.y = -0.092;
  board.add(under);
  return board;
}

// NED body (x fwd, y right, z down) to scene (X fwd, Y up, Z right).
function sceneQuaternion(pose: Mat3): THREE.Quaternion {
  const s = new THREE.Matrix3().set(1, 0, 0, 0, 0, -1, 0, 1, 0);
  const r = new THREE.Matrix3().set(...(pose as [number, number, number, number, number, number, number, number, number]));
  const m3 = s.clone().multiply(r).multiply(s.clone().transpose());
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().setFromMatrix3(m3));
}

export function BoardMountScene({ pose, kind, roll, pitch, tilt, size = 320, onUnavailable }: BoardMountSceneProps) {
  const { t } = useTranslation();
  const isLight = useResolvedTheme() === 'light';
  const mountRef = useRef<HTMLDivElement | null>(null);
  const liveRef = useRef({ pose, roll, pitch, tilt });
  liveRef.current = { pose, roll, pitch, tilt };

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      onUnavailable?.();
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(size, size);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    // Behind and above, so the vehicle's right is the screen's right.
    camera.position.set(-5.2, 8.2, 0);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0.4, -0.4, 0);
    controls.enableDamping = true;
    controls.enablePan = false;
    // the wheel stays with the page scroll
    controls.enableZoom = false;
    controls.update();
    controls.saveState();
    const resetView = () => controls.reset();
    renderer.domElement.addEventListener('dblclick', resetView);
    renderer.domElement.style.cursor = 'grab';

    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(2, 5, -3);
    scene.add(key);

    const rig = new THREE.Group();
    scene.add(rig);

    const { group: vehicle, noseX } = buildVehicleModel(kind, vehiclePalette(isLight));
    rig.add(vehicle);
    const front = label(t('mavlink-config:boardMountScene.front'), isLight ? '#b45309' : '#fbbf24', 0.45);
    front.position.set(noseX + 0.55, -0.1, 0);
    rig.add(front);

    const pivot = new THREE.Group();
    pivot.position.y = 0.45;
    const board = buildBoard();
    board.scale.setScalar(1.2);
    pivot.add(board);
    pivot.quaternion.copy(sceneQuaternion(liveRef.current.pose));
    rig.add(pivot);

    const grid = new THREE.GridHelper(6, 12, isLight ? 0x94a3b8 : 0x334155, isLight ? 0xcbd5e1 : 0x1e293b);
    grid.position.y = -1.1;
    scene.add(grid);

    let frame = 0;
    const DEG = Math.PI / 180;
    const render = () => {
      frame = requestAnimationFrame(render);
      const live = liveRef.current;
      pivot.quaternion.slerp(sceneQuaternion(live.pose), 0.18);
      if (live.tilt) applyAttitude(rig, live.roll * DEG, live.pitch * DEG);
      else rig.rotation.set(0, 0, 0);
      controls.update();
      renderer.render(scene, camera);
    };
    render();

    return () => {
      cancelAnimationFrame(frame);
      renderer.domElement.removeEventListener('dblclick', resetView);
      controls.dispose();
      renderer.dispose();
      scene.traverse((child) => {
        const obj = child as THREE.Mesh | THREE.Sprite;
        (obj as THREE.Mesh).geometry?.dispose?.();
        const mat = obj.material as THREE.Material | THREE.Material[] | undefined;
        const mats = Array.isArray(mat) ? mat : mat ? [mat] : [];
        for (const m of mats) {
          (m as THREE.SpriteMaterial).map?.dispose();
          m.dispose();
        }
      });
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [size, kind, isLight, onUnavailable, t]);

  return <div ref={mountRef} style={{ width: size, height: size }} className="mx-auto shrink-0 overflow-hidden" />;
}
