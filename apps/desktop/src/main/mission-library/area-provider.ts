/**
 * Saved survey areas on disk, next to the mission library.
 *
 *   {userData}/mission-library/areas-index.json   SurveyDocumentSummary[]
 *   {userData}/mission-library/areas/{uuid}.json  the full SurveyDocument
 *
 * One file per area, pretty-printed, so the same directory can be a git
 * working tree and a revision reads as a diff rather than a blob.
 */

import { app } from 'electron';
import { join } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync } from 'fs';
import { randomUUID } from 'crypto';
import {
  composeSurveyDocument,
  isSurveyDocument,
  normalizeSurveyDocument,
  summarizeSurveyDocument,
  type SaveSurveyAreaPayload,
  type SurveyDocument,
  type SurveyDocumentSummary,
} from '../../shared/survey-document-types.js';

export interface SurveyAreaFilter {
  search?: string;
  tags?: string[];
  site?: string;
}

export class LocalSurveyAreaProvider {
  private baseDir: string;
  private indexPath: string;
  private areasDir: string;
  private index: SurveyDocumentSummary[] = [];

  constructor() {
    this.baseDir = join(app.getPath('userData'), 'mission-library');
    this.indexPath = join(this.baseDir, 'areas-index.json');
    this.areasDir = join(this.baseDir, 'areas');
  }

  initialize(): void {
    if (!existsSync(this.baseDir)) mkdirSync(this.baseDir, { recursive: true });
    if (!existsSync(this.areasDir)) mkdirSync(this.areasDir, { recursive: true });
    this.index = this.readIndex();
  }

  private readIndex(): SurveyDocumentSummary[] {
    const stored = readJsonSafe<SurveyDocumentSummary[]>(this.indexPath);
    // An index can be missing (first run) or stale against a folder someone
    // synced in by hand or pulled from git; the files are the truth.
    if (stored && Array.isArray(stored) && stored.length === this.countFiles()) return stored;
    return this.rebuildIndex();
  }

  private countFiles(): number {
    try {
      return readdirSync(this.areasDir).filter((f) => f.endsWith('.json')).length;
    } catch {
      return 0;
    }
  }

  private rebuildIndex(): SurveyDocumentSummary[] {
    const summaries: SurveyDocumentSummary[] = [];
    let files: string[] = [];
    try {
      files = readdirSync(this.areasDir).filter((f) => f.endsWith('.json'));
    } catch {
      return [];
    }
    for (const file of files) {
      const doc = this.readDocument(join(this.areasDir, file));
      if (doc) summaries.push(summarizeSurveyDocument(doc));
    }
    writeJson(this.indexPath, summaries);
    return summaries;
  }

  private readDocument(path: string): SurveyDocument | null {
    const raw = readJsonSafe<unknown>(path);
    if (!isSurveyDocument(raw)) return null;
    return normalizeSurveyDocument(raw);
  }

  private saveIndex(): void {
    writeJson(this.indexPath, this.index);
  }

  private pathFor(id: string): string {
    return join(this.areasDir, `${safeId(id)}.json`);
  }

  async list(filter?: SurveyAreaFilter): Promise<SurveyDocumentSummary[]> {
    let results = [...this.index];
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      results = results.filter((a) =>
        a.name.toLowerCase().includes(q)
        || a.description.toLowerCase().includes(q)
        || a.tags.some((t) => t.toLowerCase().includes(q)));
    }
    if (filter?.tags?.length) {
      results = results.filter((a) => filter.tags!.some((t) => a.tags.includes(t)));
    }
    if (filter?.site) {
      results = results.filter((a) => a.site === filter.site);
    }
    return results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id: string): Promise<SurveyDocument | null> {
    return this.readDocument(this.pathFor(id));
  }

  async save(payload: SaveSurveyAreaPayload): Promise<SurveyDocument> {
    const previous = payload.id ? await this.get(payload.id) : null;
    const doc = composeSurveyDocument(
      payload,
      previous,
      new Date().toISOString(),
      randomUUID,
      app.getVersion(),
    );
    writeJson(this.pathFor(doc.id), doc);
    const summary = summarizeSurveyDocument(doc);
    const at = this.index.findIndex((a) => a.id === doc.id);
    if (at >= 0) this.index[at] = summary;
    else this.index.push(summary);
    this.saveIndex();
    return doc;
  }

  /** Write a document that came from elsewhere (a file, a repo) as it stands. */
  async import(doc: SurveyDocument): Promise<SurveyDocument> {
    const normalized = normalizeSurveyDocument(doc);
    writeJson(this.pathFor(normalized.id), normalized);
    const summary = summarizeSurveyDocument(normalized);
    const at = this.index.findIndex((a) => a.id === normalized.id);
    if (at >= 0) this.index[at] = summary;
    else this.index.push(summary);
    this.saveIndex();
    return normalized;
  }

  async delete(id: string): Promise<boolean> {
    const path = this.pathFor(id);
    if (!existsSync(path)) return false;
    try {
      unlinkSync(path);
    } catch {
      return false;
    }
    this.index = this.index.filter((a) => a.id !== id);
    this.saveIndex();
    return true;
  }

  async duplicate(id: string, newName: string): Promise<SurveyDocument | null> {
    const source = await this.get(id);
    if (!source) return null;
    return this.save({
      name: newName,
      description: source.description,
      tags: source.tags,
      ...(source.site ? { site: source.site } : {}),
      area: source.area,
      preview: source.preview,
    });
  }

  async getAllTags(): Promise<string[]> {
    return [...new Set(this.index.flatMap((a) => a.tags))].sort();
  }
}

/** An id from a file or a repo must never escape the areas directory. */
function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function readJsonSafe<T>(path: string): T | null {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
  } catch {
    return null;
  }
}

function writeJson(path: string, data: unknown): void {
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8');
}
