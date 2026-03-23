/**
 * Companion panel registry for dockview.
 * Panel component implementations are in Plan 3 — this defines the registry structure.
 */

// Panel registry for companion dockview instance
export const COMPANION_PANEL_COMPONENTS = {
  status: { component: 'CompanionStatusPanel', title: 'Status' },
  metrics: { component: 'CompanionMetricsPanel', title: 'System Metrics' },
  network: { component: 'CompanionNetworkPanel', title: 'Network' },
  processes: { component: 'CompanionProcessesPanel', title: 'Processes' },
  logs: { component: 'CompanionLogsPanel', title: 'Logs' },
  terminal: { component: 'CompanionTerminalPanel', title: 'Terminal' },
  fileBrowser: { component: 'CompanionFileBrowserPanel', title: 'File Browser' },
  services: { component: 'CompanionServicesPanel', title: 'Services' },
  containers: { component: 'CompanionContainersPanel', title: 'Containers' },
  extensions: { component: 'CompanionExtensionsPanel', title: 'Extensions' },
  droneBridgeStatus: { component: 'CompanionDroneBridgeStatusPanel', title: 'DroneBridge' },
  droneBridgeSettings: { component: 'CompanionDroneBridgeSettingsPanel', title: 'DroneBridge Settings' },
} as const;

export type CompanionPanelId = keyof typeof COMPANION_PANEL_COMPONENTS;
