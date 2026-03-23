// apps/desktop/src/renderer/testing/store-registry.ts

type StoreApi = {
  getState: () => any;
  subscribe: (listener: (state: any, prevState: any) => void) => () => void;
};

const registry = new Map<string, StoreApi>();

export function registerStore(name: string, store: StoreApi): void {
  registry.set(name, store);
}

export function getStoreState(storeName: string, path?: string): any {
  const store = registry.get(storeName);
  if (!store) {
    throw new Error(
      `Store "${storeName}" not found. Available: ${[...registry.keys()].join(', ')}`
    );
  }

  const state = store.getState();

  if (!path) {
    return JSON.parse(JSON.stringify(state, (_key, value) => {
      if (typeof value === 'function') return undefined;
      return value;
    }));
  }

  const parts = path.split('.');
  let current: any = state;
  for (const part of parts) {
    if (current == null) return undefined;
    current = current[part];
  }

  return JSON.parse(JSON.stringify(current, (_key, value) => {
    if (typeof value === 'function') return undefined;
    return value;
  }));
}

export function waitForStoreCondition(
  storeName: string,
  path: string,
  expectedValue: any,
  timeout: number = 10000
): Promise<void> {
  const store = registry.get(storeName);
  if (!store) {
    throw new Error(`Store "${storeName}" not found.`);
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error(`Timeout waiting for ${storeName}.${path} === ${JSON.stringify(expectedValue)}`));
    }, timeout);

    // Check immediately
    const currentValue = getNestedValue(store.getState(), path);
    if (JSON.stringify(currentValue) === JSON.stringify(expectedValue)) {
      clearTimeout(timer);
      resolve();
      return;
    }

    const unsubscribe = store.subscribe((state: any) => {
      const value = getNestedValue(state, path);
      if (JSON.stringify(value) === JSON.stringify(expectedValue)) {
        clearTimeout(timer);
        unsubscribe();
        resolve();
      }
    });
  });
}

function getNestedValue(obj: any, path: string): any {
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current == null) return undefined;
    current = current[part];
  }
  return current;
}

export function listStoreNames(): string[] {
  return [...registry.keys()];
}

export async function registerAllStores(): Promise<void> {
  const storeMap: Record<string, () => Promise<any>> = {
    'ardupilot-sitl': () => import('../stores/ardupilot-sitl-store'),
    'calibration': () => import('../stores/calibration-store'),
    'cli': () => import('../stores/cli-store'),
    'companion': () => import('../stores/companion-store'),
    'connection': () => import('../stores/connection-store'),
    'console': () => import('../stores/console-store'),
    'edit-mode': () => import('../stores/edit-mode-store'),
    'fence': () => import('../stores/fence-store'),
    'firmware': () => import('../stores/firmware-store'),
    'flight-control': () => import('../stores/flight-control-store'),
    'layout': () => import('../stores/layout-store'),
    'legacy-config': () => import('../stores/legacy-config-store'),
    'lua-graph': () => import('../stores/lua-graph-store'),
    'messages': () => import('../stores/messages-store'),
    'mission-library': () => import('../stores/mission-library-store'),
    'mission': () => import('../stores/mission-store'),
    'modes-wizard': () => import('../stores/modes-wizard-store'),
    'module': () => import('../stores/module-store'),
    'msp-telemetry': () => import('../stores/msp-telemetry-store'),
    'navigation': () => import('../stores/navigation-store'),
    'network': () => import('../stores/network-store'),
    'osd': () => import('../stores/osd-store'),
    'overlay': () => import('../stores/overlay-store'),
    'parameter': () => import('../stores/parameter-store'),
    'payload': () => import('../stores/payload-store'),
    'quick-setup': () => import('../stores/quick-setup-store'),
    'rally': () => import('../stores/rally-store'),
    'receiver': () => import('../stores/receiver-store'),
    'servo-wizard': () => import('../stores/servo-wizard-store'),
    'settings': () => import('../stores/settings-store'),
    'signing': () => import('../stores/signing-store'),
    'sitl': () => import('../stores/sitl-store'),
    'survey': () => import('../stores/survey-store'),
    'telemetry': () => import('../stores/telemetry-store'),
    'tile-cache': () => import('../stores/tile-cache-store'),
    'update': () => import('../stores/update-store'),
  };

  for (const [name, importFn] of Object.entries(storeMap)) {
    try {
      const mod = await importFn();
      const hookName = Object.keys(mod).find((k) => k.startsWith('use') && k.endsWith('Store'));
      if (hookName && mod[hookName]) {
        registerStore(name, mod[hookName]);
      }
    } catch (err) {
      console.warn(`[test-driver] Failed to register store "${name}":`, err);
    }
  }

  console.log(`[test-driver] Registered ${registry.size} stores: ${listStoreNames().join(', ')}`);
}
