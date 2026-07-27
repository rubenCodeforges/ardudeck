/**
 * Parse/serialize Mission Planner .param and QGroundControl .params files
 * and compare against FC parameters.
 */

export interface ParsedParam {
  name: string;
  value: number;
  /** MAV_PARAM_TYPE when known (QGC 5th column). */
  type?: number;
}

export interface ParamDiff {
  name: string;
  fileValue: number;
  fcValue: number | null;
  status: 'changed' | 'added' | 'unchanged';
}

export type ParamFileFormat = 'mp' | 'qgc' | 'unknown';

export interface SerializeParamOptions {
  format: 'mp' | 'qgc';
  systemId?: number;
  componentId?: number;
  /** Fallback MAV_PARAM_TYPE for QGC export when not provided per-param. Default 9 (REAL32). */
  defaultType?: number;
  /** Optional header comment lines (without leading #). */
  headerComments?: string[];
}

export interface BuildModifiedResult {
  modified: Map<string, number>;
  applied: number;
  unknown: number;
}

const PARAM_NAME_RE = /^[A-Za-z][A-Za-z0-9_]*$/;

function normalizeText(text: string): string {
  return text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function isCommentOrHeader(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  if (t.startsWith('#') || t.startsWith('//') || t.startsWith(';')) return true;
  const low = t.toLowerCase();
  if (low.startsWith('qgc')) return true;
  if (low === 'vehicle_id' || low.startsWith('vehicle_id ')) return true;
  return false;
}

function stripInlineComment(line: string): string {
  let out = line;
  for (const sep of ['#', '//', ';']) {
    const idx = out.indexOf(sep);
    if (idx !== -1) out = out.slice(0, idx);
  }
  return out.trim();
}

/** Heuristic format detection for operator feedback / future UI. */
export function detectParamFileFormat(text: string): ParamFileFormat {
  const lines = normalizeText(text).split('\n');
  let qgcHits = 0;
  let mpHits = 0;
  for (const raw of lines) {
    if (isCommentOrHeader(raw)) {
      if (raw.trim().toLowerCase().startsWith('qgc')) return 'qgc';
      continue;
    }
    const line = stripInlineComment(raw);
    if (!line) continue;
    const parts = line.split(/[\s,]+/).filter(Boolean);
    if (parts.length >= 5) {
      const a = parseInt(parts[0]!, 10);
      const b = parseInt(parts[1]!, 10);
      if (!isNaN(a) && !isNaN(b) && PARAM_NAME_RE.test(parts[2]!)) {
        qgcHits++;
        continue;
      }
    }
    if (
      parts.length >= 2 &&
      PARAM_NAME_RE.test(parts[0]!) &&
      !isNaN(parseFloat(parts[1]!))
    ) {
      mpHits++;
    }
  }
  if (qgcHits > 0 && qgcHits >= mpHits) return 'qgc';
  if (mpHits > 0) return 'mp';
  return 'unknown';
}

/**
 * Extract vehicle type from ArduDeck / comment headers (`# Vehicle: Copter`).
 */
export function extractVehicleTypeFromParamFile(text: string): string | undefined {
  for (const raw of normalizeText(text).split('\n')) {
    const trimmed = raw.trim();
    if (!trimmed.startsWith('#')) continue;
    const vehicleMatch = trimmed.match(/^#\s*Vehicle:\s*(.+)/i);
    if (vehicleMatch?.[1]) return vehicleMatch[1].trim();
  }
  return undefined;
}

/**
 * Parse a .param / .params file into name/value pairs.
 * Supports Mission Planner (NAME VALUE / NAME,VALUE) and QGC
 * (VEHICLE_ID COMPONENT_ID NAME VALUE TYPE).
 */
export function parseParamFile(text: string): ParsedParam[] {
  const params: ParsedParam[] = [];
  for (const raw of normalizeText(text).split('\n')) {
    if (isCommentOrHeader(raw)) continue;
    const line = stripInlineComment(raw);
    if (!line) continue;

    const parts =
      line.includes(',') && !line.includes(' ')
        ? line.split(',').map((p) => p.trim()).filter(Boolean)
        : line.split(/[\s,]+/).filter(Boolean);

    if (parts.length < 2) continue;

    // QGC: sysid compid NAME VALUE [TYPE]
    if (parts.length >= 5) {
      const sys = parseInt(parts[0]!, 10);
      const comp = parseInt(parts[1]!, 10);
      const maybeName = parts[2]!;
      const maybeVal = parseFloat(parts[3]!);
      if (!isNaN(sys) && !isNaN(comp) && PARAM_NAME_RE.test(maybeName) && !isNaN(maybeVal)) {
        const typeNum = parseInt(parts[4]!, 10);
        params.push({
          name: maybeName,
          value: maybeVal,
          type: !isNaN(typeNum) ? typeNum : undefined,
        });
        continue;
      }
    }

    // MP / generic: NAME VALUE
    const name = parts[0]!.replace(/"/g, '');
    const value = parseFloat(parts[1]!);
    if (PARAM_NAME_RE.test(name) && !isNaN(value)) {
      params.push({ name, value });
    }
  }
  return params;
}

function formatParamFileValue(value: number): string {
  if (Number.isInteger(value)) return String(value);
  // float32 noise: recover ~6 significant digits for file interchange
  return String(parseFloat(value.toPrecision(6)));
}

/** Serialize parameters for download / save dialogs. */
export function serializeParamFile(
  rows: Array<{ name: string; value: number; type?: number }>,
  options: SerializeParamOptions,
): string {
  const sys = options.systemId ?? 1;
  const comp = options.componentId ?? 1;
  const defaultType = options.defaultType ?? 9;

  if (options.format === 'qgc') {
    const header = options.headerComments?.length
      ? options.headerComments.map((c) => (c.startsWith('#') ? c : `# ${c}`))
      : ['# Onboard parameters', '# VEHICLE_ID COMPONENT_ID NAME VALUE TYPE'];
    const lines = [
      ...header,
      ...rows.map(
        (r) =>
          `${sys}\t${comp}\t${r.name}\t${formatParamFileValue(r.value)}\t${r.type ?? defaultType}`,
      ),
    ];
    return lines.join('\n') + '\n';
  }

  // Mission Planner / ArduDeck .param — comma form is widely compatible
  const header = options.headerComments?.length
    ? options.headerComments.map((c) => (c.startsWith('#') ? c : `# ${c}`)).join('\n') + '\n\n'
    : '';
  if (rows.length === 0) return header;
  return (
    header +
    rows.map((r) => `${r.name},${formatParamFileValue(r.value)}`).join('\n') +
    '\n'
  );
}

/**
 * Float32-aware equality for MAVLink REAL32 params (matches parameter-store f32Equal).
 * Avoids false "changed" diffs from float64 noise after float32 round-trips.
 */
export function paramValuesEqual(a: number, b: number): boolean {
  return Math.fround(a) === Math.fround(b);
}

/**
 * Whether the parameter compare modal should open after loading a file.
 * Only open when there are value diffs to review; skipped-only is toast-only.
 */
export function shouldOpenParamCompareModal(diffCount: number, _skippedCount = 0): boolean {
  return diffCount > 0;
}

/**
 * Offline parameter type for a parsed row: preserve QGC type when present, else REAL32 (9).
 */
export function offlineParamTypeFromParsed(type: number | undefined): number {
  return type ?? 9;
}

/**
 * Compare file params against current FC params.
 * Returns a diff array sorted by status (changed first, then added, then unchanged).
 * Uses float32-aware equality so IEEE noise does not create spurious changes.
 */
export function compareParams(
  fileParams: ParsedParam[],
  fcParams: Map<string, number>,
): ParamDiff[] {
  const diffs: ParamDiff[] = [];

  for (const fp of fileParams) {
    const fcValue = fcParams.get(fp.name);
    if (fcValue === undefined) {
      diffs.push({ name: fp.name, fileValue: fp.value, fcValue: null, status: 'added' });
    } else if (!paramValuesEqual(fcValue, fp.value)) {
      diffs.push({ name: fp.name, fileValue: fp.value, fcValue, status: 'changed' });
    } else {
      diffs.push({ name: fp.name, fileValue: fp.value, fcValue, status: 'unchanged' });
    }
  }

  const order: Record<string, number> = { changed: 0, added: 1, unchanged: 2 };
  diffs.sort((a, b) => {
    const o = order[a.status]! - order[b.status]!;
    if (o !== 0) return o;
    return a.name.localeCompare(b.name);
  });

  return diffs;
}

/**
 * Apply a parsed file onto the FC parameter list as a pending modified map.
 * Only names present on the FC are applied; unknown names are counted separately.
 * Uses float32-aware equality when deciding modified vs clear.
 */
export function buildModifiedFromFile(
  parsed: ParsedParam[],
  fcParams: Map<string, number>,
  existingModified: Map<string, number> = new Map(),
): BuildModifiedResult {
  const modified = new Map(existingModified);
  let applied = 0;
  let unknown = 0;

  for (const p of parsed) {
    const fcValue = fcParams.get(p.name);
    if (fcValue === undefined) {
      unknown++;
      continue;
    }
    applied++;
    if (!paramValuesEqual(fcValue, p.value)) modified.set(p.name, p.value);
    else modified.delete(p.name);
  }

  return { modified, applied, unknown };
}
