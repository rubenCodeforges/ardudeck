/**
 * Companion Connection Manager
 * WebSocket client that connects to the ArduDeck Agent daemon
 * running on a companion computer (Raspberry Pi, Jetson, etc.)
 */

import WebSocket from 'ws';
import { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels.js';
import type { CompanionConnectionIpcState } from '../../shared/ipc-channels.js';
import { AGENT_DEFAULT_PORT } from '@ardudeck/companion-types';
import type {
  WsMessage,
  HelloMessage,
  MetricsData,
  ProcessInfo,
  LogEntry,
} from '@ardudeck/companion-types';

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

interface CompanionConnectionOptions {
  host: string;
  port: number;
  token: string;
}

// Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 30s
const BACKOFF_BASE = 1000;
const BACKOFF_MAX = 30000;

export class CompanionConnection {
  private ws: WebSocket | null = null;
  private state: ConnectionState = 'disconnected';
  private options: CompanionConnectionOptions | null = null;
  private mainWindow: BrowserWindow | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private shouldReconnect = false;
  private agentVersion: string | null = null;
  private protocolVersion: string | null = null;
  private versionMismatch = false;

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win;
  }

  getState(): CompanionConnectionIpcState {
    return {
      state: this.state,
      host: this.options?.host ?? null,
      port: this.options?.port ?? null,
      agentVersion: this.agentVersion,
      protocolVersion: this.protocolVersion,
      versionMismatch: this.versionMismatch,
      reconnectAttempt: this.reconnectAttempt,
    };
  }

  isConnected(): boolean {
    return this.state === 'connected';
  }

  async connect(host: string, port: number, token: string): Promise<boolean> {
    // Disconnect existing connection first
    if (this.ws) {
      this.disconnect();
    }

    this.options = { host, port, token };
    this.shouldReconnect = true;
    this.reconnectAttempt = 0;

    return this.doConnect();
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.clearReconnectTimer();

    if (this.ws) {
      this.ws.removeAllListeners();
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close(1000, 'User disconnect');
      }
      this.ws = null;
    }

    this.state = 'disconnected';
    this.agentVersion = null;
    this.protocolVersion = null;
    this.versionMismatch = false;
    this.reconnectAttempt = 0;
    this.sendStateToRenderer();
  }

  /** Send data to the agent WebSocket (for terminal, etc.) */
  send(channel: string, data: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ channel, data }));
    }
  }

  /** Make an authenticated REST request to the agent */
  async restGet<T>(path: string): Promise<T> {
    if (!this.options) throw new Error('Not connected');
    const url = `http://${this.options.host}:${this.options.port}/api/v1${path}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.options.token}` } as Record<string, string>,
    });
    if (!res.ok) throw new Error(`Agent API error: ${res.status} ${res.statusText}`);
    return res.json() as Promise<T>;
  }

  /** Make an authenticated REST POST to the agent */
  async restPost<T>(path: string, body?: unknown): Promise<T> {
    if (!this.options) throw new Error('Not connected');
    const url = `http://${this.options.host}:${this.options.port}/api/v1${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.options.token}`,
    };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`Agent API error: ${res.status} ${res.statusText}`);
    return res.json() as Promise<T>;
  }

  // ------- private -------

  private doConnect(): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.options) {
        resolve(false);
        return;
      }

      const { host, port, token } = this.options;
      this.setState(this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting');

      const wsUrl = `ws://${host}:${port}/ws`;
      this.ws = new WebSocket(wsUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });

      let resolved = false;

      this.ws.on('open', () => {
        // Wait for hello message before declaring connected
      });

      this.ws.on('message', (raw: WebSocket.RawData) => {
        try {
          const msg = JSON.parse(raw.toString()) as WsMessage;
          this.handleMessage(msg);

          // First message should be hello — mark connected
          if (msg.channel === 'hello' && !resolved) {
            resolved = true;
            resolve(true);
          }
        } catch {
          // Ignore malformed messages
        }
      });

      this.ws.on('close', (_code: number) => {
        if (!resolved) {
          resolved = true;
          resolve(false);
        }
        this.handleDisconnect();
      });

      this.ws.on('error', (_err: Error) => {
        if (!resolved) {
          resolved = true;
          resolve(false);
        }
        // close event will follow
      });

      // Connection timeout (5s)
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          if (this.ws?.readyState === WebSocket.CONNECTING) {
            this.ws.close();
          }
          resolve(false);
        }
      }, 5000);
    });
  }

  private handleMessage(msg: WsMessage): void {
    if (!this.mainWindow?.webContents) return;
    const send = this.mainWindow.webContents.send.bind(this.mainWindow.webContents);

    switch (msg.channel) {
      case 'hello': {
        const hello = msg.data as HelloMessage;
        this.agentVersion = hello.agentVersion;
        this.protocolVersion = hello.protocolVersion;
        // Check major version match
        const agentMajor = hello.protocolVersion.split('.')[0];
        const expectedMajor = '1'; // AGENT_PROTOCOL_VERSION major
        this.versionMismatch = agentMajor !== expectedMajor;
        this.reconnectAttempt = 0;
        this.setState('connected');
        break;
      }
      case 'metrics':
        send(IPC_CHANNELS.COMPANION_METRICS, msg.data);
        break;
      case 'processes':
        send(IPC_CHANNELS.COMPANION_PROCESSES, msg.data);
        break;
      case 'logs':
        send(IPC_CHANNELS.COMPANION_LOGS, msg.data);
        break;
      case 'terminal':
        send(IPC_CHANNELS.COMPANION_TERMINAL_DATA, msg.data);
        break;
    }
  }

  private handleDisconnect(): void {
    this.ws = null;
    if (this.shouldReconnect) {
      this.setState('reconnecting');
      this.scheduleReconnect();
    } else {
      this.setState('disconnected');
    }
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    this.reconnectAttempt++;
    const delay = Math.min(BACKOFF_BASE * Math.pow(2, this.reconnectAttempt - 1), BACKOFF_MAX);
    this.sendStateToRenderer();
    this.reconnectTimer = setTimeout(async () => {
      if (this.shouldReconnect) {
        await this.doConnect();
      }
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private setState(state: ConnectionState): void {
    this.state = state;
    this.sendStateToRenderer();
  }

  private sendStateToRenderer(): void {
    if (this.mainWindow?.webContents) {
      this.mainWindow.webContents.send(
        IPC_CHANNELS.COMPANION_CONNECTION_STATE,
        this.getState(),
      );
    }
  }
}

// Singleton instance
export const companionConnection = new CompanionConnection();
