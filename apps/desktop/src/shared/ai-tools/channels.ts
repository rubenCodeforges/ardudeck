export const AI_TOOL_CHANNELS = {
  /** main -> renderer: run a tool (id, name, input) */
  CALL: 'ai-tools:call',
  /** renderer -> main: the result for an id */
  RESULT: 'ai-tools:result',
  /** renderer -> main (invoke): state of the local MCP server */
  MCP_STATUS: 'ai-tools:mcp-status',
  MCP_ROTATE_TOKEN: 'ai-tools:mcp-rotate-token',
  MCP_CLAUDE_DESKTOP_INSTALL: 'ai-tools:mcp-claude-desktop-install',
} as const;

export interface AiToolCallResult {
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

export interface AiMcpStatus {
  running: boolean;
  url: string | null;
  token: string | null;
  error: string | null;
  /** Claude Desktop's config already holds the ardudeck entry. */
  claudeDesktop: boolean;
}

export interface AiClaudeDesktopResult {
  ok: boolean;
  /** The Claude Desktop config file that was (or would have been) written. */
  path: string;
  error?: string;
}
