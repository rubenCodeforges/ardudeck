import http from 'node:http';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { app, ipcMain, type BrowserWindow } from 'electron';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { AI_TOOLS, type AiToolDefinition } from '../../shared/ai-tools/definitions.js';
import { AI_TOOL_CHANNELS, type AiToolCallResult, type AiMcpStatus } from '../../shared/ai-tools/channels.js';
import { createMainHostApi } from '../modules/module-host-main.js';
import { getInstalledModulesRaw, onInstalledModulesChange } from '../modules/module-manager.js';
import { getDevModuleVersion } from '../modules/module-dev.js';
import { claudeDesktopInstalled, installClaudeDesktop } from './claude-desktop.js';
import type { ModuleManifest } from '@ardudeck/module-sdk';

// Installing the AI Agent Bridge cargo switches this server on. Older cargo versions run their own server.
const BRIDGE_SLUG = 'ardudeck.mcp';
const FIRST_CORE_SERVED_VERSION = [0, 3, 0];
// Same file and stored token/port as the cargo, so a pilot's saved Claude Code config keeps working.
const DISCOVERY_PATH = join(homedir(), '.ardudeck', 'mcp-cargo.json');

let window: BrowserWindow | null = null;
let httpServer: http.Server | null = null;
let port = 0;
let token = '';
let lastError: string | null = null;
const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();

const bridgeStore = () => createMainHostApi({ slug: BRIDGE_SLUG, name: 'AI Agent Bridge' } as ModuleManifest);

/** Runs a registry tool in the main window's renderer, where the stores and review dialogs live. */
export function callAiTool(tool: AiToolDefinition, input: unknown): Promise<unknown> {
  if (!window || window.isDestroyed()) return Promise.reject(new Error('ArduDeck window is not ready yet.')); // i18n-exempt
  const id = randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`ArduDeck did not answer within ${Math.round(tool.timeoutMs / 1000)}s`)); // i18n-exempt
    }, tool.timeoutMs);
    pending.set(id, { resolve, reject, timer });
    window!.webContents.send(AI_TOOL_CHANNELS.CALL, id, tool.name, input);
  });
}

function versionAtLeast(v: string, min: number[]): boolean {
  const parts = v.split(/[.-]/).map((n) => Number(n) || 0);
  for (let i = 0; i < min.length; i++) {
    if ((parts[i] ?? 0) !== min[i]) return (parts[i] ?? 0) > min[i]!;
  }
  return true;
}

function bridgeWanted(): boolean {
  // A dev-loaded bridge wins over an installed one, same as the module loader
  const dev = getDevModuleVersion(BRIDGE_SLUG);
  if (dev) return versionAtLeast(dev, FIRST_CORE_SERVED_VERSION);
  const m = getInstalledModulesRaw().find((x) => x.slug === BRIDGE_SLUG);
  return !!m && m.enabled !== false && versionAtLeast(m.version, FIRST_CORE_SERVED_VERSION);
}


function buildServer(): McpServer {
  const server = new McpServer({ name: 'ardudeck', version: app.getVersion() });
  for (const tool of AI_TOOLS) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.input,
        annotations: { readOnlyHint: tool.effect === 'read', destructiveHint: false, openWorldHint: false },
      },
      async (input: unknown) => {
        try {
          const result = await callAiTool(tool, input);
          return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? null, null, 2) }] };
        } catch (err) {
          return { isError: true, content: [{ type: 'text' as const, text: err instanceof Error ? err.message : String(err) }] };
        }
      },
    );
  }
  return server;
}

function authorized(req: http.IncomingMessage): boolean {
  const header = req.headers.authorization ?? '';
  const given = Buffer.from(header.startsWith('Bearer ') ? header.slice(7) : '');
  const expected = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

async function readBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : undefined;
}

async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
  // Browsers always send Origin and agents don't: blocks web pages and DNS rebinding.
  const hostHeader = req.headers.host ?? '';
  if (req.headers.origin || (hostHeader !== `127.0.0.1:${port}` && hostHeader !== `localhost:${port}`)) {
    res.writeHead(403).end();
    return;
  }
  const path = (req.url ?? '').split('?')[0];
  if (path === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ status: 'ok', name: 'ardudeck' }));
    return;
  }
  if (path !== '/mcp') return void res.writeHead(404).end();
  if (!authorized(req)) return void res.writeHead(401, { 'WWW-Authenticate': 'Bearer' }).end();
  if (req.method !== 'POST') return void res.writeHead(405, { Allow: 'POST' }).end();
  let body: unknown;
  try {
    body = await readBody(req);
  } catch {
    return void res.writeHead(400).end();
  }
  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, body);
}

function listen(onPort: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      handle(req, res).catch((err) => {
        console.error('[ai-tools] MCP request failed', err);
        if (!res.headersSent) res.writeHead(500).end();
      });
    });
    server.once('error', reject);
    server.listen(onPort, '127.0.0.1', () => {
      httpServer = server;
      resolve((server.address() as { port: number }).port);
    });
  });
}

function writeDiscovery() {
  mkdirSync(join(homedir(), '.ardudeck'), { recursive: true });
  writeFileSync(DISCOVERY_PATH, JSON.stringify({ name: 'ardudeck', transport: 'http', url: `http://127.0.0.1:${port}/mcp`, token }, null, 2), { mode: 0o600 });
}

async function start() {
  if (httpServer) return;
  const store = bridgeStore();
  token = (await store.secureRead('token')) ?? '';
  if (!token) {
    token = randomBytes(24).toString('base64url');
    await store.secureWrite('token', token);
  }
  const saved = Number(await store.readData('port')) || 0;
  try {
    port = await listen(saved);
  } catch {
    port = await listen(0);
  }
  if (port !== saved) await store.writeData('port', String(port));
  writeDiscovery();
  lastError = null;
  console.log(`[ai-tools] MCP server on http://127.0.0.1:${port}/mcp`);
}

function stop() {
  httpServer?.close();
  httpServer = null;
  try {
    rmSync(DISCOVERY_PATH, { force: true });
  } catch {
    // already gone
  }
}

async function sync() {
  try {
    if (bridgeWanted()) await start();
    else if (httpServer) stop();
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    console.error('[ai-tools] MCP server failed to start', err);
  }
}

export function status(): AiMcpStatus {
  return { running: !!httpServer, url: httpServer ? `http://127.0.0.1:${port}/mcp` : null, token: httpServer ? token : null, error: lastError, claudeDesktop: claudeDesktopInstalled() };
}

export async function rotateToken(): Promise<AiMcpStatus> {
  token = randomBytes(24).toString('base64url');
  await bridgeStore().secureWrite('token', token);
  if (httpServer) writeDiscovery();
  return status();
}

export function initAiTools(mainWindow: BrowserWindow): void {
  window = mainWindow;
  ipcMain.on(AI_TOOL_CHANNELS.RESULT, (_e, res: AiToolCallResult) => {
    const entry = pending.get(res.id);
    if (!entry) return;
    pending.delete(res.id);
    clearTimeout(entry.timer);
    if (res.ok) entry.resolve(res.result);
    else entry.reject(new Error(res.error));
  });
  ipcMain.handle(AI_TOOL_CHANNELS.MCP_STATUS, () => status());
  ipcMain.handle(AI_TOOL_CHANNELS.MCP_ROTATE_TOKEN, () => rotateToken());
  ipcMain.handle(AI_TOOL_CHANNELS.MCP_CLAUDE_DESKTOP_INSTALL, () => installClaudeDesktop());
  onInstalledModulesChange(() => void sync());
  app.on('will-quit', stop);
  void sync();
}
