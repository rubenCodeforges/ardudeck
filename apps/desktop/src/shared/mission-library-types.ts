/**
 * Mission Library Types
 * Shared types for mission storage, flight logs, and provider interface.
 */

import type { MissionItem } from './mission-types';
import type { Group } from './mission-group-types';

/**
 * Current mission file format version.
 * v1 = legacy (no `version` field on disk, no groups, flat WP list)
 * v2 = groups added; every WP has groupId; mission file carries Group[].
 */
export const MISSION_FILE_VERSION = 2 as const;

// =============================================================================
// Status Tracking
// =============================================================================

export type FlightStatus = 'planned' | 'in_progress' | 'completed' | 'aborted';
export type AbortReason = 'battery_low' | 'airspace' | 'manual' | 'weather' | 'other';

// =============================================================================
// Mission Summary (lightweight, kept in memory)
// =============================================================================

export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export interface MissionSummary {
  id: string;
  name: string;
  description: string;
  /** Project/site this mission belongs to, matching the vault's sites/<site>. */
  site?: string;
  vehicleProfileId: string | null;
  tags: string[];
  waypointCount: number;
  totalDistanceMeters: number;
  boundingBox: BoundingBox | null;
  flightCount: number;
  lastFlightStatus: FlightStatus | null;
  createdAt: string; // ISO 8601
  updatedAt: string;
}

// =============================================================================
// Full Stored Mission (loaded on demand)
// =============================================================================

export interface StoredMission extends MissionSummary {
  /**
   * On-disk schema version. Older files (no `version` field) are treated as
   * v1 and migrated to v2 by `migrateStoredMission` at load time.
   */
  version?: number;
  /**
   * Ordered list of groups. Every waypoint in `items` references one of
   * these by `groupId`. For migrated v1 files this is a single auto-created
   * Manual group.
   */
  groups: Group[];
  items: MissionItem[];
  homePosition: { lat: number; lon: number; alt: number } | null;
}

// =============================================================================
// Camera Event
// =============================================================================

export interface CameraEvent {
  timestamp: string;
  latitude: number;
  longitude: number;
  altitude: number;
  imageIndex: number;
}

// =============================================================================
// Flight Log
// =============================================================================

export interface FlightLog {
  id: string;
  missionId: string;
  status: FlightStatus;
  abortReason: AbortReason | null;
  lastWaypointReached: number | null;
  notes: string;
  startedAt: string | null;
  endedAt: string | null;
  cameraEvents: CameraEvent[];
  createdAt: string;
}

// =============================================================================
// Save Payload (renderer -> main)
// =============================================================================

export interface SaveMissionPayload {
  name: string;
  description: string;
  site?: string;
  vehicleProfileId: string | null;
  tags: string[];
  /**
   * Optional during the structural rollout. If omitted (legacy callers), the
   * provider auto-creates a single Manual group and assigns every item to
   * it on save. New callers should always supply groups.
   */
  groups?: Group[];
  items: MissionItem[];
  homePosition: { lat: number; lon: number; alt: number } | null;
  existingId?: string; // If set, update existing mission
}

// =============================================================================
// Filter & Sort
// =============================================================================

export interface MissionListFilter {
  search?: string;
  vehicleProfileId?: string | null;
  tags?: string[];
  status?: FlightStatus;
}

export type MissionSortField = 'name' | 'createdAt' | 'updatedAt' | 'waypointCount' | 'totalDistanceMeters' | 'flightCount';
export type MissionSortDirection = 'asc' | 'desc';

export interface MissionSortOptions {
  field: MissionSortField;
  direction: MissionSortDirection;
}

// =============================================================================
// Provider Interface (swappable backend)
// =============================================================================

export interface MissionLibraryProvider {
  initialize(): void;
  listMissions(filter?: MissionListFilter, sort?: MissionSortOptions): Promise<MissionSummary[]>;
  getMission(id: string): Promise<StoredMission | null>;
  saveMission(payload: SaveMissionPayload): Promise<MissionSummary>;
  deleteMission(id: string): Promise<boolean>;
  duplicateMission(id: string, newName: string): Promise<MissionSummary | null>;
  getFlightLogs(missionId: string): Promise<FlightLog[]>;
  addFlightLog(log: Omit<FlightLog, 'id' | 'createdAt'>): Promise<FlightLog>;
  updateFlightLog(log: FlightLog): Promise<FlightLog>;
  deleteFlightLog(missionId: string, logId: string): Promise<boolean>;
  getAllTags(): Promise<string[]>;
}

/**
 * Validate a mission file that came from disk, a repo or another machine.
 * Items and groups stay loosely typed here; the mission store and migration
 * own their shapes, and a file that gets this far is one of ours.
 */
export function isStoredMission(value: unknown): value is StoredMission {
  if (typeof value !== 'object' || value === null) return false;
  const m = value as Partial<StoredMission>;
  if (typeof m.id !== 'string' || m.id.length === 0) return false;
  if (typeof m.name !== 'string') return false;
  if (!Array.isArray(m.items)) return false;
  if (m.groups !== undefined && !Array.isArray(m.groups)) return false;
  return true;
}
