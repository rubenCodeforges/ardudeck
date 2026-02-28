export { AttitudePanel, AttitudeIndicator } from './AttitudePanel';
export { AltitudePanel } from './AltitudePanel';
export { SpeedPanel } from './SpeedPanel';
export { BatteryPanel } from './BatteryPanel';
export { GpsPanel } from './GpsPanel';
export { PositionPanel } from './PositionPanel';
export { VelocityPanel } from './VelocityPanel';
export { FlightModePanel } from './FlightModePanel';
export { FlightControlPanel } from './FlightControlPanel';
export { MapPanel } from './MapPanel';
export { MessagesPanel } from './MessagesPanel';

// Re-export mission panels for use in telemetry dashboard
// Note: MissionMapPanel not exported here - mission data now integrated into MapPanel
export { WaypointTablePanel } from '../mission/WaypointTablePanel';
export { AltitudeProfilePanel } from '../mission/AltitudeProfilePanel';

// Panel registry for dockview
export const PANEL_COMPONENTS = {
  // Telemetry panels
  attitude: { component: 'AttitudePanel', title: 'Attitude' },
  altitude: { component: 'AltitudePanel', title: 'Altitude' },
  speed: { component: 'SpeedPanel', title: 'Speed' },
  battery: { component: 'BatteryPanel', title: 'Battery' },
  gps: { component: 'GpsPanel', title: 'GPS' },
  position: { component: 'PositionPanel', title: 'Position' },
  velocity: { component: 'VelocityPanel', title: 'Velocity' },
  flightMode: { component: 'FlightModePanel', title: 'Flight Mode' },
  flightControl: { component: 'FlightControlPanel', title: 'Flight Control' },
  map: { component: 'MapPanel', title: 'Map' }, // Unified map with mission overlays
  messages: { component: 'MessagesPanel', title: 'Messages' },
  // Mission panels (for monitoring during flight)
  // Note: missionMap removed - mission data now integrated into unified MapPanel
  waypoints: { component: 'WaypointTablePanel', title: 'Waypoints' },
  altitudeProfile: { component: 'AltitudeProfilePanel', title: 'Altitude Profile' },
} as const;

export type PanelId = keyof typeof PANEL_COMPONENTS;
