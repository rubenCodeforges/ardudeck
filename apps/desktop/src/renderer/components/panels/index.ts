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
export { SitlStatusPanel } from './SitlStatusPanel';

// Re-export mission panels for use in telemetry dashboard
export { MissionMapPanel } from '../mission/MissionMapPanel';
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
  map: { component: 'MapPanel', title: 'Map' },
  sitlStatus: { component: 'SitlStatusPanel', title: 'SITL Status' },
  // Mission panels (for monitoring during flight)
  missionMap: { component: 'MissionMapPanel', title: 'Mission Map' },
  waypoints: { component: 'WaypointTablePanel', title: 'Waypoints' },
  altitudeProfile: { component: 'AltitudeProfilePanel', title: 'Altitude Profile' },
} as const;

export type PanelId = keyof typeof PANEL_COMPONENTS;
