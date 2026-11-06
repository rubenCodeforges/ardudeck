// Must match ArduDeck Locus engine/core/geoid.cpp exactly (4x4 cubic convolution) so both apps agree.

export interface Geoid {
  /** Geoid undulation N in metres: h_msl = h_ellipsoid - N. */
  undulation(latDeg: number, lonDeg: number): number;
}

export function parseGeoidPgm(bytes: Uint8Array): Geoid {
  let pos = 0;
  const line = (): string => {
    const end = bytes.indexOf(0x0a, pos);
    if (end < 0) throw new Error('geoid grid header is truncated');
    const s = new TextDecoder().decode(bytes.subarray(pos, end)).replace(/\r$/, '');
    pos = end + 1;
    return s;
  };
  if (!line().startsWith('P5')) throw new Error('geoid grid is not a binary PGM');
  let offset = 0;
  let scale = 1;
  const fields: number[] = [];
  while (fields.length < 3) {
    const l = line();
    if (l.startsWith('#')) {
      const [key, value] = l.slice(1).trim().split(/\s+/);
      if (key === 'Offset') offset = Number(value);
      if (key === 'Scale') scale = Number(value);
      continue;
    }
    for (const v of l.trim().split(/\s+/)) if (v && fields.length < 3) fields.push(Number(v));
  }
  const [width, height, max] = fields as [number, number, number];
  if (width < 4 || height < 4 || max !== 65535) throw new Error('unsupported geoid grid layout');
  if (bytes.length - pos < width * height * 2) throw new Error('truncated geoid grid');
  const data = new Uint16Array(width * height);
  for (let i = 0; i < data.length; i++) data[i] = (bytes[pos + 2 * i]! << 8) | bytes[pos + 2 * i + 1]!;

  const at = (row: number, col: number): number => {
    const r = Math.min(Math.max(row, 0), height - 1);
    const c = (((col % (width - 1)) + (width - 1)) % (width - 1));
    return offset + scale * data[r * width + c]!;
  };
  const weights = (t: number): [number, number, number, number] => {
    const t2 = t * t, t3 = t2 * t;
    return [-0.5 * t3 + t2 - 0.5 * t, 1.5 * t3 - 2.5 * t2 + 1, -1.5 * t3 + 2 * t2 + 0.5 * t, 0.5 * t3 - 0.5 * t2];
  };

  return {
    undulation(latDeg, lonDeg) {
      const step = 180 / (height - 1);
      const y = (90 - latDeg) / step;
      let lon = lonDeg % 360;
      if (lon < 0) lon += 360;
      const x = lon / step;
      const r = Math.floor(y), c = Math.floor(x);
      const wy = weights(y - r), wx = weights(x - c);
      let sum = 0;
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) sum += wy[i]! * wx[j]! * at(r - 1 + i, c - 1 + j);
      return sum;
    },
  };
}
