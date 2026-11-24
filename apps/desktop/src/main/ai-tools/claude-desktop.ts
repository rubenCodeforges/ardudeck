import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { AiClaudeDesktopResult } from '../../shared/ai-tools/channels.js';

// Claude Desktop only starts local programs: ArduDeck's binary runs this stdio proxy in Node mode and it rereads mcp-cargo.json per request.
const PROXY_PATH = join(homedir(), '.ardudeck', 'mcp-stdio.cjs');
const SERVER_NAME = 'ardudeck';

const PROXY_SOURCE = `// Written by ArduDeck. Bridges Claude Desktop (stdio) to ArduDeck's local MCP server.
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { homedir } = require('node:os');
const readline = require('node:readline');

const DISCOVERY = join(homedir(), '.ardudeck', 'mcp-cargo.json');
const out = (msg) => process.stdout.write(JSON.stringify(msg) + '\\n');

async function forward(msg) {
  let target;
  try {
    target = JSON.parse(readFileSync(DISCOVERY, 'utf8'));
  } catch {
    throw new Error('ArduDeck is not open, or its AI Agent Bridge is turned off. Open ArduDeck and try again.');
  }
  const res = await fetch(target.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: 'Bearer ' + target.token,
    },
    body: JSON.stringify(msg),
  });
  if (res.status === 202) return;
  if (!res.ok) throw new Error('ArduDeck answered HTTP ' + res.status + '. Open ArduDeck and try again.');
  const text = await res.text();
  if ((res.headers.get('content-type') || '').includes('text/event-stream')) {
    for (const line of text.split(/\\r?\\n/)) if (line.startsWith('data:')) out(JSON.parse(line.slice(5)));
  } else if (text) {
    out(JSON.parse(text));
  }
}

readline.createInterface({ input: process.stdin }).on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  forward(msg).catch((err) => {
    if (msg.id !== undefined) out({ jsonrpc: '2.0', id: msg.id, error: { code: -32000, message: String(err && err.message || err) } });
  });
});
`;

function configPath(): string {
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'); // i18n-exempt: macOS folder name
  if (process.platform === 'win32') return join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json');
  return join(homedir(), '.config', 'Claude', 'claude_desktop_config.json');
}

export function claudeDesktopInstalled(): boolean {
  try {
    const cfg = JSON.parse(readFileSync(configPath(), 'utf8')) as { mcpServers?: Record<string, unknown> };
    return Boolean(cfg.mcpServers?.[SERVER_NAME]);
  } catch {
    return false;
  }
}

/** Adds (or refreshes) the ardudeck entry in Claude Desktop's config, keeping everything else in it. */
export function installClaudeDesktop(): AiClaudeDesktopResult {
  const path = configPath();
  try {
    mkdirSync(dirname(PROXY_PATH), { recursive: true });
    writeFileSync(PROXY_PATH, PROXY_SOURCE);

    let cfg: Record<string, unknown> = {};
    if (existsSync(path)) {
      const raw = readFileSync(path, 'utf8');
      if (raw.trim()) cfg = JSON.parse(raw) as Record<string, unknown>;
      copyFileSync(path, `${path}.ardudeck-backup`);
    } else {
      mkdirSync(dirname(path), { recursive: true });
    }
    const servers = (cfg.mcpServers && typeof cfg.mcpServers === 'object' ? cfg.mcpServers : {}) as Record<string, unknown>;
    servers[SERVER_NAME] = {
      command: process.execPath,
      args: [PROXY_PATH],
      env: { ELECTRON_RUN_AS_NODE: '1' },
    };
    cfg.mcpServers = servers;
    writeFileSync(path, JSON.stringify(cfg, null, 2));
    return { ok: true, path };
  } catch (err) {
    return { ok: false, path, error: err instanceof Error ? err.message : String(err) };
  }
}
