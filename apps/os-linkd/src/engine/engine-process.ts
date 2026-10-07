import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import type { LogFn } from '../param-fetcher.js';
import { engineArgs } from './engine-links.js';

const RESTART_DELAY_MS = 1000;
/** A run shorter than this counts towards a crash loop. */
const STABLE_UPTIME_MS = 20_000;
const MAX_RAPID_CRASHES = 5;
const CRASH_LOOP_RETRY_MS = 30_000;
const STOP_GRACE_MS = 2000;

export interface EngineStatus {
  running: boolean;
  links: string[];
  error: string | null;
  pid: number | null;
}

/**
 * Keeps the orchestrator (the multi-vehicle engine) running with the OS's
 * current links. The engine reads its links only at startup, so a change of
 * links is a restart. A crashing engine is restarted, with a pause when it
 * keeps dying straight away.
 */
export class EngineProcess {
  private child: ChildProcess | null = null;
  private links: string[] = [];
  private error: string | null = null;
  private startedAt = 0;
  private rapidCrashes = 0;
  private restartTimer: NodeJS.Timeout | null = null;

  constructor(private readonly binary: string, private readonly bind: string, private readonly log: LogFn) {}

  get status(): EngineStatus {
    return { running: !!this.child, links: [...this.links], error: this.error, pid: this.child?.pid ?? null };
  }

  /** Run the engine with exactly these links; no links stops it. */
  async apply(links: readonly string[]): Promise<void> {
    const unchanged = links.length === this.links.length && links.every((l, i) => l === this.links[i]);
    if (unchanged && (this.child || links.length === 0)) return;
    this.links = [...links];
    this.rapidCrashes = 0;
    await this.stopChild();
    if (links.length > 0) this.spawnChild();
  }

  async stop(): Promise<void> {
    this.links = [];
    await this.stopChild();
  }

  private spawnChild(): void {
    this.clearRestart();
    if (!existsSync(this.binary)) {
      this.error = `orchestrator not installed at ${this.binary}`;
      this.log('warn', this.error);
      return;
    }
    this.error = null;
    this.startedAt = Date.now();
    const child = spawn(this.binary, engineArgs(this.bind, this.links), {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NO_COLOR: '1' },
    });
    this.child = child;
    this.log('info', `engine started (${this.links.join(', ')})`);
    child.stdout?.on('data', (d: Buffer) => this.logOutput(d));
    child.stderr?.on('data', (d: Buffer) => this.logOutput(d));
    child.on('error', (err) => {
      this.error = err.message;
      this.log('warn', `engine: ${err.message}`);
    });
    child.on('exit', (code, signal) => {
      if (this.child !== child) return;
      this.child = null;
      this.error = `engine exited (${signal ?? `code ${code}`})`;
      this.log('warn', this.error);
      this.scheduleRestart();
    });
  }

  private scheduleRestart(): void {
    if (this.links.length === 0) return;
    const crashedFast = Date.now() - this.startedAt < STABLE_UPTIME_MS;
    this.rapidCrashes = crashedFast ? this.rapidCrashes + 1 : 0;
    const delay = this.rapidCrashes >= MAX_RAPID_CRASHES ? CRASH_LOOP_RETRY_MS : RESTART_DELAY_MS;
    this.restartTimer = setTimeout(() => this.spawnChild(), delay);
  }

  private async stopChild(): Promise<void> {
    this.clearRestart();
    const child = this.child;
    this.child = null;
    if (!child || child.exitCode !== null) return;
    const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
    child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), STOP_GRACE_MS);
    await exited;
    clearTimeout(timer);
  }

  private clearRestart(): void {
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null;
  }

  private logOutput(data: Buffer): void {
    for (const line of data.toString().split('\n')) {
      if (line.trim()) this.log('info', `engine: ${line.trim()}`);
    }
  }
}
