// apps/desktop/src/renderer/testing/ipc-handlers.ts
import { TESTING_CHANNELS } from '../../shared/testing-channels';
import {
  findElements,
  click,
  type,
  selectOption,
  scroll,
  keyboard,
  hover,
  getPageState,
  getElementText,
  listTestIds,
  waitForElement,
} from './test-driver';
import {
  registerAllStores,
  getStoreState,
  waitForStoreCondition,
  listStoreNames,
} from './store-registry';

declare global {
  interface Window {
    __testing?: {
      onTestRequest: (channel: string, callback: (requestId: string, params: any) => void) => void;
      sendTestResponse: (channel: string, requestId: string, result: { success: boolean; data?: any; error?: string }) => void;
      signalReady: () => void;
    };
  }
}

/**
 * Helper: register a test handler that bridges the contextBridge API.
 */
function register(channel: string, handler: (params: any) => Promise<any>): void {
  const testing = window.__testing;
  if (!testing) return;

  testing.onTestRequest(channel, async (requestId: string, params: any) => {
    try {
      const result = await handler(params);
      testing.sendTestResponse(channel, requestId, { success: true, data: result });
    } catch (err: any) {
      testing.sendTestResponse(channel, requestId, {
        success: false,
        error: err?.message || String(err),
      });
    }
  });
}

async function init(): Promise<void> {
  if (!window.__testing) {
    console.warn('[test-driver] window.__testing not available — preload dev bridge missing');
    return;
  }

  // Register all Zustand stores
  await registerAllStores();

  // --- Observation handlers ---

  register(TESTING_CHANNELS.FIND_ELEMENTS, async (params) => {
    return findElements(params);
  });

  register(TESTING_CHANNELS.GET_PAGE_STATE, async () => {
    return getPageState();
  });

  register(TESTING_CHANNELS.GET_STORE_STATE, async (params) => {
    return getStoreState(params.storeName, params.path);
  });

  register(TESTING_CHANNELS.GET_ELEMENT_TEXT, async (params) => {
    return getElementText(params.selector, params.by);
  });

  register(TESTING_CHANNELS.LIST_TEST_IDS, async (params) => {
    return listTestIds(params?.scope);
  });

  register(TESTING_CHANNELS.GET_APP_INFO, async () => {
    return {
      storeNames: listStoreNames(),
      windowSize: { width: window.innerWidth, height: window.innerHeight },
      userAgent: navigator.userAgent,
    };
  });

  register(TESTING_CHANNELS.GET_VIEWS, async () => {
    try {
      const navState = getStoreState('navigation');
      return navState;
    } catch {
      return { error: 'navigation store not available' };
    }
  });

  // --- Interaction handlers ---

  register(TESTING_CHANNELS.CLICK, async (params) => {
    click(params.selector, params.by, params.options);
    return { clicked: params.selector };
  });

  register(TESTING_CHANNELS.TYPE, async (params) => {
    type(params.selector, params.text, params.by, params.options);
    return { typed: params.text, into: params.selector };
  });

  register(TESTING_CHANNELS.SELECT, async (params) => {
    selectOption(params.selector, params.value, params.by);
    return { selected: params.value, in: params.selector };
  });

  register(TESTING_CHANNELS.SCROLL, async (params) => {
    scroll(params.selector, params.direction, params.amount);
    return { scrolled: params.direction };
  });

  register(TESTING_CHANNELS.KEYBOARD, async (params) => {
    keyboard(params.key);
    return { pressed: params.key };
  });

  register(TESTING_CHANNELS.HOVER, async (params) => {
    hover(params.selector, params.by);
    return { hovered: params.selector };
  });

  register(TESTING_CHANNELS.NAVIGATE, async (params) => {
    // Use navigation store's setView action to switch views
    try {
      const navMod = await import('../stores/navigation-store');
      const hookName = Object.keys(navMod).find((k) => k.startsWith('use') && k.endsWith('Store'));
      if (hookName) {
        const store = (navMod as any)[hookName];
        const state = store.getState();
        if (typeof state.setView === 'function') {
          state.setView(params.view);
        } else {
          throw new Error('Navigation store has no setView action');
        }
      }
      return { navigated: params.view };
    } catch (err: any) {
      throw new Error(`Navigation failed: ${err.message}`);
    }
  });

  // --- Waiting handlers ---

  register(TESTING_CHANNELS.WAIT_FOR_ELEMENT, async (params) => {
    await waitForElement(params.selector, params.by, params.options);
    return { found: params.selector };
  });

  register(TESTING_CHANNELS.WAIT_FOR_STORE, async (params) => {
    await waitForStoreCondition(params.storeName, params.path, params.value, params.timeout);
    return { matched: `${params.storeName}.${params.path}` };
  });

  register(TESTING_CHANNELS.WAIT_FOR_IDLE, async (params) => {
    // Simple implementation: wait for no loading spinners for 500ms
    // Future: monkey-patch window.electronAPI to track in-flight IPC calls
    const timeout = params?.timeout ?? 10000;
    const start = Date.now();
    return new Promise<{ idle: true }>((resolve, reject) => {
      let stableStart: number | null = null;
      const check = () => {
        if (Date.now() - start > timeout) {
          reject(new Error(`Timeout (${timeout}ms) waiting for idle`));
          return;
        }
        const spinners = document.querySelectorAll(
          '.animate-spin, [class*="loading"], [class*="spinner"]'
        );
        if (spinners.length === 0) {
          if (stableStart === null) stableStart = Date.now();
          if (Date.now() - stableStart >= 500) {
            resolve({ idle: true });
            return;
          }
        } else {
          stableStart = null;
        }
        requestAnimationFrame(check);
      };
      check();
    });
  });

  // Signal that the test driver is ready
  window.__testing.signalReady();
  console.log('[test-driver] All IPC handlers registered and ready');
}

// Auto-init
init().catch((err) => console.error('[test-driver] Init failed:', err));
