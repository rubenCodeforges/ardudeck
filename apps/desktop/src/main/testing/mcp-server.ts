// apps/desktop/src/main/testing/mcp-server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';
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
} from './tools';

let httpServer: http.Server | null = null;
let transport: SSEServerTransport | null = null;

export async function startMcpServer(): Promise<{ port: number }> {
  const server = new McpServer({
    name: 'ardudeck-test-driver',
    version: '1.0.0',
  });

  // --- Observation tools ---

  server.tool(
    'screenshot',
    'Capture a screenshot of the ArduDeck window. Returns base64 PNG.',
    { region: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }).optional() },
    async (params) => {
      const base64 = await screenshot(params as any);
      return { content: [{ type: 'image', data: base64, mimeType: 'image/png' }] };
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

  // --- Start HTTP server with SSE transport ---

  return new Promise((resolve, reject) => {
    httpServer = http.createServer();

    httpServer.on('request', async (req, res) => {
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', name: 'ardudeck-test-driver' }));
        return;
      }

      // SSE endpoint — single client only
      if (req.url === '/sse' && req.method === 'GET') {
        if (transport) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Another agent is already connected. Single-client only.' }));
          return;
        }
        transport = new SSEServerTransport('/messages', res);
        await server.connect(transport);
        res.on('close', () => {
          transport = null;
        });
        return;
      }

      if (req.url === '/messages' && req.method === 'POST') {
        if (transport) {
          await transport.handlePostMessage(req, res);
        } else {
          res.writeHead(400);
          res.end('No active SSE connection');
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
  transport = null;
}
