// apps/desktop/src/main/testing/index.ts
import { BrowserWindow, app } from 'electron';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { setMainWindow } from './tools';
import { startMcpServer, stopMcpServer } from './mcp-server';

const DISCOVERY_FILE = '.ardudeck-mcp.json';

let discoveryPath: string | null = null;

export async function initTestingMcp(mainWindow: BrowserWindow): Promise<void> {
  setMainWindow(mainWindow);

  try {
    const { port } = await startMcpServer();

    // Write discovery file to monorepo root.
    // In dev mode, process.cwd() is the monorepo root (where pnpm dev runs from).
    // In packaged mode this code never runs (isDev guard), so cwd() is safe.
    discoveryPath = join(process.cwd(), DISCOVERY_FILE);

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
