/**
 * Swarm SITL for the desktop app: resolves the downloaded firmware and frame
 * defaults, runs the shared launcher from @ardudeck/sitl, and reports each
 * instance to the renderer, which hands the instances to the orchestrator.
 */

import { app, BrowserWindow } from 'electron';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { SwarmSitl, generateDefaultParams, withPathPrepended, type SwarmInstanceStatus } from '@ardudeck/sitl';
import type { SwarmSitlConfig, SwarmSitlStatus, ArduPilotVehicleType } from '../../shared/ipc-channels.js';
import { IPC_CHANNELS } from '../../shared/ipc-channels.js';
import { ardupilotSitlDownloader } from './ardupilot-sitl-downloader.js';
import { resolveDefaultsFile } from './frame-config.js';

const DEFAULT_MODELS: Record<ArduPilotVehicleType, string> = {
  copter: 'quad',
  plane: 'plane',
  rover: 'rover',
  sub: 'vectored',
};

class SwarmSitlProcessManager {
  private mainWindow: BrowserWindow | null = null;
  private readonly swarm = new SwarmSitl({
    onInstance: (status) => this.send(IPC_CHANNELS.SWARM_SITL_INSTANCE, status),
    onLog: (index, sysid, line, isError) => this.send(IPC_CHANNELS.SWARM_SITL_LOG, { index, sysid, isError, line }),
    onState: () => this.send(IPC_CHANNELS.SWARM_SITL_STATE, this.getStatus()),
  });

  get isRunning(): boolean {
    return this.swarm.isRunning;
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  async start(config: SwarmSitlConfig): Promise<{ success: boolean; error?: string; instances?: SwarmInstanceStatus[] }> {
    const model = config.model || DEFAULT_MODELS[config.vehicleType];
    const binaryPath = ardupilotSitlDownloader.getBinaryPath(config.vehicleType, config.releaseTrack);
    try {
      await access(binaryPath);
    } catch {
      return { success: false, error: `SITL binary not found at ${binaryPath}. Download it on the SITL tab first.` };
    }

    const sitlData = path.join(app.getPath('userData'), 'ardupilot-sitl');
    try {
      const instances = await this.swarm.start({
        binaryPath,
        workDir: path.join(sitlData, 'swarm'),
        model,
        speedup: config.speedup,
        count: config.count,
        spacingM: config.spacingM,
        formation: config.formation,
        home: config.homeLocation,
        baseParams: generateDefaultParams(config.vehicleType, model),
        upstreamDefaultsPath: await resolveDefaultsFile(config.vehicleType, model).catch(() => null),
        env: process.platform === 'win32' ? withPathPrepended(process.env, path.join(sitlData, 'cygwin')) : process.env,
      });
      return { success: true, instances };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  stop(): void {
    this.swarm.stop();
  }

  getStatus(): SwarmSitlStatus {
    return { isRunning: this.swarm.isRunning, instances: this.swarm.snapshot() };
  }

  private send(channel: string, data: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }
}

export const swarmSitlProcess = new SwarmSitlProcessManager();
