import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useParameterStore } from './parameter-store';
import { useConnectionStore } from './connection-store';

const REAL32 = 9;

function seedParam(id: string, value: number) {
  useParameterStore.getState().bulkLoadParameters([
    { paramId: id, paramValue: value, paramType: REAL32, paramCount: 1, paramIndex: 0 },
  ]);
}

function setFirmware(firmware: string | undefined) {
  const cs = useConnectionStore.getState().connectionState;
  useConnectionStore.setState({ connectionState: { ...cs, firmware } as typeof cs });
}

const setParameterIpc = vi.fn(async () => ({ success: true }));

describe('parameter-store PX4 staged writes', () => {
  beforeEach(() => {
    setParameterIpc.mockClear();
    (globalThis as { window?: unknown }).window = { electronAPI: { setParameter: setParameterIpc } };
    useParameterStore.getState().reset();
    seedParam('NAV_RCL_ACT', 2);
  });

  it('px4: setParameter stages locally and sends NOTHING to the vehicle', async () => {
    setFirmware('px4');
    const ok = await useParameterStore.getState().setParameter('NAV_RCL_ACT', 3);
    expect(ok).toBe(true);
    expect(setParameterIpc).not.toHaveBeenCalled();
    const p = useParameterStore.getState().parameters.get('NAV_RCL_ACT');
    expect(p?.value).toBe(3);
    expect(p?.isModified).toBe(true);
    expect(p?.originalValue).toBe(2);
  });

  it('px4: commitStagedParams sends the staged PARAM_SETs', async () => {
    setFirmware('px4');
    await useParameterStore.getState().setParameter('NAV_RCL_ACT', 3);
    const result = await useParameterStore.getState().commitStagedParams();
    expect(result.written).toBe(1);
    expect(result.failed).toEqual([]);
    expect(setParameterIpc).toHaveBeenCalledWith('NAV_RCL_ACT', 3, REAL32);
  });

  it('px4: commitStagedParams reports failed writes and keeps them modified', async () => {
    setFirmware('px4');
    setParameterIpc.mockResolvedValueOnce({ success: false });
    await useParameterStore.getState().setParameter('NAV_RCL_ACT', 3);
    const result = await useParameterStore.getState().commitStagedParams();
    expect(result.failed).toEqual(['NAV_RCL_ACT']);
    expect(useParameterStore.getState().parameters.get('NAV_RCL_ACT')?.isModified).toBe(true);
  });

  it('px4: editing back to the original value un-stages the param', async () => {
    setFirmware('px4');
    await useParameterStore.getState().setParameter('NAV_RCL_ACT', 3);
    await useParameterStore.getState().setParameter('NAV_RCL_ACT', 2);
    expect(useParameterStore.getState().parameters.get('NAV_RCL_ACT')?.isModified).toBe(false);
    const result = await useParameterStore.getState().commitStagedParams();
    expect(result.written).toBe(0);
    expect(setParameterIpc).not.toHaveBeenCalled();
  });

  it('px4: an unsolicited PARAM_VALUE does not clobber a staged edit', async () => {
    setFirmware('px4');
    await useParameterStore.getState().setParameter('NAV_RCL_ACT', 3);
    useParameterStore.getState().updateParameter({
      paramId: 'NAV_RCL_ACT', paramValue: 2, paramType: REAL32, paramCount: 1, paramIndex: 0,
    });
    const p = useParameterStore.getState().parameters.get('NAV_RCL_ACT');
    expect(p?.value).toBe(3);
    expect(p?.isModified).toBe(true);
  });

  it('px4: setParameterImmediate still writes straight through (action flows)', async () => {
    setFirmware('px4');
    await useParameterStore.getState().setParameterImmediate('NAV_RCL_ACT', 3);
    expect(setParameterIpc).toHaveBeenCalledWith('NAV_RCL_ACT', 3, REAL32);
  });

  it('ardupilot: setParameter stages locally and sends NOTHING to the vehicle', async () => {
    setFirmware('ardupilot');
    const ok = await useParameterStore.getState().setParameter('NAV_RCL_ACT', 3);
    expect(ok).toBe(true);
    expect(setParameterIpc).not.toHaveBeenCalled();
    const p = useParameterStore.getState().parameters.get('NAV_RCL_ACT');
    expect(p?.value).toBe(3);
    expect(p?.isModified).toBe(true);
    expect(p?.originalValue).toBe(2);
  });

  it('ardupilot: commitStagedParams sends the staged PARAM_SETs', async () => {
    setFirmware('ardupilot');
    await useParameterStore.getState().setParameter('NAV_RCL_ACT', 3);
    const result = await useParameterStore.getState().commitStagedParams();
    expect(setParameterIpc).toHaveBeenCalledWith('NAV_RCL_ACT', 3, REAL32);
    expect(result.failed).toEqual([]);
  });

  it('uncached params still write immediately: nothing to diff against', async () => {
    setFirmware('ardupilot');
    await useParameterStore.getState().setParameter('NOT_IN_CACHE', 7);
    expect(setParameterIpc).toHaveBeenCalledWith('NOT_IN_CACHE', 7, REAL32);
  });
});
