import { ecefToGeodetic, type Geodetic } from '../geodesy';

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;

function gltfJson(bytes: Uint8Array): unknown {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength >= 20 && dv.getUint32(0, true) === GLB_MAGIC) {
    const len = dv.getUint32(12, true);
    if (dv.getUint32(16, true) !== CHUNK_JSON || 20 + len > bytes.byteLength) return null;
    return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + len)));
  }
  return JSON.parse(new TextDecoder().decode(bytes).replace(/^﻿/, ''));
}

/** A glTF's own georeference (CESIUM_RTC center, ECEF metres), from a .glb or .gltf file's bytes; null when it has none. */
export function readGltfGeoreference(bytes: Uint8Array): Geodetic | null {
  let doc: unknown;
  try {
    doc = gltfJson(bytes);
  } catch {
    return null;
  }
  const center = (doc as { extensions?: { CESIUM_RTC?: { center?: unknown } } } | null)?.extensions?.CESIUM_RTC?.center;
  if (!Array.isArray(center) || center.length !== 3 || !center.every((v) => typeof v === 'number' && Number.isFinite(v))) return null;
  const [x, y, z] = center as [number, number, number];
  if (Math.hypot(x, y, z) < 1e6) return null;
  return ecefToGeodetic([x, y, z]);
}
