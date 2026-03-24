/**
 * Integration-style tests for HeartbeatWatchdog in the connection lifecycle.
 *
 * These tests verify the watchdog works correctly in the context of how
 * ipc-handlers.ts uses it — simulating the mock transport, connection state,
 * and the disconnect flow triggered by the watchdog timeout.
 *
 * Covers issue #47: connection showing "Connected" despite vehicle being
 * powered off for over 30 minutes without pressing Disconnect.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HeartbeatWatchdog } from '../heartbeat-watchdog.js';

// ---------------------------------------------------------------------------
// Mock types that mirror the ipc-handlers.ts runtime objects
// ---------------------------------------------------------------------------

interface MockConnectionState {
  isConnected: boolean;
  isWaitingForHeartbeat: boolean;
  protocol: 'mavlink' | 'msp' | null;
}

interface MockTransport {
  isOpen: boolean;
  close: ReturnType<typeof vi.fn>;
}

// ---------------------------------------------------------------------------
// Helper: simulates the connection lifecycle from ipc-handlers.ts
// ---------------------------------------------------------------------------

function createConnectionLifecycle() {
  const connectionState: MockConnectionState = {
    isConnected: false,
    isWaitingForHeartbeat: false,
    protocol: null,
  };

  const transport: MockTransport = {
    isOpen: true,
    close: vi.fn().mockResolvedValue(undefined),
  };

  const callbacks = {
    onLog: vi.fn(),
    onConnectionStateChanged: vi.fn(),
    onCleanup: vi.fn(),
  };

  // This mirrors resetHeartbeatWatchdog() in ipc-handlers.ts
  const watchdog = new HeartbeatWatchdog({
    timeoutMs: 5000,
    onTimeout: () => {
      // Guard: don't disconnect if already disconnected (matches ipc-handlers.ts)
      if (!connectionState.isConnected) return;

      callbacks.onLog('warn', 'Vehicle heartbeat lost');

      if (transport.isOpen) {
        // Close transport to trigger normal disconnect flow
        transport.close().catch(() => {});
      } else {
        // Transport already closed — manually clean up connection state
        callbacks.onCleanup();
        connectionState.isConnected = false;
        connectionState.isWaitingForHeartbeat = false;
        callbacks.onLog('info', 'Connection closed');
        callbacks.onConnectionStateChanged();
      }
    },
  });

  /** Simulate vehicle connecting (first heartbeat received) */
  const connect = () => {
    connectionState.isWaitingForHeartbeat = false;
    connectionState.isConnected = true;
    connectionState.protocol = 'mavlink';
    transport.isOpen = true;
    watchdog.start();
    callbacks.onConnectionStateChanged();
  };

  /** Simulate receiving a vehicle heartbeat (1 Hz from ArduPilot) */
  const receiveHeartbeat = () => {
    if (connectionState.isConnected) {
      watchdog.reset();
    }
  };

  /** Simulate manual disconnect (user presses Disconnect button) */
  const manualDisconnect = () => {
    watchdog.stop();
    connectionState.isConnected = false;
    connectionState.isWaitingForHeartbeat = false;
    transport.isOpen = false;
    callbacks.onConnectionStateChanged();
  };

  return { connectionState, transport, callbacks, watchdog, connect, receiveHeartbeat, manualDisconnect };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HeartbeatWatchdog integration (issue #47)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('issue #47 scenario: UDP vehicle powered off without Disconnect', () => {
    it('detects vehicle power-off and triggers disconnect within 5 seconds', () => {
      const { connectionState, callbacks, connect, receiveHeartbeat } = createConnectionLifecycle();

      // Establish connection
      connect();
      expect(connectionState.isConnected).toBe(true);

      // Simulate 60 seconds of normal 1Hz heartbeats
      for (let i = 0; i < 60; i++) {
        vi.advanceTimersByTime(1000);
        receiveHeartbeat();
      }
      expect(connectionState.isConnected).toBe(true);
      expect(callbacks.onLog).not.toHaveBeenCalledWith('warn', 'Vehicle heartbeat lost');

      // Vehicle powers off — no more heartbeats
      // After 5 seconds of silence, watchdog should fire
      vi.advanceTimersByTime(5000);

      expect(callbacks.onLog).toHaveBeenCalledWith('warn', 'Vehicle heartbeat lost');
    });

    it('triggers transport.close() when transport is still open (UDP stays open)', () => {
      const { transport, connect, receiveHeartbeat } = createConnectionLifecycle();

      connect();

      // Receive a few heartbeats then stop (vehicle powered off)
      for (let i = 0; i < 5; i++) {
        vi.advanceTimersByTime(1000);
        receiveHeartbeat();
      }

      // UDP transports stay open even when the remote stops sending
      expect(transport.isOpen).toBe(true);

      // Watchdog fires after 5s of silence
      vi.advanceTimersByTime(5000);

      expect(transport.close).toHaveBeenCalledOnce();
    });

    it('manually cleans up state when transport is already closed', () => {
      const { connectionState, transport, callbacks, connect, receiveHeartbeat } = createConnectionLifecycle();

      connect();

      // Simulate heartbeats then stop
      for (let i = 0; i < 3; i++) {
        vi.advanceTimersByTime(1000);
        receiveHeartbeat();
      }

      // Transport closed before watchdog fires (e.g. network error)
      transport.isOpen = false;

      // Watchdog fires
      vi.advanceTimersByTime(5000);

      expect(transport.close).not.toHaveBeenCalled();
      expect(callbacks.onCleanup).toHaveBeenCalledOnce();
      expect(connectionState.isConnected).toBe(false);
      expect(callbacks.onConnectionStateChanged).toHaveBeenCalled();
    });

    it('does NOT detect false disconnect while receiving regular heartbeats', () => {
      const { connectionState, callbacks, connect, receiveHeartbeat } = createConnectionLifecycle();

      connect();

      // Simulate 30 minutes (1800 seconds) of normal 1Hz heartbeats
      for (let i = 0; i < 1800; i++) {
        vi.advanceTimersByTime(1000);
        receiveHeartbeat();
      }

      expect(connectionState.isConnected).toBe(true);
      expect(callbacks.onLog).not.toHaveBeenCalledWith('warn', 'Vehicle heartbeat lost');
    });
  });

  describe('connection state guard', () => {
    it('does nothing if connection already marked disconnected when watchdog fires', () => {
      const { connectionState, transport, callbacks, connect } = createConnectionLifecycle();

      connect();

      // Externally set disconnected (e.g. another error handler ran first)
      connectionState.isConnected = false;

      // Watchdog fires, but guard should prevent any action
      vi.advanceTimersByTime(5000);

      expect(transport.close).not.toHaveBeenCalled();
      expect(callbacks.onCleanup).not.toHaveBeenCalled();
      expect(callbacks.onLog).not.toHaveBeenCalledWith('warn', 'Vehicle heartbeat lost');
    });
  });

  describe('manual disconnect prevents watchdog', () => {
    it('watchdog does not fire after manual disconnect', () => {
      const { callbacks, connect, receiveHeartbeat, manualDisconnect } = createConnectionLifecycle();

      connect();

      // A few heartbeats
      for (let i = 0; i < 3; i++) {
        vi.advanceTimersByTime(1000);
        receiveHeartbeat();
      }

      // User presses Disconnect — stops watchdog
      manualDisconnect();

      // Wait well past the timeout
      vi.advanceTimersByTime(10000);

      expect(callbacks.onLog).not.toHaveBeenCalledWith('warn', 'Vehicle heartbeat lost');
    });

    it('watchdog is stopped even if disconnect happens just before expiry', () => {
      const { callbacks, connect, manualDisconnect } = createConnectionLifecycle();

      connect();

      // Wait until 1ms before watchdog would fire
      vi.advanceTimersByTime(4999);

      manualDisconnect();

      // The 1ms that would have triggered it
      vi.advanceTimersByTime(1);

      expect(callbacks.onLog).not.toHaveBeenCalledWith('warn', 'Vehicle heartbeat lost');
    });
  });

  describe('reconnection lifecycle', () => {
    it('watchdog restarts correctly after reconnection', () => {
      const { connectionState, callbacks, connect, receiveHeartbeat, manualDisconnect } = createConnectionLifecycle();

      // First connection
      connect();
      for (let i = 0; i < 5; i++) {
        vi.advanceTimersByTime(1000);
        receiveHeartbeat();
      }
      manualDisconnect();
      expect(connectionState.isConnected).toBe(false);

      // Reset mocks for clean assertions on second connection
      callbacks.onLog.mockClear();

      // Second connection
      connect();
      expect(connectionState.isConnected).toBe(true);

      // Stop sending heartbeats — watchdog should fire for the second connection too
      vi.advanceTimersByTime(5000);

      expect(callbacks.onLog).toHaveBeenCalledWith('warn', 'Vehicle heartbeat lost');
    });

    it('old watchdog does not interfere with new connection', () => {
      const { connectionState, callbacks, connect, manualDisconnect } = createConnectionLifecycle();

      // First connection — no heartbeats after connect
      connect();
      vi.advanceTimersByTime(3000); // 3s into watchdog

      // Disconnect and immediately reconnect
      manualDisconnect();
      callbacks.onLog.mockClear();

      connect();

      // 2s later (would have been 5s from first connect, but that timer was stopped)
      vi.advanceTimersByTime(2000);
      expect(connectionState.isConnected).toBe(true);
      expect(callbacks.onLog).not.toHaveBeenCalledWith('warn', 'Vehicle heartbeat lost');

      // Full 5s from second connect triggers normally
      vi.advanceTimersByTime(3000);
      expect(callbacks.onLog).toHaveBeenCalledWith('warn', 'Vehicle heartbeat lost');
    });
  });

  describe('heartbeat timing patterns', () => {
    it('survives irregular heartbeat intervals (jitter)', () => {
      const { connectionState, callbacks, connect, receiveHeartbeat } = createConnectionLifecycle();

      connect();

      // Simulate jittery heartbeats (800ms-1200ms intervals) for 30s
      const intervals = [800, 1200, 950, 1100, 900, 1050, 1150, 850, 1000, 1000,
                         800, 1200, 950, 1100, 900, 1050, 1150, 850, 1000, 1000,
                         800, 1200, 950, 1100, 900, 1050, 1150, 850, 1000, 1000];
      for (const interval of intervals) {
        vi.advanceTimersByTime(interval);
        receiveHeartbeat();
      }

      expect(connectionState.isConnected).toBe(true);
      expect(callbacks.onLog).not.toHaveBeenCalledWith('warn', 'Vehicle heartbeat lost');
    });

    it('detects loss after intermittent heartbeats (some missed, then total stop)', () => {
      const { callbacks, connect, receiveHeartbeat } = createConnectionLifecycle();

      connect();

      // Normal heartbeats for 10s
      for (let i = 0; i < 10; i++) {
        vi.advanceTimersByTime(1000);
        receiveHeartbeat();
      }

      // Miss 3 heartbeats (3s gap) — still within 5s window
      vi.advanceTimersByTime(3000);
      receiveHeartbeat(); // vehicle recovers briefly

      // Miss another 2 heartbeats
      vi.advanceTimersByTime(2000);
      receiveHeartbeat(); // still alive

      // Now complete silence — vehicle powered off
      vi.advanceTimersByTime(5000);

      expect(callbacks.onLog).toHaveBeenCalledWith('warn', 'Vehicle heartbeat lost');
    });

    it('a single heartbeat at 4.9s prevents timeout', () => {
      const { connectionState, callbacks, connect, receiveHeartbeat } = createConnectionLifecycle();

      connect();

      // Wait 4.9s (almost at timeout)
      vi.advanceTimersByTime(4900);
      expect(callbacks.onLog).not.toHaveBeenCalledWith('warn', 'Vehicle heartbeat lost');

      // Just-in-time heartbeat
      receiveHeartbeat();

      // Another 4.9s — still alive
      vi.advanceTimersByTime(4900);
      expect(connectionState.isConnected).toBe(true);
      expect(callbacks.onLog).not.toHaveBeenCalledWith('warn', 'Vehicle heartbeat lost');
    });

    it('only resets watchdog when isConnected is true (not during handshake)', () => {
      const { connectionState, watchdog } = createConnectionLifecycle();

      // During handshake, isConnected is false — heartbeats should NOT reset watchdog
      connectionState.isConnected = false;
      connectionState.isWaitingForHeartbeat = true;

      // Calling receiveHeartbeat when not connected should not affect watchdog
      // (receiveHeartbeat checks connectionState.isConnected)
      watchdog.start();

      // Simulate what ipc-handlers.ts does: only reset if isConnected
      if (connectionState.isConnected) {
        watchdog.reset(); // should NOT execute
      }

      // Watchdog should still fire from original start() since no reset happened
      vi.advanceTimersByTime(5000);
      expect(watchdog.isActive).toBe(false); // timer fired
    });
  });

  describe('watchdog fires only once per disconnect', () => {
    it('onTimeout callback is invoked exactly once', () => {
      const { callbacks, connect } = createConnectionLifecycle();

      connect();

      // Let watchdog fire
      vi.advanceTimersByTime(5000);
      expect(callbacks.onLog).toHaveBeenCalledWith('warn', 'Vehicle heartbeat lost');

      const callCount = callbacks.onLog.mock.calls.filter(
        (args: string[]) => args[0] === 'warn' && args[1] === 'Vehicle heartbeat lost'
      ).length;

      // Even after much more time passes, no second fire
      vi.advanceTimersByTime(60000);

      const callCountAfter = callbacks.onLog.mock.calls.filter(
        (args: string[]) => args[0] === 'warn' && args[1] === 'Vehicle heartbeat lost'
      ).length;

      expect(callCount).toBe(1);
      expect(callCountAfter).toBe(1);
    });
  });

  describe('HEARTBEAT_WATCHDOG_MS constant alignment', () => {
    it('default timeout matches the 5000ms constant from ipc-handlers.ts', () => {
      const onTimeout = vi.fn();
      const watchdog = new HeartbeatWatchdog({ onTimeout });

      watchdog.start();

      // Should NOT fire at 4999ms
      vi.advanceTimersByTime(4999);
      expect(onTimeout).not.toHaveBeenCalled();

      // Should fire at exactly 5000ms
      vi.advanceTimersByTime(1);
      expect(onTimeout).toHaveBeenCalledOnce();
    });
  });
});
