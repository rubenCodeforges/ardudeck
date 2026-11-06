import { open, type FileHandle } from 'node:fs/promises';
import { createLazPerf } from 'laz-perf';
import {
  LAS14_HEADER, LasFormatError, lasCrs, parseEvlrHeader, parseLasHeader, parseLaszipVlr, parseVlrs,
  type LasCrs, type LasHeader, type LasVlr,
} from './las.js';
import { decodeChunkTable, type LazChunk } from './laz-chunk-table.js';

/** Whole-file LAZ decoding is the fallback when the chunk table cannot be read; past this it refuses. */
const WHOLE_LAZ_LIMIT = 1024 * 1024 * 1024;
const LAS_READ_BYTES = 8 * 1024 * 1024;

export interface PointBatch {
  /** Kept records packed back to back, header.pointLength bytes each. */
  records: Uint8Array;
  count: number;
}

export interface LasSource {
  header: LasHeader;
  vlrs: LasVlr[];
  crs: LasCrs;
  /** Every `stride`-th record, in order, in batches. */
  batches(stride: number): AsyncGenerator<PointBatch>;
  close(): Promise<void>;
}

interface LazPerf {
  HEAPU8: Uint8Array;
  _malloc(size: number): number;
  _free(ptr: number): void;
  LASZip: new () => { open(ptr: number, length: number): void; getPoint(ptr: number): void; getCount(): number; delete(): void };
  ChunkDecoder: new () => { open(format: number, length: number, ptr: number): void; getPoint(ptr: number): void; delete(): void };
}

let lazPerf: Promise<LazPerf> | null = null;
function lazModule(): Promise<LazPerf> {
  return (lazPerf ??= (createLazPerf() as Promise<LazPerf>));
}

async function readAt(fh: FileHandle, position: number, length: number): Promise<Uint8Array> {
  const buf = new Uint8Array(Math.max(0, length));
  let got = 0;
  while (got < buf.length) {
    const { bytesRead } = await fh.read(buf, got, buf.length - got, position + got);
    if (bytesRead === 0) break;
    got += bytesRead;
  }
  return got === buf.length ? buf : buf.subarray(0, got);
}

async function readEvlrs(fh: FileHandle, h: LasHeader, size: number): Promise<LasVlr[]> {
  const out: LasVlr[] = [];
  let p = h.evlrStart;
  for (let i = 0; i < h.evlrCount && p > 0 && p + 60 <= size; i++) {
    const e = parseEvlrHeader(await readAt(fh, p, 60));
    // only CRS records are kept; anything else (waveforms) can be huge
    if (e.userId === 'LASF_Projection' && e.length < 1024 * 1024) out.push({ userId: e.userId, recordId: e.recordId, data: await readAt(fh, p + 60, e.length) });
    p += 60 + e.length;
  }
  return out;
}

export async function openLasSource(path: string): Promise<LasSource> {
  const fh = await open(path, 'r');
  try {
    const size = (await fh.stat()).size;
    const head = await readAt(fh, 0, LAS14_HEADER);
    const header = parseLasHeader(head);
    const pre = await readAt(fh, 0, header.offsetToPoints);
    if (pre.length < header.offsetToPoints) throw new LasFormatError('truncated');
    const vlrs = [...parseVlrs(pre, header), ...(await readEvlrs(fh, header, size))];
    if (!header.compressed) {
      const fit = Math.floor((size - header.offsetToPoints) / header.pointLength);
      header.pointCount = header.pointCount > 0 ? Math.min(header.pointCount, fit) : fit;
    }
    return {
      header,
      vlrs,
      crs: lasCrs(vlrs),
      batches: (stride) => (header.compressed ? lazBatches(fh, header, vlrs, size, stride) : lasBatches(fh, header, stride)),
      close: () => fh.close(),
    };
  } catch (err) {
    await fh.close();
    throw err;
  }
}

async function* lasBatches(fh: FileHandle, h: LasHeader, stride: number): AsyncGenerator<PointBatch> {
  const len = h.pointLength;
  const perRead = Math.max(1, Math.floor(LAS_READ_BYTES / len));
  for (let first = 0; first < h.pointCount; first += perRead) {
    const n = Math.min(perRead, h.pointCount - first);
    const block = await readAt(fh, h.offsetToPoints + first * len, n * len);
    const avail = Math.floor(block.length / len);
    const start = (stride - (first % stride)) % stride;
    const kept = start < avail ? Math.ceil((avail - start) / stride) : 0;
    if (kept > 0) {
      const out = new Uint8Array(kept * len);
      for (let i = start, k = 0; i < avail; i += stride, k++) out.set(block.subarray(i * len, i * len + len), k * len);
      yield { records: out, count: kept };
    }
    if (avail < n) return;
  }
}

async function readChunkTable(fh: FileHandle, h: LasHeader, vlrs: LasVlr[], size: number): Promise<LazChunk[] | null> {
  const lz = parseLaszipVlr(vlrs);
  if (!lz || (lz.compressor !== 2 && lz.compressor !== 3)) return null;
  const ptr = await readAt(fh, h.offsetToPoints, 8);
  if (ptr.length < 8) return null;
  let tableAt = Number(new DataView(ptr.buffer, ptr.byteOffset, 8).getBigInt64(0, true));
  if (tableAt === -1) {
    const tail = await readAt(fh, size - 8, 8);
    tableAt = Number(new DataView(tail.buffer, tail.byteOffset, 8).getBigInt64(0, true));
  }
  if (tableAt <= h.offsetToPoints || tableAt + 8 > size) return null;
  const th = await readAt(fh, tableAt, 8);
  const tdv = new DataView(th.buffer, th.byteOffset, 8);
  if (tdv.getUint32(0, true) !== 0) return null;
  const count = tdv.getUint32(4, true);
  const body = await readAt(fh, tableAt + 8, Math.min(size - tableAt - 8, count * 24 + 1024));
  const chunks = decodeChunkTable(body, count, lz.chunkSize, h.offsetToPoints + 8, h.pointCount);
  const end = chunks.length > 0 ? chunks[chunks.length - 1]!.start + chunks[chunks.length - 1]!.bytes : h.offsetToPoints + 8;
  const total = chunks.reduce((s, c) => s + c.points, 0);
  if (end !== tableAt || total !== h.pointCount || chunks.some((c) => c.bytes <= 0 || c.points < 0)) return null;
  return chunks;
}

async function* lazBatches(fh: FileHandle, h: LasHeader, vlrs: LasVlr[], size: number, stride: number): AsyncGenerator<PointBatch> {
  const L = await lazModule();
  const len = h.pointLength;
  let chunks: LazChunk[] | null = null;
  try {
    chunks = await readChunkTable(fh, h, vlrs, size);
  } catch {
    chunks = null;
  }
  const point = L._malloc(len);
  try {
    if (chunks) {
      let index = 0;
      let cap = 0;
      let buf = 0;
      try {
        for (const c of chunks) {
          if (c.bytes > cap) {
            if (buf) L._free(buf);
            cap = c.bytes;
            buf = L._malloc(cap);
          }
          L.HEAPU8.set(await readAt(fh, c.start, c.bytes), buf);
          const dec = new L.ChunkDecoder();
          try {
            dec.open(h.pointFormat, len, buf);
            const start = (stride - (index % stride)) % stride;
            const kept = start < c.points ? Math.ceil((c.points - start) / stride) : 0;
            const out = new Uint8Array(kept * len);
            let k = 0;
            for (let i = 0; i < c.points; i++) {
              dec.getPoint(point);
              if ((index + i) % stride === 0) out.set(L.HEAPU8.subarray(point, point + len), (k++) * len);
            }
            index += c.points;
            if (kept > 0) yield { records: out, count: kept };
          } finally {
            dec.delete();
          }
        }
      } finally {
        if (buf) L._free(buf);
      }
      return;
    }
    if (size > WHOLE_LAZ_LIMIT) throw new LasFormatError('unsupportedFormat');
    const all = await readAt(fh, 0, size);
    const data = L._malloc(all.length);
    const zip = new L.LASZip();
    try {
      L.HEAPU8.set(all, data);
      zip.open(data, all.length);
      const n = zip.getCount();
      const per = 65536;
      for (let first = 0; first < n; first += per) {
        const m = Math.min(per, n - first);
        const start = (stride - (first % stride)) % stride;
        const kept = start < m ? Math.ceil((m - start) / stride) : 0;
        const out = new Uint8Array(kept * len);
        let k = 0;
        for (let i = 0; i < m; i++) {
          zip.getPoint(point);
          if ((first + i) % stride === 0) out.set(L.HEAPU8.subarray(point, point + len), (k++) * len);
        }
        if (kept > 0) yield { records: out, count: kept };
      }
    } finally {
      zip.delete();
      L._free(data);
    }
  } finally {
    L._free(point);
  }
}
