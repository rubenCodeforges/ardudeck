import type { MissionItem } from './mission-types.js';
import type { Group } from './mission-group-types.js';
import type { FenceItem } from './fence-types.js';
import type { RallyPoint } from './rally-types.js';

export const MISSION_PACKAGE_FORMAT = 'ardudeck-mission';
export const MISSION_PACKAGE_VERSION = 1;
export const MISSION_PACKAGE_EXT = 'ardudeck-mission';

export interface ShareIdentity {
  /** Stable per install, so "shared by me" survives a renamed login. */
  id: string;
  name: string;
}

export interface MissionPackage {
  format: typeof MISSION_PACKAGE_FORMAT;
  version: number;
  /** Stable across re-shares of the same mission, so a new version replaces the old one. */
  id: string;
  name: string;
  sharedBy: ShareIdentity;
  sharedAt: number;
  note?: string;
  mission: {
    items: MissionItem[];
    groups?: Group[];
    home: { lat: number; lon: number; alt: number } | null;
  };
  fence?: FenceItem[] | null;
  rally?: RallyPoint[] | null;
  vehicleProfile?: { name: string; cruiseSpeedMs: number; enduranceSec: number } | null;
}

export function isMissionPackage(x: unknown): x is MissionPackage {
  if (!x || typeof x !== 'object') return false;
  const p = x as Partial<MissionPackage>;
  return p.format === MISSION_PACKAGE_FORMAT
    && typeof p.version === 'number'
    && typeof p.id === 'string'
    && typeof p.name === 'string'
    && !!p.sharedBy && typeof p.sharedBy.id === 'string' && typeof p.sharedBy.name === 'string'
    && typeof p.sharedAt === 'number'
    && !!p.mission && Array.isArray(p.mission.items);
}

/** A shared version that came in on a vault sync, with where it lives in the vault. */
export interface IncomingShare {
  path: string;
  site: string;
  pkg: MissionPackage;
}

export interface MissionDiff {
  moved: number;
  added: number;
  removed: number;
  unchanged: boolean;
}

/** Items that differ by position (more than ~0.5 m) or altitude (more than 0.5 m), by sequence. */
export function diffMissionItems(mine: readonly MissionItem[], theirs: readonly MissionItem[]): MissionDiff {
  let moved = 0;
  const n = Math.min(mine.length, theirs.length);
  for (let i = 0; i < n; i++) {
    const a = mine[i]!;
    const b = theirs[i]!;
    const dLat = (a.latitude - b.latitude) * 111_320;
    const dLon = (a.longitude - b.longitude) * 111_320 * Math.cos((a.latitude * Math.PI) / 180);
    if (a.command !== b.command || Math.hypot(dLat, dLon) > 0.5 || Math.abs(a.altitude - b.altitude) > 0.5) moved++;
  }
  const added = Math.max(0, theirs.length - mine.length);
  const removed = Math.max(0, mine.length - theirs.length);
  return { moved, added, removed, unchanged: moved === 0 && added === 0 && removed === 0 };
}
