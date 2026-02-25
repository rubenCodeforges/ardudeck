/**
 * Mission Library Types
 * Shared types for mission storage, flight logs, and provider interface.
 */

import type { MissionItem } from './mission-types';

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
  vehicleProfileId: string | null;
  tags: string[];
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
