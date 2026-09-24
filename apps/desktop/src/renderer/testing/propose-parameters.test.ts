// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./test-driver', () => ({
  findElements: vi.fn(), click: vi.fn(), type: vi.fn(), selectOption: vi.fn(),
  scroll: vi.fn(), keyboard: vi.fn(), hover: vi.fn(), getPageState: vi.fn(),
  getElementText: vi.fn(), listTestIds: vi.fn(), waitForElement: vi.fn(),
}));
vi.mock('./store-registry', () => ({
  registerAllStores: vi.fn(async () => {}),
  getStoreState: vi.fn(),
  waitForStoreCondition: vi.fn(),
  listStoreNames: vi.fn(() => []),
}));

import { TESTING_CHANNELS } from '../../shared/testing-channels';
import { useParameterStore } from '../stores/parameter-store';

const REAL32 = 9;
const handlers = new Map<string, (requestId: string, params: any) => void>();
const responses: any[] = [];
const setParameterBatch = vi.fn(async (params: Array<{ paramId: string }>) => ({
  success: true, sent: params.length, confirmed: params.length, failed: [] as string[],
}));

(window as any).__testing = {
  onTestRequest: (channel: string, cb: (requestId: string, params: any) => void) => {
    handlers.set(channel, cb);
  },
  sendTestResponse: (_channel: string, requestId: string, result: any) => {
    responses.push({ requestId, result });
  },
  signalReady: () => {},
};
(window as any).electronAPI = { setParameterBatch };

// Registers the handlers under test via the module's auto-init.
await import('./ipc-handlers');

function propose(proposals: Array<{ name: string; value: number }>): Promise<any> {
  const requestId = `req-${responses.length}`;
  handlers.get(TESTING_CHANNELS.PROPOSE_PARAMETERS)!(requestId, { proposals });
  return vi.waitFor(() => {
    const hit = responses.find(r => r.requestId === requestId);
    if (!hit) throw new Error('no response yet');
    return hit;
  }, { timeout: 5000, interval: 20 });
}

const modalOpen = () => vi.waitFor(() => {
  if (!useParameterStore.getState().showCompareModal) throw new Error('modal not open');
}, { timeout: 5000, interval: 20 });

describe('propose_parameters outcome reporting', () => {
  beforeEach(() => {
    setParameterBatch.mockClear();
    responses.length = 0;
    useParameterStore.getState().reset();
    useParameterStore.getState().bulkLoadParameters([
      { paramId: 'ATC_ANG_RLL_P', paramValue: 4.5, paramType: REAL32, paramCount: 2, paramIndex: 0 },
      { paramId: 'ATC_ANG_PIT_P', paramValue: 4.5, paramType: REAL32, paramCount: 2, paramIndex: 1 },
    ]);
  });

  it('reports a clean apply as applied, not as a cancellation', async () => {
    const pending = propose([{ name: 'ATC_ANG_RLL_P', value: 6 }]);
    await modalOpen();
    await useParameterStore.getState().applySelectedFileParams();

    const { result } = await pending;
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ ok: true, applied: 1, failed: 0, failedParams: [] });
    expect(result.data.reason).toBeUndefined();
  });

  it('survives the summary dialog being dismissed after the apply', async () => {
    useParameterStore.setState({ metadata: { ATC_ANG_RLL_P: { rebootRequired: true } } as any });
    const pending = propose([{ name: 'ATC_ANG_RLL_P', value: 6 }]);
    await modalOpen();
    await useParameterStore.getState().applySelectedFileParams();
    useParameterStore.getState().clearFileApplyResult();
    useParameterStore.getState().closeCompareModal();

    const { result } = await pending;
    expect(result.data).toMatchObject({ ok: true, applied: 1 });
    expect(result.data.rebootRequired).toEqual(['ATC_ANG_RLL_P']);
  });

  it('reports a dismissed modal as cancelled', async () => {
    const pending = propose([{ name: 'ATC_ANG_RLL_P', value: 6 }]);
    await modalOpen();
    useParameterStore.getState().closeCompareModal();

    const { result } = await pending;
    expect(result.data).toMatchObject({ ok: false, reason: 'user cancelled' });
    expect(setParameterBatch).not.toHaveBeenCalled();
  });

  it('names the parameters that failed to write', async () => {
    setParameterBatch.mockResolvedValueOnce({
      success: false, sent: 2, confirmed: 1, failed: ['ATC_ANG_PIT_P'],
    });
    const pending = propose([
      { name: 'ATC_ANG_RLL_P', value: 6 },
      { name: 'ATC_ANG_PIT_P', value: 6 },
    ]);
    await modalOpen();
    await useParameterStore.getState().applySelectedFileParams();

    const { result } = await pending;
    expect(result.data.ok).toBe(false);
    expect(result.data.applied).toBe(1);
    expect(result.data.failedParams).toEqual(['ATC_ANG_PIT_P']);
  });

  it('reports up-front rejections for denylisted params', async () => {
    const { result } = await propose([{ name: 'FRAME_CLASS', value: 2 }]);
    expect(result.data).toMatchObject({ ok: false, reason: 'no applicable proposals' });
    expect(result.data.rejected[0]).toMatchObject({ name: 'FRAME_CLASS' });
  });
});
