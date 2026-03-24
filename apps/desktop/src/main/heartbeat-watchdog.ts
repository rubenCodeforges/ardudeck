/**
 * HeartbeatWatchdog — detects when a vehicle stops sending heartbeats.
 *
 * ArduPilot sends heartbeats at 1 Hz. If no heartbeat arrives within the
 * configured timeout (default 5 000 ms = 5 missed heartbeats), the watchdog
 * fires an `onTimeout` callback so the caller can trigger a disconnect.
 *
 * This fixes issue #47: connection showing "Connected" despite vehicle being
 * powered off for over 30 minutes without using the Disconnect button.
 *
 * Usage in ipc-handlers.ts:
 *   - call `start()` when the first vehicle heartbeat confirms a connection
 *   - call `reset()` on each subsequent real vehicle heartbeat
 *   - call `stop()` on manual disconnect or cleanup
 */

/** Default matches HEARTBEAT_WATCHDOG_MS in ipc-handlers.ts */
const DEFAULT_TIMEOUT_MS = 5000;

export interface HeartbeatWatchdogOptions {
  /** Milliseconds of silence before triggering disconnect. Default: 5000 */
  timeoutMs?: number;
  /** Called when no heartbeat has been received within the timeout window */
  onTimeout: () => void;
}

export class HeartbeatWatchdog {
  private readonly timeoutMs: number;
  private readonly onTimeout: () => void;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: HeartbeatWatchdogOptions) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.onTimeout = options.onTimeout;
  }

  /** Whether the watchdog has an active timer running */
  get isActive(): boolean {
    return this.timer !== null;
  }

  /** Start the watchdog. Safe to call multiple times (resets existing timer). */
  start(): void {
    this.scheduleTimeout();
  }

  /**
   * Reset the watchdog timer. Call on each real vehicle heartbeat.
   * If the watchdog was stopped, this implicitly restarts it.
   */
  reset(): void {
    this.scheduleTimeout();
  }

  /** Stop the watchdog. Safe to call when already stopped. */
  stop(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleTimeout(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      this.onTimeout();
    }, this.timeoutMs);
  }
}
