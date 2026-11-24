// apps/desktop/src/main/testing/mcp-server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';
import { AI_TOOLS } from '../../shared/ai-tools/definitions.js';
import http from 'http';
import {
  screenshot,
  findElementsTool,
  getPageStateTool,
  getStoreStateTool,
  getElementTextTool,
  listTestIdsTool,
  getAppInfoTool,
  getViewsTool,
  clickTool,
  typeTool,
  selectTool,
  scrollTool,
  keyboardTool,
  hoverTool,
  navigateTool,
  waitForElementTool,
  waitForStoreTool,
  waitForIdleTool,
  sitlStatusTool,
  sitlStartTool,
  sitlStopTool,
} from './tools';

let httpServer: http.Server | null = null;

// One transport per connected client, keyed by the SSE session id. Each Claude
// Code session spawns its own bridge and gets its own session, so multiple
// agents can drive ArduDeck concurrently.
const transports = new Map<string, SSEServerTransport>();
const SSE_KEEPALIVE_MS = 25_000;

function buildServer(): McpServer {
  const server = new McpServer({
    name: 'ardudeck',
    version: '1.0.0',
  });

  // --- Observation tools ---

  server.tool(
    'screenshot',
    'Capture a screenshot of the ArduDeck window. Saves JPEG to ~/.ardudeck/screenshots/ and returns the file path. Use the Read tool to view the image.',
    { region: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }).optional() },
    async (params) => {
      const filePath = await screenshot(params as any);
      return { content: [{ type: 'text', text: filePath }] };
    }
  );

  server.tool(
    'find_elements',
    'Find UI elements by test-id, role, visible text, or CSS selector. Returns element details including bounding rects.',
    { query: z.string(), by: z.enum(['testId', 'role', 'text', 'css']).optional() },
    async (params) => {
      const result = await findElementsTool(params);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'get_page_state',
    'Get current page state: active view, loading indicators, error messages, window dimensions.',
    {},
    async () => {
      const result = await getPageStateTool();
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'get_store_state',
    'Read Zustand store state by name. Use path (dot notation) to read a subset, e.g. storeName="connection", path="isConnected".',
    { storeName: z.string(), path: z.string().optional() },
    async (params) => {
      const result = await getStoreStateTool(params);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'get_element_text',
    'Read the text content or input value of a specific element.',
    { selector: z.string(), by: z.enum(['testId', 'role', 'text', 'css']).optional() },
    async (params) => {
      const result = await getElementTextTool(params);
      return { content: [{ type: 'text', text: String(result) }] };
    }
  );

  server.tool(
    'list_test_ids',
    'List all data-testid attributes in the current DOM. Helps discover interactable elements.',
    { scope: z.string().optional() },
    async (params) => {
      const result = await listTestIdsTool(params);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'get_app_info',
    'Get ArduDeck app info: version, platform, electron version, connected device, available stores.',
    {},
    async () => {
      const result = await getAppInfoTool();
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'get_views',
    'List available views/navigation state and which view is currently active.',
    {},
    async () => {
      const result = await getViewsTool();
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  // --- Registry tools: the same list the released MCP server, cargos and the website use ---

  const asText = (result: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] });
  for (const tool of AI_TOOLS) {
    // Lazy: ai-tools pulls in electron-store, which needs a live Electron app.
    server.tool(tool.name, tool.description, tool.input, async (params) => asText(await (await import('../ai-tools/index.js')).callAiTool(tool, params)));
  }

  server.tool(
    'sitl_status',
    'ArduPilot SITL state: running, vehicle type, model, whether a vehicle is connected, the available models per vehicle type and the last output lines. Read-only.',
    {},
    async () => asText(await sitlStatusTool()),
  );

  server.tool(
    'sitl_start',
    'Start ArduPilot SITL as the SITL tab does (vehicleType copter|plane|rover|sub, model from sitl_status, e.g. heli or quadplane) and connect to it over TCP 5760. Refused while SITL runs or a vehicle is connected.',
    {
      vehicleType: z.enum(['copter', 'plane', 'rover', 'sub']).optional(),
      model: z.string().optional(),
      wipe: z.boolean().optional().describe('Start from default parameters'),
      speedup: z.number().optional(),
      connect: z.boolean().optional().describe('Default true'),
    },
    async (params) => asText(await sitlStartTool(params)),
  );

  server.tool(
    'sitl_stop',
    'Disconnect and stop the running ArduPilot SITL.',
    {},
    async () => asText(await sitlStopTool()),
  );

  // --- Interaction tools ---

  server.tool(
    'click',
    'Click a UI element. Dispatches mousedown, mouseup, click events. Supports double-click and right-click.',
    {
      selector: z.string(),
      by: z.enum(['testId', 'role', 'text', 'css']).optional(),
      options: z.object({ double: z.boolean().optional(), right: z.boolean().optional() }).optional(),
    },
    async (params) => {
      const result = await clickTool(params);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    'type',
    'Type text into an input element. Uses React-compatible input events.',
    {
      selector: z.string(),
      text: z.string(),
      by: z.enum(['testId', 'role', 'text', 'css']).optional(),
      options: z.object({ clear: z.boolean().optional(), delay: z.number().optional() }).optional(),
    },
    async (params) => {
      const result = await typeTool(params);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    'select',
    'Select an option from a dropdown/select element.',
    {
      selector: z.string(),
      value: z.string(),
      by: z.enum(['testId', 'role', 'text', 'css']).optional(),
    },
    async (params) => {
      const result = await selectTool(params);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    'scroll',
    'Scroll an element or the page.',
    {
      selector: z.string().optional(),
      direction: z.enum(['up', 'down', 'left', 'right']),
      amount: z.number().optional(),
    },
    async (params) => {
      const result = await scrollTool(params);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    'keyboard',
    'Press a key or key combination (e.g., "Enter", "Escape", "Ctrl+S").',
    { key: z.string() },
    async (params) => {
      const result = await keyboardTool(params);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    'hover',
    'Hover over an element. Triggers mouseenter, mouseover, mousemove events (activates tooltips and hover menus).',
    {
      selector: z.string(),
      by: z.enum(['testId', 'role', 'text', 'css']).optional(),
    },
    async (params) => {
      const result = await hoverTool(params);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    'navigate',
    'Switch to a different ArduDeck view (e.g., "telemetry", "parameters", "mission", "firmware").',
    { view: z.string() },
    async (params) => {
      const result = await navigateTool(params);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
  );

  // --- Waiting tools ---

  server.tool(
    'wait_for_element',
    'Wait until an element appears, becomes visible, or disappears. Default timeout 10s.',
    {
      selector: z.string(),
      by: z.enum(['testId', 'role', 'text', 'css']).optional(),
      options: z.object({
        visible: z.boolean().optional(),
        hidden: z.boolean().optional(),
        timeout: z.number().optional(),
      }).optional(),
    },
    async (params) => {
      const result = await waitForElementTool(params);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    'wait_for_store',
    'Wait until a Zustand store state at a given path matches an expected value. E.g., storeName="connection", path="isConnected", value=true.',
    {
      storeName: z.string(),
      path: z.string(),
      value: z.any(),
      timeout: z.number().optional(),
    },
    async (params) => {
      const result = await waitForStoreTool(params);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    'wait_for_idle',
    'Wait until the app is idle — no loading spinners for 500ms. Default timeout 10s.',
    { timeout: z.number().optional() },
    async (params) => {
      const result = await waitForIdleTool(params);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
  );

  return server;
}

// --- Start HTTP server with SSE transport ---

export async function startMcpServer(): Promise<{ port: number }> {
  return new Promise((resolve, reject) => {
    httpServer = http.createServer();

    httpServer.on('request', async (req, res) => {
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', name: 'ardudeck', sessions: transports.size }));
        return;
      }

      // SSE endpoint — one session per connecting client.
      if (req.url === '/sse' && req.method === 'GET') {
        const transport = new SSEServerTransport('/messages', res);
        transports.set(transport.sessionId, transport);
        // An SSE comment keeps the stream alive while a tool waits on a person: Node's fetch drops a
        // body that stays silent for 300 s, and the answer then goes to a session nobody reads.
        const keepalive = setInterval(() => { if (!res.writableEnded) res.write(': keepalive\n\n'); }, SSE_KEEPALIVE_MS);
        res.on('close', () => {
          clearInterval(keepalive);
          transports.delete(transport.sessionId);
        });
        // Each session gets its own server instance: the SDK binds a server to
        // exactly one transport, so one shared server cannot multiplex clients.
        await buildServer().connect(transport);
        return;
      }

      if (req.url?.startsWith('/messages') && req.method === 'POST') {
        const sessionId = new URL(req.url, 'http://localhost').searchParams.get('sessionId');
        const transport = sessionId ? transports.get(sessionId) : undefined;
        if (transport) {
          await transport.handlePostMessage(req, res);
        } else {
          res.writeHead(400);
          res.end('No active SSE connection for sessionId');
        }
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    });

    httpServer.listen(0, '127.0.0.1', () => {
      const addr = httpServer!.address() as any;
      const port = addr.port as number;
      console.log(`[test-driver] MCP server listening on http://127.0.0.1:${port}`);
      resolve({ port });
    });

    httpServer.on('error', reject);
  });
}

export function stopMcpServer(): void {
  if (httpServer) {
    httpServer.close();
    httpServer = null;
  }
  for (const transport of transports.values()) {
    void transport.close();
  }
  transports.clear();
}
