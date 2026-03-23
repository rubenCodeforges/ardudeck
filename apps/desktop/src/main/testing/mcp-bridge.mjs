#!/usr/bin/env node
/**
 * Stdio-to-SSE bridge for the ArduDeck test driver MCP server.
 *
 * Claude Code spawns this as a child process (stdio transport).
 * It reads ~/.ardudeck/mcp.json on each connection attempt to find the
 * dynamic SSE port, then proxies MCP messages between stdio and SSE.
 *
 * Reconnects automatically when ArduDeck restarts (new port in discovery file).
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const DISCOVERY_PATH = join(homedir(), '.ardudeck', 'mcp.json');
const RETRY_INTERVAL = 2000;

let sessionUrl = null;
let connected = false;

function readDiscovery() {
  try {
    return JSON.parse(readFileSync(DISCOVERY_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

async function connectSSE() {
  while (true) {
    sessionUrl = null;
    connected = false;

    const discovery = readDiscovery();
    if (!discovery?.sseUrl) {
      process.stderr.write('[ardudeck-mcp-bridge] Waiting for ArduDeck (no discovery file)...\n');
      await new Promise(r => setTimeout(r, RETRY_INTERVAL));
      continue;
    }

    try {
      const response = await fetch(discovery.sseUrl, {
        headers: { 'Accept': 'text/event-stream' },
      });

      if (!response.ok) {
        process.stderr.write(`[ardudeck-mcp-bridge] SSE ${response.status}, retrying...\n`);
        await new Promise(r => setTimeout(r, RETRY_INTERVAL));
        continue;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          process.stderr.write('[ardudeck-mcp-bridge] SSE stream ended, reconnecting...\n');
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let eventType = null;
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (eventType === 'endpoint') {
              sessionUrl = new URL(data, discovery.url).href;
              connected = true;
              process.stderr.write(`[ardudeck-mcp-bridge] Connected: ${sessionUrl}\n`);
            } else if (eventType === 'message') {
              process.stdout.write(data + '\n');
            }
            eventType = null;
          }
        }
      }
    } catch (err) {
      process.stderr.write(`[ardudeck-mcp-bridge] Connection error: ${err.message}, retrying...\n`);
    }

    await new Promise(r => setTimeout(r, RETRY_INTERVAL));
  }
}

// Read stdin, forward to MCP server. Queue messages if not connected.
const pendingMessages = [];

async function readStdin() {
  const decoder = new TextDecoder();
  let buffer = '';

  for await (const chunk of process.stdin) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;

      if (!connected || !sessionUrl) {
        pendingMessages.push(line);
        continue;
      }

      await sendMessage(line);
    }
  }
}

async function sendMessage(line) {
  try {
    const resp = await fetch(sessionUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: line,
    });
    if (!resp.ok) {
      process.stderr.write(`[ardudeck-mcp-bridge] POST ${resp.status}\n`);
    }
  } catch (err) {
    process.stderr.write(`[ardudeck-mcp-bridge] POST error: ${err.message}\n`);
  }
}

// Drain pending messages when connection establishes
setInterval(async () => {
  if (connected && sessionUrl && pendingMessages.length > 0) {
    while (pendingMessages.length > 0) {
      await sendMessage(pendingMessages.shift());
    }
  }
}, 100);

connectSSE();
readStdin().catch(() => process.exit(0));
