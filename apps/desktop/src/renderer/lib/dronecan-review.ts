import type { DroneCanParam, DroneCanParamValue } from '../../shared/dronecan-types.js';

export interface DroneCanChange {
  name: string;
  value: DroneCanParamValue;
  /** Current value; looked up on the node when absent. */
  current?: DroneCanParamValue | null;
}

export interface DroneCanWriteRequest {
  /** Who asks: a cargo name, or null when the pilot edited it in ArduDeck. */
  from: string | null;
  nodeId: number;
  nodeName?: string;
  reason?: string;
  changes: DroneCanChange[];
  /** Pre-ticks "save on the node" in the dialog. */
  saveByDefault?: boolean;
}

export interface DroneCanWriteResult {
  accepted: boolean;
  written: DroneCanParam[];
  failed: Array<{ name: string; error: string }>;
  saved: boolean;
  error?: string;
}

export interface PendingDroneCanWrite {
  request: Omit<DroneCanWriteRequest, 'changes'> & { changes: Array<DroneCanChange & { current: DroneCanParamValue | null }> };
  resolve(result: DroneCanWriteResult): void;
}

let pending: PendingDroneCanWrite | null = null;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

export function subscribeDroneCanWrite(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getPendingDroneCanWrite(): PendingDroneCanWrite | null {
  return pending;
}

const declined = (error?: string): DroneCanWriteResult => ({ accepted: false, written: [], failed: [], saved: false, ...(error ? { error } : {}) });

export async function requestDroneCanWrite(request: DroneCanWriteRequest): Promise<DroneCanWriteResult> {
  if (pending) return declined('another DroneCAN review is already open'); // i18n-exempt
  if (request.changes.length === 0) return declined('no changes'); // i18n-exempt
  const changes: Array<DroneCanChange & { current: DroneCanParamValue | null }> = [];
  for (const c of request.changes) {
    let current: DroneCanParamValue | null | undefined = c.current;
    if (current === undefined) {
      const res = await window.electronAPI.dronecanGetParam(request.nodeId, c.name);
      current = res.success ? res.data?.value ?? null : null;
    }
    changes.push({ ...c, current: current ?? null });
  }
  return new Promise<DroneCanWriteResult>((resolve) => {
    pending = {
      request: { ...request, changes },
      resolve: (result) => {
        pending = null;
        emit();
        resolve(result);
      },
    };
    emit();
  });
}

/** Called by the dialog when the pilot applies: the host writes, then optionally saves. */
export async function performDroneCanWrite(p: PendingDroneCanWrite, save: boolean): Promise<void> {
  const written: DroneCanParam[] = [];
  const failed: Array<{ name: string; error: string }> = [];
  for (const c of p.request.changes) {
    const res = await window.electronAPI.dronecanSetParam(p.request.nodeId, c.name, c.value, 0);
    if (res.success) written.push(res.data);
    else failed.push({ name: c.name, error: res.error });
  }
  let saved = false;
  if (save && written.length > 0) {
    const res = await window.electronAPI.dronecanSaveParams(p.request.nodeId);
    saved = res.success && res.data;
  }
  p.resolve({ accepted: true, written, failed, saved });
}

export function cancelDroneCanWrite(): void {
  pending?.resolve(declined());
}
