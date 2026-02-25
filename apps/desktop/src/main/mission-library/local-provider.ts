/**
 * Local Mission Library Provider
 * Stores missions as JSON files in the app's userData directory.
 *
 * Layout:
 *   {userData}/mission-library/
 *     index.json                          - MissionSummary[] (loaded at init)
 *     missions/{uuid}.json                - Full StoredMission (on demand)
 *     flight-logs/{missionId}/{logId}.json - FlightLog per attempt
 */

import { app } from 'electron';
import { join } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync, rmSync } from 'fs';
import { randomUUID } from 'crypto';
import {
  commandHasLocation,
  calculateMissionDistance,
} from '../../shared/mission-types.js';
import type {
  MissionLibraryProvider,
  MissionSummary,
  StoredMission,
  SaveMissionPayload,
  FlightLog,
  MissionListFilter,
  MissionSortOptions,
  BoundingBox,
} from '../../shared/mission-library-types.js';
import type { MissionItem } from '../../shared/mission-types.js';

// =============================================================================
// Helpers
// =============================================================================

function computeBoundingBox(items: MissionItem[]): BoundingBox | null {
  const locItems = items.filter(i => commandHasLocation(i.command) && (i.latitude !== 0 || i.longitude !== 0));
  if (locItems.length === 0) return null;

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;

  for (const item of locItems) {
    if (item.latitude < minLat) minLat = item.latitude;
    if (item.latitude > maxLat) maxLat = item.latitude;
    if (item.longitude < minLon) minLon = item.longitude;
    if (item.longitude > maxLon) maxLon = item.longitude;
  }

  return { minLat, maxLat, minLon, maxLon };
}

function buildSummary(
  id: string,
  payload: SaveMissionPayload,
  now: string,
  existingFlightCount: number,
  existingLastFlightStatus: string | null,
  existingCreatedAt?: string,
): MissionSummary {
  return {
    id,
    name: payload.name,
    description: payload.description,
    vehicleProfileId: payload.vehicleProfileId,
    tags: payload.tags,
    waypointCount: payload.items.length,
    totalDistanceMeters: calculateMissionDistance(payload.items),
    boundingBox: computeBoundingBox(payload.items),
    flightCount: existingFlightCount,
    lastFlightStatus: existingLastFlightStatus as MissionSummary['lastFlightStatus'],
    createdAt: existingCreatedAt ?? now,
    updatedAt: now,
  };
}

function readJsonSafe<T>(path: string): T | null {
  try {
    if (!existsSync(path)) return null;
    const raw = readFileSync(path, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(path: string, data: unknown): void {
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8');
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

// =============================================================================
// Local Provider
// =============================================================================

export class LocalMissionLibraryProvider implements MissionLibraryProvider {
  private baseDir: string;
  private indexPath: string;
  private missionsDir: string;
  private logsDir: string;
  private index: MissionSummary[] = [];

  constructor() {
    this.baseDir = join(app.getPath('userData'), 'mission-library');
    this.indexPath = join(this.baseDir, 'index.json');
    this.missionsDir = join(this.baseDir, 'missions');
    this.logsDir = join(this.baseDir, 'flight-logs');
  }

  initialize(): void {
    ensureDir(this.baseDir);
    ensureDir(this.missionsDir);
    ensureDir(this.logsDir);

    this.index = readJsonSafe<MissionSummary[]>(this.indexPath) ?? [];
  }

  private saveIndex(): void {
    writeJson(this.indexPath, this.index);
  }

  // ---------------------------------------------------------------------------
  // Missions
  // ---------------------------------------------------------------------------

  async listMissions(filter?: MissionListFilter, sort?: MissionSortOptions): Promise<MissionSummary[]> {
    let results = [...this.index];

    // Apply filters
    if (filter) {
      if (filter.search) {
        const q = filter.search.toLowerCase();
        results = results.filter(m =>
          m.name.toLowerCase().includes(q) ||
          m.description.toLowerCase().includes(q) ||
          m.tags.some(t => t.toLowerCase().includes(q))
        );
      }
      if (filter.vehicleProfileId !== undefined) {
        results = results.filter(m => m.vehicleProfileId === filter.vehicleProfileId);
      }
      if (filter.tags && filter.tags.length > 0) {
        results = results.filter(m =>
          filter.tags!.some(t => m.tags.includes(t))
        );
      }
      if (filter.status) {
        results = results.filter(m => m.lastFlightStatus === filter.status);
      }
    }

    // Apply sort
    const field = sort?.field ?? 'updatedAt';
    const dir = sort?.direction ?? 'desc';
    results.sort((a, b) => {
      const aVal = a[field];
      const bVal = b[field];
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return dir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      const aNum = (aVal as number) ?? 0;
      const bNum = (bVal as number) ?? 0;
      return dir === 'asc' ? aNum - bNum : bNum - aNum;
    });

    return results;
  }

  async getMission(id: string): Promise<StoredMission | null> {
    const missionPath = join(this.missionsDir, `${id}.json`);
    return readJsonSafe<StoredMission>(missionPath);
  }

  async saveMission(payload: SaveMissionPayload): Promise<MissionSummary> {
    const now = new Date().toISOString();
    const isUpdate = !!payload.existingId;
    const id = payload.existingId ?? randomUUID();

    // Get existing data for update
    let existingFlightCount = 0;
    let existingLastFlightStatus: string | null = null;
    let existingCreatedAt: string | undefined;

    if (isUpdate) {
      const existing = this.index.find(m => m.id === id);
      if (existing) {
        existingFlightCount = existing.flightCount;
        existingLastFlightStatus = existing.lastFlightStatus;
        existingCreatedAt = existing.createdAt;
      }
    }

    const summary = buildSummary(id, payload, now, existingFlightCount, existingLastFlightStatus, existingCreatedAt);

    // Write full mission file
    const storedMission: StoredMission = {
      ...summary,
      items: payload.items,
      homePosition: payload.homePosition,
    };
    writeJson(join(this.missionsDir, `${id}.json`), storedMission);

    // Update index
    if (isUpdate) {
      const idx = this.index.findIndex(m => m.id === id);
      if (idx >= 0) {
        this.index[idx] = summary;
      } else {
        this.index.push(summary);
      }
    } else {
      this.index.push(summary);
    }
    this.saveIndex();

    return summary;
  }

  async deleteMission(id: string): Promise<boolean> {
    const idx = this.index.findIndex(m => m.id === id);
    if (idx < 0) return false;

    this.index.splice(idx, 1);
    this.saveIndex();

    // Delete mission file
    const missionPath = join(this.missionsDir, `${id}.json`);
    if (existsSync(missionPath)) unlinkSync(missionPath);

    // Delete flight logs directory
    const logDir = join(this.logsDir, id);
    if (existsSync(logDir)) rmSync(logDir, { recursive: true });

    return true;
  }

  async duplicateMission(id: string, newName: string): Promise<MissionSummary | null> {
    const original = await this.getMission(id);
    if (!original) return null;

    return this.saveMission({
      name: newName,
      description: original.description,
      vehicleProfileId: original.vehicleProfileId,
      tags: [...original.tags],
      items: original.items,
      homePosition: original.homePosition,
    });
  }

  // ---------------------------------------------------------------------------
  // Flight Logs
  // ---------------------------------------------------------------------------

  async getFlightLogs(missionId: string): Promise<FlightLog[]> {
    const logDir = join(this.logsDir, missionId);
    if (!existsSync(logDir)) return [];

    const files = readdirSync(logDir).filter(f => f.endsWith('.json'));
    const logs: FlightLog[] = [];

    for (const file of files) {
      const log = readJsonSafe<FlightLog>(join(logDir, file));
      if (log) logs.push(log);
    }

    // Sort by createdAt descending (newest first)
    logs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return logs;
  }

  async addFlightLog(log: Omit<FlightLog, 'id' | 'createdAt'>): Promise<FlightLog> {
    const logDir = join(this.logsDir, log.missionId);
    ensureDir(logDir);

    const fullLog: FlightLog = {
      ...log,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };

    writeJson(join(logDir, `${fullLog.id}.json`), fullLog);

    // Update index summary
    this.updateMissionFlightSummary(log.missionId);

    return fullLog;
  }

  async updateFlightLog(log: FlightLog): Promise<FlightLog> {
    const logPath = join(this.logsDir, log.missionId, `${log.id}.json`);
    writeJson(logPath, log);

    // Update index summary
    this.updateMissionFlightSummary(log.missionId);

    return log;
  }

  async deleteFlightLog(missionId: string, logId: string): Promise<boolean> {
    const logPath = join(this.logsDir, missionId, `${logId}.json`);
    if (!existsSync(logPath)) return false;

    unlinkSync(logPath);

    // Update index summary
    this.updateMissionFlightSummary(missionId);

    return true;
  }

  // ---------------------------------------------------------------------------
  // Tags
  // ---------------------------------------------------------------------------

  async getAllTags(): Promise<string[]> {
    const tagSet = new Set<string>();
    for (const m of this.index) {
      for (const t of m.tags) tagSet.add(t);
    }
    return Array.from(tagSet).sort();
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private updateMissionFlightSummary(missionId: string): void {
    const idx = this.index.findIndex(m => m.id === missionId);
    if (idx < 0) return;

    const logDir = join(this.logsDir, missionId);
    if (!existsSync(logDir)) {
      this.index[idx] = { ...this.index[idx]!, flightCount: 0, lastFlightStatus: null };
      this.saveIndex();
      return;
    }

    const files = readdirSync(logDir).filter(f => f.endsWith('.json'));
    let latestLog: FlightLog | null = null;

    for (const file of files) {
      const log = readJsonSafe<FlightLog>(join(logDir, file));
      if (log && (!latestLog || log.createdAt > latestLog.createdAt)) {
        latestLog = log;
      }
    }

    this.index[idx] = {
      ...this.index[idx]!,
      flightCount: files.length,
      lastFlightStatus: latestLog?.status ?? null,
    };
    this.saveIndex();
  }
}
