import { promises as fsp } from 'fs';
import * as fs from 'fs';
import { join } from 'path';
import { hostname } from 'os';
import { createHash } from 'crypto';
import git from 'isomorphic-git';
import { formatParamFile, parseParamFile, parseParamFileHeader } from '../../shared/param-file';
import {
  DEFAULT_PRODUCTION_RULES,
  type BirthCertificate,
  type ProductionModel,
  type ProductionRules,
  type ProductionRun,
} from '../../shared/production-types';
import { branchName, commitFiles, ensureRepo, repoDir, resolveUnitDir, sanitizeSegment } from './fleet-repo-manager';

export interface SaveModelInput {
  name: string;
  vehicleType?: string;
  firmware?: string;
  firmwareVersion?: string;
  boardId?: string;
  sourceUnit?: string;
  rules?: ProductionRules;
}

export interface ModelWithGolden {
  model: ProductionModel;
  golden: Array<{ id: string; value: number }>;
  /** Last commit that changed the golden; stamped on every certificate. */
  goldenOid?: string;
}

export interface RecordRunInput {
  run: Omit<ProductionRun, 'id' | 'at' | 'station'>;
  /** Present on a pass. */
  certificate?: Omit<BirthCertificate, 'issuedAt' | 'station'>;
  /** Unit parameters at QA time, snapshotted with the certificate. */
  params?: Array<{ id: string; value: number }>;
}

function modelId(name: string): string {
  return sanitizeSegment(name.toLowerCase());
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await fsp.readFile(path, 'utf-8')) as T;
  } catch {
    return null;
  }
}

export function defaultStationName(): string {
  return sanitizeSegment(hostname().replace(/\.local$/, ''));
}

export async function listModels(): Promise<ProductionModel[]> {
  await ensureRepo();
  const dir = join(repoDir(), 'models');
  let entries: string[] = [];
  try {
    entries = await fsp.readdir(dir);
  } catch {
    return [];
  }
  const out: ProductionModel[] = [];
  for (const id of entries) {
    if (id.startsWith('.')) continue;
    const model = await readJson<ProductionModel>(join(dir, id, 'model.json'));
    if (model) out.push({ ...model, id, rules: { ...DEFAULT_PRODUCTION_RULES, ...model.rules } });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export async function readModel(id: string): Promise<ModelWithGolden | null> {
  await ensureRepo();
  const clean = sanitizeSegment(id);
  const base = join(repoDir(), 'models', clean);
  const model = await readJson<ProductionModel>(join(base, 'model.json'));
  if (!model) return null;
  let golden: Array<{ id: string; value: number }> = [];
  try {
    golden = parseParamFile(await fsp.readFile(join(base, 'golden.param'), 'utf-8'));
  } catch {
    return null;
  }
  let goldenOid: string | undefined;
  try {
    const dir = repoDir();
    const [last] = await git.log({ fs, dir, ref: await branchName(dir), filepath: `models/${clean}/golden.param`, depth: 1 });
    goldenOid = last?.oid;
  } catch {
    // uncommitted or shallow history: the certificate simply carries no oid
  }
  return { model: { ...model, id: clean, rules: { ...DEFAULT_PRODUCTION_RULES, ...model.rules } }, golden, goldenOid };
}

/** Create or replace a model's golden configuration. Rules and createdAt survive a re-capture. */
export async function saveModel(
  input: SaveModelInput,
  params: Array<{ id: string; value: number }>,
): Promise<{ changed: boolean; model: ProductionModel }> {
  const id = modelId(input.name);
  const prev = await readJson<ProductionModel>(join(repoDir(), 'models', id, 'model.json'));
  const now = Date.now();
  const model: ProductionModel = {
    id,
    name: input.name.trim(),
    vehicleType: input.vehicleType,
    firmware: input.firmware,
    firmwareVersion: input.firmwareVersion,
    boardId: input.boardId,
    paramCount: params.length,
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
    sourceUnit: input.sourceUnit,
    rules: input.rules ?? { ...DEFAULT_PRODUCTION_RULES, ...prev?.rules },
    ...(prev?.firmwareFile
      ? { firmwareFile: prev.firmwareFile, firmwareSha256: prev.firmwareSha256, firmwareBoardId: prev.firmwareBoardId }
      : {}),
  };
  const golden = formatParamFile(params, {
    Source: 'ArduDeck production golden',
    Model: model.name,
    ...(model.boardId ? { Board: model.boardId } : {}),
    ...(model.vehicleType ? { Vehicle: model.vehicleType } : {}),
    ...(model.firmware ? { Firmware: model.firmware } : {}),
    ...(model.firmwareVersion ? { Version: model.firmwareVersion } : {}),
  });
  const result = await commitFiles(
    [
      { path: `models/${id}/golden.param`, content: golden },
      { path: `models/${id}/model.json`, content: JSON.stringify(model, null, 2) + '\n' },
    ],
    `golden ${id}: ${model.name} (${params.length} params)`,
  );
  return { changed: result.changed, model };
}

export async function updateModelRules(id: string, rules: ProductionRules): Promise<ProductionModel | null> {
  const clean = sanitizeSegment(id);
  const path = `models/${clean}/model.json`;
  const prev = await readJson<ProductionModel>(join(repoDir(), path));
  if (!prev) return null;
  const model = { ...prev, rules, updatedAt: Date.now() };
  await commitFiles([{ path, content: JSON.stringify(model, null, 2) + '\n' }], `rules ${clean}`);
  return model;
}

/** Board that already carries this serial, so one serial can never ship twice. */
export async function findUnitBySerial(serial: string): Promise<string | null> {
  await ensureRepo();
  const wanted = serial.trim();
  if (!wanted) return null;
  const unitsDir = join(repoDir(), 'units');
  let entries: string[] = [];
  try {
    entries = await fsp.readdir(unitsDir);
  } catch {
    return null;
  }
  for (const uid of entries) {
    const cert = await readJson<BirthCertificate>(join(unitsDir, uid, 'birth.json'));
    if (cert?.serial === wanted) return uid;
  }
  return null;
}

export async function readCertificate(uid: string): Promise<BirthCertificate | null> {
  await ensureRepo();
  return readJson<BirthCertificate>(join(repoDir(), 'units', await resolveUnitDir(uid), 'birth.json'));
}

function dayKey(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Per-station run files: stations sharing a remote never edit the same file, so sync merges cleanly.
export async function recordRun(
  input: RecordRunInput,
  station: string,
): Promise<{ run: ProductionRun; oid?: string }> {
  await ensureRepo();
  const at = Date.now();
  const stationId = sanitizeSegment(station || defaultStationName());
  const run: ProductionRun = { ...input.run, id: crypto.randomUUID(), at, station: stationId };
  const runsPath = `production/runs/${dayKey(at)}/${stationId}.jsonl`;
  let existing = '';
  try {
    existing = await fsp.readFile(join(repoDir(), runsPath), 'utf-8');
  } catch {
    // first run of the day on this station
  }
  const files: Array<{ path: string; content: string }> = [
    { path: runsPath, content: existing + JSON.stringify(run) + '\n' },
  ];

  if (run.passed && input.certificate) {
    const unit = await resolveUnitDir(input.certificate.unitUid);
    const cert: BirthCertificate = { ...input.certificate, unitUid: unit, issuedAt: at, station: stationId };
    files.push({ path: `units/${unit}/birth.json`, content: JSON.stringify(cert, null, 2) + '\n' });
    const prevMeta = (await readJson<Record<string, unknown>>(join(repoDir(), 'units', unit, 'meta.json'))) ?? {};
    if (input.params?.length) {
      files.push({
        path: `units/${unit}/params.param`,
        content: formatParamFile(input.params, {
          Source: 'ArduDeck production QA',
          Board: cert.boardId ?? '',
          Serial: cert.serial,
          Model: cert.modelName,
          ...(cert.vehicleType ? { Vehicle: cert.vehicleType } : {}),
          ...(cert.firmware ? { Firmware: cert.firmware } : {}),
        }),
      });
    }
    const meta = {
      ...prevMeta,
      uid: unit,
      name: `${cert.modelName} ${cert.serial}`,
      vehicleType: cert.vehicleType ?? prevMeta.vehicleType,
      sitl: false,
      firmware: cert.firmware ?? prevMeta.firmware,
      serial: cert.serial,
      model: cert.modelId,
      ...(input.params?.length ? { lastSnapshotAt: at, paramCount: input.params.length } : {}),
    };
    files.push({ path: `units/${unit}/meta.json`, content: JSON.stringify(meta, null, 2) + '\n' });
  }

  const verdict = run.passed ? 'PASS' : 'FAIL';
  const result = await commitFiles(files, `production ${verdict} ${run.serial || run.unitUid} ${run.modelId}`);
  return { run, oid: result.oid };
}

/** Most recent runs across every station, newest first, reading back at most `days` day folders. */
export async function listRuns(limit = 200, days = 7): Promise<ProductionRun[]> {
  await ensureRepo();
  const base = join(repoDir(), 'production', 'runs');
  let dayDirs: string[] = [];
  try {
    dayDirs = (await fsp.readdir(base)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().reverse().slice(0, days);
  } catch {
    return [];
  }
  const out: ProductionRun[] = [];
  for (const day of dayDirs) {
    let files: string[] = [];
    try {
      files = (await fsp.readdir(join(base, day))).filter((f) => f.endsWith('.jsonl'));
    } catch {
      continue;
    }
    for (const f of files) {
      const raw = await fsp.readFile(join(base, day, f), 'utf-8').catch(() => '');
      for (const line of raw.split('\n')) {
        if (!line.trim()) continue;
        try {
          out.push(JSON.parse(line) as ProductionRun);
        } catch {
          // a hand-edited bad line must not hide the rest of the log
        }
      }
    }
  }
  return out.sort((a, b) => b.at - a.at).slice(0, limit);
}

/** Pin the firmware every unit of this model is flashed with: an .apj, or a .px4 (same JSON container). */
export async function attachFirmware(id: string, sourcePath: string): Promise<ProductionModel> {
  const clean = sanitizeSegment(id);
  const metaPath = `models/${clean}/model.json`;
  const prev = await readJson<ProductionModel>(join(repoDir(), metaPath));
  if (!prev) throw new Error(`Model ${clean} not found`); // i18n-exempt: caught and translated by the IPC layer
  const content = await fsp.readFile(sourcePath, 'utf-8');
  const apj = JSON.parse(content) as { board_id?: number; image?: string };
  if (typeof apj.image !== 'string' || typeof apj.board_id !== 'number') {
    throw new Error('Not an .apj or .px4 firmware image'); // i18n-exempt: shown verbatim, the file format names are not translated
  }
  const model: ProductionModel = {
    ...prev,
    firmwareFile: 'firmware.apj',
    firmwareSha256: createHash('sha256').update(content).digest('hex'),
    firmwareBoardId: apj.board_id,
    updatedAt: Date.now(),
  };
  await commitFiles(
    [
      { path: `models/${clean}/firmware.apj`, content },
      { path: metaPath, content: JSON.stringify(model, null, 2) + '\n' },
    ],
    `firmware ${clean}: board ${apj.board_id}`,
  );
  return model;
}

export function modelFirmwarePath(model: ProductionModel): string | null {
  return model.firmwareFile ? join(repoDir(), 'models', sanitizeSegment(model.id), model.firmwareFile) : null;
}

/**
 * Golden from a parameter file (Mission Planner / QGC .param, or a vault snapshot).
 * Firmware and board are pinned only when the file's header names them.
 */
export async function saveModelFromParamText(name: string, content: string, sourceUnit?: string): Promise<ProductionModel> {
  const params = parseParamFile(content);
  if (params.length === 0) throw new Error('The file holds no parameters'); // i18n-exempt: wrapped by the IPC layer
  const header = parseParamFileHeader(content);
  const firmware = header.Firmware === 'ardupilot' || header.Firmware === 'px4' ? header.Firmware : undefined;
  const { model } = await saveModel(
    { name, firmware, boardId: header.Board || undefined, vehicleType: header.Vehicle || undefined, sourceUnit },
    params,
  );
  return model;
}

export async function saveModelFromVaultUnit(name: string, unitUid: string): Promise<ProductionModel> {
  const unit = sanitizeSegment(unitUid);
  const content = await fsp.readFile(join(repoDir(), 'units', unit, 'params.param'), 'utf-8');
  return saveModelFromParamText(name, content, unit);
}

/** Removes a model as a commit, so its golden stays recoverable in history. Certificates already issued are untouched. */
export async function deleteModel(id: string): Promise<void> {
  await ensureRepo();
  const clean = sanitizeSegment(id);
  const dir = repoDir();
  const prefix = `models/${clean}/`;
  const files = (await git.listFiles({ fs, dir })).filter((f) => f.startsWith(prefix));
  if (files.length === 0) throw new Error(`Model ${clean} not found`); // i18n-exempt: wrapped by the IPC layer
  for (const filepath of files) await git.remove({ fs, dir, filepath });
  await fsp.rm(join(dir, 'models', clean), { recursive: true, force: true });
  await git.commit({ fs, dir, message: `delete model ${clean}`, author: { name: 'ArduDeck', email: 'vault@ardudeck.app' } }); // i18n-exempt
}
