import {
  copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, watch,
  writeFileSync, type FSWatcher,
} from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import AdmZip from 'adm-zip';
import type { SceneName } from '@ardudeck/module-sdk';
import {
  USER_MODELS_SLUG,
  type UserModel,
  type UserModelFormat,
  type UserModelImportResult,
  type UserModelPlacement,
} from '../../shared/scene-models/user-models.js';
import {
  cityJsonToGlb, parseKmlModels, parsePlacementTable, readGltfGeoreference, type PlacementRow,
} from '../../shared/scene-models/parsers/index.js';
import { tilesetCentre } from '../../shared/scene-models/geodesy.js';
import type { Geoid } from '../../shared/scene-models/geoid.js';
import { registerSceneMesh, unregisterSceneMesh } from '../terrain/scene-mesh-registry.js';
import { t } from '../../shared/i18n/index.js';
import { toRegistration } from './registration.js';
import { ellipsoidToMsl } from './geoid-loader.js';
import { unverifiedCrsCodes, type CrsResolver } from './crs.js';
import { PointCloudError } from './point-cloud.js';
import { convertPointCloud, type PointCloudConverted, type PointCloudJob } from './point-cloud-convert.js';
import { encodePly, readPlyHeader } from './ply.js';

export interface UserModelLibraryDeps {
  baseDir: string;
  geoid: () => Geoid | null;
  resolveCrs: CrsResolver;
  /** Converts LAS/LAZ off the main thread; defaults to running in-process (tests). */
  convertPointCloud?: (job: PointCloudJob) => Promise<PointCloudConverted>;
  onChange: (models: UserModel[]) => void;
  /** Set false in tests to skip fs.watch. */
  watchFs?: boolean;
}

interface IndexFile {
  models: UserModel[];
  watched: string[];
  /** `<entryPath>#<n>` of a watched table row to the model id it keeps across reloads. */
  watchKeys: Record<string, string>;
}

const SCENES: readonly SceneName[] = ['svt', 'mission3d', 'sim', 'logs'];
const RELOAD_DEBOUNCE_MS = 300;

class PilotError extends Error {}

function isUrl(s: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(s) && !/^[a-z]:[\\/]/i.test(s);
}

function inside(base: string, target: string): boolean {
  const b = resolve(base);
  const p = resolve(target);
  return p === b || p.startsWith(b + sep);
}

function lowerName(p: string): string {
  return basename(p).toLowerCase();
}

function stripExt(name: string): string {
  return name.replace(/\.city\.json$/i, '').replace(/\.[^.]+$/, '');
}

function isTilesetJson(json: unknown): boolean {
  const j = json as { asset?: { version?: unknown }; root?: unknown } | null;
  return !!j && typeof j === 'object' && !!j.asset && j.asset.version !== undefined && !!j.root && typeof j.root === 'object';
}

function isCityJson(json: unknown): boolean {
  return !!json && typeof json === 'object' && (json as { type?: unknown }).type === 'CityJSON';
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    throw new PilotError(t('main:userModels.notJson'));
  }
}

function placementEqual(a: UserModelPlacement, b: UserModelPlacement): boolean {
  return a.lat === b.lat && a.lng === b.lng && a.alt === b.alt && a.altitudeMode === b.altitudeMode
    && a.yawDeg === b.yawDeg && a.pitchDeg === b.pitchDeg && a.rollDeg === b.rollDeg && a.scale === b.scale;
}

function finitePlacement(p: UserModelPlacement): boolean {
  return [p.lat, p.lng, p.alt, p.yawDeg, p.pitchDeg, p.rollDeg, p.scale].every((v) => typeof v === 'number' && Number.isFinite(v))
    && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180 && p.scale > 0
    && (p.altitudeMode === 'amsl' || p.altitudeMode === 'agl' || p.altitudeMode === 'clamp');
}

function formatForWatchedFile(file: string): UserModelFormat | null {
  const ext = extname(file).toLowerCase();
  if (ext === '.glb' || ext === '.gltf') return 'gltf';
  if (ext === '.dae') return 'kmz';
  if (ext === '.ply') return 'pointcloud';
  if (ext === '.json') {
    try {
      return isTilesetJson(JSON.parse(readFileSync(file, 'utf-8'))) ? 'tileset' : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Writes each entry under `dir`, refusing names that would land outside it. */
export function extractZipSafely(zipPath: string, dir: string): void {
  const zip = new AdmZip(zipPath);
  for (const e of zip.getEntries()) {
    if (e.isDirectory) continue;
    const target = resolve(dir, e.entryName);
    if (!inside(dir, target) || target === resolve(dir)) continue;
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, e.getData());
  }
}

function walkFiles(dir: string, depth = 6): string[] {
  const out: string[] = [];
  if (depth < 0) return out;
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, d.name);
    if (d.isDirectory()) out.push(...walkFiles(p, depth - 1));
    else if (d.isFile()) out.push(p);
  }
  return out;
}

export function placementTablesIn(dir: string): Array<{ path: string; kind: 'json' | 'csv' | 'geojson' }> {
  const out: Array<{ path: string; kind: 'json' | 'csv' | 'geojson' }> = [];
  for (const name of readdirSync(dir).sort()) {
    const lower = name.toLowerCase();
    const kind = lower === 'models.json' ? 'json' : lower.endsWith('.csv') ? 'csv' : lower.endsWith('.geojson') ? 'geojson' : null;
    if (kind && statSync(join(dir, name)).isFile()) out.push({ path: join(dir, name), kind });
  }
  return out;
}

export class UserModelLibrary {
  private readonly indexPath: string;
  private readonly modelsDir: string;
  private readonly stagingDir: string;
  private models = new Map<string, UserModel>();
  private watched: string[] = [];
  private watchKeys: Record<string, string> = {};
  private mtimes = new Map<string, number>();
  private watchers = new Map<string, FSWatcher>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private readonly deps: UserModelLibraryDeps) {
    this.indexPath = join(deps.baseDir, 'index.json');
    this.modelsDir = join(deps.baseDir, 'models');
    this.stagingDir = join(deps.baseDir, 'staging');
  }

  init(): void {
    mkdirSync(this.modelsDir, { recursive: true });
    rmSync(this.stagingDir, { recursive: true, force: true });
    const idx = this.readIndex();
    for (const m of idx.models) this.models.set(m.id, m);
    this.watched = idx.watched;
    this.watchKeys = idx.watchKeys;
    for (const m of this.models.values()) {
      if (m.origin === 'watch') this.mtimes.set(m.id, this.mtimeOf(m.entryPath));
      this.sync(m);
    }
    for (const dir of this.watched) {
      try {
        if (existsSync(dir)) this.reloadWatched(dir, false);
      } catch (err) {
        console.warn(`[user-models] watched folder ${dir} did not load:`, err);
      }
      this.startWatching(dir);
    }
    this.emit();
  }

  dispose(): void {
    for (const w of this.watchers.values()) w.close();
    this.watchers.clear();
    for (const tm of this.timers.values()) clearTimeout(tm);
    this.timers.clear();
  }

  list(): UserModel[] {
    return [...this.models.values()].sort((a, b) => a.importedAt - b.importedAt);
  }

  listWatched(): string[] {
    return [...this.watched];
  }

  get(id: string): UserModel | undefined {
    return this.models.get(id);
  }

  // ─── Import ───────────────────────────────────────────────────────────────

  async importFiles(paths: string[], dropAt?: { lat: number; lng: number }): Promise<UserModelImportResult> {
    const result: UserModelImportResult = { imported: [], failed: [], needsPlacement: [] };
    for (const p of paths) {
      const before = new Set(unverifiedCrsCodes());
      try {
        await this.importOne(p, dropAt, result);
      } catch (err) {
        result.failed.push({ file: p, error: this.pilotMessage(err) });
      }
      for (const epsg of unverifiedCrsCodes()) {
        if (!before.has(epsg)) (result.warnings ??= []).push({ file: p, message: t('main:userModels.unverifiedCrs', { epsg }) });
      }
    }
    if (result.imported.length > 0) {
      for (const m of result.imported) this.sync(m);
      this.save();
      this.emit();
    }
    return result;
  }

  private pilotMessage(err: unknown): string {
    if (err instanceof PilotError) return err.message;
    return t('main:userModels.readFailed', { reason: err instanceof Error ? err.message : String(err) });
  }

  private async importOne(src: string, dropAt: { lat: number; lng: number } | undefined, result: UserModelImportResult): Promise<void> {
    if (!existsSync(src) || !statSync(src).isFile()) throw new PilotError(t('main:userModels.fileNotFound'));
    const name = lowerName(src);
    const ext = extname(name);
    if (ext === '.glb' || ext === '.gltf') return this.importGltf(src, dropAt, result);
    if (ext === '.kmz') return this.importKmz(src, result);
    if (ext === '.kml') return this.importKml(src, result);
    if (ext === '.zip') return this.importZip(src, dropAt, result);
    if (ext === '.las' || ext === '.laz') return this.importLas(src, result);
    if (ext === '.ply') return this.importPly(src, dropAt, result);
    if (ext === '.json' || ext === '.cityjson') {
      const json = readJson(src);
      if (isTilesetJson(json)) return this.importTileset(src, json, result);
      if (isCityJson(json)) return this.importCityJson(src, json, result);
      throw new PilotError(t('main:userModels.unknownJson'));
    }
    throw new PilotError(t('main:userModels.unsupportedFile'));
  }

  private newModelDir(): { id: string; dir: string } {
    const id = randomUUID();
    const dir = join(this.modelsDir, id);
    mkdirSync(dir, { recursive: true });
    return { id, dir };
  }

  private withDir<T>(dir: string, fn: () => T): T {
    try {
      return fn();
    } catch (err) {
      rmSync(dir, { recursive: true, force: true });
      throw err;
    }
  }

  private async withDirAsync<T>(dir: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      rmSync(dir, { recursive: true, force: true });
      throw err;
    }
  }

  private add(result: UserModelImportResult, m: UserModel): void {
    this.models.set(m.id, m);
    result.imported.push(m);
  }

  private newModel(id: string, fields: Pick<UserModel, 'name' | 'format' | 'entryPath' | 'placement' | 'placedBy'> & Partial<UserModel>): UserModel {
    return { origin: 'library', visible: true, version: 1, importedAt: Date.now(), ...fields, id };
  }

  private msl(lat: number, lng: number, hEll: number): number {
    return ellipsoidToMsl(this.deps.geoid(), lat, lng, hEll);
  }

  private importGltf(src: string, dropAt: { lat: number; lng: number } | undefined, result: UserModelImportResult): void {
    const { id, dir } = this.newModelDir();
    this.withDir(dir, () => {
      const bytes = new Uint8Array(readFileSync(src));
      const entryPath = join(dir, basename(src));
      copyFileSync(src, entryPath);
      if (extname(src).toLowerCase() === '.gltf') this.copyGltfResources(src, dir, bytes);
      const geo = readGltfGeoreference(bytes);
      const base = { yawDeg: 0, pitchDeg: 0, rollDeg: 0, scale: 1 };
      if (geo) {
        this.add(result, this.newModel(id, {
          name: stripExt(basename(src)), format: 'gltf', entryPath, placedBy: 'data',
          placement: { lat: geo.lat, lng: geo.lng, alt: this.msl(geo.lat, geo.lng, geo.hEll), altitudeMode: 'amsl', ...base },
        }));
      } else {
        this.add(result, this.newModel(id, {
          name: stripExt(basename(src)), format: 'gltf', entryPath, placedBy: 'manual',
          placement: { lat: dropAt?.lat ?? 0, lng: dropAt?.lng ?? 0, alt: 0, altitudeMode: 'clamp', ...base },
        }));
        result.needsPlacement.push(id);
      }
    });
  }

  /** Copies the buffers and images a .gltf references, keeping their relative layout. */
  private copyGltfResources(src: string, dir: string, bytes: Uint8Array): void {
    let gltf: { buffers?: Array<{ uri?: string }>; images?: Array<{ uri?: string }> };
    try {
      gltf = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new PilotError(t('main:userModels.notJson'));
    }
    const srcDir = dirname(src);
    const uris = [...(gltf.buffers ?? []), ...(gltf.images ?? [])].map((r) => r?.uri).filter((u): u is string => typeof u === 'string');
    for (const uri of uris) {
      if (uri.startsWith('data:') || isUrl(uri)) continue;
      let rel: string;
      try {
        rel = decodeURIComponent(uri);
      } catch {
        rel = uri;
      }
      const from = resolve(srcDir, rel);
      if (!inside(srcDir, from)) continue;
      if (!existsSync(from)) throw new PilotError(t('main:userModels.missingResource', { file: rel }));
      const to = join(dir, relative(srcDir, from));
      mkdirSync(dirname(to), { recursive: true });
      copyFileSync(from, to);
    }
  }

  private importKmz(src: string, result: UserModelImportResult): void {
    const { id, dir } = this.newModelDir();
    this.withDir(dir, () => {
      try {
        extractZipSafely(src, dir);
      } catch {
        throw new PilotError(t('main:userModels.badArchive'));
      }
      const kmls = walkFiles(dir).filter((f) => f.toLowerCase().endsWith('.kml'));
      const kml = kmls.find((f) => resolve(f) === resolve(dir, 'doc.kml')) ?? kmls.find((f) => lowerName(f) === 'doc.kml') ?? kmls[0];
      if (!kml) throw new PilotError(t('main:userModels.noKmlInKmz'));
      this.addKmlModels(src, kml, dir, id, result);
    });
  }

  private importKml(src: string, result: UserModelImportResult): void {
    const { id, dir } = this.newModelDir();
    this.withDir(dir, () => {
      cpSync(dirname(src), dir, { recursive: true });
      this.addKmlModels(src, join(dir, basename(src)), dir, id, result);
    });
  }

  private addKmlModels(src: string, kmlPath: string, dir: string, firstId: string, result: UserModelImportResult): void {
    const found = parseKmlModels(readFileSync(kmlPath, 'utf-8'));
    if (found.length === 0) throw new PilotError(t('main:userModels.noModelsInKml'));
    let added = 0;
    found.forEach((m, i) => {
      const label = `${basename(src)}: ${m.href}`;
      if (isUrl(m.href)) {
        result.failed.push({ file: label, error: t('main:userModels.remoteHref') });
        return;
      }
      let rel: string;
      try {
        rel = decodeURIComponent(m.href);
      } catch {
        rel = m.href;
      }
      const entryPath = resolve(dirname(kmlPath), rel);
      if (!inside(dir, entryPath) || !existsSync(entryPath)) {
        result.failed.push({ file: label, error: t('main:userModels.missingResource', { file: m.href }) });
        return;
      }
      added++;
      this.add(result, this.newModel(i === 0 ? firstId : randomUUID(), {
        name: m.name || stripExt(basename(entryPath)), format: 'kmz', entryPath, placedBy: 'data', placement: m.placement,
      }));
    });
    if (added === 0) throw new PilotError(t('main:userModels.noModelsInKml'));
  }

  private importTileset(src: string, json: unknown, result: UserModelImportResult): void {
    let centre: ReturnType<typeof tilesetCentre>;
    try {
      centre = tilesetCentre(json as Parameters<typeof tilesetCentre>[0]);
    } catch {
      throw new PilotError(t('main:userModels.tilesetNoPosition'));
    }
    const { id, dir } = this.newModelDir();
    this.withDir(dir, () => {
      cpSync(dirname(src), dir, { recursive: true });
      this.add(result, this.newModel(id, {
        name: basename(dirname(src)) || stripExt(basename(src)), format: 'tileset', entryPath: join(dir, basename(src)), placedBy: 'data',
        placement: {
          lat: centre.lat, lng: centre.lng, alt: this.msl(centre.lat, centre.lng, centre.hEll), altitudeMode: 'amsl',
          yawDeg: 0, pitchDeg: 0, rollDeg: 0, scale: 1,
        },
      }));
    });
  }

  private async importCityJson(src: string, json: unknown, result: UserModelImportResult): Promise<void> {
    let mesh: Awaited<ReturnType<typeof cityJsonToGlb>>;
    try {
      mesh = await cityJsonToGlb(json, this.deps.resolveCrs);
    } catch (err) {
      throw new PilotError(err instanceof Error && err.message ? err.message : t('main:userModels.cityJsonFailed'));
    }
    const { id, dir } = this.newModelDir();
    await this.withDirAsync(dir, async () => {
      const entryPath = join(dir, 'model.glb');
      writeFileSync(entryPath, mesh.glb);
      const o = mesh.origin;
      this.add(result, this.newModel(id, {
        name: stripExt(basename(src)), format: 'cityjson', entryPath, placedBy: 'data',
        footprints: mesh.footprints,
        placement: {
          lat: o.lat, lng: o.lng, alt: mesh.ellipsoidal ? this.msl(o.lat, o.lng, o.hEll) : o.hEll, altitudeMode: 'amsl',
          yawDeg: 0, pitchDeg: 0, rollDeg: 0, scale: 1,
        },
      }));
    });
  }

  private async importLas(src: string, result: UserModelImportResult): Promise<void> {
    const { id, dir } = this.newModelDir();
    await this.withDirAsync(dir, async () => {
      const entryPath = join(dir, 'points.ply');
      const convert = this.deps.convertPointCloud ?? ((job: PointCloudJob) => convertPointCloud(job, this.deps.resolveCrs, this.deps.geoid));
      let cloud: PointCloudConverted;
      try {
        cloud = await convert({ src, outPath: entryPath });
      } catch (err) {
        if (err instanceof PointCloudError) throw new PilotError(err.message);
        throw err;
      }
      this.add(result, this.newModel(id, {
        name: stripExt(basename(src)), format: 'pointcloud', entryPath, placedBy: 'data',
        pointCount: cloud.count,
        ...(cloud.sourceCount > cloud.count ? { sourcePointCount: cloud.sourceCount } : {}),
        ...(cloud.footprint.length >= 3 ? { footprints: [cloud.footprint] } : {}),
        placement: { lat: cloud.lat, lng: cloud.lng, alt: cloud.altMsl, altitudeMode: 'amsl', yawDeg: 0, pitchDeg: 0, rollDeg: 0, scale: 1 },
      }));
    });
  }

  private async importPly(src: string, dropAt: { lat: number; lng: number } | undefined, result: UserModelImportResult): Promise<void> {
    const info = await readPlyHeader(src);
    if (!info) throw new PilotError(t('main:userModels.plyInvalid'));
    const { id, dir } = this.newModelDir();
    this.withDir(dir, () => {
      const entryPath = join(dir, basename(src));
      copyFileSync(src, entryPath);
      const base = { yawDeg: 0, pitchDeg: 0, rollDeg: 0, scale: 1 };
      const fields = { name: stripExt(basename(src)), format: 'pointcloud' as const, entryPath, pointCount: info.vertexCount };
      if (info.origin) {
        const o = info.origin;
        this.add(result, this.newModel(id, { ...fields, placedBy: 'data', placement: { lat: o.lat, lng: o.lng, alt: o.altMsl, altitudeMode: 'amsl', ...base } }));
        return;
      }
      this.add(result, this.newModel(id, {
        ...fields, placedBy: 'manual', placement: { lat: dropAt?.lat ?? 0, lng: dropAt?.lng ?? 0, alt: 0, altitudeMode: 'clamp', ...base },
      }));
      result.needsPlacement.push(id);
    });
  }

  private async importZip(src: string, dropAt: { lat: number; lng: number } | undefined, result: UserModelImportResult): Promise<void> {
    const stage = join(this.stagingDir, randomUUID());
    mkdirSync(stage, { recursive: true });
    try {
      try {
        extractZipSafely(src, stage);
      } catch {
        throw new PilotError(t('main:userModels.badArchive'));
      }
      const files = walkFiles(stage).sort((a, b) => a.split(sep).length - b.split(sep).length || a.localeCompare(b));
      const tileset = files.find((f) => {
        if (!f.toLowerCase().endsWith('.json')) return false;
        try {
          return isTilesetJson(JSON.parse(readFileSync(f, 'utf-8')));
        } catch {
          return false;
        }
      });
      const targets = tileset
        ? [tileset]
        : files.filter((f) => /\.(glb|gltf|kml|kmz|cityjson|las|laz|ply)$/i.test(f) || (/\.json$/i.test(f) && this.isCityJsonFile(f)));
      if (targets.length === 0) throw new PilotError(t('main:userModels.zipEmpty'));
      for (const f of targets) {
        try {
          await this.importOne(f, dropAt, result);
        } catch (err) {
          result.failed.push({ file: `${basename(src)}: ${relative(stage, f)}`, error: this.pilotMessage(err) });
        }
      }
    } finally {
      rmSync(stage, { recursive: true, force: true });
    }
  }

  private isCityJsonFile(f: string): boolean {
    try {
      return isCityJson(JSON.parse(readFileSync(f, 'utf-8')));
    } catch {
      return false;
    }
  }

  // ─── Update / remove ──────────────────────────────────────────────────────

  update(id: string, patch: Partial<Pick<UserModel, 'name' | 'placement' | 'visible' | 'scenes'>>): UserModel | null {
    const cur = this.models.get(id);
    if (!cur || !patch) return null;
    const next: UserModel = { ...cur };
    if (typeof patch.visible === 'boolean') next.visible = patch.visible;
    if (cur.origin === 'library') {
      if (typeof patch.name === 'string' && patch.name.trim()) next.name = patch.name.trim();
      if (patch.placement) {
        const p = { ...cur.placement, ...patch.placement };
        if (!finitePlacement(p)) return null;
        if (!placementEqual(p, cur.placement)) {
          next.placement = p;
          next.placedBy = 'manual';
          next.version = cur.version + 1;
        }
      }
      if (Array.isArray(patch.scenes)) next.scenes = patch.scenes.filter((s) => SCENES.includes(s));
    }
    this.models.set(id, next);
    this.sync(next);
    this.save();
    this.emit();
    return next;
  }

  remove(id: string): boolean {
    const m = this.models.get(id);
    if (!m || m.origin !== 'library') return false;
    this.models.delete(id);
    unregisterSceneMesh(USER_MODELS_SLUG, id);
    const dir = this.libraryDirOf(m.entryPath);
    if (dir && ![...this.models.values()].some((o) => o.origin === 'library' && inside(dir, o.entryPath))) {
      rmSync(dir, { recursive: true, force: true });
    }
    this.save();
    this.emit();
    return true;
  }

  private libraryDirOf(entryPath: string): string | null {
    const rel = relative(this.modelsDir, entryPath);
    if (!rel || rel.startsWith('..') || resolve(this.modelsDir, rel) !== resolve(entryPath)) return null;
    const first = rel.split(sep)[0];
    return first ? join(this.modelsDir, first) : null;
  }

  // ─── Watched folders ──────────────────────────────────────────────────────

  addWatched(dirIn: string): { dir: string | null; error?: string } {
    const dir = resolve(dirIn);
    if (!existsSync(dir) || !statSync(dir).isDirectory()) return { dir: null, error: t('main:userModels.folderNotFound') };
    if (placementTablesIn(dir).length === 0) return { dir: null, error: t('main:userModels.noPlacementTable') };
    if (this.watched.includes(dir)) return { dir };
    try {
      this.readTables(dir);
    } catch (err) {
      return { dir: null, error: this.pilotMessage(err) };
    }
    this.watched.push(dir);
    this.reloadWatched(dir);
    this.startWatching(dir);
    return { dir };
  }

  removeWatched(dirIn: string): boolean {
    const dir = resolve(dirIn);
    const i = this.watched.indexOf(dir);
    if (i < 0) return false;
    this.watched.splice(i, 1);
    this.watchers.get(dir)?.close();
    this.watchers.delete(dir);
    const tm = this.timers.get(dir);
    if (tm) clearTimeout(tm);
    this.timers.delete(dir);
    for (const m of [...this.models.values()]) {
      if (m.origin === 'watch' && m.watchDir === dir) {
        this.models.delete(m.id);
        this.mtimes.delete(m.id);
        unregisterSceneMesh(USER_MODELS_SLUG, m.id);
      }
    }
    for (const k of Object.keys(this.watchKeys)) {
      if (inside(dir, k.replace(/#\d+$/, ''))) delete this.watchKeys[k];
    }
    this.save();
    this.emit();
    return true;
  }

  private readTables(dir: string): PlacementRow[] {
    const rows: PlacementRow[] = [];
    for (const table of placementTablesIn(dir)) {
      try {
        rows.push(...parsePlacementTable(readFileSync(table.path, 'utf-8'), table.kind));
      } catch (err) {
        throw new PilotError(t('main:userModels.tableUnreadable', {
          file: basename(table.path), reason: err instanceof Error ? err.message : String(err),
        }));
      }
    }
    return rows;
  }

  /** Re-reads the folder's tables and reconciles its models; a broken table leaves the current models in place. */
  reloadWatched(dir: string, notify = true): void {
    let rows: PlacementRow[];
    try {
      rows = existsSync(dir) ? this.readTables(dir) : [];
    } catch (err) {
      console.warn(`[user-models] ${dir}:`, err instanceof Error ? err.message : err);
      return;
    }
    const seen = new Set<string>();
    const counts = new Map<string, number>();
    for (const row of rows) {
      const entryPath = resolve(dir, row.file);
      if (!inside(dir, entryPath) || !existsSync(entryPath)) {
        console.warn(`[user-models] ${dir}: ${row.file} is missing`);
        continue;
      }
      const format = formatForWatchedFile(entryPath);
      if (!format) {
        console.warn(`[user-models] ${dir}: ${row.file} is not a glTF, Collada or 3D Tiles file`);
        continue;
      }
      if (!finitePlacement(row.placement)) {
        console.warn(`[user-models] ${dir}: ${row.file} has an invalid placement`);
        continue;
      }
      const n = counts.get(entryPath) ?? 0;
      counts.set(entryPath, n + 1);
      const key = `${entryPath}#${n}`;
      seen.add(key);
      const mtime = this.mtimeOf(entryPath);
      const name = row.name || stripExt(basename(entryPath));
      const existingId = this.watchKeys[key];
      const cur = existingId ? this.models.get(existingId) : undefined;
      if (cur) {
        const changed = !placementEqual(cur.placement, row.placement) || cur.name !== name || cur.format !== format
          || this.mtimes.get(cur.id) !== mtime;
        const next: UserModel = changed
          ? { ...cur, name, format, entryPath, placement: row.placement, version: cur.version + 1 }
          : cur;
        this.mtimes.set(cur.id, mtime);
        if (next !== cur) {
          this.models.set(cur.id, next);
          this.sync(next);
        }
        continue;
      }
      const id = randomUUID();
      this.watchKeys[key] = id;
      this.mtimes.set(id, mtime);
      const m: UserModel = {
        id, name, format, entryPath, placement: row.placement, placedBy: 'data', origin: 'watch', watchDir: dir,
        visible: true, version: 1, importedAt: Date.now(),
      };
      this.models.set(id, m);
      this.sync(m);
    }
    for (const [key, id] of Object.entries(this.watchKeys)) {
      const m = this.models.get(id);
      if (seen.has(key)) continue;
      if (m && m.watchDir !== dir) continue;
      if (!m && !inside(dir, key.replace(/#\d+$/, ''))) continue;
      delete this.watchKeys[key];
      if (m) {
        this.models.delete(id);
        this.mtimes.delete(id);
        unregisterSceneMesh(USER_MODELS_SLUG, id);
      }
    }
    this.save();
    if (notify) this.emit();
  }

  private startWatching(dir: string): void {
    if (this.deps.watchFs === false || this.watchers.has(dir) || !existsSync(dir)) return;
    const onEvent = () => {
      const prev = this.timers.get(dir);
      if (prev) clearTimeout(prev);
      this.timers.set(dir, setTimeout(() => {
        this.timers.delete(dir);
        if (this.watched.includes(dir)) this.reloadWatched(dir);
      }, RELOAD_DEBOUNCE_MS));
    };
    try {
      let w: FSWatcher;
      try {
        w = watch(dir, { recursive: true }, onEvent);
      } catch {
        w = watch(dir, onEvent);
      }
      w.on('error', (err) => console.warn(`[user-models] watch ${dir}:`, err));
      this.watchers.set(dir, w);
    } catch (err) {
      console.warn(`[user-models] cannot watch ${dir}:`, err);
    }
  }

  private mtimeOf(p: string): number {
    try {
      return statSync(p).mtimeMs;
    } catch {
      return 0;
    }
  }

  // ─── Registry, persistence, broadcast ─────────────────────────────────────

  private sync(m: UserModel): void {
    if (!m.visible) {
      unregisterSceneMesh(USER_MODELS_SLUG, m.id);
      return;
    }
    try {
      registerSceneMesh(USER_MODELS_SLUG, toRegistration(m));
    } catch (err) {
      console.warn(`[user-models] ${m.name} did not register:`, err);
    }
  }

  private emit(): void {
    this.deps.onChange(this.list());
  }

  private readIndex(): IndexFile {
    try {
      if (!existsSync(this.indexPath)) return { models: [], watched: [], watchKeys: {} };
      const raw = JSON.parse(readFileSync(this.indexPath, 'utf-8')) as Partial<IndexFile>;
      return {
        models: Array.isArray(raw.models) ? raw.models.filter((m) => m && typeof m.id === 'string' && typeof m.entryPath === 'string') : [],
        watched: Array.isArray(raw.watched) ? raw.watched.filter((d) => typeof d === 'string') : [],
        watchKeys: raw.watchKeys && typeof raw.watchKeys === 'object' ? raw.watchKeys : {},
      };
    } catch (err) {
      console.warn('[user-models] index.json unreadable, starting empty:', err);
      return { models: [], watched: [], watchKeys: {} };
    }
  }

  private save(): void {
    mkdirSync(this.deps.baseDir, { recursive: true });
    const data: IndexFile = { models: this.list(), watched: this.watched, watchKeys: this.watchKeys };
    const tmp = `${this.indexPath}.tmp`;
    writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
    renameSync(tmp, this.indexPath);
  }
}
