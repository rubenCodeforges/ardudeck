/**
 * Metadata loading. Every enum dropdown in the config UI (servo functions, RC
 * options, flight modes) comes from here, so a failure to load does not look
 * like a failed fetch: it looks like half the UI is missing.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useParameterStore } from './parameter-store';

const META = { SERVO1_FUNCTION: { name: 'SERVO1_FUNCTION', values: { 6: 'Mount1Pan' } } } as never;

function withApi(impl: () => Promise<unknown>) {
  (globalThis as unknown as { window: Record<string, unknown> }).window = {
    electronAPI: { fetchParameterMetadata: impl },
  };
}

describe('fetchMetadata', () => {
  beforeEach(() => {
    useParameterStore.setState({ metadata: null, metadataMavType: null, isLoadingMetadata: false });
  });

  it('loads and records which vehicle it is for', async () => {
    withApi(async () => ({ success: true, metadata: META }));
    await useParameterStore.getState().fetchMetadata(10);
    expect(useParameterStore.getState().metadata).toBeTruthy();
    expect(useParameterStore.getState().metadataMavType).toBe(10);
  });

  it('does not refetch for the same vehicle', async () => {
    const spy = vi.fn(async () => ({ success: true, metadata: META }));
    withApi(spy);
    await useParameterStore.getState().fetchMetadata(10);
    await useParameterStore.getState().fetchMetadata(10);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  // Connecting to a rover after a copter used to keep the copter's lists,
  // because the guard only asked "is there any metadata at all".
  it('refetches when the vehicle type changes', async () => {
    const spy = vi.fn(async () => ({ success: true, metadata: META }));
    withApi(spy);
    await useParameterStore.getState().fetchMetadata(2);
    await useParameterStore.getState().fetchMetadata(10);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(useParameterStore.getState().metadataMavType).toBe(10);
  });

  // The one that cost a session: a rejected IPC call left the flag set, and
  // every later attempt returned early.
  it('clears the in-flight flag when the request throws', async () => {
    withApi(async () => { throw new Error('ipc gone'); });
    await useParameterStore.getState().fetchMetadata(10);
    expect(useParameterStore.getState().isLoadingMetadata).toBe(false);
    expect(useParameterStore.getState().metadata).toBeNull();
  });

  it('can still load after a failure', async () => {
    withApi(async () => { throw new Error('offline'); });
    await useParameterStore.getState().fetchMetadata(10);
    withApi(async () => ({ success: true, metadata: META }));
    await useParameterStore.getState().fetchMetadata(10);
    expect(useParameterStore.getState().metadata).toBeTruthy();
  });

  it('clears the flag when the main process reports failure', async () => {
    withApi(async () => ({ success: false, error: 'HTTP 503' }));
    await useParameterStore.getState().fetchMetadata(10);
    expect(useParameterStore.getState().isLoadingMetadata).toBe(false);
  });
});
