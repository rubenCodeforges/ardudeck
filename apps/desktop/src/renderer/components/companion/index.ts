/**
 * Companion panel registry for dockview.
 * Panel component implementations are in Plan 3 — this defines the registry structure.
 */

// Panel registry for companion dockview instance
export const COMPANION_PANEL_COMPONENTS = {
  status: { component: 'CompanionStatusPanel', titleKey: 'companion:panels.status' },
  metrics: { component: 'CompanionMetricsPanel', titleKey: 'companion:panels.metrics' },
  network: { component: 'CompanionNetworkPanel', titleKey: 'companion:panels.network' },
  processes: { component: 'CompanionProcessesPanel', titleKey: 'companion:panels.processes' },
  logs: { component: 'CompanionLogsPanel', titleKey: 'companion:panels.logs' },
  terminal: { component: 'CompanionTerminalPanel', titleKey: 'companion:panels.terminal' },
  fileBrowser: { component: 'CompanionFileBrowserPanel', titleKey: 'companion:panels.fileBrowser' },
  services: { component: 'CompanionServicesPanel', titleKey: 'companion:panels.services' },
  containers: { component: 'CompanionContainersPanel', titleKey: 'companion:panels.containers' },
  extensions: { component: 'CompanionExtensionsPanel', titleKey: 'companion:panels.extensions' },
  droneBridgeStatus: { component: 'CompanionDroneBridgeStatusPanel', titleKey: 'companion:panels.droneBridgeStatus' },
  droneBridgeSettings: { component: 'CompanionDroneBridgeSettingsPanel', titleKey: 'companion:panels.droneBridgeSettings' },
} as const;

export type CompanionPanelId = keyof typeof COMPANION_PANEL_COMPONENTS;
