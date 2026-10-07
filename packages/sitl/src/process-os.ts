// Process plumbing shared by the single and swarm ArduPilot SITL launchers.

import { execFile, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

const SITL_BINARIES = ['arducopter', 'arduplane', 'ardurover', 'ardusub'];

export function isSitlBinary(nameOrCommand: string): boolean {
  const s = nameOrCommand.toLowerCase();
  return SITL_BINARIES.some((b) => s.includes(b));
}

/** Copy of `env` with `dir` in front of the path. Windows names it `Path`, and a second `PATH` key is not the same variable. */
export function withPathPrepended(env: NodeJS.ProcessEnv, dir: string): NodeJS.ProcessEnv {
  const out = { ...env };
  const key = Object.keys(out).find((k) => k.toLowerCase() === 'path') ?? 'PATH';
  const sep = process.platform === 'win32' ? ';' : ':';
  out[key] = out[key] ? `${dir}${sep}${out[key]}` : dir;
  return out;
}

/** Stop a SITL process. On Windows taskkill /T also takes anything it started, which a plain kill leaves running. */
export function killProcessTree(proc: ChildProcess): void {
  if (process.platform === 'win32') {
    if (proc.pid) void run('taskkill', ['/PID', String(proc.pid), '/T', '/F']).catch(() => undefined);
    return;
  }
  try {
    proc.kill('SIGTERM');
  } catch {
    return;
  }
  setTimeout(() => {
    try { proc.kill('SIGKILL'); } catch { /* already gone */ }
  }, 2000);
}

/** PIDs listening on `port` in `netstat -ano -p TCP` output. */
export function parseNetstatListeners(output: string, port: number): number[] {
  const pids = new Set<number>();
  for (const line of output.split(/\r?\n/)) {
    const cols = line.trim().split(/\s+/);
    // Proto  Local Address  Foreign Address  State  PID
    if (cols.length < 5 || cols[3] !== 'LISTENING') continue;
    if (!cols[1]!.endsWith(`:${port}`)) continue;
    const pid = Number(cols[4]);
    if (pid > 0) pids.add(pid);
  }
  return [...pids];
}

async function sitlPidsOnPort(port: number): Promise<number[]> {
  if (process.platform === 'win32') {
    const { stdout } = await run('netstat', ['-ano', '-p', 'TCP']).catch(() => ({ stdout: '' }));
    const out: number[] = [];
    for (const pid of parseNetstatListeners(stdout, port)) {
      const { stdout: row } = await run('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH']).catch(() => ({ stdout: '' }));
      if (isSitlBinary(row)) out.push(pid);
    }
    return out;
  }
  const { stdout } = await run('lsof', ['-ti', `TCP:${port}`]).catch(() => ({ stdout: '' }));
  const out: number[] = [];
  for (const pid of stdout.split('\n').map((s) => Number(s.trim())).filter((n) => n > 0)) {
    const { stdout: cmd } = await run('ps', ['-o', 'command=', '-p', String(pid)]).catch(() => ({ stdout: '' }));
    if (isSitlBinary(cmd)) out.push(pid);
  }
  return out;
}

/** Kill a leftover ArduPilot SITL holding `port`, matched by binary name so nothing else is touched. */
export async function reapSitlOnPort(port: number): Promise<number> {
  try {
    const pids = await sitlPidsOnPort(port);
    for (const pid of pids) {
      if (process.platform === 'win32') {
        await run('taskkill', ['/PID', String(pid), '/T', '/F']).catch(() => undefined);
      } else {
        try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
      }
    }
    if (pids.length > 0) {
      console.log(`[sitl] reaped ${pids.length} stale SITL process(es) on TCP ${port}`);
      // Give the OS a moment to release the port before the new SITL binds it.
      await new Promise((r) => setTimeout(r, 300));
    }
    return pids.length;
  } catch (err) {
    console.warn('[sitl] reap failed (continuing):', err);
    return 0;
  }
}
