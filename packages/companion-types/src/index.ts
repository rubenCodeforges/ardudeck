// ============================================================
// Protocol version — bump major on breaking changes
// ============================================================
export const AGENT_PROTOCOL_VERSION = '1.0.0';
export const AGENT_DEFAULT_PORT = 48400;

// ============================================================
// WebSocket message envelope
// ============================================================
export interface WsMessage<T = unknown> {
  channel: WsChannel;
  data: T;
}

export type WsChannel = 'hello' | 'metrics' | 'logs' | 'terminal' | 'processes';

export interface HelloMessage {
  protocolVersion: string;
  agentVersion: string;
  hostname: string;
}

// ============================================================
// System Info (GET /api/v1/info)
// ============================================================
export interface SystemInfo {
  hostname: string;
  os: string;
  arch: string;
  uptime: number;
  agentVersion: string;
  protocolVersion: string;
  dockerAvailable: boolean;
  blueosDetected: boolean;
  terminalAvailable: boolean;
}

// ============================================================
// Metrics (WebSocket channel: metrics)
// ============================================================
export interface MetricsData {
  cpu: number;       // 0-100 percent
  ram: number;       // 0-100 percent
  ramTotal: number;  // bytes
  ramUsed: number;   // bytes
  disk: number;      // 0-100 percent
  diskTotal: number; // bytes
  diskUsed: number;  // bytes
  temp: number;      // Celsius, -1 if unavailable
}

// ============================================================
// Processes
// ============================================================
export interface ProcessInfo {
  pid: number;
  name: string;
  cpu: number;       // 0-100 percent
  ram: number;       // bytes
  user: string;
  command: string;
  isProtected: boolean;
}

// ============================================================
// Log entry
// ============================================================
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  message: string;
  source: string;
}

// ============================================================
// Network
// ============================================================
export interface NetworkInterface {
  name: string;
  ip4: string;
  ip6: string;
  mac: string;
  type: string;       // 'wired' | 'wireless' | 'virtual'
  speed: number;       // Mbps, 0 if unknown
  ssid?: string;       // WiFi only
  signal?: number;     // WiFi only, dBm
}

export interface NetworkInfo {
  interfaces: NetworkInterface[];
}

// ============================================================
// Files
// ============================================================
export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modified: number;   // Unix timestamp ms
}

// ============================================================
// Services (systemd/OpenRC)
// ============================================================
export type ServiceStatus = 'running' | 'stopped' | 'failed' | 'unknown';
export type ServiceAction = 'start' | 'stop' | 'restart';

export interface ServiceInfo {
  name: string;
  description: string;
  status: ServiceStatus;
  enabled: boolean;     // starts on boot
}

// ============================================================
// Docker containers (Layer 3)
// ============================================================
export type ContainerStatus = 'running' | 'stopped' | 'restarting' | 'paused' | 'exited' | 'dead';
export type ContainerAction = 'start' | 'stop' | 'restart';

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  status: ContainerStatus;
  created: number;     // Unix timestamp ms
  ports: string[];     // e.g. "8080:80/tcp"
}

// ============================================================
// BlueOS extensions (Layer 3)
// ============================================================
export interface ExtensionInfo {
  identifier: string;
  name: string;
  description: string;
  version: string;
  enabled: boolean;
  docker_image: string;
}

export interface AvailableExtension {
  identifier: string;
  name: string;
  description: string;
  versions: string[];
  website: string;
}

// ============================================================
// Agent connection state (used by desktop app)
// ============================================================
export type CompanionConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface CompanionState {
  connectionState: CompanionConnectionState;
  agentVersion: string | null;
  protocolVersion: string | null;
  versionMismatch: boolean;

  // Layer 1 (MAVLink)
  heartbeatOnline: boolean;
  lastHeartbeat: number | null;
  companionType: string | null;

  // Layer 2 (Agent)
  systemInfo: SystemInfo | null;
  metrics: MetricsData | null;
  processes: ProcessInfo[];
  network: NetworkInfo | null;
  logs: LogEntry[];

  // Layer 3
  containers: ContainerInfo[];
  extensions: ExtensionInfo[];
}
