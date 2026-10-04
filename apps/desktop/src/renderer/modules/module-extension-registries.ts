import type {
  BoardPortLabel, ConfigCardRegistration, ConfigCardSlot, DetectedHardware, DroneCanNodeProfile, FirmwareSourceRegistration, HardwareProduct,
} from '@ardudeck/module-sdk';
import type { ComponentType } from 'react';
import type { DroneCanNode } from '../../shared/dronecan-types.js';
import { createSlugRegistry, type SlugEntry } from './slug-registry';

export const configCardRegistry = createSlugRegistry<ConfigCardRegistration>();
export const hardwareCatalogRegistry = createSlugRegistry<HardwareProduct[]>();
export const firmwareSourceRegistry = createSlugRegistry<FirmwareSourceRegistration>();
export const boardPortRegistry = createSlugRegistry<{ boardId: number; ports: BoardPortLabel[] }>();
export const nodeProfileRegistry = createSlugRegistry<DroneCanNodeProfile>();

export function boardPortLabel(entries: SlugEntry<{ boardId: number; ports: BoardPortLabel[] }>[], boardId: number | undefined, serial: number): BoardPortLabel | undefined {
  if (boardId === undefined) return undefined;
  for (const e of entries) if (e.value.boardId === boardId) return e.value.ports.find((p) => p.serial === serial);
  return undefined;
}

export function matchUsbProduct(
  catalogs: SlugEntry<HardwareProduct[]>[],
  port: { vendorId?: string; productId?: string; manufacturer?: string },
): (HardwareProduct & { moduleSlug: string }) | undefined {
  if (!port.vendorId || !port.productId) return undefined;
  const vid = parseInt(port.vendorId, 16);
  const pid = parseInt(port.productId, 16);
  for (const { slug, value } of catalogs) {
    for (const product of value) {
      const u = product.match.usb;
      if (!u || u.vendorId !== vid || u.productId !== pid) continue;
      if (u.manufacturer && u.manufacturer !== port.manufacturer) continue;
      return { ...product, moduleSlug: slug };
    }
  }
  return undefined;
}

export const CONFIG_CARD_SLOTS: readonly ConfigCardSlot[] = ['notify', 'gps', 'hardware'];

export function cardsForSlot(entries: SlugEntry<ConfigCardRegistration>[], slot: ConfigCardSlot): SlugEntry<ConfigCardRegistration>[] {
  return entries.filter((e) => e.value.slot === slot).sort((a, b) => (a.value.order ?? 0) - (b.value.order ?? 0));
}

function nameMatches(pattern: string, name: string): boolean {
  return pattern.endsWith('*') ? name.startsWith(pattern.slice(0, -1)) : name === pattern;
}

export function profilesForNode(entries: SlugEntry<DroneCanNodeProfile>[], name: string | undefined): SlugEntry<DroneCanNodeProfile>[] {
  return name ? entries.filter((e) => nameMatches(e.value.match, name)) : [];
}

export function matchProduct(
  catalogs: SlugEntry<HardwareProduct[]>[],
  probe: { dronecanNodeName?: string; boardId?: number },
): (HardwareProduct & { moduleSlug: string }) | undefined {
  for (const { slug, value } of catalogs) {
    for (const product of value) {
      const m = product.match;
      if (m.dronecanNodeName && probe.dronecanNodeName && nameMatches(m.dronecanNodeName, probe.dronecanNodeName)) {
        return { ...product, moduleSlug: slug };
      }
      if (m.boardId !== undefined && probe.boardId !== undefined && m.boardId === probe.boardId) {
        return { ...product, moduleSlug: slug };
      }
    }
  }
  return undefined;
}

export function detectHardware(
  catalogs: SlugEntry<HardwareProduct[]>[],
  board: { name?: string; boardVersion?: number } | null,
  nodes: DroneCanNode[],
): DetectedHardware[] {
  const out: DetectedHardware[] = [];
  if (board) {
    const boardId = board.boardVersion ? board.boardVersion >>> 16 : undefined;
    out.push({
      source: 'flight-controller',
      reportedName: board.name ?? '',
      ...(boardId !== undefined ? { boardId } : {}),
      product: matchProduct(catalogs, { boardId }),
    });
  }
  for (const node of nodes) {
    out.push({
      source: 'dronecan',
      reportedName: node.name ?? '',
      nodeId: node.nodeId,
      product: node.name ? matchProduct(catalogs, { dronecanNodeName: node.name }) : undefined,
    });
  }
  return out;
}

/** Bodies of cargo-unlocked nav views (host.views), keyed by view id. */
export const viewBodyRegistry = createSlugRegistry<ComponentType>();
