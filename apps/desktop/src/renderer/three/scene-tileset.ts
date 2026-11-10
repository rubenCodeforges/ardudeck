import * as THREE from 'three';
import { TilesRenderer, type Ellipsoid } from '3d-tiles-renderer';
import { GLTFExtensionsPlugin } from '3d-tiles-renderer/plugins';
import { tilesetCentre } from '../../shared/scene-models/geodesy';
import { gltfDecoders } from './gltf-cache';

const DEG = Math.PI / 180;
// ENU (x east, y north, z up) into the views' frame (x east, y up, z south)
const ENU_TO_LOCAL = new THREE.Matrix4().makeRotationX(-Math.PI / 2);

export interface SceneTileset {
  /** The tileset with the entry origin at its local zero, x east, y up, z south. */
  object: THREE.Group;
  /** Root bounding box in `object`'s frame, once the root tileset has loaded. */
  box: THREE.Box3 | null;
  /** Run the LOD traversal for this camera; resolution in drawing-buffer pixels. */
  update(camera: THREE.Camera, width: number, height: number): void;
  dispose(): void;
}

interface TilesetCallbacks {
  /** Something new to draw. */
  onChange: () => void;
  /** The root has loaded and `box` is known. */
  onRoot: () => void;
  onError: (err: unknown) => void;
  /** Stamped into every loaded mesh's userData. */
  entryKey: string;
  /** Fixed screen-space error target in pixels. */
  errorTarget?: number;
}

/** Maps the TilesRenderer group's ECEF frame into the views' frame, with (lat, lng, hEll) at zero. */
export function ecefToLocalMatrix(ellipsoid: Ellipsoid, lat: number, lng: number, hEll: number, out = new THREE.Matrix4()): THREE.Matrix4 {
  return ellipsoid.getEastNorthUpFrame(lat * DEG, lng * DEG, hEll, out).invert().premultiply(ENU_TO_LOCAL);
}

/** A 3D Tiles tileset (ECEF) reoriented so (lat, lng) at the tileset centre's ellipsoid height is the local origin. */
export function createSceneTileset(url: string, origin: { lat: number; lng: number }, cb: TilesetCallbacks): SceneTileset {
  const tiles = new TilesRenderer(url);
  const d = gltfDecoders();
  tiles.registerPlugin(new GLTFExtensionsPlugin({ dracoLoader: d.draco, ktxLoader: d.ktx2, meshoptDecoder: d.meshopt, autoDispose: false }));
  if (cb.errorTarget != null) tiles.errorTarget = cb.errorTarget;

  const object = new THREE.Group();
  object.add(tiles.group);
  let failed = false;

  const handle: SceneTileset = {
    object,
    box: null,
    update(camera, width, height) {
      if (failed) return;
      if (!tiles.hasCamera(camera)) tiles.setCamera(camera);
      tiles.setResolution(camera, Math.max(1, width), Math.max(1, height));
      object.updateMatrixWorld(true);
      tiles.update();
    },
    dispose() {
      object.remove(tiles.group);
      tiles.dispose();
    },
  };

  const onRoot = () => {
    let hEll = 0;
    try {
      hEll = tilesetCentre(tiles.rootTileset as unknown as Parameters<typeof tilesetCentre>[0]).hEll;
    } catch {
      const s = new THREE.Sphere();
      if (tiles.getBoundingSphere(s)) {
        const cart = { lat: 0, lon: 0, height: 0 };
        tiles.ellipsoid.getPositionToCartographic(s.center, cart);
        hEll = cart.height;
      }
    }
    const m = ecefToLocalMatrix(tiles.ellipsoid, origin.lat, origin.lng, hEll);
    m.decompose(tiles.group.position, tiles.group.quaternion, tiles.group.scale);
    tiles.group.updateMatrixWorld(true);

    const sphere = new THREE.Sphere();
    if (tiles.getBoundingSphere(sphere)) {
      sphere.applyMatrix4(m);
      handle.box = sphere.getBoundingBox(new THREE.Box3());
    }
    cb.onRoot();
    cb.onChange();
  };

  tiles.addEventListener('load-root-tileset', onRoot);
  tiles.addEventListener('load-model', (e: { scene: THREE.Object3D }) => {
    e.scene.traverse((o) => { o.userData.entryKey = cb.entryKey; });
    cb.onChange();
  });
  tiles.addEventListener('needs-update', () => cb.onChange());
  tiles.addEventListener('tiles-load-end', () => cb.onChange());
  tiles.addEventListener('load-error', (e: { tile: unknown; error: Error }) => {
    if (e.tile == null) failed = true;
    cb.onError(e.error);
  });

  return handle;
}
