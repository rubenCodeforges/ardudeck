/**
 * Companion Discovery
 * Finds ArduDeck Agent instances on the network via mDNS
 */

import type { CompanionDiscoveryResult } from '../../shared/ipc-channels.js';
import { AGENT_DEFAULT_PORT } from '@ardudeck/companion-types';

interface BonjourBrowser {
  start(): void;
  stop(): void;
  on(event: string, callback: (...args: unknown[]) => void): void;
}

interface BonjourService {
  name: string;
  host: string;
  port: number;
  addresses: string[];
}

let bonjourInstance: { find: (opts: { type: string; protocol: string }) => BonjourBrowser; destroy: () => void } | null = null;
let activeBrowser: BonjourBrowser | null = null;

/**
 * Start mDNS discovery for ArduDeck Agent instances.
 * Calls onFound for each discovered agent.
 */
export function startDiscovery(
  onFound: (result: CompanionDiscoveryResult) => void,
): void {
  stopDiscovery();

  try {
    // Dynamic import — bonjour-service is optional
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Bonjour } = require('bonjour-service');
    bonjourInstance = new Bonjour();
    activeBrowser = bonjourInstance!.find({ type: 'ardudeck-agent', protocol: 'tcp' });
    activeBrowser!.on('up', (service: BonjourService) => {
      const host = service.addresses?.[0] ?? service.host;
      onFound({
        host,
        port: service.port,
        hostname: service.name,
        source: 'mdns',
      });
    });
    activeBrowser!.start();
  } catch {
    // bonjour-service not available — mDNS discovery disabled
    console.warn('mDNS discovery unavailable: bonjour-service not installed');
  }
}

/**
 * Stop mDNS discovery and clean up.
 */
export function stopDiscovery(): void {
  if (activeBrowser) {
    activeBrowser.stop();
    activeBrowser = null;
  }
  if (bonjourInstance) {
    bonjourInstance.destroy();
    bonjourInstance = null;
  }
}

/**
 * Probe a specific host:port to check if an ArduDeck Agent is running.
 * Used for manual IP entry and MAVLink hint discovery.
 */
export async function probeAgent(
  host: string,
  port: number = AGENT_DEFAULT_PORT,
): Promise<CompanionDiscoveryResult | null> {
  try {
    const url = `http://${host}:${port}/api/v1/info`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (res.ok) {
      const info = await res.json() as { hostname: string };
      return {
        host,
        port,
        hostname: info.hostname ?? host,
        source: 'manual',
      };
    }
  } catch {
    // Not reachable
  }
  return null;
}
