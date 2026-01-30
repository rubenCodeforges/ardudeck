/**
 * ArduPilot RC Sender
 * Sends RC channel values to ArduPilot SITL via UDP port 5501
 *
 * ArduPilot SITL expects RC input as:
 * - UDP packets to localhost:5501
 * - 8x uint16_t values (16 bytes total)
 * - PWM range 1000-2000
 * - Sent at ~50Hz when active
 */

import { createSocket, Socket } from 'node:dgram';
import type { VirtualRCState } from '../../shared/ipc-channels.js';

const RC_PORT = 5501;
const RC_HOST = '127.0.0.1';
const RC_CHANNELS = 8;
const SEND_RATE_HZ = 50;
const SEND_INTERVAL_MS = 1000 / SEND_RATE_HZ;

class ArduPilotRcSender {
  private socket: Socket | null = null;
  private sendInterval: NodeJS.Timeout | null = null;
  private _isRunning = false;
  private rcState: VirtualRCState = {
    roll: 0,
    pitch: 0,
    yaw: 0,
    throttle: -1, // Minimum for safety
    aux1: 0,
    aux2: 0,
    aux3: 0,
    aux4: 0,
  };

  get isRunning(): boolean {
    return this._isRunning;
  }

  /**
   * Start sending RC packets
   */
  start(): void {
    if (this._isRunning) {
      return;
    }

    // Create UDP socket
    this.socket = createSocket('udp4');

    this.socket.on('error', (err) => {
      console.error('[ArduPilot RC] Socket error:', err);
    });

    this._isRunning = true;

    // Start sending at 50Hz
    this.sendInterval = setInterval(() => {
      this.sendRcPacket();
    }, SEND_INTERVAL_MS);

    console.log('[ArduPilot RC] Started RC sender');
  }

  /**
   * Stop sending RC packets
   */
  stop(): void {
    if (this.sendInterval) {
      clearInterval(this.sendInterval);
      this.sendInterval = null;
    }

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    this._isRunning = false;
    console.log('[ArduPilot RC] Stopped RC sender');
  }

  /**
   * Set RC state
   */
  setState(state: Partial<VirtualRCState>): void {
    this.rcState = { ...this.rcState, ...state };
  }

  /**
   * Get current RC state
   */
  getState(): VirtualRCState {
    return { ...this.rcState };
  }

  /**
   * Reset RC state to safe defaults
   */
  reset(): void {
    this.rcState = {
      roll: 0,
      pitch: 0,
      yaw: 0,
      throttle: -1, // Minimum for safety
      aux1: 0,
      aux2: 0,
      aux3: 0,
      aux4: 0,
    };
  }

  /**
   * Convert normalized value (-1 to +1) to PWM (1000-2000)
   */
  private normalizedToPwm(value: number): number {
    // Clamp to -1, +1
    const clamped = Math.max(-1, Math.min(1, value));
    // Convert to 1000-2000
    return Math.round(1500 + clamped * 500);
  }

  /**
   * Send RC packet to SITL
   */
  private sendRcPacket(): void {
    if (!this.socket) {
      return;
    }

    // Build 16-byte packet (8 x uint16_t, little-endian)
    const buffer = Buffer.alloc(RC_CHANNELS * 2);

    // ArduPilot SITL expects channels in order:
    // Ch1=Roll, Ch2=Pitch, Ch3=Throttle, Ch4=Yaw, Ch5-8=AUX1-4
    const channels = [
      this.normalizedToPwm(this.rcState.roll),
      this.normalizedToPwm(this.rcState.pitch),
      this.normalizedToPwm(this.rcState.throttle),
      this.normalizedToPwm(this.rcState.yaw),
      this.normalizedToPwm(this.rcState.aux1),
      this.normalizedToPwm(this.rcState.aux2),
      this.normalizedToPwm(this.rcState.aux3),
      this.normalizedToPwm(this.rcState.aux4),
    ];

    // Write channels as little-endian uint16
    for (let i = 0; i < RC_CHANNELS; i++) {
      buffer.writeUInt16LE(channels[i]!, i * 2);
    }

    // Send to SITL
    this.socket.send(buffer, RC_PORT, RC_HOST, (err) => {
      if (err) {
        console.error('[ArduPilot RC] Send error:', err);
      }
    });
  }

  /**
   * Send a single RC packet immediately (for one-off updates)
   */
  sendOnce(state?: Partial<VirtualRCState>): void {
    if (state) {
      this.setState(state);
    }

    // Create temporary socket if not running continuously
    if (!this.socket) {
      const tempSocket = createSocket('udp4');
      const buffer = this.buildPacket();

      tempSocket.send(buffer, RC_PORT, RC_HOST, (err) => {
        if (err) {
          console.error('[ArduPilot RC] Send error:', err);
        }
        tempSocket.close();
      });
    } else {
      this.sendRcPacket();
    }
  }

  /**
   * Build RC packet buffer
   */
  private buildPacket(): Buffer {
    const buffer = Buffer.alloc(RC_CHANNELS * 2);

    const channels = [
      this.normalizedToPwm(this.rcState.roll),
      this.normalizedToPwm(this.rcState.pitch),
      this.normalizedToPwm(this.rcState.throttle),
      this.normalizedToPwm(this.rcState.yaw),
      this.normalizedToPwm(this.rcState.aux1),
      this.normalizedToPwm(this.rcState.aux2),
      this.normalizedToPwm(this.rcState.aux3),
      this.normalizedToPwm(this.rcState.aux4),
    ];

    for (let i = 0; i < RC_CHANNELS; i++) {
      buffer.writeUInt16LE(channels[i]!, i * 2);
    }

    return buffer;
  }
}

// Singleton instance
export const ardupilotRcSender = new ArduPilotRcSender();
