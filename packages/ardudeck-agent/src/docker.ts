// docker.ts
import type { ContainerInfo, ContainerAction } from '@ardudeck/companion-types';
import type Dockerode from 'dockerode';

let dockerInstance: Dockerode | null = null;

export async function isDockerAvailable(): Promise<boolean> {
  try {
    const { default: Docker } = await import('dockerode');
    const docker = new Docker();
    await docker.ping();
    dockerInstance = docker;
    return true;
  } catch {
    return false;
  }
}

function getDocker(): Dockerode {
  if (!dockerInstance) throw new Error('Docker not available');
  return dockerInstance;
}

export async function listContainers(): Promise<ContainerInfo[]> {
  const docker = getDocker();
  const containers = await docker.listContainers({ all: true });

  return containers.map(c => ({
    id: c.Id.slice(0, 12),
    name: (c.Names[0] || '').replace(/^\//, ''),
    image: c.Image,
    status: mapDockerState(c.State),
    created: c.Created * 1000,
    ports: c.Ports.map(p =>
      p.PublicPort ? `${p.PublicPort}:${p.PrivatePort}/${p.Type}` : `${p.PrivatePort}/${p.Type}`
    ),
  }));
}

function mapDockerState(state: string): ContainerInfo['status'] {
  const map: Record<string, ContainerInfo['status']> = {
    running: 'running',
    exited: 'exited',
    paused: 'paused',
    restarting: 'restarting',
    dead: 'dead',
  };
  return map[state] || 'stopped';
}

export async function controlContainer(id: string, action: ContainerAction): Promise<{ success: boolean; error?: string }> {
  try {
    const docker = getDocker();
    const container = docker.getContainer(id);

    switch (action) {
      case 'start': await container.start(); break;
      case 'stop': await container.stop(); break;
      case 'restart': await container.restart(); break;
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function getContainerLogs(id: string, tail: number = 200): Promise<string> {
  const docker = getDocker();
  const container = docker.getContainer(id);
  const logs = await container.logs({
    stdout: true,
    stderr: true,
    tail,
    timestamps: true,
  });
  return logs.toString();
}
