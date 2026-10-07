import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Same shape as the desktop app's ParamValuePayload, so the app can bulk-load it as-is. */
export interface CachedParam {
  paramId: string;
  paramValue: number;
  paramType: number;
  paramIndex: number;
  defaultValue?: number;
}

export interface ParamSnapshot {
  uid: string;
  firmwareVersion: string | null;
  /** When a full download last completed (ms since epoch), or null if never. */
  fetchedAt: number | null;
  /** Last time any value changed, including live PARAM_VALUE updates. */
  updatedAt: number;
  /** True once every index 0..paramCount-1 is present. */
  complete: boolean;
  source: 'ftp' | 'list' | 'stream';
  paramCount: number;
  params: CachedParam[];
}

const SAVE_DEBOUNCE_MS = 2000;

/**
 * Per-vehicle parameter store, keyed by board UID and persisted as JSON so a
 * vehicle seen yesterday opens with its parameters before any download.
 * Live PARAM_VALUE traffic from any GCS on the link keeps it current.
 */
export class ParamCache {
  private readonly snapshots = new Map<string, Map<string, CachedParam>>();
  private readonly meta = new Map<string, Omit<ParamSnapshot, 'params' | 'complete'>>();
  private readonly saveTimers = new Map<string, NodeJS.Timeout>();

  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true });
  }

  /** Snapshot for a vehicle, loading it from disk on first access. */
  get(uid: string): ParamSnapshot | null {
    if (!this.snapshots.has(uid)) this.loadFromDisk(uid);
    const params = this.snapshots.get(uid);
    const meta = this.meta.get(uid);
    if (!params || !meta) return null;
    const list = [...params.values()].sort((a, b) => a.paramIndex - b.paramIndex);
    return { ...meta, params: list, complete: this.isComplete(uid) };
  }

  /** Replace everything with a finished download. */
  replaceAll(uid: string, params: CachedParam[], paramCount: number, source: 'ftp' | 'list', firmwareVersion: string | null, now = Date.now()): void {
    const map = new Map<string, CachedParam>();
    for (const p of params) map.set(p.paramId, p);
    this.snapshots.set(uid, map);
    this.meta.set(uid, { uid, firmwareVersion, fetchedAt: now, updatedAt: now, source, paramCount });
    this.scheduleSave(uid);
  }

  /** Apply one PARAM_VALUE seen on the link (our own download, or another GCS's). */
  applyValue(uid: string, p: CachedParam & { paramCount: number }, firmwareVersion: string | null, now = Date.now()): void {
    if (!this.snapshots.has(uid)) this.loadFromDisk(uid);
    let map = this.snapshots.get(uid);
    if (!map) {
      map = new Map();
      this.snapshots.set(uid, map);
      this.meta.set(uid, { uid, firmwareVersion, fetchedAt: null, updatedAt: now, source: 'stream', paramCount: p.paramCount });
    }
    const prev = map.get(p.paramId);
    // PARAM_VALUE answers to PARAM_SET carry index 65535; keep the known index.
    const paramIndex = p.paramIndex === 0xffff && prev ? prev.paramIndex : p.paramIndex;
    map.set(p.paramId, { paramId: p.paramId, paramValue: p.paramValue, paramType: p.paramType, paramIndex, defaultValue: prev?.defaultValue });
    const meta = this.meta.get(uid)!;
    meta.updatedAt = now;
    if (p.paramCount > 0 && p.paramCount !== 0xffff) meta.paramCount = p.paramCount;
    if (firmwareVersion) meta.firmwareVersion = firmwareVersion;
    this.scheduleSave(uid);
  }

  /** Indices still missing for a complete set. */
  missingIndices(uid: string): number[] {
    const map = this.snapshots.get(uid);
    const meta = this.meta.get(uid);
    if (!map || !meta) return [];
    const have = new Set<number>();
    for (const p of map.values()) have.add(p.paramIndex);
    const missing: number[] = [];
    for (let i = 0; i < meta.paramCount; i++) if (!have.has(i)) missing.push(i);
    return missing;
  }

  markFetched(uid: string, source: 'ftp' | 'list', now = Date.now()): void {
    const meta = this.meta.get(uid);
    if (!meta) return;
    meta.fetchedAt = now;
    meta.source = source;
    this.scheduleSave(uid);
  }

  /** Drop in-memory state for a uid (used when a download restarts from scratch). */
  reset(uid: string): void {
    this.snapshots.delete(uid);
    this.meta.delete(uid);
  }

  flush(): void {
    for (const uid of [...this.saveTimers.keys()]) this.save(uid);
  }

  private isComplete(uid: string): boolean {
    const meta = this.meta.get(uid);
    return !!meta && meta.paramCount > 0 && this.missingIndices(uid).length === 0;
  }

  private file(uid: string): string {
    return join(this.dir, `${uid.replace(/[^A-Za-z0-9_.-]/g, '_')}.json`);
  }

  private loadFromDisk(uid: string): void {
    try {
      const snap = JSON.parse(readFileSync(this.file(uid), 'utf8')) as ParamSnapshot;
      const map = new Map<string, CachedParam>();
      for (const p of snap.params) map.set(p.paramId, p);
      this.snapshots.set(uid, map);
      const { params: _params, complete: _complete, ...meta } = snap;
      this.meta.set(uid, meta);
    } catch {
      // No cache yet, or unreadable: start fresh.
    }
  }

  private scheduleSave(uid: string): void {
    if (this.saveTimers.has(uid)) return;
    this.saveTimers.set(uid, setTimeout(() => this.save(uid), SAVE_DEBOUNCE_MS));
  }

  private save(uid: string): void {
    const timer = this.saveTimers.get(uid);
    if (timer) clearTimeout(timer);
    this.saveTimers.delete(uid);
    const snap = this.get(uid);
    if (!snap) return;
    const path = this.file(uid);
    writeFileSync(`${path}.tmp`, JSON.stringify(snap));
    renameSync(`${path}.tmp`, path);
  }
}
