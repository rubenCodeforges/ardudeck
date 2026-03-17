// config.ts
import path from 'path';
import os from 'os';

export interface AgentConfig {
  port: number;
  tokenPath: string;
  fileRoot: string;
  terminalEnabled: boolean;
  terminalTimeoutMs: number;
  subnetOnly: boolean;
  protectedProcesses: string[];
}

export function loadConfig(): AgentConfig {
  return {
    port: parseInt(process.env.ARDUDECK_AGENT_PORT || '48400', 10),
    tokenPath: process.env.ARDUDECK_AGENT_TOKEN_PATH
      || path.join(os.homedir(), '.ardudeck-agent', 'token'),
    fileRoot: process.env.ARDUDECK_AGENT_FILE_ROOT || os.homedir(),
    terminalEnabled: process.env.ARDUDECK_AGENT_TERMINAL !== 'false',
    terminalTimeoutMs: parseInt(
      process.env.ARDUDECK_AGENT_TERMINAL_TIMEOUT || '1800000', 10
    ),
    subnetOnly: process.env.ARDUDECK_AGENT_SUBNET_ONLY === 'true',
    protectedProcesses: (
      process.env.ARDUDECK_AGENT_PROTECTED_PROCESSES
      || 'ardudeck-agent,mavlink-router,mavp2p,mavproxy'
    ).split(',').map(s => s.trim()),
  };
}
