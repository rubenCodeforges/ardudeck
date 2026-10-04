import type { ParameterMetadata, ParameterMetadataStore } from './parameter-metadata.js';

/** ArduPilot's published parameter docs for AP_Periph, the firmware most DroneCAN nodes run. */
export const AP_PERIPH_METADATA_URL = 'https://autotest.ardupilot.org/Parameters/AP_Periph/apm.pdef.json';

interface PdefParam {
  DisplayName?: string;
  Description?: string;
  Range?: { low?: string; high?: string };
  Units?: string;
  Values?: Record<string, string>;
  Bitmask?: Record<string, string>;
  Increment?: string;
  RebootRequired?: string;
  ReadOnly?: string;
  Volatile?: string;
}

function numKeyed(rec: Record<string, string> | undefined): Record<number, string> | undefined {
  if (!rec) return undefined;
  const out: Record<number, string> = {};
  for (const [k, v] of Object.entries(rec)) {
    const n = Number(k);
    if (Number.isFinite(n)) out[n] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Flatten apm.pdef.json ({group: {PARAM: {...}}}) into the metadata store shape the parameter screens use. */
export function parsePeriphMetadata(json: unknown): ParameterMetadataStore {
  const out: ParameterMetadataStore = {};
  if (!json || typeof json !== 'object') return out;
  for (const group of Object.values(json as Record<string, unknown>)) {
    if (!group || typeof group !== 'object') continue;
    for (const [name, raw] of Object.entries(group as Record<string, unknown>)) {
      if (!raw || typeof raw !== 'object') continue;
      const p = raw as PdefParam;
      const meta: ParameterMetadata = {
        name,
        humanName: p.DisplayName ?? name,
        description: p.Description ?? '',
      };
      const min = Number(p.Range?.low);
      const max = Number(p.Range?.high);
      if (p.Range && Number.isFinite(min) && Number.isFinite(max)) meta.range = { min, max };
      if (p.Units) meta.units = p.Units;
      const values = numKeyed(p.Values);
      if (values) meta.values = values;
      const bitmask = numKeyed(p.Bitmask);
      if (bitmask) meta.bitmask = bitmask;
      const inc = Number(p.Increment);
      if (p.Increment && Number.isFinite(inc)) meta.increment = inc;
      if (p.RebootRequired === 'True') meta.rebootRequired = true;
      if (p.ReadOnly === 'True') meta.readOnly = true;
      if (p.Volatile === 'True') meta.volatile = true;
      out[name] = meta;
    }
  }
  return out;
}
