import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  PythonPluginEvent,
  PythonPluginLogEvent,
  PythonPluginStatus,
  PythonPluginStatusEvent,
  PythonRpcParams,
  PythonRpcResult,
} from '../../shared/python-plugin-types';

export interface PluginEventHandler {
  (payload: unknown, meta: { event: string; timestamp: number }): void;
}

export interface UsePythonPluginResult {
  status: PythonPluginStatus | 'unknown';
  pid: number | undefined;
  error: string | undefined;
  logs: PythonPluginLogEvent[];
  /** Invoke a JSON-RPC method on the running plugin. */
  call: <T = PythonRpcResult>(method: string, params?: PythonRpcParams) => Promise<T>;
  /** Subscribe to a single event name; returns unsubscribe. */
  on: (event: string, handler: PluginEventHandler) => () => void;
  /** Clear the in-memory log buffer (does not affect the main process). */
  clearLogs: () => void;
}

const MAX_LOGS = 500;

/**
 * React hook for consuming a single Python plugin from the renderer.
 *
 * Tracks live status, buffers log events, and exposes a typed `call()` for
 * issuing RPC requests. Event subscribers are dispatched only for the slug
 * supplied to the hook so multiple plugins can coexist without cross-talk.
 */
export function usePythonPlugin(slug: string): UsePythonPluginResult {
  const [status, setStatus] = useState<PythonPluginStatus | 'unknown'>('unknown');
  const [pid, setPid] = useState<number | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [logs, setLogs] = useState<PythonPluginLogEvent[]>([]);
  const listenersRef = useRef<Map<string, Set<PluginEventHandler>>>(new Map());

  // Pull initial state once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await window.electronAPI.pythonPluginList();
        if (cancelled) return;
        const me = list.find((p) => p.slug === slug);
        if (me) {
          setStatus(me.status);
          setPid(me.pid);
          setError(me.error);
        }
      } catch {
        // Initial fetch failures are non-fatal — events will reconcile state.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    const offStatus = window.electronAPI.onPythonPluginStatus(
      (event: PythonPluginStatusEvent) => {
        if (event.slug !== slug) return;
        setStatus(event.status);
        setPid(event.pid);
        setError(event.error);
      },
    );

    const offLog = window.electronAPI.onPythonPluginLog((event: PythonPluginLogEvent) => {
      if (event.slug !== slug) return;
      setLogs((prev) => {
        const next = prev.length >= MAX_LOGS ? prev.slice(prev.length - MAX_LOGS + 1) : prev.slice();
        next.push(event);
        return next;
      });
    });

    const offEvent = window.electronAPI.onPythonPluginEvent((event: PythonPluginEvent) => {
      if (event.slug !== slug) return;
      const handlers = listenersRef.current.get(event.event);
      if (!handlers) return;
      for (const handler of handlers) {
        try {
          handler(event.payload, { event: event.event, timestamp: event.timestamp });
        } catch (err) {
          // Surfacing handler errors via console keeps the UI alive.
          console.error(`[usePythonPlugin] handler for "${event.event}" threw`, err);
        }
      }
    });

    return () => {
      offStatus();
      offLog();
      offEvent();
    };
  }, [slug]);

  const call = useCallback(
    async <T = PythonRpcResult>(method: string, params?: PythonRpcParams): Promise<T> => {
      const response = await window.electronAPI.pythonPluginCall(slug, method, params);
      if (!response.ok) {
        throw new Error(response.error);
      }
      return response.result as T;
    },
    [slug],
  );

  const on = useCallback((event: string, handler: PluginEventHandler) => {
    const listeners = listenersRef.current;
    let set = listeners.get(event);
    if (!set) {
      set = new Set();
      listeners.set(event, set);
    }
    set.add(handler);
    return () => {
      const current = listeners.get(event);
      if (!current) return;
      current.delete(handler);
      if (current.size === 0) listeners.delete(event);
    };
  }, []);

  const clearLogs = useCallback(() => setLogs([]), []);

  return useMemo(
    () => ({ status, pid, error, logs, call, on, clearLogs }),
    [status, pid, error, logs, call, on, clearLogs],
  );
}
