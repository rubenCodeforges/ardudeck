// Mission Planner (.param): NAME,VALUE or NAME VALUE. QGroundControl (.params): SYSID COMPID NAME VALUE TYPE.

export type ParamFileFormat = 'mp' | 'qgc';

export interface ParamFileEntry {
  id: string;
  value: number;
  /** MAV_PARAM_TYPE when the file carries one (QGC). */
  type?: number;
}

export interface ParsedParamFile {
  params: ParamFileEntry[];
  format: ParamFileFormat;
  vehicleType?: string;
}

/** MAV_PARAM_TYPE_REAL32: what QGC writes when the type is unknown. */
const MAV_PARAM_TYPE_REAL32 = 9;
const PARAM_NAME = /^[A-Za-z][A-Za-z0-9_]{0,15}$/;
const INTEGER = /^\d+$/;

export function formatFromPath(path: string): ParamFileFormat {
  return /\.params$/i.test(path) ? 'qgc' : 'mp';
}

/** A QGC row: two integer ids, a parameter name, a number and an integer type. */
function parseQgcRow(parts: string[]): ParamFileEntry | null {
  if (parts.length < 4 || !INTEGER.test(parts[0]!) || !INTEGER.test(parts[1]!) || !PARAM_NAME.test(parts[2]!)) return null;
  const value = Number(parts[3]);
  if (!Number.isFinite(value)) return null;
  const type = parts[4] !== undefined && INTEGER.test(parts[4]) ? Number(parts[4]) : undefined;
  return type === undefined ? { id: parts[2]!, value } : { id: parts[2]!, value, type };
}

export function parseParamFile(content: string): ParsedParamFile {
  const params: ParamFileEntry[] = [];
  let vehicleType: string | undefined;
  let qgcRows = 0;
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('#')) {
      const vehicle = trimmed.match(/^#\s*Vehicle:\s*(.+)/i);
      if (vehicle?.[1]) vehicleType = vehicle[1].trim();
      continue;
    }
    const qgc = parseQgcRow(trimmed.split(/\t+|\s+/));
    if (qgc) {
      params.push(qgc);
      qgcRows++;
      continue;
    }
    const parts = trimmed.includes(',') ? trimmed.split(',') : trimmed.split(/\s+/);
    if (parts.length < 2) continue;
    const id = parts[0]!.trim();
    const value = Number(parts[1]!.trim());
    if (PARAM_NAME.test(id) && Number.isFinite(value)) params.push({ id, value });
  }
  return { params, format: qgcRows > 0 && qgcRows === params.length ? 'qgc' : 'mp', vehicleType };
}

/** Six significant digits strips float32 noise (0.18000000715255737 -> 0.18). */
export function formatParamFileValue(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(parseFloat(value.toPrecision(6)));
}

export function formatParamFile(
  params: ParamFileEntry[],
  opts: { format: ParamFileFormat; vehicleType?: string; sysid?: number; compid?: number; date?: Date },
): string {
  const date = (opts.date ?? new Date()).toISOString();
  if (opts.format === 'qgc') {
    const sysid = opts.sysid ?? 1;
    const compid = opts.compid ?? 1;
    const header = [
      '# Onboard parameters for Vehicle ' + sysid,
      '#',
      '# Written by ArduDeck',
      opts.vehicleType ? `# Vehicle: ${opts.vehicleType}` : null,
      `# Date: ${date}`,
      '#',
      '# Vehicle-Id Component-Id Name Value Type',
    ].filter((l): l is string => l !== null);
    const rows = params.map((p) => `${sysid}\t${compid}\t${p.id}\t${formatParamFileValue(p.value)}\t${p.type ?? MAV_PARAM_TYPE_REAL32}`);
    return [...header, ...rows].join('\n') + '\n';
  }
  const header = [
    '# ArduDeck Parameter File',
    opts.vehicleType ? `# Vehicle: ${opts.vehicleType}` : null,
    `# Date: ${date}`,
    `# Parameters: ${params.length}`,
  ].filter((l): l is string => l !== null);
  return header.join('\n') + '\n\n' + params.map((p) => `${p.id},${formatParamFileValue(p.value)}`).join('\n');
}
