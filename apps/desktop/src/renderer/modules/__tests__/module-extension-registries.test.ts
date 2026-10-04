// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { HardwareProduct } from '@ardudeck/module-sdk';
import {
  boardPortLabel, boardPortRegistry, cardsForSlot, configCardRegistry, detectHardware, hardwareCatalogRegistry, matchProduct, matchUsbProduct,
} from '../module-extension-registries';
import { createSlugRegistry } from '../slug-registry';
import { allTemplates, getTemplate, registerModuleTemplate, unregisterModuleTemplates } from '../../lib/vehicle-templates/registry';
import type { VehicleTemplate } from '../../lib/vehicle-templates/types';
import type { DroneCanNode } from '../../../shared/dronecan-types';

const LED: HardwareProduct = {
  id: 'led', vendor: 'UAV-DEV', name: 'DroneCAN status light', category: 'lighting', kit: 'Nav kit',
  match: { dronecanNodeName: 'com.uav-dev.led*' },
};
const FC: HardwareProduct = { id: 'fc', vendor: 'Matek', name: 'H743-WLITE', category: 'autopilot', match: { boardId: 1013 } };

const node = (nodeId: number, name?: string): DroneCanNode => ({
  nodeId, name, health: 0, mode: 0, subMode: 0, vendorStatus: 0, uptimeSec: 1, lastSeenMs: 0, online: true,
});

describe('slug registry', () => {
  it('scopes entries to the registering module and sweeps on unload', () => {
    const r = createSlugRegistry<number>();
    r.register('a.x', 'one', 1);
    r.register('b.y', 'one', 2);
    r.unregister('b.y', 'missing');
    expect(r.list()).toHaveLength(2);
    r.unregisterAll('a.x');
    expect(r.list().map((e) => e.slug)).toEqual(['b.y']);
  });

  it('keeps the snapshot reference stable until a change', () => {
    const r = createSlugRegistry<number>();
    r.register('a.x', 'one', 1);
    const first = r.list();
    expect(r.list()).toBe(first);
    r.register('a.x', 'two', 2);
    expect(r.list()).not.toBe(first);
  });
});

describe('hardware catalog', () => {
  beforeEach(() => {
    hardwareCatalogRegistry.unregisterAll('com.uav-dev');
    hardwareCatalogRegistry.register('com.uav-dev', 'catalog', [LED, FC]);
  });

  it('matches DroneCAN names by prefix and exact name', () => {
    const catalogs = hardwareCatalogRegistry.list();
    expect(matchProduct(catalogs, { dronecanNodeName: 'com.uav-dev.led' })?.id).toBe('led');
    expect(matchProduct(catalogs, { dronecanNodeName: 'com.uav-dev.ledv2' })?.moduleSlug).toBe('com.uav-dev');
    expect(matchProduct(catalogs, { dronecanNodeName: 'org.ardupilot.ap_periph' })).toBeUndefined();
  });

  it('derives the APJ board id from board_version', () => {
    const detected = detectHardware(hardwareCatalogRegistry.list(), { name: 'MatekH743', boardVersion: 1013 << 16 }, [node(125, 'com.uav-dev.led'), node(42)]);
    expect(detected[0]).toMatchObject({ source: 'flight-controller', boardId: 1013, product: { name: 'H743-WLITE' } });
    expect(detected[1]).toMatchObject({ source: 'dronecan', nodeId: 125, product: { kit: 'Nav kit' } });
    expect(detected[2]!.product).toBeUndefined();
  });

  it('lists nothing for the flight controller when disconnected', () => {
    expect(detectHardware(hardwareCatalogRegistry.list(), null, [])).toEqual([]);
  });
});

describe('config cards', () => {
  it('filters by slot and orders by order', () => {
    const C = () => null;
    configCardRegistry.register('m.a', 'late', { id: 'late', slot: 'notify', order: 5, component: C });
    configCardRegistry.register('m.a', 'early', { id: 'early', slot: 'notify', order: 1, component: C });
    configCardRegistry.register('m.a', 'gps', { id: 'gps', slot: 'gps', component: C });
    expect(cardsForSlot(configCardRegistry.list(), 'notify').map((e) => e.id)).toEqual(['early', 'late']);
    configCardRegistry.unregisterAll('m.a');
    expect(configCardRegistry.list()).toEqual([]);
  });
});

describe('module vehicle templates', () => {
  const tpl = (slug: string): VehicleTemplate => ({
    slug, name: 'Kit', description: '', icon: (() => null) as never, vehicleType: 'copter', category: 'multirotor',
    defaults: {}, toParams: () => [], toSimParams: () => [], inferFrom: () => 0,
  });

  it('adds module templates next to the built-ins and removes them on unload', () => {
    const before = allTemplates().length;
    registerModuleTemplate('com.uav-dev', tpl('com.uav-dev.nav-kit'));
    expect(allTemplates()).toHaveLength(before + 1);
    expect(getTemplate('com.uav-dev.nav-kit')?.name).toBe('Kit');
    unregisterModuleTemplates('com.uav-dev');
    expect(allTemplates()).toHaveLength(before);
  });

  it('refuses to shadow a built-in or another module', () => {
    expect(() => registerModuleTemplate('com.uav-dev', tpl('copter-quad-x'))).toThrow(/built-in/);
    registerModuleTemplate('a.one', tpl('shared.kit'));
    expect(() => registerModuleTemplate('b.two', tpl('shared.kit'))).toThrow(/a\.one/);
    unregisterModuleTemplates('a.one');
  });
});

describe('host api writes go through review', () => {
  const setParam = vi.fn(async () => ({ success: true, data: { index: 0, name: 'X', value: { type: 'integer', value: 1 }, defaultValue: { type: 'empty' } } }));
  const setParameter = vi.fn();

  beforeEach(() => {
    setParam.mockClear();
    setParameter.mockClear();
    (window as unknown as { electronAPI: unknown }).electronAPI = {
      dronecanSetParam: setParam,
      dronecanGetParam: vi.fn(async () => ({ success: true, data: { index: 0, name: 'X', value: { type: 'integer', value: 0 }, defaultValue: { type: 'empty' } } })),
      dronecanSaveParams: vi.fn(async () => ({ success: true, data: true })),
      dronecanRestartNode: vi.fn(async () => ({ success: true, data: true })),
      setParameter,
    };
  });

  it('refuses DroneCAN proposals without the dronecan permission', async () => {
    const { createRendererHostApi } = await import('../module-host-renderer');
    const denied = createRendererHostApi('com.example', () => {}, []);
    await expect(denied.dronecan.proposeParams(1, [{ name: 'X', value: { type: 'integer', value: 1 } }])).rejects.toThrow(/dronecan/);
    await expect(denied.dronecan.restartNode(1)).rejects.toThrow(/dronecan/);
  });

  it('writes a DroneCAN parameter only after the pilot applies in the dialog', async () => {
    const { createRendererHostApi } = await import('../module-host-renderer');
    const review = await import('../../lib/dronecan-review');
    const host = createRendererHostApi('com.example', () => {}, ['dronecan']);
    const result = host.dronecan.proposeParams(7, [{ name: 'X', value: { type: 'integer', value: 1 } }], { reason: 'test' });
    await vi.waitFor(() => expect(review.getPendingDroneCanWrite()).not.toBeNull());
    expect(setParam).not.toHaveBeenCalled();
    const pending = review.getPendingDroneCanWrite()!;
    expect(pending.request).toMatchObject({ from: 'com.example', nodeId: 7, reason: 'test', changes: [{ name: 'X', current: { type: 'integer', value: 0 } }] });
    await review.performDroneCanWrite(pending, false);
    await expect(result).resolves.toMatchObject({ accepted: true, failed: [], saved: false });
    expect(setParam).toHaveBeenCalledTimes(1);
  });

  it('writes nothing when the pilot cancels', async () => {
    const { createRendererHostApi } = await import('../module-host-renderer');
    const review = await import('../../lib/dronecan-review');
    const host = createRendererHostApi('com.example', () => {}, ['dronecan']);
    const result = host.dronecan.proposeParams(7, [{ name: 'X', value: { type: 'integer', value: 1 } }]);
    await vi.waitFor(() => expect(review.getPendingDroneCanWrite()).not.toBeNull());
    review.cancelDroneCanWrite();
    await expect(result).resolves.toMatchObject({ accepted: false });
    expect(setParam).not.toHaveBeenCalled();
  });

  it('never lets params.set write directly', async () => {
    const { createRendererHostApi } = await import('../module-host-renderer');
    const host = createRendererHostApi('com.example', () => {}, []);
    await expect(host.params.set('ATC_RAT_RLL_P', 0.1)).rejects.toThrow();
    expect(setParameter).not.toHaveBeenCalled();
  });
});

describe('usb and board port hooks', () => {
  it('matches a USB bridge only with the manufacturer string', () => {
    hardwareCatalogRegistry.register('com.uav-dev', 'catalog', [
      { id: 'db', vendor: 'UAV-DEV', name: 'DroneBridge GROUND', category: 'datalink', match: { usb: { vendorId: 0x10c4, productId: 0xea60, manufacturer: 'UAV-DEV GmbH' } } },
    ]);
    const catalogs = hardwareCatalogRegistry.list();
    expect(matchUsbProduct(catalogs, { vendorId: '10c4', productId: 'ea60', manufacturer: 'UAV-DEV GmbH' })?.name).toBe('DroneBridge GROUND');
    expect(matchUsbProduct(catalogs, { vendorId: '10c4', productId: 'ea60', manufacturer: 'Silicon Labs' })).toBeUndefined();
    hardwareCatalogRegistry.unregisterAll('com.uav-dev');
  });

  it('labels serial ports only for the matching board', () => {
    boardPortRegistry.register('com.uav-dev', 'board:5230', { boardId: 5230, ports: [{ serial: 2, label: 'GNSS', note: 'PPS on pin 4' }] });
    const entries = boardPortRegistry.list();
    expect(boardPortLabel(entries, 5230, 2)?.label).toBe('GNSS');
    expect(boardPortLabel(entries, 5230, 1)).toBeUndefined();
    expect(boardPortLabel(entries, 1013, 2)).toBeUndefined();
    boardPortRegistry.unregisterAll('com.uav-dev');
  });
});
