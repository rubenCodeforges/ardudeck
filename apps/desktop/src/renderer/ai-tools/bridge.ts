import { runAiTool } from './run';

/** Lets main (the MCP server) run registry tools here; tools need the renderer's stores and review dialogs. */
export function initAiToolBridge(): void {
  const api = window.electronAPI;
  if (!api?.aiToolsOnCall) return;
  api.aiToolsOnCall((id, name, input) => {
    runAiTool(name, input)
      .then((result) => api.aiToolsRespond({ id, ok: true, result }))
      .catch((err: unknown) => api.aiToolsRespond({ id, ok: false, error: err instanceof Error ? err.message : String(err) }));
  });
}
