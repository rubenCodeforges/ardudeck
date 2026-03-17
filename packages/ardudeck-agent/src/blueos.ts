// blueos.ts
import type { ExtensionInfo, AvailableExtension } from '@ardudeck/companion-types';

const BLUEOS_BASE = 'http://localhost';

export async function isBlueOSAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${BLUEOS_BASE}/version/info`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function getBlueOSVersion(): Promise<string> {
  const res = await fetch(`${BLUEOS_BASE}/version/info`);
  const data = await res.json() as Record<string, unknown>;
  return String(data.version || 'unknown');
}

export async function listInstalledExtensions(): Promise<ExtensionInfo[]> {
  const res = await fetch(`${BLUEOS_BASE}/kraken/v1.0/installed_extensions`);
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data.map(mapExtension) : [];
}

export async function listAvailableExtensions(): Promise<AvailableExtension[]> {
  const res = await fetch(`${BLUEOS_BASE}/kraken/v1.0/available_extensions`);
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function installExtension(identifier: string, version: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${BLUEOS_BASE}/kraken/v1.0/extension/install`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, tag: version }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { success: false, error: text };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function removeExtension(identifier: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${BLUEOS_BASE}/kraken/v1.0/extension/${encodeURIComponent(identifier)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const text = await res.text();
      return { success: false, error: text };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function getExtensionLogs(identifier: string): Promise<string> {
  const res = await fetch(`${BLUEOS_BASE}/kraken/v1.0/extension/${encodeURIComponent(identifier)}/logs`);
  if (!res.ok) return '';
  return res.text();
}

export async function getNetworkServices(): Promise<unknown[]> {
  const res = await fetch(`${BLUEOS_BASE}/beacon/v1.0/services`);
  if (!res.ok) return [];
  return res.json() as Promise<unknown[]>;
}

function mapExtension(data: Record<string, unknown>): ExtensionInfo {
  return {
    identifier: String(data.identifier || ''),
    name: String(data.name || ''),
    description: String(data.description || ''),
    version: String(data.tag || data.version || ''),
    enabled: data.enabled !== false,
    docker_image: String(data.docker || data.docker_image || ''),
  };
}
