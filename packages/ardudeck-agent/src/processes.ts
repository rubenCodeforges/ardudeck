// processes.ts
import si from 'systeminformation';
import type { ProcessInfo } from '@ardudeck/companion-types';

export function isProtected(name: string, protectedList: string[]): boolean {
  const lower = name.toLowerCase();
  return protectedList.some(p => lower.includes(p.toLowerCase()));
}

export async function listProcesses(protectedList: string[]): Promise<ProcessInfo[]> {
  const data = await si.processes();
  return data.list
    .sort((a, b) => b.cpu - a.cpu)
    .slice(0, 100)
    .map(p => ({
      pid: p.pid,
      name: p.name,
      cpu: Math.round(p.cpu * 10) / 10,
      ram: p.memRss ?? 0,
      user: p.user ?? '',
      command: p.command ?? p.name,
      isProtected: isProtected(p.name, protectedList),
    }));
}

export async function killProcess(pid: number, protectedList: string[]): Promise<{ success: boolean; error?: string }> {
  try {
    // Check if PID exists
    process.kill(pid, 0); // signal 0 = existence check
  } catch {
    return { success: false, error: `Process ${pid} not found` };
  }

  // Look up process name and check if protected
  const procs = await listProcesses(protectedList);
  const target = procs.find(p => p.pid === pid);
  if (target?.isProtected) {
    return { success: false, error: `Process '${target.name}' is protected and cannot be killed` };
  }

  try {
    process.kill(pid, 'SIGTERM');
    return { success: true };
  } catch (err) {
    return { success: false, error: `Failed to kill ${pid}: ${(err as Error).message}` };
  }
}
