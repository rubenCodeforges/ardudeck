/**
 * Portable survey documents: a survey area that lives on its own, not inside
 * one mission.
 *
 * A survey's value is the polygon and the generator settings, not the
 * waypoints those produce. Stored as a mission, the area can only be reopened
 * as part of that mission; exported as .waypoints or KML, the settings are
 * gone and only a shape or a flat list survives. This document carries
 * everything the generator consumes, so the same area can be opened, edited
 * and regenerated on another machine, and diffed in git as text.
 *
 * Waypoints are deliberately absent: they are derived, and storing them would
 * let a file disagree with itself.
 */

import type { BoundingBox } from './mission-library-types';
import type { SurveyGroup } from './mission-group-types';

export const SURVEY_DOCUMENT_KIND = 'ardudeck.survey';
export const SURVEY_DOCUMENT_VERSION = 1;

export interface SurveyLatLng {
  lat: number;
  lng: number;
}

/** Exactly the inputs a generator consumes, in the generator's own schema. */
export interface SurveyDocumentArea {
  generatorId: string;
  generatorVersion: string;
  polygon: SurveyLatLng[];
  holes?: SurveyLatLng[][];
  workspace?: SurveyLatLng[];
  config: Record<string, unknown>;
  /**
   * Generator-specific cached extras, opaque here and preserved byte-perfect
   * so a document written with a module installed still opens without it.
   */
  generatorResult: unknown;
}

export interface SurveyDocumentPreview {
  boundingBox: BoundingBox | null;
  /** Square metres, when the writer could compute it. */
  areaSqm: number | null;
  vertexCount: number;
}

export interface SurveyDocument {
  kind: typeof SURVEY_DOCUMENT_KIND;
  version: number;
  /** Stable across edits and machines; what a mission group references. */
  id: string;
  /** Bumped on every save. A mission records the revision it was built from. */
  revision: number;
  name: string;
  description: string;
  tags: string[];
  /** Vault site folder this area belongs to, when it came from or goes to one. */
  site?: string;
  createdAt: string;
  updatedAt: string;
  appVersion?: string;
  area: SurveyDocumentArea;
  preview: SurveyDocumentPreview;
}

/** Row in the browser: everything a card shows without opening the file. */
export interface SurveyDocumentSummary {
  id: string;
  name: string;
  description: string;
  tags: string[];
  site?: string;
  generatorId: string;
  revision: number;
  preview: SurveyDocumentPreview;
  createdAt: string;
  updatedAt: string;
}

export function surveyBoundingBox(polygon: readonly SurveyLatLng[]): BoundingBox | null {
  if (polygon.length === 0) return null;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const p of polygon) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLon) minLon = p.lng;
    if (p.lng > maxLon) maxLon = p.lng;
  }
  return Number.isFinite(minLat) ? { minLat, maxLat, minLon, maxLon } : null;
}

export interface SurveyDocumentMeta {
  /** Omit for a new document; pass the existing id to save a new revision. */
  id?: string;
  /** Omit to start at 1; pass the previous revision to bump it. */
  previousRevision?: number;
  name: string;
  description?: string;
  tags?: string[];
  site?: string;
  createdAt?: string;
  now: string;
  /** Computed by the caller, which has the geodesy helpers. */
  areaSqm?: number | null;
  appVersion?: string;
  newId: () => string;
}

/** The generator inputs and the card preview, lifted out of a live group. */
export function surveyAreaFromGroup(
  group: SurveyGroup,
  areaSqm?: number | null,
): Pick<SurveyDocument, 'area' | 'preview'> {
  return {
    area: {
      generatorId: group.generatorId,
      generatorVersion: group.generatorVersion,
      polygon: group.polygon.map((p) => ({ lat: p.lat, lng: p.lng })),
      ...(group.holes ? { holes: group.holes.map((h) => h.map((p) => ({ lat: p.lat, lng: p.lng }))) } : {}),
      ...(group.workspace ? { workspace: group.workspace.map((p) => ({ lat: p.lat, lng: p.lng })) } : {}),
      config: group.config,
      generatorResult: group.generatorResult,
    },
    preview: {
      boundingBox: surveyBoundingBox(group.polygon),
      areaSqm: areaSqm ?? null,
      vertexCount: group.polygon.length,
    },
  };
}

export function surveyGroupToDocument(group: SurveyGroup, meta: SurveyDocumentMeta): SurveyDocument {
  return {
    kind: SURVEY_DOCUMENT_KIND,
    version: SURVEY_DOCUMENT_VERSION,
    id: meta.id ?? meta.newId(),
    revision: (meta.previousRevision ?? 0) + 1,
    name: meta.name,
    description: meta.description ?? '',
    tags: meta.tags ?? [],
    ...(meta.site ? { site: meta.site } : {}),
    createdAt: meta.createdAt ?? meta.now,
    updatedAt: meta.now,
    ...(meta.appVersion ? { appVersion: meta.appVersion } : {}),
    ...surveyAreaFromGroup(group, meta.areaSqm),
  };
}

/** What the renderer hands the store; identity and history belong to the store. */
export interface SaveSurveyAreaPayload {
  /** Set to save over an existing area, which bumps its revision. */
  id?: string;
  name: string;
  description?: string;
  tags?: string[];
  site?: string;
  area: SurveyDocumentArea;
  preview: SurveyDocumentPreview;
}

/**
 * Turn a save request into the document that goes on disk. The previous
 * version decides the revision and keeps the original creation date, so a
 * saved area has a history rather than being replaced by a stranger.
 */
export function composeSurveyDocument(
  payload: SaveSurveyAreaPayload,
  previous: SurveyDocument | null,
  now: string,
  newId: () => string,
  appVersion?: string,
): SurveyDocument {
  return {
    kind: SURVEY_DOCUMENT_KIND,
    version: SURVEY_DOCUMENT_VERSION,
    id: previous?.id ?? payload.id ?? newId(),
    revision: (previous?.revision ?? 0) + 1,
    name: payload.name,
    description: payload.description ?? '',
    tags: payload.tags ?? [],
    ...(payload.site ? { site: payload.site } : {}),
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    ...(appVersion ? { appVersion } : {}),
    area: payload.area,
    preview: payload.preview,
  };
}

export interface SurveyGroupFromDocument {
  id: string;
  color: string;
  order: number;
  /** Defaults to the document's name. */
  name?: string;
  now: number;
}

/**
 * Build a mission group from a document. The group starts with no generation
 * signature, so the planner treats it as needing a run: the waypoints are
 * derived and were never part of the file.
 */
export function documentToSurveyGroup(doc: SurveyDocument, opts: SurveyGroupFromDocument): SurveyGroup {
  return {
    id: opts.id,
    name: opts.name ?? doc.name,
    kind: 'survey',
    color: opts.color,
    visible: true,
    collapsed: false,
    order: opts.order,
    createdAt: opts.now,
    updatedAt: opts.now,
    generatorId: doc.area.generatorId,
    generatorVersion: doc.area.generatorVersion,
    polygon: doc.area.polygon.map((p) => ({ lat: p.lat, lng: p.lng })),
    ...(doc.area.holes ? { holes: doc.area.holes.map((h) => h.map((p) => ({ lat: p.lat, lng: p.lng }))) } : {}),
    ...(doc.area.workspace ? { workspace: doc.area.workspace.map((p) => ({ lat: p.lat, lng: p.lng })) } : {}),
    config: { ...doc.area.config },
    lastGeneratedAt: null,
    lastGeneratedSignature: null,
    generatorResult: doc.area.generatorResult,
    source: { docId: doc.id, revision: doc.revision, name: doc.name },
  };
}

export function summarizeSurveyDocument(doc: SurveyDocument): SurveyDocumentSummary {
  return {
    id: doc.id,
    name: doc.name,
    description: doc.description,
    tags: doc.tags,
    ...(doc.site ? { site: doc.site } : {}),
    generatorId: doc.area.generatorId,
    revision: doc.revision,
    preview: doc.preview,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/** A saved area has moved on since this group was built from it. */
export function sourceIsBehind(
  source: SurveyGroup['source'],
  latestRevision: number | undefined,
): boolean {
  if (!source || latestRevision === undefined) return false;
  return latestRevision > source.revision;
}

function isLatLngList(value: unknown): value is SurveyLatLng[] {
  return (
    Array.isArray(value)
    && value.every((p) => typeof p === 'object' && p !== null
      && typeof (p as SurveyLatLng).lat === 'number'
      && typeof (p as SurveyLatLng).lng === 'number')
  );
}

/**
 * Validate a document read from disk, a repo or another machine. Everything
 * here is untrusted input, so the shape is checked rather than assumed; the
 * config and generatorResult blobs stay opaque by design.
 */
export function isSurveyDocument(value: unknown): value is SurveyDocument {
  if (typeof value !== 'object' || value === null) return false;
  const doc = value as Partial<SurveyDocument>;
  if (doc.kind !== SURVEY_DOCUMENT_KIND) return false;
  if (typeof doc.version !== 'number' || doc.version < 1) return false;
  if (typeof doc.id !== 'string' || doc.id.length === 0) return false;
  if (typeof doc.revision !== 'number' || doc.revision < 1) return false;
  if (typeof doc.name !== 'string') return false;
  const area = doc.area as Partial<SurveyDocumentArea> | undefined;
  if (typeof area !== 'object' || area === null) return false;
  if (typeof area.generatorId !== 'string' || area.generatorId.length === 0) return false;
  if (!isLatLngList(area.polygon) || area.polygon.length < 2) return false;
  if (area.holes !== undefined && !(Array.isArray(area.holes) && area.holes.every(isLatLngList))) return false;
  if (area.workspace !== undefined && !isLatLngList(area.workspace)) return false;
  if (typeof area.config !== 'object' || area.config === null) return false;
  return true;
}

/**
 * Fill in what a hand-written or older file may omit, after `isSurveyDocument`
 * has vouched for the parts that cannot be defaulted.
 */
export function normalizeSurveyDocument(doc: SurveyDocument): SurveyDocument {
  const now = new Date().toISOString();
  return {
    ...doc,
    description: typeof doc.description === 'string' ? doc.description : '',
    tags: Array.isArray(doc.tags) ? doc.tags.filter((t): t is string => typeof t === 'string') : [],
    createdAt: typeof doc.createdAt === 'string' ? doc.createdAt : now,
    updatedAt: typeof doc.updatedAt === 'string' ? doc.updatedAt : now,
    area: {
      ...doc.area,
      generatorVersion: typeof doc.area.generatorVersion === 'string' ? doc.area.generatorVersion : '0',
    },
    preview: {
      boundingBox: doc.preview?.boundingBox ?? surveyBoundingBox(doc.area.polygon),
      areaSqm: typeof doc.preview?.areaSqm === 'number' ? doc.preview.areaSqm : null,
      vertexCount: typeof doc.preview?.vertexCount === 'number' ? doc.preview.vertexCount : doc.area.polygon.length,
    },
  };
}
