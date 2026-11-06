import { writeFile } from 'node:fs/promises';
import type { Geoid } from '../../shared/scene-models/geoid.js';
import type { CrsResolver } from './crs.js';
import { readLasPointCloud } from './point-cloud.js';
import { encodePly } from './ply.js';

export interface PointCloudJob {
  src: string;
  /** Where the compact PLY goes. */
  outPath: string;
}

export interface PointCloudConverted {
  lat: number;
  lng: number;
  altMsl: number;
  count: number;
  sourceCount: number;
  footprint: Array<{ lat: number; lng: number }>;
}

/** LAS/LAZ to the library's PLY. Heavy: run it in point-cloud-worker, never on the main thread. */
export async function convertPointCloud(job: PointCloudJob, resolveCrs: CrsResolver, geoid: () => Geoid | null): Promise<PointCloudConverted> {
  const cloud = await readLasPointCloud(job.src, resolveCrs);
  const o = cloud.origin;
  const g = cloud.ellipsoidal ? geoid() : null;
  const altMsl = g ? o.hEll - g.undulation(o.lat, o.lng) : o.hEll;
  await writeFile(job.outPath, encodePly(cloud.positions, cloud.colors, cloud.count, { lat: o.lat, lng: o.lng, altMsl }));
  return { lat: o.lat, lng: o.lng, altMsl, count: cloud.count, sourceCount: cloud.sourceCount, footprint: cloud.footprint };
}
