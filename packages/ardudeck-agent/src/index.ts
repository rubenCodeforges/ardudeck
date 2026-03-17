// index.ts
import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { AGENT_PROTOCOL_VERSION } from '@ardudeck/companion-types';
import type { WsMessage, HelloMessage, MetricsData, ProcessInfo, LogEntry } from '@ardudeck/companion-types';
import { loadOrCreateToken, validateToken } from './auth.js';
import { startDiscovery, stopDiscovery } from './discovery.js';
import { loadConfig } from './config.js';
import { collectMetrics } from './metrics.js';
import { listProcesses, killProcess } from './processes.js';
import { listServices, controlService } from './services.js';
import { listDirectory, readFile, writeFile } from './files.js';
import { collectNetworkInfo } from './network.js';
import { isDockerAvailable, listContainers, controlContainer, getContainerLogs } from './docker.js';
import { isBlueOSAvailable, listInstalledExtensions, listAvailableExtensions, installExtension, removeExtension, getExtensionLogs } from './blueos.js';
import { createSession, writeToSession, resizeSession, destroySession, destroyAllSessions, isTerminalAvailable } from './terminal.js';
import { startLogTailing, onLogEntry, stopLogTailing } from './logs.js';
import { subnetMiddleware } from './subnet.js';
import os from 'os';

const config = loadConfig();
const token = loadOrCreateToken(config.tokenPath);

// ---- Express REST API ----
const app = express();
app.use(express.json());

// --- Subnet enforcement (before auth middleware) ---
app.use(subnetMiddleware(config.subnetOnly));

// Auth middleware for REST
function authMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing authorization' });
    return;
  }
  if (!validateToken(auth.slice(7), token)) {
    res.status(403).json({ error: 'Invalid token' });
    return;
  }
  next();
}

app.use('/api/v1', authMiddleware);

// Health endpoint (no auth)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// --- Platform detection (run once at startup) ---
let dockerAvailable = false;
let blueosDetected = false;

async function detectPlatforms(): Promise<void> {
  dockerAvailable = await isDockerAvailable();
  blueosDetected = await isBlueOSAvailable();
  console.log(`[platform] Docker: ${dockerAvailable}, BlueOS: ${blueosDetected}`);
}

// --- Info endpoint ---
app.get('/api/v1/info', (_req, res) => {
  res.json({
    hostname: os.hostname(),
    os: `${os.type()} ${os.release()}`,
    arch: os.arch(),
    uptime: os.uptime(),
    agentVersion: '0.1.0',
    protocolVersion: AGENT_PROTOCOL_VERSION,
    dockerAvailable,
    blueosDetected,
    terminalAvailable: isTerminalAvailable() && config.terminalEnabled,
  });
});

// --- Network ---
app.get('/api/v1/network', async (_req, res) => {
  res.json(await collectNetworkInfo());
});

// --- Processes ---
app.get('/api/v1/processes', async (_req, res) => {
  res.json(await listProcesses(config.protectedProcesses));
});

app.post('/api/v1/processes/:pid/kill', async (req, res) => {
  const pid = parseInt(req.params.pid, 10);
  if (isNaN(pid)) { res.status(400).json({ error: 'Invalid PID' }); return; }
  const result = await killProcess(pid, config.protectedProcesses);
  res.status(result.success ? 200 : 400).json(result);
});

// --- Services ---
app.get('/api/v1/services', async (_req, res) => {
  res.json(await listServices());
});

app.post('/api/v1/services/:name/:action', async (req, res) => {
  const { name, action } = req.params;
  if (!['start', 'stop', 'restart'].includes(action)) {
    res.status(400).json({ error: 'Invalid action' }); return;
  }
  const result = await controlService(name, action as 'start' | 'stop' | 'restart');
  res.status(result.success ? 200 : 400).json(result);
});

// --- Files ---
app.get('/api/v1/files', async (req, res) => {
  try {
    const dirPath = (req.query.path as string) || '/';
    const entries = await listDirectory(config.fileRoot, dirPath);
    res.json(entries);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.get('/api/v1/files/read', async (req, res) => {
  try {
    const filePath = req.query.path as string;
    if (!filePath) { res.status(400).json({ error: 'path required' }); return; }
    const content = await readFile(config.fileRoot, filePath);
    res.send(content);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.post('/api/v1/files/write', async (req, res) => {
  try {
    const { path: filePath, data } = req.body;
    if (!filePath || !data) { res.status(400).json({ error: 'path and data required' }); return; }
    await writeFile(config.fileRoot, filePath, Buffer.from(data, 'base64'));
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// --- Docker (Layer 3) ---
app.get('/api/v1/docker/containers', async (_req, res) => {
  if (!dockerAvailable) { res.json([]); return; }
  res.json(await listContainers());
});

app.post('/api/v1/docker/containers/:id/:action', async (req, res) => {
  if (!dockerAvailable) { res.status(404).json({ error: 'Docker not available' }); return; }
  const { id, action } = req.params;
  if (!['start', 'stop', 'restart'].includes(action)) {
    res.status(400).json({ error: 'Invalid action' }); return;
  }
  const result = await controlContainer(id, action as 'start' | 'stop' | 'restart');
  res.status(result.success ? 200 : 400).json(result);
});

app.get('/api/v1/docker/containers/:id/logs', async (req, res) => {
  if (!dockerAvailable) { res.status(404).json({ error: 'Docker not available' }); return; }
  const logs = await getContainerLogs(req.params.id);
  res.type('text/plain').send(logs);
});

// --- BlueOS Extensions (Layer 3) ---
app.get('/api/v1/extensions', async (_req, res) => {
  if (!blueosDetected) { res.json([]); return; }
  res.json(await listInstalledExtensions());
});

app.get('/api/v1/extensions/available', async (_req, res) => {
  if (!blueosDetected) { res.json([]); return; }
  res.json(await listAvailableExtensions());
});

app.post('/api/v1/extensions/install', async (req, res) => {
  if (!blueosDetected) { res.status(404).json({ error: 'BlueOS not available' }); return; }
  const { identifier, version } = req.body;
  const result = await installExtension(identifier, version);
  res.status(result.success ? 200 : 400).json(result);
});

app.delete('/api/v1/extensions/:identifier', async (req, res) => {
  if (!blueosDetected) { res.status(404).json({ error: 'BlueOS not available' }); return; }
  const result = await removeExtension(req.params.identifier);
  res.status(result.success ? 200 : 400).json(result);
});

app.get('/api/v1/extensions/:identifier/logs', async (req, res) => {
  if (!blueosDetected) { res.status(404).json({ error: 'BlueOS not available' }); return; }
  const logs = await getExtensionLogs(req.params.identifier);
  res.type('text/plain').send(logs);
});

// ---- HTTP + WebSocket Server ----
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws: WebSocket, req) => {
  // Auth check on WebSocket upgrade
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const wsToken = url.searchParams.get('token')
    || req.headers.authorization?.slice(7)
    || '';

  if (!validateToken(wsToken, token)) {
    ws.close(4001, 'Unauthorized');
    return;
  }

  console.log('[ws] Client connected');

  // Send hello message
  const hello: WsMessage<HelloMessage> = {
    channel: 'hello',
    data: {
      protocolVersion: AGENT_PROTOCOL_VERSION,
      agentVersion: '0.1.0',
      hostname: os.hostname(),
    },
  };
  ws.send(JSON.stringify(hello));

  // --- Metrics stream (every 1s) ---
  const metricsInterval = setInterval(async () => {
    if (ws.readyState !== WebSocket.OPEN) return;
    const data = await collectMetrics();
    const msg: WsMessage<MetricsData> = { channel: 'metrics', data };
    ws.send(JSON.stringify(msg));
  }, 1000);

  // --- Process list stream (every 5s) ---
  const processInterval = setInterval(async () => {
    if (ws.readyState !== WebSocket.OPEN) return;
    const data = await listProcesses(config.protectedProcesses);
    const msg: WsMessage<ProcessInfo[]> = { channel: 'processes', data };
    ws.send(JSON.stringify(msg));
  }, 5000);

  // --- Log streaming ---
  const removeLogListener = onLogEntry((entry: LogEntry) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    const msg: WsMessage<LogEntry> = { channel: 'logs', data: entry };
    ws.send(JSON.stringify(msg));
  });

  // --- Terminal PTY ---
  const sessionId = `ws-${Date.now()}`;
  let terminalActive = false;

  // --- Handle incoming messages ---
  ws.on('message', (raw: Buffer) => {
    try {
      const msg = JSON.parse(raw.toString()) as WsMessage;

      if (msg.channel === 'terminal' && config.terminalEnabled) {
        if (!terminalActive) {
          terminalActive = createSession(
            sessionId,
            config.terminalTimeoutMs,
            (data: string) => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ channel: 'terminal', data }));
              }
            },
            () => {
              terminalActive = false;
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ channel: 'terminal', data: '\r\n[Session ended]\r\n' }));
              }
            }
          );
        }
        if (typeof msg.data === 'string') {
          writeToSession(sessionId, msg.data);
        } else if (msg.data && typeof msg.data === 'object' && 'cols' in msg.data) {
          const resize = msg.data as { cols: number; rows: number };
          resizeSession(sessionId, resize.cols, resize.rows);
        }
      }
    } catch {
      // Ignore malformed messages
    }
  });

  ws.on('close', () => {
    console.log('[ws] Client disconnected');
    clearInterval(metricsInterval);
    clearInterval(processInterval);
    removeLogListener();
    if (terminalActive) destroySession(sessionId);
  });
});

// ---- Start ----
server.listen(config.port, async () => {
  await detectPlatforms();
  startLogTailing();

  console.log('='.repeat(50));
  console.log('ArduDeck Agent v0.1.0');
  console.log(`REST API: http://0.0.0.0:${config.port}/api/v1`);
  console.log(`WebSocket: ws://0.0.0.0:${config.port}/ws`);
  console.log('');
  console.log(`Pairing token: ${token}`);
  console.log('Enter this token in ArduDeck to connect.');
  console.log('='.repeat(50));

  startDiscovery(config.port, os.hostname());
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[agent] Shutting down...');
  stopDiscovery();
  stopLogTailing();
  destroyAllSessions();
  wss.close();
  server.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[agent] Shutting down...');
  stopDiscovery();
  stopLogTailing();
  destroyAllSessions();
  wss.close();
  server.close();
  process.exit(0);
});

export { app, server, wss, config };
