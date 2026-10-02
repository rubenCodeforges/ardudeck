import { app, ipcMain, BrowserWindow } from 'electron';
import { existsSync } from 'node:fs';
import { IPC_CHANNELS } from '../../shared/ipc-channels.js';
import type { TrainerLaunchInput, TrainerStatus } from '../../shared/trainer-types.js';
import { getInstalledApp } from '../apps/app-manager.js';
import {
  locateTrainer,
  TRAINER_APP_SLUG,
  TRAINER_PATH_ENV,
  type TrainerTarget,
} from './trainer-locator.js';
import { buildTrainerRequest } from './trainer-request.js';
import {
  bakeRegion,
  deleteRegion,
  launchTrainer,
  queryTrainer,
  type BakeHandle,
  type TrainerCatalogueResult,
  type TrainerLaunchOutcome,
} from './trainer-process.js';
import type { TrainerBakeDone } from '../../shared/trainer-types.js';
import { t } from '../../shared/i18n/index.js';

/**
 * Flying what is planned here, in the Trainer, without leaving this app first.
 *
 * ArduDeck owns the flight controller on this path BY CONSTRUCTION: it is the one spawning the
 * Trainer, so the Trainer serves the physics and never starts a flight stack of its own. That
 * replaces the negotiation the two used to perform over a loopback endpoint, which had to infer
 * another program's intentions from open ports and process command lines and was wrong often
 * enough to be a coin flip in front of an audience.
 *
 * What this does NOT do is decide how a flight is configured. Regions, cameras, weather and the
 * launch config belong to the Trainer; sending intent and letting it answer is what keeps one
 * implementation of that across two repositories.
 */

export interface TrainerDeps {
  /** Where this app's flight controller takes off from, or null when there is none. */
  home: () => { lat: number; lon: number; altM?: number | null; headingDeg?: number | null } | null;
  /** FRAME_CLASS / FRAME_TYPE of the running stack, and its custom frame JSON. */
  frame: () => { frameClass: number | null; frameType: number | null; framePath: string | null };
  /** Lets go of UDP 9002, because the Trainer binds it before it does anything else. */
  releasePhysics: () => Promise<boolean>;
  /** Takes it back when the flight ends. Without this the vehicle never returns. */
  reclaimPhysics: () => Promise<boolean>;
  log?: (level: 'info' | 'warn', message: string) => void;
}

function installedPath(): string | undefined {
  return getInstalledApp(TRAINER_APP_SLUG)?.installPath;
}

function find(): { target: TrainerTarget | null; searched: string[] } {
  return locateTrainer({
    exists: existsSync,
    platform: process.platform,
    override: process.env[TRAINER_PATH_ENV],
    installedPath: installedPath(),
    homeDir: app.getPath('home'),
  });
}

// The running Trainer owns the sticks; every ArduDeck RC sender gates on this.
let trainerSessionActive = false;

export function isTrainerSessionActive(): boolean {
  return trainerSessionActive;
}

function setTrainerSession(active: boolean): void {
  if (trainerSessionActive === active) return;
  trainerSessionActive = active;
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(IPC_CHANNELS.TRAINER_SESSION, active);
  }
}

export function trainerStatus(deps: TrainerDeps): TrainerStatus {
  const { target, searched } = find();
  const home = deps.home();
  return {
    // Installed from the Hangar, OR pointed at explicitly, OR simply FOUND on this machine.
    //
    // That last one is the website download: somebody installs the Trainer from the site
    // without going near the Hangar, and ArduDeck should still show it rather than pretend it
    // is not there. The locator already checks the platform's normal install locations, so
    // "we found a Trainer" is the honest test.
    available:
      target !== null || installedPath() !== undefined || Boolean(process.env[TRAINER_PATH_ENV]),
    installed: target !== null,
    kind: target?.kind ?? null,
    path: target?.path ?? null,
    searched,
    home,
    canLaunch: target !== null && buildTrainerRequest({ home }).ok,
    reason: target === null ? t('main:trainer.notInstalled') : notReady(deps),
  };
}

function notReady(deps: TrainerDeps): string | null {
  const built = buildTrainerRequest({ home: deps.home() });
  return built.ok ? null : built.error;
}

export function setupTrainerHandlers(mainWindow: BrowserWindow | null, deps: TrainerDeps): void {
  const send = (line: string): void => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.TRAINER_LOG, line);
    }
  };

  ipcMain.handle(IPC_CHANNELS.TRAINER_STATUS, (): TrainerStatus => trainerStatus(deps));

  // One bake at a time. The pipeline writes into a single region directory and leans on public
  // services that rate-limit, so a second concurrent run corrupts the first and gets both
  // throttled.
  let bake: BakeHandle | null = null;

  ipcMain.handle(
    IPC_CHANNELS.TRAINER_BAKE,
    async (_e, request: unknown): Promise<TrainerBakeDone> => {
      if (bake) return { kind: 'done', ok: false, error: t('main:trainer.regionBuilding') };
      const { target, searched } = find();
      if (!target) {
        return {
          kind: 'done',
          ok: false,
          error: `The Trainer is not installed. Looked in: ${searched.join(', ')}`,
        };
      }
      bake = bakeRegion(request, {
        target,
        userDataPath: app.getPath('userData'),
        onLog: send,
        onProgress: (p) => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send(IPC_CHANNELS.TRAINER_BAKE_PROGRESS, p);
          }
        },
      });
      try {
        return await bake.done;
      } finally {
        bake = null;
      }
    },
  );

  ipcMain.handle(IPC_CHANNELS.TRAINER_BAKE_CANCEL, (): void => bake?.cancel());

  ipcMain.handle(
    IPC_CHANNELS.TRAINER_DELETE_REGION,
    async (_e, name: string): Promise<{ ok: boolean; error?: string }> => {
      const { target } = find();
      if (!target) return { ok: false, error: t('main:trainer.notInstalled') };
      return deleteRegion(target, name);
    },
  );

  ipcMain.handle(IPC_CHANNELS.TRAINER_CATALOGUE, async (): Promise<TrainerCatalogueResult> => {
    const { target, searched } = find();
    if (!target) {
      return { ok: false, error: `The Trainer is not installed. Looked in: ${searched.join(', ')}` };
    }
    return queryTrainer(target);
  });

  ipcMain.handle(
    IPC_CHANNELS.TRAINER_LAUNCH,
    async (_e, input: TrainerLaunchInput = {}): Promise<TrainerLaunchOutcome> => {
      const { target, searched } = find();
      if (!target) {
        return {
          ok: false,
          error: `The Trainer is not installed. Looked in: ${searched.join(', ')}`,
        };
      }

      const frame = deps.frame();
      const built = buildTrainerRequest({
        home: deps.home(),
        frameClass: frame.frameClass,
        frameType: frame.frameType,
        framePath: frame.framePath,
        ...input,
      });
      if (!built.ok) return { ok: false, error: built.error };

      // NOT released here. The Trainer asks for the port at the last possible moment, once it
      // has compiled and prepared its region, because until then this app's flight controller
      // is happily flying its own model and there is no reason to take it away.
      setTrainerSession(true);
      const outcome = await launchTrainer(built.request, {
        target,
        userDataPath: app.getPath('userData'),
        onLog: send,
        onNeedsPort: () => {
          void deps.releasePhysics().then((ok) => {
            deps.log?.(
              ok ? 'info' : 'warn',
              ok
                ? 'trainer: physics released to the Trainer'
                : 'trainer: could not release the physics engine',
            );
          });
        },
        onExit: () => {
          setTrainerSession(false);
          void deps.reclaimPhysics().then((ok) => {
            deps.log?.(
              ok ? 'info' : 'warn',
              ok
                ? 'trainer: flight over, physics engine reclaimed'
                : 'trainer: flight over but the physics engine did not restart',
            );
          });
        },
      });
      if (!outcome.ok) setTrainerSession(false);
      return outcome;
    },
  );

  ipcMain.handle(IPC_CHANNELS.TRAINER_SESSION_ACTIVE, (): boolean => trainerSessionActive);
}
