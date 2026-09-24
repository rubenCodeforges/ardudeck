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
    console.warn('[test-driver] window.__testing not available: preload dev bridge missing');
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

  register(TESTING_CHANNELS.ENSURE_PARAMETERS_LOADED, async (params) => {
    // Reads the parameter store (lazy-imported to avoid circular deps).
    // If the param map is empty, triggers fetchParameters() and waits for
    // isLoading to flip back to false (or timeout).
    const timeout = params?.timeout ?? 30000;
    const mod = await import('../stores/parameter-store');
    const store = mod.useParameterStore;
    const snap = () => {
      const s = store.getState() as any;
      return {
        size: s.parameters?.size ?? 0,
        isLoading: !!s.isLoading,
        // A full download landed, as opposed to a few parameters that happen to
        // be sitting in the store. Connect-time batch reads (safety monitor,
        // Q_ENABLE, calibration) put a handful there before anything is
        // downloaded, so `size > 0` reported "already loaded" with six
        // unrelated entries and every lookup came back empty until the user
        // opened the Parameters screen and triggered a real fetch.
        complete: typeof s.hasFullParameterSet === 'function' ? s.hasFullParameterSet() : s.size > 0,
      };
    };

    const initial = snap();
    if (initial.complete && initial.size > 0) {
      return { ok: true, count: initial.size, alreadyLoaded: true };
    }

    // Kick off a download if no fetch is already in flight.
    if (!initial.isLoading) {
      const fetchParameters = (store.getState() as any).fetchParameters as
        | (() => Promise<void>)
        | undefined;
      if (typeof fetchParameters !== 'function') {
        throw new Error('parameter store has no fetchParameters action');
      }
      void fetchParameters();
    }

    // Wait for a COMPLETED download, not merely for loading to stop.
    return new Promise<{ ok: true; count: number; alreadyLoaded: false }>((resolve, reject) => {
      const start = Date.now();
      let stableStart: number | null = null;
      const unsub = store.subscribe(() => {});
      const tick = () => {
        const s = snap();
        if (s.complete && s.size > 0 && !s.isLoading) {
          // Settle for 250ms to avoid returning mid-download when batches arrive.
          if (stableStart === null) stableStart = Date.now();
          if (Date.now() - stableStart >= 250) {
            unsub();
            resolve({ ok: true, count: s.size, alreadyLoaded: false });
            return;
          }
        } else {
          stableStart = null;
        }
        if (Date.now() - start > timeout) {
          unsub();
          reject(new Error(`Timeout (${timeout}ms) waiting for parameters to load`));
          return;
        }
        setTimeout(tick, 100);
      };
      tick();
    });
  });

  register(TESTING_CHANNELS.PROPOSE_PARAMETERS, async (params) => {
    // Armed-guard + denylist + drive the existing file-diff compare modal.
    // Waits for the user to apply or dismiss, then returns the outcome.
    const DENY = new Set<string>([
      'MOT_PWM_TYPE', 'FRAME_CLASS', 'FRAME_TYPE',
      'COMPASS_ORIENT', 'BRD_TYPE',
    ]);
    const TIMEOUT_MS = params?.timeout ?? 5 * 60 * 1000;
    const proposals = (params?.proposals ?? []) as Array<{
      name: string;
      value: number;
      reason?: string;
    }>;
    if (!Array.isArray(proposals) || proposals.length === 0) {
      throw new Error('proposals array is empty');
    }

    const telemetryMod = await import('../stores/telemetry-store');
    const paramMod = await import('../stores/parameter-store');

    const tState = telemetryMod.useTelemetryStore.getState() as any;
    if (tState?.flight?.armed) {
      return {
        ok: false,
        reason: 'vehicle is armed, disarm before applying parameter changes',
      };
    }

    // A full set has to be present before diffing, not merely some parameters:
    // connect-time batch reads leave a handful in the store, and against those
    // every proposal is rejected as "unknown parameter".
    const pStore = paramMod.useParameterStore;
    const hasAll = () => {
      const st = pStore.getState() as any;
      return typeof st.hasFullParameterSet === 'function'
        ? st.hasFullParameterSet()
        : (st.parameters?.size ?? 0) > 0;
    };
    if (!hasAll()) {
      const fetchParameters = (pStore.getState() as any).fetchParameters as
        | (() => Promise<void>)
        | undefined;
      if (typeof fetchParameters === 'function') {
        await fetchParameters();
        const deadline = Date.now() + 45_000;
        while (Date.now() < deadline) {
          if (hasAll()) break;
          await new Promise((r) => setTimeout(r, 100));
        }
      }
    }
    if (!hasAll()) {
      return { ok: false, reason: 'parameters are not loaded; could not verify the proposals' };
    }

    const paramMap: Map<string, any> = (pStore.getState() as any).parameters;
    const diffs: any[] = [];
    const rejected: Array<{ name: string; reason: string }> = [];
    for (const p of proposals) {
      if (DENY.has(p.name)) {
        rejected.push({ name: p.name, reason: 'denylisted (identity/motor-topology)' });
        continue;
      }
      const existing = paramMap.get(p.name);
      if (!existing) {
        rejected.push({ name: p.name, reason: 'unknown parameter' });
        continue;
      }
      if (existing.isReadOnly) {
        rejected.push({ name: p.name, reason: 'read-only' });
        continue;
      }
      const newValue = Number(p.value);
      if (Number.isNaN(newValue)) {
        rejected.push({ name: p.name, reason: 'value is not numeric' });
        continue;
      }
      diffs.push({
        paramId: p.name,
        currentValue: existing.value,
        fileValue: newValue,
        type: existing.type,
        selected: true,
        note: p.reason,
      });
    }

    if (diffs.length === 0) {
      return { ok: false, reason: 'no applicable proposals', rejected };
    }

    // Drive the existing compare modal
    pStore.setState({
      fileParamDiffs: diffs,
      fileSkippedParams: [],
      fileSkippedCount: 0,
      fileTotalCount: diffs.length,
      fileVehicleType: null,
      showCompareModal: true,
      applyProgress: null,
      fileApplyResult: null,
      lastFileApplyOutcome: null,
    } as any);

    // No navigation: ParameterCompareModalRoot is mounted at App root exactly so
    // this dialog appears over whatever view the user is on. Yanking them to the
    // Parameters screen to approve a change moves them away from what they were
    // doing, mid-flight included.

    // Wait for the user to apply or cancel. The outcome is read from
    // lastFileApplyOutcome, not fileApplyResult: the latter is null on a clean
    // apply and is cleared again when the summary dialog is dismissed, so
    // waiting for the modal to close and reading it reported every successful
    // apply as a cancellation.
    return new Promise<any>((resolve, reject) => {
      const started = Date.now();
      const tick = () => {
        const s = pStore.getState() as any;
        const outcome = s.lastFileApplyOutcome;
        if (outcome) {
          const failedParams: string[] = outcome.failedParams ?? [];
          resolve({
            ok: outcome.failed === 0,
            applied: outcome.applied,
            failed: outcome.failed,
            failedParams,
            rebootRequired: outcome.rebootRequired,
            rejected,
            ...(outcome.failed > 0
              ? { reason: `${outcome.failed} of ${outcome.applied + outcome.failed} parameters failed to write` }
              : {}),
          });
          return;
        }
        if (!s.showCompareModal && !s.isApplyingFileParams) {
          resolve({ ok: false, reason: 'user cancelled', rejected });
          return;
        }
        if (Date.now() - started > TIMEOUT_MS) {
          pStore.setState({ showCompareModal: false, fileParamDiffs: [] } as any);
          reject(new Error('Timeout waiting for user to review proposed parameters'));
          return;
        }
        setTimeout(tick, 200);
      };
      tick();
    });
  });

  // Signal that the test driver is ready
  window.__testing.signalReady();
  console.log('[test-driver] All IPC handlers registered and ready');
}

// Auto-init
init().catch((err) => console.error('[test-driver] Init failed:', err));
