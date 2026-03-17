// discovery.ts
import { Bonjour } from 'bonjour-service';
import { AGENT_DEFAULT_PORT } from '@ardudeck/companion-types';

let instance: Bonjour | null = null;

export function startDiscovery(port: number = AGENT_DEFAULT_PORT, hostname: string): void {
  if (instance) return;
  instance = new Bonjour();
  instance.publish({
    name: `ardudeck-agent-${hostname}`,
    type: 'ardudeck-agent',
    port,
    txt: { version: '1' },
  });
  console.log(`[discovery] mDNS broadcasting on _ardudeck-agent._tcp port ${port}`);
}

export function stopDiscovery(): void {
  if (instance) {
    instance.unpublishAll();
    instance.destroy();
    instance = null;
  }
}
