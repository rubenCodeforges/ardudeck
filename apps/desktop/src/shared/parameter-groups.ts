/**
 * Parameter Group Definitions
 * Groups commonly modified ArduPilot parameters for easier navigation
 */

export interface ParameterGroup {
  id: string;
  name: string;
  icon: string; // SVG path data for the icon
  description: string;
  prefixes: string[]; // Parameter name prefixes that belong to this group
}

export const PARAMETER_GROUPS: ParameterGroup[] = [
  {
    id: 'all',
    name: 'All',
    icon: 'M4 6h16M4 10h16M4 14h16M4 18h16',
    description: 'All parameters',
    prefixes: [], // Empty means show all
  },
  {
    id: 'arming',
    name: 'Arming',
    icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
    description: 'Arming checks and requirements',
    prefixes: ['ARMING_'],
  },
  {
    id: 'battery',
    name: 'Battery',
    icon: 'M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z',
    description: 'Battery monitor configuration',
    prefixes: ['BATT_', 'BATT2_', 'BATT3_'],
  },
  {
    id: 'failsafe',
    name: 'Failsafe',
    icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
    description: 'Failsafe actions and thresholds',
    prefixes: ['FS_', 'BATT_FS_', 'THR_FS_', 'GCS_', 'FENCE_'],
  },
  {
    id: 'flight_modes',
    name: 'Flight Modes',
    icon: 'M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3',
    description: 'Flight mode configuration',
    prefixes: ['FLTMODE', 'MODE', 'SIMPLE_', 'SUPER_SIMPLE'],
  },
  {
    id: 'tuning',
    name: 'Tuning',
    icon: 'M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4',
    description: 'PID and attitude tuning',
    prefixes: ['ATC_', 'PSC_', 'ACRO_', 'ANGLE_', 'RATE_', 'AUTOTUNE_'],
  },
  {
    id: 'gps',
    name: 'GPS',
    icon: 'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z',
    description: 'GPS configuration',
    prefixes: ['GPS_', 'GPS2_', 'EK2_GPS', 'EK3_GPS'],
  },
  {
    id: 'compass',
    name: 'Compass',
    icon: 'M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    description: 'Compass and magnetometer settings',
    prefixes: ['COMPASS_', 'COMPASS2_', 'COMPASS3_'],
  },
  {
    id: 'rc',
    name: 'RC Input',
    icon: 'M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
    description: 'Radio control input settings',
    prefixes: ['RC', 'RCMAP_', 'BRD_PWM', 'BRD_RADIO'],
  },
  {
    id: 'motors',
    name: 'Motors',
    icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
    description: 'Motor and ESC configuration',
    prefixes: ['MOT_', 'SERVO', 'ESC_', 'H_'],
  },
  {
    id: 'navigation',
    name: 'Navigation',
    icon: 'M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7',
    description: 'Waypoint and navigation settings',
    prefixes: ['WPNAV_', 'WP_', 'RTL_', 'LOIT_', 'LAND_', 'CIRCLE_'],
  },
  {
    id: 'logging',
    name: 'Logging',
    icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
    description: 'Data logging and scheduler',
    prefixes: ['LOG_', 'SCHED_', 'STAT_'],
  },
];

/**
 * Get the group ID for a parameter based on its name
 */
export function getParameterGroup(paramName: string): string {
  const upperName = paramName.toUpperCase();

  for (const group of PARAMETER_GROUPS) {
    if (group.id === 'all') continue;

    for (const prefix of group.prefixes) {
      if (upperName.startsWith(prefix)) {
        return group.id;
      }
    }
  }

  return 'other'; // Parameters that don't match any group
}

/**
 * Check if a parameter belongs to a specific group
 */
export function parameterBelongsToGroup(paramName: string, groupId: string): boolean {
  if (groupId === 'all') return true;

  const group = PARAMETER_GROUPS.find(g => g.id === groupId);
  if (!group) return false;

  const upperName = paramName.toUpperCase();
  return group.prefixes.some(prefix => upperName.startsWith(prefix));
}

