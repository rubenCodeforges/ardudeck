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
  getVehicleSnapshotTool,
  getParameterTool,
  listParametersTool,
  getRecentMessagesTool,
  proposeParametersTool,
  getMissionTool,
  proposeMissionTool,
  proposeSurveyTool,
  proposeFenceTool,
  setVehicleProfileTool,
  getFlightEstimateTool,
  setHomeTool,
  listSurveyOptionsTool,
  fitMissionTool,
  drawAreaTool,
  listAreasTool,
  deleteAreaTool,
  surveyAreaTool,
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

  // --- Assistant read-only helpers ---

  server.tool(
    'get_vehicle_snapshot',
    'Get a compact snapshot of the connected vehicle: connection state, attitude, position, battery, flight mode, armed state, current view. Read-only.',
    {},
    async () => {
      const result = await getVehicleSnapshotTool();
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'get_parameter',
    'Read a single ArduPilot parameter by exact name (e.g. ATC_ANG_RLL_P). Returns current value and metadata. Read-only.',
    { name: z.string() },
    async (params) => {
      const result = await getParameterTool(params as any);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'list_parameters',
    'List ArduPilot parameters filtered by name prefix (e.g. "ATC_") and/or search substring. Capped at `limit` (default 50). Read-only.',
    {
      prefix: z.string().optional(),
      search: z.string().optional(),
      limit: z.number().optional(),
    },
    async (params) => {
      const result = await listParametersTool(params as any);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'get_recent_messages',
    'Get the most recent MAVLink STATUSTEXT messages (prearm checks, errors, mode changes, etc.). Read-only.',
    { limit: z.number().optional() },
    async (params) => {
      const result = await getRecentMessagesTool(params as any);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'propose_parameters',
    'Propose one or more ArduPilot parameter changes. The user sees a review modal in ArduDeck and must click Apply. Returns { ok, applied, failed, failedParams, rebootRequired, rejected } once they act; ok is false with reason "user cancelled" if they dismiss it. Blocked while vehicle is armed. Certain identity/motor-topology params are denylisted. Use this for tuning suggestions — NOT for arming, mode changes, or any mid-flight action.',
    {
      proposals: z.array(
        z.object({
          name: z.string().describe('Exact parameter name, e.g. ATC_ANG_RLL_P'),
          value: z.number().describe('Proposed new value'),
          reason: z.string().optional().describe('Short justification shown to user under the param name'),
        }),
      ),
    },
    async (params) => {
      const result = await proposeParametersTool(params as any);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  // --- Mission planning (proposal-gated) ---

  const point = z.object({ lat: z.number().describe('Latitude, degrees'), lng: z.number().describe('Longitude, degrees') });
  const asText = (result: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] });

  server.tool(
    'get_mission',
    'Read the plan in the ArduDeck mission planner: home, groups (manual, survey, imported) and every item with command, lat, lng, altitude and frame, plus a fence summary. This is the planner, which may differ from what the vehicle holds. Read-only.',
    {},
    async () => asText(await getMissionTool()),
  );

  server.tool(
    'propose_mission',
    'Propose waypoints for the mission planner. The user reviews them in a dialog and must accept; accepted items become their own group in the planner. Nothing is uploaded to the vehicle: the user uploads from the planner. Blocks until the user answers (up to 10 min). Refused while the vehicle is armed. Altitudes are metres relative to home unless frame is "asl".',
    {
      name: z.string().describe('Group name shown to the user'),
      reason: z.string().describe('Why, in one sentence, shown to the user'),
      mode: z.enum(['append', 'replace']).optional().describe('append (default) adds after the current plan; replace swaps the whole plan'),
      items: z.array(point.extend({
        altitude: z.number().describe('Metres'),
        frame: z.enum(['relative', 'asl']).optional(),
        command: z.enum(['waypoint', 'takeoff', 'land', 'loiter_time']).optional().describe('Default waypoint'),
        holdSeconds: z.number().optional().describe('Waypoint hold or loiter_time duration'),
      })).min(1),
      returnToLaunch: z.boolean().optional().describe('Append a return-to-launch item at the end'),
    },
    async (params) => asText(await proposeMissionTool(params)),
  );

  server.tool(
    'propose_survey',
    'Propose a survey area. ArduDeck generates the flight lines with its own survey planner (same as drawing the area by hand); the user reviews the area in a dialog and must accept. The result is a survey group in the planner the user can still tune; nothing is uploaded. Returns an estimate: area, lines, spacing, distance, flight time, photos, GSD and battery packs. Unset settings use the survey panel\'s current values. Give either altitudeM or gsdCm. For pattern "corridor" the polygon is an open centerline. Blocks until the user answers (up to 10 min). Refused while armed.',
    {
      name: z.string(),
      reason: z.string(),
      polygon: z.array(point).min(2).describe('Boundary vertices in order (3+), or the centerline for corridor (2+)'),
      pattern: z.enum(['grid', 'crosshatch', 'circular', 'spiral', 'perimeter-fill', 'corridor', 'panorama']).optional().describe('Default grid. corridor and panorama take an open line'),
      altitudeM: z.number().optional().describe('Metres above home'),
      gsdCm: z.number().optional().describe('Target ground sample distance in cm/px; altitude is solved from the camera'),
      speedMs: z.number().optional(),
      frontOverlap: z.number().optional().describe('Percent'),
      sideOverlap: z.number().optional().describe('Percent'),
      gridAngle: z.number().optional().describe('Line direction in degrees, 0 = north-south'),
      camera: z.string().optional().describe('Camera preset name, e.g. "DJI Mavic 3E"; an unknown name returns the list'),
      corridorWidthM: z.number().optional().describe('Corridor pattern only'),
      lineSpacingM: z.number().optional().describe('Fixed line spacing for a non-camera sensor (LiDAR, magnetometer); no photos are planned'),
      terrainFollow: z.boolean().optional().describe('Hold the altitude above the ground under each waypoint'),
      enduranceMinutes: z.number().optional().describe('Usable flight time per battery pack, for the pack count in the estimate'),
      manualCorridorWidthM: z.number().optional().describe('Fixed swath width with no camera (mower deck, spray boom)'),
      generatorId: z.string().optional().describe('A survey engine from list_survey_options (module engines included); default is the built-in pattern'),
      engineParams: z.record(z.string(), z.unknown()).optional().describe('Values for that engine\'s configFields'),
      advanced: z.record(z.string(), z.unknown()).optional().describe('Any other survey panel setting by key, e.g. {"altitudeReference":"terrain","margin":10,"overshoot":20,"stripOrder":"sequential"}; keys are listed by list_survey_options. altitudeReference "terrain" lets the flight controller follow the ground with few waypoints'),
    },
    async (params) => asText(await proposeSurveyTool(params)),
  );

  server.tool(
    'draw_area',
    'Draw (no id) or update (with id) a guide on the ArduDeck mission map: an outline, a line or a set of points with a name, a role (kind) and an optional colour. Guides show with a name label and are managed in the planner\'s Guides tab (rename, colour, show/hide, zoom, plan a survey, delete). Planner only; nothing reaches a vehicle. bufferM grows a polygon outward, e.g. a survey margin around an anomaly.',
    {
      id: z.string().optional(),
      name: z.string(),
      kind: z.enum(['area', 'interest', 'nofly', 'takeoff', 'poi', 'note']).describe('area: a plain boundary; interest: an area of interest (e.g. a target or anomaly); nofly; takeoff: take-off or landing site; poi: points of interest (e.g. sample sites); note: a reference'),
      geometry: z.enum(['polygon', 'line', 'point']),
      points: z.array(point).min(1).describe('Polygon ring (3+, not closed), line (2+), or the points of a point set'),
      pointLabels: z.array(z.string()).optional().describe('Labels per point for a point set, e.g. sample ids'),
      bufferM: z.number().optional().describe('Polygon only: grow outward by this many metres'),
      color: z.string().optional().describe('CSS colour; defaults to the kind colour'),
      notes: z.string().optional().describe('Source or remark, shown in the legend tooltip'),
    },
    async (params) => asText(await drawAreaTool(params)),
  );

  server.tool(
    'list_areas',
    'List the guides on the mission map (imported, drawn, from agents or cargos) with their points and area. Read-only.',
    {},
    async () => asText(await listAreasTool()),
  );

  server.tool(
    'delete_area',
    'Delete a guide from the mission map by id.',
    { id: z.string() },
    async (params) => asText(await deleteAreaTool(params)),
  );

  server.tool(
    'survey_area',
    'Propose a survey over a guide: its outline (or its line, as a corridor) with the same settings and review dialog as propose_survey. Returns the same estimate.',
    {
      id: z.string(),
      name: z.string().optional(),
      reason: z.string().optional(),
      pattern: z.enum(['grid', 'crosshatch', 'circular', 'spiral', 'perimeter-fill', 'corridor', 'panorama']).optional(),
      altitudeM: z.number().optional(),
      gsdCm: z.number().optional(),
      speedMs: z.number().optional(),
      frontOverlap: z.number().optional(),
      sideOverlap: z.number().optional(),
      gridAngle: z.number().optional(),
      camera: z.string().optional(),
      corridorWidthM: z.number().optional(),
      lineSpacingM: z.number().optional(),
      manualCorridorWidthM: z.number().optional(),
      terrainFollow: z.boolean().optional(),
      enduranceMinutes: z.number().optional(),
      generatorId: z.string().optional(),
      engineParams: z.record(z.string(), z.unknown()).optional(),
      advanced: z.record(z.string(), z.unknown()).optional(),
    },
    async (params) => asText(await surveyAreaTool(params)),
  );

  server.tool(
    'list_survey_options',
    'Everything propose_survey can take: patterns, altitude references, camera presets, survey engines with their config fields (module engines included), the advanced setting keys and the survey panel\'s current settings. Read-only.',
    {},
    async () => asText(await listSurveyOptionsTool()),
  );

  server.tool(
    'fit_mission',
    'Make a mission fit a flight controller with limited mission storage, the same three fixes ArduDeck offers when an upload is refused for space. "terrain": surveys planned with ArduDeck terrain following switch to flight-controller terrain following (waypoints only at line ends) and TERRAIN_ENABLE is proposed if off. "split": the largest survey becomes one flight group per battery. "sd": proposes BRD_SD_MISSION=64 (about 4,369 items on the SD card) through the parameter review; reboot after. Nothing is uploaded. Refused while armed.',
    { method: z.enum(['terrain', 'split', 'sd']) },
    async (params) => asText(await fitMissionTool(params)),
  );

  server.tool(
    'set_home',
    'Set the planning home (take-off point) in the mission planner. The altitude is the ground elevation there unless altAslM is given. Planner only: the flight controller sets its own home when it arms. Distance, max-from-home, altitudes above home and the altitude profile all use it.',
    {
      lat: z.number(),
      lng: z.number(),
      altAslM: z.number().optional().describe('Ground altitude above sea level at the take-off point; looked up when omitted'),
    },
    async (params) => asText(await setHomeTool(params)),
  );

  server.tool(
    'set_vehicle_profile',
    'Create (no id) or update (with id) a vehicle profile in ArduDeck settings, the same profile the Flight Info panel uses for cruise speed and endurance. Local only: nothing is written to a vehicle. Returns the profile and, when active, its derived cruise speed and endurance. Endurance = battery energy x 80% / average power; pass avgPowerW from a datasheet or log when known, otherwise ArduDeck estimates power from weight, props, KV and ESC.',
    {
      id: z.string().optional(),
      name: z.string(),
      type: z.enum(['copter', 'plane', 'vtol']),
      weightG: z.number().describe('All-up weight with battery and payload, grams'),
      batteryCells: z.number().describe('Series cell count, e.g. 12 for 12S'),
      batteryCapacityMah: z.number().describe('Total capacity flown at once, mAh (sum parallel packs)'),
      batteryChemistry: z.enum(['lipo', 'lihv', 'lion', 'life']).optional(),
      motorCount: z.number().optional(),
      frameSizeMm: z.number().optional().describe('Motor-to-motor diagonal'),
      propSize: z.string().optional().describe('Inches, diameter x pitch, e.g. "28x9.2"'),
      motorKv: z.number().optional(),
      escRatingA: z.number().optional().describe('Continuous amps per ESC'),
      wingspanMm: z.number().optional(),
      wingAreaCm2: z.number().optional(),
      maxSpeedMs: z.number().optional(),
      avgPowerW: z.number().optional().describe('Average electrical power in flight, W; overrides the estimate'),
      cruiseSpeedMs: z.number().optional().describe('Overrides the cruise speed estimate'),
      notes: z.string().optional(),
      activate: z.boolean().optional().describe('Make it the active profile'),
    },
    async (params) => asText(await setVehicleProfileTool(params)),
  );

  server.tool(
    'get_flight_estimate',
    'The Flight Info panel figures for the plan in the mission planner with the active vehicle profile: distance, still-air flight time, endurance, battery packs, reserve on the last pack, total climb. Pass speedMs to use the mission speed instead of the profile cruise estimate, enduranceMinutes to override the profile endurance. Read-only.',
    {
      speedMs: z.number().optional(),
      enduranceMinutes: z.number().optional(),
    },
    async (params) => asText(await getFlightEstimateTool(params)),
  );

  server.tool(
    'propose_fence',
    'Propose a geofence. The user reviews it and must accept; on accept the inclusion polygon REPLACES any held inclusion, exclusions are added, and the fence is uploaded to the vehicle. Blocks until the user answers (up to 10 min). Refused while armed.',
    {
      name: z.string(),
      reason: z.string(),
      inclusion: z.array(point).min(3).optional(),
      exclusions: z.array(z.object({ name: z.string(), points: z.array(point).min(3) })).optional(),
    },
    async (params) => asText(await proposeFenceTool(params)),
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
