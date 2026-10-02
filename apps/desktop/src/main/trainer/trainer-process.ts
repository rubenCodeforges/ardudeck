import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { TrainerRequest } from './trainer-request';
import type { TrainerTarget } from './trainer-locator';
import type {
  TrainerBakeDone,
  TrainerBakeProgress,
  TrainerCatalogue,
} from '../../shared/trainer-types';
import { t } from '../../shared/i18n/index.js';

export type TrainerCatalogueResult =
  | { ok: true; catalogue: TrainerCatalogue }
  | { ok: false; error: string };

/**
 * Checks the answer is one this build can actually render, before the view sees it.
 *
 * The Trainer ships as its own cargo and updates on its own schedule, so an ArduDeck talking to
 * a Trainer from either side of a protocol change is a normal state, not a corrupt one. Without
 * this the first missing array reaches the renderer as `undefined` and the whole view throws on
 * `.length`, which reads as ArduDeck being broken rather than as two versions disagreeing.
 */
export function parseCatalogue(raw: unknown): TrainerCatalogueResult {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, error: t('main:trainer.notCatalogue') };
  }
  const c = raw as Record<string, unknown>;
  const missing = (['regions', 'cameras', 'weather', 'times'] as const).filter(
    (key) => !Array.isArray(c[key]),
  );
  if (missing.length > 0) {
    return {
      ok: false,
      error: `This Trainer answers in a format ArduDeck does not understand (no ${missing.join(', ')}). Update the Trainer, or ArduDeck.`,
    };
  }
  return { ok: true, catalogue: raw as TrainerCatalogue };
}

/**
 * Starting the Trainer and finding out whether it worked.
 *
 * The Trainer answers on stdout with one marked line among its ordinary log, because the thing
 * that matters (did a flight actually start, and if not why) arrives minutes after the process
 * does: it may compile the game extension, prepare a region and wait for a port. An exit code
 * would say nothing, since a SUCCESSFUL launch does not exit at all - the Trainer stays alive
 * as the game's parent.
 */

/** The line the Trainer prints when it has decided. Must match its `TRAINER_RESULT_MARKER`. */
export const RESULT_MARKER = 'ARDUDECK_TRAINER_RESULT';

/** The Trainer is about to bind the physics link and is asking us to let go of it. */
export const NEEDS_PORT_MARKER = 'ARDUDECK_TRAINER_NEEDS_PORT';

/** The line a `--trainer-query` answers on. Must match the Trainer's `TRAINER_QUERY_MARKER`. */
export const CATALOGUE_MARKER = 'ARDUDECK_TRAINER_CATALOGUE';

/** A query starts nothing, so it either answers quickly or something is wrong. */
const QUERY_TIMEOUT_MS = 20_000;

/** The line a bake reports each step on. Must match the Trainer's `TRAINER_BAKE_MARKER`. */
export const BAKE_MARKER = 'ARDUDECK_TRAINER_BAKE';

/** The line a delete answers on. Must match the Trainer's `TRAINER_DELETE_MARKER`. */
export const DELETE_MARKER = 'ARDUDECK_TRAINER_DELETE';

/** Long enough to cover a first run compiling the game's Rust extension on a cold cache. */
const RESULT_TIMEOUT_MS = 300_000;

export interface TrainerLaunchOutcome {
  ok: boolean;
  error?: string;
  pid?: number;
  configPath?: string;
}

export interface SpawnDeps {
  target: TrainerTarget;
  /** `app.getPath('userData')`, where the request file is written. */
  userDataPath: string;
  onLog?: (line: string) => void;
  /**
   * The Trainer is about to bind UDP 9002. Release the physics engine NOW, not earlier.
   *
   * Released before the spawn, ArduDeck's flight controller sits with no flight model for
   * everything the Trainer does first - compiling, preparing a region, starting Godot - which
   * is minutes of a vehicle with no GPS and no telemetry, and reads as SITL disconnecting.
   */
  onNeedsPort?: () => void;
  /**
   * The flight is over: the Trainer exited and UDP 9002 is free again.
   *
   * Fires AFTER a successful launch, which is why the exit handler outlives the promise. The
   * Trainer stays alive as the game's parent, so its exit is the end of the session, and
   * without this ArduDeck's flight controller keeps running with no flight model at all: a
   * vehicle that never comes back until the whole app is restarted.
   */
  onExit?: () => void;
}

/** The command line for each shape a Trainer can take. */
export function trainerCommand(target: TrainerTarget, requestPath: string): {
  command: string;
  args: string[];
} {
  return trainerArgs(target, `--trainer-request=${requestPath}`);
}

/** Build a region. Streams for minutes; starts no game and takes no port. */
export function trainerBakeCommand(
  target: TrainerTarget,
  requestPath: string,
): { command: string; args: string[] } {
  return trainerArgs(target, `--trainer-bake=${requestPath}`);
}

/** Remove a baked region's files. The recipe is kept, so it can be rebuilt. */
export function trainerDeleteCommand(
  target: TrainerTarget,
  name: string,
): { command: string; args: string[] } {
  return trainerArgs(target, `--trainer-delete=${name}`);
}

/** Ask what a launch could choose from. Starts nothing and holds no port. */
export function trainerQueryCommand(target: TrainerTarget): { command: string; args: string[] } {
  return trainerArgs(target, '--trainer-query');
}

function trainerArgs(target: TrainerTarget, flag: string): { command: string; args: string[] } {
  if (target.kind === 'checkout') {
    // The checkout's OWN Electron, and the directory as the app to run. A global `electron`
    // would be a different major version against a pinned preload.
    return { command: target.electron, args: [target.path, flag] };
  }
  return { command: target.exec, args: [flag] };
}

/**
 * Runs the Trainer and resolves once it says what happened.
 *
 * The child is deliberately NOT killed on resolve: a successful launch means the Trainer is now
 * the game's parent, and it has to outlive this call. It is detached and unreferenced so
 * ArduDeck quitting does not take a flight down with it.
 */
/**
 * Reads the catalogue the Trainer prints, so ArduDeck's picker shows real regions.
 *
 * Spawned per call rather than kept alive: the answer changes when a region is baked or
 * removed, and a cached list that says a region exists when it does not is worse than the
 * second this takes.
 */
export async function queryTrainer(target: TrainerTarget): Promise<TrainerCatalogueResult> {
  const { command, args } = trainerQueryCommand(target);
  return new Promise<TrainerCatalogueResult>((resolve) => {
    let child: ChildProcess;
    try {
      child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      resolve({ ok: false, error: (err as Error).message });
      return;
    }

    let settled = false;
    const done = (r: TrainerCatalogueResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      resolve(r);
    };
    const timer = setTimeout(
      () => done({ ok: false, error: t('main:trainer.noAnswer') }),
      QUERY_TIMEOUT_MS,
    );

    let out = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      out += chunk.toString();
      const at = out.indexOf(CATALOGUE_MARKER);
      if (at === -1) return;
      const line = out.slice(at + CATALOGUE_MARKER.length).split('\n')[0];
      if (!line) return;
      // The marker carries a PATH, not the catalogue: with a thumbnail per region the payload
      // is hundreds of kilobytes, and a write past PIPE_BUF is not atomic, so anything else the
      // Trainer logs can land in the middle of it.
      let file: string;
      try {
        const answer = JSON.parse(line) as { file?: string; error?: string };
        if (answer.error) {
          done({ ok: false, error: answer.error });
          return;
        }
        if (!answer.file) return;
        file = answer.file;
      } catch {
        // Still arriving: the marker landed in one chunk and its JSON in the next.
        return;
      }
      void readFile(file, 'utf8')
        .then((raw) => done(parseCatalogue(JSON.parse(raw))))
        .catch((err: Error) => done({ ok: false, error: err.message }));
    });
    child.on('error', (err) => done({ ok: false, error: err.message }));
    child.on('exit', (code) =>
      done({ ok: false, error: t('main:trainer.exitedWithoutAnswer', { code }) }),
    );
  });
}

/**
 * Runs a short command that answers on one marked line, then exits.
 *
 * Shared by the query and the delete because their failure modes are identical and both were
 * getting their own copy of "spawn, watch stdout for a marker, treat an early exit as the
 * answer". A bake cannot use it: it streams for minutes and needs its progress.
 */
function runMarked<T>(
  command: string,
  args: string[],
  marker: string,
  timeoutMs: number,
  onFail: (error: string) => T,
): Promise<T> {
  return new Promise<T>((resolve) => {
    let child: ChildProcess;
    try {
      child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      resolve(onFail((err as Error).message));
      return;
    }

    let settled = false;
    const done = (value: T): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      resolve(value);
    };
    const timer = setTimeout(() => done(onFail(t('main:trainer.noAnswer'))), timeoutMs);

    let out = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      out += chunk.toString();
      const at = out.indexOf(marker);
      if (at === -1) return;
      const line = out.slice(at + marker.length).split('\n')[0];
      if (!line) return;
      try {
        done(JSON.parse(line) as T);
      } catch {
        // Still arriving: the marker landed in one chunk and its JSON in the next.
      }
    });
    child.on('error', (err) => done(onFail(err.message)));
    child.on('exit', (code) => done(onFail(t('main:trainer.exitedWithoutAnswer', { code }))));
  });
}

/** Delete a region. Never guesses: an unanswered delete is reported, not assumed to have worked. */
export async function deleteRegion(
  target: TrainerTarget,
  name: string,
): Promise<{ ok: boolean; error?: string }> {
  const { command, args } = trainerDeleteCommand(target, name);
  return runMarked(command, args, DELETE_MARKER, QUERY_TIMEOUT_MS, (error) => ({
    ok: false,
    error,
  }));
}

export interface BakeHandle {
  /** Resolves when the bake ends, however it ends. */
  done: Promise<TrainerBakeDone>;
  cancel: () => void;
}

/**
 * Runs a bake and reports every step as it happens.
 *
 * Streamed rather than awaited silently because the pipeline is minutes of network against six
 * public services, two of which rate-limit. A caller that only learns the answer at the end has
 * nothing to show for the wait, and a bake that appears to hang is the worst thing this screen
 * could do.
 */
export function bakeRegion(
  request: unknown,
  deps: SpawnDeps & { onProgress: (p: TrainerBakeProgress) => void },
): BakeHandle {
  const dir = join(deps.userDataPath, 'trainer');
  const requestPath = join(dir, 'bake.json');
  let child: ChildProcess | null = null;

  const done = (async (): Promise<TrainerBakeDone> => {
    try {
      await mkdir(dir, { recursive: true });
      await writeFile(requestPath, JSON.stringify(request, null, 2), 'utf8');
    } catch (err) {
      return { kind: 'done', ok: false, error: (err as Error).message };
    }

    const { command, args } = trainerBakeCommand(deps.target, requestPath);
    return new Promise<TrainerBakeDone>((resolve) => {
      try {
        child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (err) {
        resolve({ kind: 'done', ok: false, error: (err as Error).message });
        return;
      }

      let settled = false;
      const finish = (r: TrainerBakeDone): void => {
        if (settled) return;
        settled = true;
        resolve(r);
      };

      let buffer = '';
      let lastError = '';
      const read = (stream: 'stdout' | 'stderr') => {
        child?.[stream]?.on('data', (chunk: Buffer) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            deps.onLog?.(line);
            if (stream === 'stderr' && line.trim()) lastError = line.trim();
            const at = line.indexOf(BAKE_MARKER);
            if (at === -1) continue;
            try {
              const payload = JSON.parse(line.slice(at + BAKE_MARKER.length));
              if (payload.kind === 'progress') deps.onProgress(payload as TrainerBakeProgress);
              else finish(payload as TrainerBakeDone);
            } catch {
              // A marker this build cannot read is a newer Trainer. The exit still settles it.
            }
          }
        });
      };
      read('stdout');
      read('stderr');

      child.on('error', (err) => finish({ kind: 'done', ok: false, error: err.message }));
      child.on('exit', (code, signal) =>
        finish({
          kind: 'done',
          ok: false,
          error: signal
            ? `The bake was stopped (${signal}).`
            : lastError || `The bake ended (${code}) without finishing.`,
        }),
      );
    });
  })();

  return { done, cancel: () => child?.kill('SIGTERM') };
}

export async function launchTrainer(
  request: TrainerRequest,
  deps: SpawnDeps,
): Promise<TrainerLaunchOutcome> {
  const dir = join(deps.userDataPath, 'trainer');
  const requestPath = join(dir, 'request.json');
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(requestPath, JSON.stringify(request, null, 2), 'utf8');
  } catch (err) {
    return { ok: false, error: `Could not write the Trainer request: ${(err as Error).message}` };
  }

  const { command, args } = trainerCommand(deps.target, requestPath);
  let child: ChildProcess;
  try {
    child = spawn(command, args, { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    return { ok: false, error: `Could not start the Trainer: ${(err as Error).message}` };
  }
  child.unref();

  return new Promise<TrainerLaunchOutcome>((resolve) => {
    let settled = false;
    let launched = false;
    const done = (outcome: TrainerLaunchOutcome): void => {
      if (settled) return;
      settled = true;
      launched = outcome.ok;
      clearTimeout(timer);
      resolve(outcome);
    };

    const timer = setTimeout(
      () => done({ ok: false, error: t('main:trainer.noReport') }),
      RESULT_TIMEOUT_MS,
    );

    let lastError = '';
    const read = (stream: 'stdout' | 'stderr') => {
      let buffer = '';
      child[stream]?.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          deps.onLog?.(line);
          if (stream === 'stderr' && line.trim()) lastError = line.trim();
          if (line.includes(NEEDS_PORT_MARKER)) {
            deps.onNeedsPort?.();
            continue;
          }
          const at = line.indexOf(RESULT_MARKER);
          if (at === -1) continue;
          try {
            done(JSON.parse(line.slice(at + RESULT_MARKER.length)) as TrainerLaunchOutcome);
          } catch {
            // A marker we cannot parse is a Trainer newer than this build. Not fatal: it has
            // already started or failed on its own, and guessing which would be worse.
            done({ ok: false, error: t('main:trainer.unreadableAnswer') });
          }
        }
      });
    };
    read('stdout');
    read('stderr');

    child.on('error', (err) => done({ ok: false, error: err.message }));
    child.on('exit', (code) => {
      // Before the marker this is bad news. After it, it is simply the end of the flight, and
      // the physics engine has to come back.
      if (settled && launched) {
        deps.onExit?.();
        return;
      }
      done({
        ok: false,
        error: lastError || `The Trainer exited (${code}) without starting a flight.`,
      });
    });
  });
}
