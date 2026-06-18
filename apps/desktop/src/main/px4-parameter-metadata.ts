/**
 * PX4 Parameter Metadata
 *
 * ArduPilot publishes parameter metadata as XML at autotest.ardupilot.org.
 * PX4 has no equivalent live endpoint; instead QGroundControl ships a complete
 * JSON metadata file. We bundle a copy of that file (src/main/px4-parameter-metadata.json)
 * and import it as a module so the main-process bundler (electron-vite / rollup)
 * inlines it into out/main. That means it is available at runtime in BOTH dev and
 * packaged (asar) builds with no filesystem path resolution required.
 */

import type {
  ParameterMetadata,
  ParameterMetadataStore,
} from '../shared/parameter-metadata.js';
// resolveJsonModule is enabled; rollup inlines this into the bundle.
import rawMetadata from './px4-parameter-metadata.json' assert { type: 'json' };

/** Shape of a single entry in QGC's PX4ParameterFactMetaData.json. */
interface Px4MetadataEntry {
  name?: unknown;
  shortDesc?: unknown;
  longDesc?: unknown;
  min?: unknown;
  max?: unknown;
  units?: unknown;
  increment?: unknown;
  rebootRequired?: unknown;
  volatile?: unknown;
  values?: unknown;
  bitmask?: unknown;
}

interface Px4MetadataFile {
  parameters?: unknown;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Parse QGC's PX4 parameter metadata (object with a `parameters` array, or a
 * bare array) into the vendor-neutral ParameterMetadataStore used by the param UI.
 * Malformed entries (missing name) are skipped; all optional fields are tolerated.
 */
export function parsePx4ParameterMetadata(json: unknown): ParameterMetadataStore {
  let entries: unknown;
  if (Array.isArray(json)) {
    entries = json;
  } else if (json && typeof json === 'object') {
    entries = (json as Px4MetadataFile).parameters;
  }

  const store: ParameterMetadataStore = {};
  if (!Array.isArray(entries)) {
    return store;
  }

  for (const raw of entries) {
    if (!raw || typeof raw !== 'object') continue;
    const entry = raw as Px4MetadataEntry;

    if (!isNonEmptyString(entry.name)) continue;
    const name = entry.name;

    const shortDesc = isNonEmptyString(entry.shortDesc) ? entry.shortDesc : undefined;
    const longDesc = isNonEmptyString(entry.longDesc) ? entry.longDesc : undefined;

    const metadata: ParameterMetadata = {
      name,
      humanName: shortDesc ?? name,
      description: longDesc ?? shortDesc ?? '',
    };

    if (isFiniteNumber(entry.min) && isFiniteNumber(entry.max)) {
      metadata.range = { min: entry.min, max: entry.max };
    }

    if (isNonEmptyString(entry.units)) {
      metadata.units = entry.units;
    }

    if (isFiniteNumber(entry.increment)) {
      metadata.increment = entry.increment;
    }

    if (entry.rebootRequired === true) {
      metadata.rebootRequired = true;
    }

    if (entry.volatile === true) {
      metadata.readOnly = true;
    }

    if (Array.isArray(entry.values)) {
      const values: Record<number, string> = {};
      for (const v of entry.values) {
        if (!v || typeof v !== 'object') continue;
        const value = (v as { value?: unknown }).value;
        const description = (v as { description?: unknown }).description;
        if (isFiniteNumber(value) && isNonEmptyString(description)) {
          values[value] = description;
        }
      }
      if (Object.keys(values).length > 0) {
        metadata.values = values;
      }
    }

    if (Array.isArray(entry.bitmask)) {
      const bitmask: Record<number, string> = {};
      for (const b of entry.bitmask) {
        if (!b || typeof b !== 'object') continue;
        const index = (b as { index?: unknown }).index;
        const description = (b as { description?: unknown }).description;
        if (isFiniteNumber(index) && isNonEmptyString(description)) {
          bitmask[index] = description;
        }
      }
      if (Object.keys(bitmask).length > 0) {
        metadata.bitmask = bitmask;
      }
    }

    store[name] = metadata;
  }

  return store;
}

let cachedPx4Store: ParameterMetadataStore | null = null;

/** Load + parse the bundled PX4 metadata once and memoize the result. */
export function getPx4ParameterMetadata(): ParameterMetadataStore {
  if (!cachedPx4Store) {
    cachedPx4Store = parsePx4ParameterMetadata(rawMetadata as unknown);
  }
  return cachedPx4Store;
}
