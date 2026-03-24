import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HeartbeatWatchdog } from '../heartbeat-watchdog.js';

describe('HeartbeatWatchdog', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('timeout detection (issue #47: vehicle powered off without disconnect)', () => {
    it('fires onTimeout after the configured timeout with no heartbeat', () => {
      const onTimeout = vi.fn();
      const watchdog = new HeartbeatWatchdog({ timeoutMs: 5000, onTimeout });

      watchdog.start();
      vi.advanceTimersByTime(5000);

      expect(onTimeout).toHaveBeenCalledOnce();
    });

    it('does not fire before the timeout elapses', () => {
      const onTimeout = vi.fn();
      const watchdog = new HeartbeatWatchdog({ timeoutMs: 5000, onTimeout });

      watchdog.start();
      vi.advanceTimersByTime(4999);

      expect(onTimeout).not.toHaveBeenCalled();
    });

    it('uses 5000ms default matching HEARTBEAT_WATCHDOG_MS', () => {
      const onTimeout = vi.fn();
      const watchdog = new HeartbeatWatchdog({ onTimeout });

      watchdog.start();
      vi.advanceTimersByTime(4999);
      expect(onTimeout).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(onTimeout).toHaveBeenCalledOnce();
    });
  });

  describe('heartbeat reset (vehicle still alive)', () => {
    it('resets the timer when a heartbeat is received', () => {
      const onTimeout = vi.fn();
      const watchdog = new HeartbeatWatchdog({ timeoutMs: 5000, onTimeout });

      watchdog.start();
      vi.advanceTimersByTime(4000); // 4s in, no timeout yet
      watchdog.reset(); // vehicle heartbeat received — restart timer
      vi.advanceTimersByTime(4000); // 4s after reset — still within window

      expect(onTimeout).not.toHaveBeenCalled();
    });

    it('fires timeout 5s after last heartbeat, not first', () => {
      const onTimeout = vi.fn();
      const watchdog = new HeartbeatWatchdog({ timeoutMs: 5000, onTimeout });

      watchdog.start();

      // Simulate 1Hz heartbeats for 10 seconds
      for (let i = 0; i < 10; i++) {
        vi.advanceTimersByTime(1000);
        watchdog.reset();
      }

      expect(onTimeout).not.toHaveBeenCalled();

      // Now stop sending heartbeats — watchdog should fire after 5s
      vi.advanceTimersByTime(5000);
      expect(onTimeout).toHaveBeenCalledOnce();
    });

    it('survives rapid resets without leaking timers', () => {
      const onTimeout = vi.fn();
      const watchdog = new HeartbeatWatchdog({ timeoutMs: 5000, onTimeout });

      watchdog.start();

      // Rapid-fire resets (e.g. burst of heartbeats)
      for (let i = 0; i < 100; i++) {
        watchdog.reset();
      }

      // Only one timer should be active — timeout fires once after 5s from last reset
      vi.advanceTimersByTime(5000);
      expect(onTimeout).toHaveBeenCalledOnce();
    });
  });

  describe('stop (manual disconnect)', () => {
    it('cancels the watchdog timer on stop', () => {
      const onTimeout = vi.fn();
      const watchdog = new HeartbeatWatchdog({ timeoutMs: 5000, onTimeout });

      watchdog.start();
      vi.advanceTimersByTime(3000);
      watchdog.stop();
      vi.advanceTimersByTime(5000);

      expect(onTimeout).not.toHaveBeenCalled();
    });

    it('can be stopped before starting without error', () => {
      const onTimeout = vi.fn();
      const watchdog = new HeartbeatWatchdog({ timeoutMs: 5000, onTimeout });

      expect(() => watchdog.stop()).not.toThrow();
    });

    it('can be stopped multiple times without error', () => {
      const onTimeout = vi.fn();
      const watchdog = new HeartbeatWatchdog({ timeoutMs: 5000, onTimeout });

      watchdog.start();
      watchdog.stop();
      expect(() => watchdog.stop()).not.toThrow();
    });
  });

  describe('restart after stop', () => {
    it('can be restarted after being stopped', () => {
      const onTimeout = vi.fn();
      const watchdog = new HeartbeatWatchdog({ timeoutMs: 5000, onTimeout });

      watchdog.start();
      watchdog.stop();

      // Restart (new connection established)
      watchdog.start();
      vi.advanceTimersByTime(5000);

      expect(onTimeout).toHaveBeenCalledOnce();
    });

    it('reset after stop restarts the watchdog', () => {
      const onTimeout = vi.fn();
      const watchdog = new HeartbeatWatchdog({ timeoutMs: 5000, onTimeout });

      watchdog.start();
      watchdog.stop();

      // Reset implicitly restarts
      watchdog.reset();
      vi.advanceTimersByTime(5000);

      expect(onTimeout).toHaveBeenCalledOnce();
    });
  });

  describe('isActive state', () => {
    it('reports inactive before start', () => {
      const watchdog = new HeartbeatWatchdog({ onTimeout: vi.fn() });
      expect(watchdog.isActive).toBe(false);
    });

    it('reports active after start', () => {
      const watchdog = new HeartbeatWatchdog({ onTimeout: vi.fn() });
      watchdog.start();
      expect(watchdog.isActive).toBe(true);
    });

    it('reports inactive after stop', () => {
      const watchdog = new HeartbeatWatchdog({ onTimeout: vi.fn() });
      watchdog.start();
      watchdog.stop();
      expect(watchdog.isActive).toBe(false);
    });

    it('reports inactive after timeout fires', () => {
      const watchdog = new HeartbeatWatchdog({ timeoutMs: 5000, onTimeout: vi.fn() });
      watchdog.start();
      vi.advanceTimersByTime(5000);
      expect(watchdog.isActive).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('timeout fires only once even if time continues advancing', () => {
      const onTimeout = vi.fn();
      const watchdog = new HeartbeatWatchdog({ timeoutMs: 5000, onTimeout });

      watchdog.start();
      vi.advanceTimersByTime(30000); // 30s — simulating the 30-minute scenario from issue

      expect(onTimeout).toHaveBeenCalledOnce();
    });

    it('does not fire timeout if stopped just before expiry', () => {
      const onTimeout = vi.fn();
      const watchdog = new HeartbeatWatchdog({ timeoutMs: 5000, onTimeout });

      watchdog.start();
      vi.advanceTimersByTime(4999);
      watchdog.stop();
      vi.advanceTimersByTime(1);

      expect(onTimeout).not.toHaveBeenCalled();
    });

    it('handles start called multiple times (idempotent)', () => {
      const onTimeout = vi.fn();
      const watchdog = new HeartbeatWatchdog({ timeoutMs: 5000, onTimeout });

      watchdog.start();
      watchdog.start(); // double start
      watchdog.start(); // triple start

      vi.advanceTimersByTime(5000);

      // Should only fire once, not three times
      expect(onTimeout).toHaveBeenCalledOnce();
    });
  });
});
