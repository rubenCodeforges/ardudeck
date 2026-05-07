/**
 * Long-lived Python sidecar process spoken to via JSON-RPC 2.0 over stdio.
 *
 * Wire format: one JSON object per line on stdin/stdout. stderr is treated as
 * a free-form log stream (forwarded to the renderer as `level: "error"`).
 *
 * Lifecycle:
 *  - `start()` spawns the venv python with the SDK bootstrap + plugin dir.
 *  - The Python side sends a `notification` named `ardudeck.ready` once it has
 *    registered RPC methods. We resolve `start()` only on that signal so the
 *    renderer never races a partially-initialized plugin.
 *  - `call(method, params)` returns a Promise that settles when the Python
 *    side replies with a matching `id`.
 *  - Auto-restart with capped exponential backoff after unexpected exits.
 *  - `stop()` flushes a `shutdown` notification and SIGKILLs after a grace.
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'node:events';

const READY_NOTIFICATION = 'ardudeck.ready';
const MAX_INFLIGHT = 256;
const REQUEST_TIMEOUT_MS = 30_000;
const STARTUP_READY_TIMEOUT_MS = 20_000;

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

type Incoming = JsonRpcResponse | JsonRpcNotification;

export interface SidecarOptions {
  /** Stable identifier for log prefixes. */
  slug: string;
  /** Absolute path to the venv python binary. */
  pythonPath: string;
  /** Absolute path to the plugin directory (used as cwd + args[1]). */
  pluginDir: string;
  /** Module name to invoke; defaults to the bundled SDK bootstrap. */
  bootstrapModule?: string;
  /** Extra environment variables passed to the child. */
  env?: Record<string, string>;
}

export interface SidecarEvents {
  on(event: 'log', listener: (level: 'info' | 'error', line: string) => void): this;
  on(event: 'event', listener: (name: string, payload: unknown) => void): this;
  on(event: 'command', listener: (command: string, payload: unknown) => void): this;
  on(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
  on(event: 'ready', listener: () => void): this;
}

export class PythonSidecar extends EventEmitter implements SidecarEvents {
  private child: ChildProcessWithoutNullStreams | null = null;
  private nextId = 1;
  private inflight = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }
  >();
  private stdoutBuffer = '';
  private stderrBuffer = '';
  private readyPromise: Promise<void> | null = null;
  private readyResolve: (() => void) | null = null;
  private readyReject: ((err: Error) => void) | null = null;
  private readyTimer: NodeJS.Timeout | null = null;
  private starting = false;
  private stopping = false;
  private restartAttempts = 0;
  private autoRestart = true;

  constructor(private readonly options: SidecarOptions) {
    super();
  }

  get pid(): number | undefined {
    return this.child?.pid;
  }

  get isRunning(): boolean {
    return this.child !== null && !this.stopping;
  }

  /** Spawn the process and wait for the `ardudeck.ready` notification. */
  async start(): Promise<void> {
    if (this.child) return this.readyPromise ?? Promise.resolve();
    this.starting = true;
    this.stopping = false;

    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
    this.readyTimer = setTimeout(() => {
      this.emit(
        'log',
        'error',
        `[sidecar] startup timeout: no ${READY_NOTIFICATION} within ${STARTUP_READY_TIMEOUT_MS}ms`,
      );
      this.failReady(
        new Error(`Plugin did not signal ready in ${STARTUP_READY_TIMEOUT_MS}ms`),
      );
      if (this.child && !this.child.killed) {
        try {
          this.child.kill('SIGTERM');
        } catch {
          // ignore
        }
      }
    }, STARTUP_READY_TIMEOUT_MS);

    const bootstrap = this.options.bootstrapModule ?? 'ardudeck_sdk';
    const args = ['-u', '-m', bootstrap, this.options.pluginDir];

    const child = spawn(this.options.pythonPath, args, {
      cwd: this.options.pluginDir,
      windowsHide: true,
      env: {
        // Whitelist a small set of host env vars; everything else comes from
        // the explicit per-plugin env. Avoids leaking GH tokens, AWS creds, etc.
        PATH: process.env['PATH'] ?? '',
        SYSTEMROOT: process.env['SYSTEMROOT'] ?? '',
        TEMP: process.env['TEMP'] ?? '',
        TMP: process.env['TMP'] ?? '',
        HOME: process.env['HOME'] ?? '',
        USERPROFILE: process.env['USERPROFILE'] ?? '',
        LANG: process.env['LANG'] ?? 'en_US.UTF-8',
        PYTHONIOENCODING: 'utf-8',
        PYTHONUNBUFFERED: '1',
        ARDUDECK_PLUGIN_SLUG: this.options.slug,
        ...(this.options.env ?? {}),
      },
    });

    this.child = child;

    child.stdout.on('data', (chunk: Buffer) => this.handleStdout(chunk));
    child.stderr.on('data', (chunk: Buffer) => this.handleStderr(chunk));

    child.on('error', (err) => {
      this.failReady(err);
      this.emit('log', 'error', `[sidecar] spawn error: ${err.message}`);
    });

    child.on('exit', (code, signal) => {
      this.handleExit(code, signal);
    });

    return this.readyPromise;
  }

  /**
   * Stop the sidecar gracefully. Sends a `shutdown` notification, then SIGTERM,
   * and finally SIGKILLs after `graceMs`.
   */
  async stop(graceMs = 1500): Promise<void> {
    if (!this.child) return;
    this.stopping = true;
    this.autoRestart = false;
    this.failInflight(new Error('Sidecar shutting down'));

    try {
      this.send({ jsonrpc: '2.0', method: 'shutdown' });
    } catch {
      // already dead
    }

    const child = this.child;
    return new Promise<void>((resolve) => {
      let resolved = false;
      const finish = () => {
        if (resolved) return;
        resolved = true;
        resolve();
      };
      child.once('exit', finish);
      setTimeout(() => {
        if (!child.killed) child.kill('SIGTERM');
      }, Math.min(graceMs, 1000));
      setTimeout(() => {
        if (!child.killed) child.kill('SIGKILL');
        finish();
      }, graceMs);
    });
  }

  /** Invoke an RPC method. Rejects on Python-side error or timeout. */
  call<T = unknown>(method: string, params?: unknown, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
    if (!this.child) {
      return Promise.reject(new Error('Sidecar is not running'));
    }
    if (this.inflight.size >= MAX_INFLIGHT) {
      return Promise.reject(new Error('Too many concurrent RPC calls'));
    }
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.inflight.delete(id);
        reject(new Error(`RPC ${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.inflight.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timer,
      });
      try {
        this.send({ jsonrpc: '2.0', id, method, params });
      } catch (err) {
        this.inflight.delete(id);
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  /** Send a JSON-RPC notification (no response expected). */
  notify(method: string, params?: unknown): void {
    this.send({ jsonrpc: '2.0', method, params });
  }

  private send(message: JsonRpcRequest | JsonRpcNotification): void {
    if (!this.child) throw new Error('Sidecar is not running');
    const payload = JSON.stringify(message) + '\n';
    this.child.stdin.write(payload);
  }

  private handleStdout(chunk: Buffer): void {
    this.stdoutBuffer += chunk.toString('utf-8');
    let newlineIdx: number;
    while ((newlineIdx = this.stdoutBuffer.indexOf('\n')) !== -1) {
      const line = this.stdoutBuffer.slice(0, newlineIdx).trimEnd();
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIdx + 1);
      if (line.length === 0) continue;
      this.processLine(line);
    }
  }

  private handleStderr(chunk: Buffer): void {
    this.stderrBuffer += chunk.toString('utf-8');
    let newlineIdx: number;
    while ((newlineIdx = this.stderrBuffer.indexOf('\n')) !== -1) {
      const line = this.stderrBuffer.slice(0, newlineIdx).trimEnd();
      this.stderrBuffer = this.stderrBuffer.slice(newlineIdx + 1);
      if (line.length > 0) this.emit('log', 'error', line);
    }
  }

  private processLine(line: string): void {
    let parsed: Incoming | null = null;
    try {
      parsed = JSON.parse(line) as Incoming;
    } catch {
      // Non-JSON output is treated as a regular log line. Plugins shouldn't
      // print() on stdout, but this keeps things robust if they slip up.
      this.emit('log', 'info', line);
      return;
    }
    if (!parsed || parsed.jsonrpc !== '2.0') {
      this.emit('log', 'info', line);
      return;
    }
    if ('id' in parsed && typeof parsed.id === 'number') {
      this.handleResponse(parsed);
      return;
    }
    if ('method' in parsed) {
      this.handleNotification(parsed);
    }
  }

  private handleResponse(msg: JsonRpcResponse): void {
    const pending = this.inflight.get(msg.id);
    if (!pending) return;
    this.inflight.delete(msg.id);
    clearTimeout(pending.timer);
    if (msg.error) {
      pending.reject(new Error(`${msg.error.message} (code ${msg.error.code})`));
    } else {
      pending.resolve(msg.result);
    }
  }

  private handleNotification(msg: JsonRpcNotification): void {
    if (msg.method === READY_NOTIFICATION) {
      this.starting = false;
      this.restartAttempts = 0;
      if (this.readyTimer) {
        clearTimeout(this.readyTimer);
        this.readyTimer = null;
      }
      this.readyResolve?.();
      this.readyResolve = null;
      this.readyReject = null;
      this.emit('ready');
      return;
    }
    if (msg.method === 'log' && msg.params && typeof msg.params === 'object') {
      const params = msg.params as { level?: 'info' | 'warn' | 'error' | 'debug'; message?: string };
      const level = params.level === 'error' ? 'error' : 'info';
      this.emit('log', level, params.message ?? '');
      return;
    }
    if (msg.method === 'event' && msg.params && typeof msg.params === 'object') {
      const params = msg.params as { event?: string; payload?: unknown };
      if (typeof params.event === 'string') {
        this.emit('event', params.event, params.payload);
      }
      return;
    }
    if (msg.method === 'command' && msg.params && typeof msg.params === 'object') {
      const params = msg.params as { command?: string; payload?: unknown };
      if (typeof params.command === 'string') {
        this.emit('command', params.command, params.payload);
      }
      return;
    }
    // Unknown notification — surface as log so plugin authors can debug.
    this.emit('log', 'info', `unknown notification: ${msg.method}`);
  }

  private handleExit(code: number | null, signal: NodeJS.Signals | null): void {
    const wasStarting = this.starting;
    this.child = null;
    this.failInflight(new Error(`Sidecar exited (code=${code}, signal=${signal})`));
    this.emit('exit', code, signal);

    if (wasStarting) {
      this.failReady(new Error(`Sidecar exited during startup (code=${code})`));
    }

    if (!this.autoRestart || this.stopping) return;
    if (code === 0) return; // clean exit, don't restart

    this.restartAttempts += 1;
    if (this.restartAttempts > 5) {
      this.emit('log', 'error', '[sidecar] giving up after 5 failed restarts');
      return;
    }
    const backoff = Math.min(30_000, 500 * 2 ** this.restartAttempts);
    this.emit('log', 'info', `[sidecar] restarting in ${backoff}ms (attempt ${this.restartAttempts})`);
    setTimeout(() => {
      if (this.stopping) return;
      this.start().catch((err) => {
        this.emit('log', 'error', `[sidecar] restart failed: ${err.message}`);
      });
    }, backoff);
  }

  private failInflight(err: Error): void {
    for (const pending of this.inflight.values()) {
      clearTimeout(pending.timer);
      pending.reject(err);
    }
    this.inflight.clear();
  }

  private failReady(err: Error): void {
    if (this.readyTimer) {
      clearTimeout(this.readyTimer);
      this.readyTimer = null;
    }
    this.starting = false;
     if (this.readyReject) {
      this.readyReject(err);
      this.readyReject = null;
      this.readyResolve = null;
    }
  }
}
