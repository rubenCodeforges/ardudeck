import { app } from 'electron';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { i18n } from '../../shared/i18n/index.js';
import { noteUnverifiedCrs } from './crs.js';
import type { PointCloudConverted, PointCloudJob } from './point-cloud-convert.js';
import { PointCloudError } from './point-cloud.js';
import type { PointCloudWorkerData } from './point-cloud-worker.js';

/** Runs the LAS/LAZ conversion in a worker thread, so a multi-gigabyte cloud never stalls IPC or the MAVLink link. */
export function createPointCloudRunner(crsCachePath: string) {
  return async (job: PointCloudJob): Promise<PointCloudConverted> => {
    const { Worker } = await import('node:worker_threads');
    const workerData: PointCloudWorkerData = {
      ...job,
      language: i18n.language,
      crsCachePath,
      geoidPath: join(app.getAppPath(), 'resources', 'geoids', 'egm96-15.pgm'),
    };
    return new Promise((resolve, reject) => {
      let settled = false;
      const worker = new Worker(join(dirname(fileURLToPath(import.meta.url)), 'point-cloud-worker.js'), {
        workerData,
        resourceLimits: { maxOldGenerationSizeMb: 4096 },
      });
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        void worker.terminate();
        fn();
      };
      worker.on('message', (msg: { type: 'done'; result: PointCloudConverted; unverifiedCrs: number[] } | { type: 'error'; pilot: boolean; message: string }) => {
        if (msg.type === 'done') {
          for (const epsg of msg.unverifiedCrs) noteUnverifiedCrs(epsg);
          finish(() => resolve(msg.result));
        } else {
          finish(() => reject(msg.pilot ? new PointCloudError(msg.message) : new Error(msg.message)));
        }
      });
      worker.on('error', (err) => finish(() => reject(err)));
      worker.on('exit', (code) => finish(() => reject(new Error(`point cloud worker exited with code ${code}`)))); // i18n-exempt
    });
  };
}
