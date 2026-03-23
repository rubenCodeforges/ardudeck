// apps/desktop/src/main/testing/index.ts
import { BrowserWindow, app } from 'electron';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { mkdirSync } from 'fs';
import { setMainWindow } from './tools';
import { startMcpServer, stopMcpServer } from './mcp-server';

// Fixed well-known path: ~/.ardudeck/mcp.json
// Predictable for all consumers (orchestrator, bridge script, Claude Code).
const DISCOVERY_DIR = join(homedir(), '.ardudeck');
const DISCOVERY_FILE = 'mcp.json';

let discoveryPath: string | null = null;

export async function initTestingMcp(mainWindow: BrowserWindow): Promise<void> {
  setMainWindow(mainWindow);

  try {
    const { port } = await startMcpServer();

    // Write discovery file to ~/.ardudeck/mcp.json
    mkdirSync(DISCOVERY_DIR, { recursive: true });
    discoveryPath = join(DISCOVERY_DIR, DISCOVERY_FILE);

    const discoveryContent = {
      transport: 'sse',
      url: `http://127.0.0.1:${port}`,
      sseUrl: `http://127.0.0.1:${port}/sse`,
      messagesUrl: `http://127.0.0.1:${port}/messages`,
      name: 'ardudeck-test-driver',
      description: 'UI testing tools for ArduDeck — click, type, screenshot, read Zustand state. Dev-only.',
    };

    writeFileSync(discoveryPath, JSON.stringify(discoveryContent, null, 2));
    console.log(`[test-driver] Discovery file written to ${discoveryPath}`);
    console.log(`[test-driver] MCP URL: http://127.0.0.1:${port}`);

    app.on('will-quit', () => {
      cleanup();
    });
  } catch (err) {
    console.error('[test-driver] Failed to start MCP server:', err);
  }
}

function cleanup(): void {
  stopMcpServer();
  if (discoveryPath && existsSync(discoveryPath)) {
    try {
      unlinkSync(discoveryPath);
      console.log('[test-driver] Discovery file cleaned up');
    } catch {
      // Ignore cleanup errors
    }
  }
}
