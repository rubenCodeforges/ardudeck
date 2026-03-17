// services.ts
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { ServiceInfo, ServiceAction, ServiceStatus } from '@ardudeck/companion-types';

const exec = promisify(execFile);

type InitSystem = 'systemd' | 'openrc' | 'none';

async function detectInitSystem(): Promise<InitSystem> {
  try {
    await exec('systemctl', ['--version']);
    return 'systemd';
  } catch {
    try {
      await exec('rc-status', ['--version']);
      return 'openrc';
    } catch {
      return 'none';
    }
  }
}

let cachedInitSystem: InitSystem | null = null;

async function getInitSystem(): Promise<InitSystem> {
  if (cachedInitSystem === null) {
    cachedInitSystem = await detectInitSystem();
  }
  return cachedInitSystem;
}

export async function listServices(): Promise<ServiceInfo[]> {
  const init = await getInitSystem();

  if (init === 'systemd') {
    return listSystemdServices();
  } else if (init === 'openrc') {
    return listOpenRCServices();
  }
  return [];
}

async function listSystemdServices(): Promise<ServiceInfo[]> {
  try {
    const { stdout } = await exec('systemctl', [
      'list-units', '--type=service', '--all', '--no-pager', '--no-legend',
      '--output=json',
    ]);
    const units = JSON.parse(stdout) as Array<{
      unit: string;
      load: string;
      active: string;
      sub: string;
      description: string;
    }>;

    return units
      .filter(u => u.unit.endsWith('.service'))
      .map(u => ({
        name: u.unit.replace('.service', ''),
        description: u.description,
        status: mapSystemdStatus(u.active, u.sub),
        enabled: false, // filled below
      }));
  } catch {
    return [];
  }
}

function mapSystemdStatus(active: string, sub: string): ServiceStatus {
  if (active === 'active' && sub === 'running') return 'running';
  if (active === 'failed') return 'failed';
  if (active === 'inactive') return 'stopped';
  return 'unknown';
}

async function listOpenRCServices(): Promise<ServiceInfo[]> {
  try {
    const { stdout } = await exec('rc-status', ['-a']);
    const lines = stdout.split('\n');
    const services: ServiceInfo[] = [];

    for (const line of lines) {
      const match = line.match(/^\s+(\S+)\s+\[\s+(\S+)\s+\]/);
      if (match && match[1] && match[2]) {
        services.push({
          name: match[1],
          description: match[1],
          status: match[2] === 'started' ? 'running' : 'stopped',
          enabled: false,
        });
      }
    }
    return services;
  } catch {
    return [];
  }
}

export async function controlService(name: string, action: ServiceAction): Promise<{ success: boolean; error?: string }> {
  const init = await getInitSystem();

  try {
    if (init === 'systemd') {
      await exec('systemctl', [action, name]);
    } else if (init === 'openrc') {
      await exec('rc-service', [name, action]);
    } else {
      return { success: false, error: 'No init system detected' };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
