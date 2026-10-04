import { useEffect, useState } from 'react';
import type { DroneCanParamDoc, DroneCanNodeProfile } from '@ardudeck/module-sdk';
import type { ParameterMetadataStore } from '../../shared/parameter-metadata';

let store: ParameterMetadataStore | null = null;
let pending: Promise<ParameterMetadataStore | null> | null = null;

function load(): Promise<ParameterMetadataStore | null> {
  pending ??= window.electronAPI.periphParamMetadata().then((res) => {
    if (res.success) store = res.data;
    else pending = null;
    return store;
  });
  return pending;
}

/** AP_Periph parameter docs, fetched once per session (disk-cached in main). Null until loaded or when offline with no cache. */
export function usePeriphMetadata(): ParameterMetadataStore | null {
  const [meta, setMeta] = useState(store);
  useEffect(() => {
    if (store) return;
    let alive = true;
    void load().then((m) => { if (alive) setMeta(m); });
    return () => { alive = false; };
  }, []);
  return meta;
}

export interface NodeParamDoc extends DroneCanParamDoc {
  bitmask?: Record<number, string>;
  /** True when a module, not ArduPilot's docs, supplied part of this entry. */
  fromModule?: boolean;
}

// Wrong values here drop the node off the bus or rewrite its bootloader; recovery needs other tools.
const DANGER = new Set(['FLASH_BOOTLOADER', 'CAN_BAUDRATE', 'CAN_PROTOCOL', 'CAN_FDMODE']);

export function nodeParamDocs(
  names: string[],
  periph: ParameterMetadataStore | null,
  profiles: DroneCanNodeProfile[],
): Record<string, NodeParamDoc> {
  const fromModules: Record<string, DroneCanParamDoc> = {};
  for (const p of profiles) {
    try {
      Object.assign(fromModules, p.params?.());
    } catch (err) {
      console.warn('[dronecan] node profile params() threw', err);
    }
  }
  const out: Record<string, NodeParamDoc> = {};
  for (const name of names) {
    const m = periph?.[name];
    const doc: NodeParamDoc = m
      ? {
          displayName: m.humanName !== name ? m.humanName : undefined,
          description: m.description || undefined,
          values: m.values,
          bitmask: m.bitmask,
          units: m.units,
          min: m.range?.min,
          max: m.range?.max,
          rebootRequired: m.rebootRequired,
        }
      : {};
    if (DANGER.has(name)) doc.danger = true;
    const mod = fromModules[name];
    if (mod) {
      for (const [k, v] of Object.entries(mod)) if (v !== undefined) (doc as Record<string, unknown>)[k] = v;
      doc.fromModule = true;
    }
    out[name] = doc;
  }
  return out;
}
