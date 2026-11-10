import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import dracoWrapperUrl from 'three/examples/jsm/libs/draco/draco_wasm_wrapper.js?url';
import dracoWasmUrl from 'three/examples/jsm/libs/draco/draco_decoder.wasm?url';
import basisJsUrl from 'three/examples/jsm/libs/basis/basis_transcoder.js?url';
import basisWasmUrl from 'three/examples/jsm/libs/basis/basis_transcoder.wasm?url';

// The decoders ask for fixed file names under a path; Vite hashes them, so map each name to its bundled URL.
function decoderManager(files: Record<string, string>): THREE.LoadingManager {
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => files[url.slice(url.lastIndexOf('/') + 1)] ?? url);
  return manager;
}

let decoders: { draco: DRACOLoader; ktx2: KTX2Loader; meshopt: typeof MeshoptDecoder } | null = null;
let ktx2Ready = false;

/** Draco, KTX2 and Meshopt decoders shared by the glTF cache and the 3D Tiles renderers. */
export function gltfDecoders(): { draco: DRACOLoader; ktx2: KTX2Loader; meshopt: typeof MeshoptDecoder } {
  if (!decoders) {
    const draco = new DRACOLoader(decoderManager({ 'draco_wasm_wrapper.js': dracoWrapperUrl, 'draco_decoder.wasm': dracoWasmUrl }));
    draco.setDecoderPath('draco/');
    draco.setDecoderConfig({ type: 'wasm' });
    const ktx2 = new KTX2Loader(decoderManager({ 'basis_transcoder.js': basisJsUrl, 'basis_transcoder.wasm': basisWasmUrl }));
    ktx2.setTranscoderPath('basis/');
    decoders = { draco, ktx2, meshopt: MeshoptDecoder };
  }
  return decoders;
}

/** KTX2 needs one renderer to know which compressed formats the GPU takes; every 3D view calls this once. */
export function initGltfDecoders(renderer: THREE.WebGLRenderer): void {
  if (ktx2Ready) return;
  try {
    gltfDecoders().ktx2.detectSupport(renderer);
    ktx2Ready = true;
  } catch {
    // a renderer without a context yet; the next view tries again
  }
}

let gltfLoader: GLTFLoader | null = null;
function getGltfLoader(): GLTFLoader {
  if (!gltfLoader) {
    const d = gltfDecoders();
    gltfLoader = new GLTFLoader().setDRACOLoader(d.draco).setKTX2Loader(d.ktx2).setMeshoptDecoder(d.meshopt);
  }
  return gltfLoader;
}

function isCollada(url: string): boolean {
  return /\.dae(?:[?#].*)?$/i.test(url);
}

function loadSource(url: string): Promise<THREE.Object3D> {
  if (isCollada(url)) {
    // ColladaLoader rotates a Z_UP asset to Y_UP and applies its unit scale on the returned root
    return new ColladaLoader().loadAsync(url).then((c) => c.scene);
  }
  return new Promise<THREE.Object3D>((resolve, reject) => getGltfLoader().load(url, (g) => resolve(g.scene), undefined, reject));
}

interface CacheEntry {
  promise: Promise<THREE.Object3D>;
  refs: number;
}

const cache = new Map<string, CacheEntry>();

/** One load per url and version; each call holds a reference until releaseGltf. Place the returned wrapper, never its child (it carries the Collada up axis and unit). */
export function loadGltfScene(url: string, version: number): Promise<THREE.Group> {
  const key = `${url}@${version}`;
  let entry = cache.get(key);
  if (!entry) {
    entry = { promise: loadSource(url), refs: 0 };
    cache.set(key, entry);
  }
  entry.refs++;
  return entry.promise.then((src) => {
    const g = new THREE.Group();
    g.add(src.clone(true));
    return g;
  });
}

function disposeGroup(g: THREE.Object3D): void {
  g.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      for (const v of Object.values(m as unknown as Record<string, unknown>)) if (v instanceof THREE.Texture) v.dispose();
      m?.dispose();
    }
  });
}

/** Drops one reference; the last one frees the GPU resources. Remove the clone from its scene first. */
export async function releaseGltf(url: string, version: number): Promise<void> {
  const key = `${url}@${version}`;
  const entry = cache.get(key);
  if (!entry) return;
  entry.refs--;
  if (entry.refs > 0) return;
  cache.delete(key);
  try {
    disposeGroup(await entry.promise);
  } catch {
    // a load that failed has nothing to free
  }
}
