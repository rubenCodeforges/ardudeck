import { parentPort, workerData } from 'node:worker_threads';
import { readFileSync } from 'node:fs';
import { i18n } from '../../shared/i18n/index.js';
import { builtinProj4 } from '../../shared/scene-models/parsers/index.js';
import { parseGeoidPgm, type Geoid } from '../../shared/scene-models/geoid.js';
import { createCrsResolver, unverifiedCrsCodes } from './crs.js';
import { convertPointCloud, type PointCloudJob } from './point-cloud-convert.js';
import { PointCloudError } from './point-cloud.js';

export interface PointCloudWorkerData extends PointCloudJob {
  language: string;
  crsCachePath: string;
  geoidPath: string;
}

if (!parentPort) throw new Error('point-cloud-worker must run as a worker thread'); // i18n-exempt

const job = workerData as PointCloudWorkerData;
let geoid: Geoid | null | undefined;
const loadGeoid = (): Geoid | null => {
  if (geoid === undefined) {
    try {
      geoid = parseGeoidPgm(new Uint8Array(readFileSync(job.geoidPath)));
    } catch {
      geoid = null;
    }
  }
  return geoid;
};

void (async () => {
  await i18n.changeLanguage(job.language);
  try {
    const result = await convertPointCloud(job, createCrsResolver(job.crsCachePath, { builtin: builtinProj4 }), loadGeoid);
    parentPort!.postMessage({ type: 'done', result, unverifiedCrs: unverifiedCrsCodes() });
  } catch (err) {
    parentPort!.postMessage({ type: 'error', pilot: err instanceof PointCloudError, message: err instanceof Error ? err.message : String(err) });
  }
})();
