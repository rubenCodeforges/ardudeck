import { deserializeTerrainRequest, serializeTerrainData, TERRAIN_DATA_CRC_EXTRA, TERRAIN_DATA_ID } from '@ardudeck/mavlink-ts';
import { demSampler } from './dem-sampler.js';
import { blockPoints, requestedBits, toInt16 } from './terrain-blocks.js';

export interface UplinkStatus {
  sysid: number;
  served: number;
  /** Blocks not answered: `unavailable` + `gaps`. */
  missing: number;
  /** Blocks where every point had no elevation: tiles failed to load (offline, blocked) or the area has no DEM. */
  unavailable: number;
  /** Blocks where only some points had no elevation (DEM edge or nodata holes). Never filled in: see handleRequest. */
  gaps: number;
  /** Blocks that failed with an exception (decode or send). */
  errors: number;
  ignored: number;
  lastAt: number | null;
  spacing: number | null;
}

export interface UplinkDeps {
  enabled(): boolean;
  sample(points: { lat: number; lon: number }[], spacingM: number): Promise<(number | null)[]>;
  send(msgid: number, payload: Uint8Array, crcExtra: number, link: unknown): Promise<void>;
  now(): number;
  onStatus(status: UplinkStatus): void;
}

// The vehicle repeats a request every 2 s; a block answered inside that window is not sent again.
const REPEAT_WINDOW_MS = 2000;

/** Answers TERRAIN_REQUEST with TERRAIN_DATA blocks; lat, lon and spacing echo the request or the vehicle drops them. */
export function createTerrainUplink(deps: UplinkDeps) {
  const status = new Map<number, UplinkStatus>();
  const recent = new Map<string, number>();

  const statusFor = (sysid: number): UplinkStatus => {
    let s = status.get(sysid);
    if (!s) {
      s = { sysid, served: 0, missing: 0, unavailable: 0, gaps: 0, errors: 0, ignored: 0, lastAt: null, spacing: null };
      status.set(sysid, s);
    }
    return s;
  };

  /** Never rejects: a bad request or a failed block is counted and logged, the rest of the request still runs. */
  async function handleRequest(packet: { sysid: number; compid: number; payload: Uint8Array }, link: unknown): Promise<void> {
    const s = statusFor(packet.sysid);
    try {
      if (!deps.enabled()) {
        s.ignored++;
        return;
      }
      const req = deserializeTerrainRequest(packet.payload);
      s.spacing = req.gridSpacing;
      const now = deps.now();
      for (const [k, at] of recent) if (now - at > REPEAT_WINDOW_MS) recent.delete(k);
      for (const bit of requestedBits(req.mask)) {
        const key = `${packet.sysid}:${req.lat}:${req.lon}:${req.gridSpacing}:${bit}`;
        if (recent.has(key)) continue;
        try {
          const pts = blockPoints(req.lat, req.lon, req.gridSpacing, bit);
          const heights = await deps.sample(pts, req.gridSpacing);
          const absent = heights.filter((h) => h === null).length;
          // A partly empty block is dropped, not patched: AP_Terrain has no per-point validity, so any invented
          // height would be flown as ground truth by terrain following. The vehicle fails safe on missing data instead.
          if (absent > 0) {
            s.missing++;
            if (absent === heights.length) s.unavailable++;
            else s.gaps++;
            continue;
          }
          const payload = serializeTerrainData({ lat: req.lat, lon: req.lon, gridSpacing: req.gridSpacing, gridbit: bit, data: heights.map((h) => toInt16(h!)) });
          await deps.send(TERRAIN_DATA_ID, payload, TERRAIN_DATA_CRC_EXTRA, link);
          recent.set(key, now);
          s.served++;
          s.lastAt = now;
        } catch (err) {
          s.errors++;
          s.missing++;
          console.warn(`[terrain] block ${bit} for sysid ${packet.sysid} failed:`, err);
        }
      }
    } catch (err) {
      s.errors++;
      console.warn(`[terrain] request from sysid ${packet.sysid} failed:`, err);
    } finally {
      deps.onStatus({ ...s });
    }
  }

  return { handleRequest, statusFor };
}

export let terrainUplink: ReturnType<typeof createTerrainUplink> | null = null;

export function installTerrainUplink(deps: Omit<UplinkDeps, 'sample' | 'now'>): ReturnType<typeof createTerrainUplink> {
  terrainUplink = createTerrainUplink({ ...deps, sample: (pts, sp) => demSampler.sample(pts, sp), now: () => Date.now() });
  return terrainUplink;
}
