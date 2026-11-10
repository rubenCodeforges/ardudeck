import { open } from 'node:fs/promises';

export interface PlyOrigin {
  lat: number;
  lng: number;
  altMsl: number;
}

const ORIGIN_COMMENT = 'ardudeck-origin';

/** Binary little-endian PLY: float32 x, y, z and, with colours, uchar red, green, blue. */
export function encodePly(positions: Float32Array, colors: Uint8Array | null, count: number, origin?: PlyOrigin): Uint8Array {
  const lines = ['ply', 'format binary_little_endian 1.0'];
  if (origin) lines.push(`comment ${ORIGIN_COMMENT} ${origin.lat} ${origin.lng} ${origin.altMsl}`);
  lines.push(`element vertex ${count}`, 'property float x', 'property float y', 'property float z');
  if (colors) lines.push('property uchar red', 'property uchar green', 'property uchar blue');
  lines.push('end_header', '');
  const head = new TextEncoder().encode(lines.join('\n'));
  const stride = colors ? 15 : 12;
  const out = new Uint8Array(head.length + count * stride);
  out.set(head, 0);
  const dv = new DataView(out.buffer, head.length);
  for (let i = 0; i < count; i++) {
    const at = i * stride;
    dv.setFloat32(at, positions[i * 3]!, true);
    dv.setFloat32(at + 4, positions[i * 3 + 1]!, true);
    dv.setFloat32(at + 8, positions[i * 3 + 2]!, true);
    if (colors) {
      dv.setUint8(at + 12, colors[i * 3]!);
      dv.setUint8(at + 13, colors[i * 3 + 1]!);
      dv.setUint8(at + 14, colors[i * 3 + 2]!);
    }
  }
  return out;
}

export interface PlyInfo {
  vertexCount: number;
  hasColor: boolean;
  origin: PlyOrigin | null;
}

/** The header of a PLY file; null when it is not one. */
export function parsePlyHeader(text: string): PlyInfo | null {
  const end = text.indexOf('end_header');
  if (!text.startsWith('ply') || end < 0) return null;
  const lines = text.slice(0, end).split(/\r?\n/).map((l) => l.trim());
  if (!lines.some((l) => /^format\s+(ascii|binary_little_endian|binary_big_endian)\s+1\.0$/.test(l))) return null;
  let vertexCount = -1;
  let inVertex = false;
  const props = new Set<string>();
  let origin: PlyOrigin | null = null;
  for (const l of lines) {
    const parts = l.split(/\s+/);
    if (parts[0] === 'element') {
      inVertex = parts[1] === 'vertex';
      if (inVertex) vertexCount = Number(parts[2]);
    } else if (parts[0] === 'property' && inVertex) {
      props.add(parts[parts.length - 1]!);
    } else if (parts[0] === 'comment' && parts[1] === ORIGIN_COMMENT) {
      const [lat, lng, altMsl] = parts.slice(2, 5).map(Number) as [number, number, number];
      if ([lat, lng, altMsl].every(Number.isFinite) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) origin = { lat, lng, altMsl };
    }
  }
  if (!Number.isInteger(vertexCount) || vertexCount <= 0 || !props.has('x') || !props.has('y') || !props.has('z')) return null;
  return { vertexCount, hasColor: props.has('red') && props.has('green') && props.has('blue'), origin };
}

export async function readPlyHeader(path: string): Promise<PlyInfo | null> {
  const fh = await open(path, 'r');
  try {
    const buf = new Uint8Array(64 * 1024);
    const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
    return parsePlyHeader(new TextDecoder('latin1').decode(buf.subarray(0, bytesRead)));
  } finally {
    await fh.close();
  }
}
