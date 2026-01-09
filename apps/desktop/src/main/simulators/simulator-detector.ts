/**
 * Simulator Detector
 *
 * Detects installed flight simulators (FlightGear, X-Plane, RealFlight)
 * on the user's system across different platforms.
 */

import { existsSync } from 'fs';
import { join } from 'path';

export type SimulatorType = 'flightgear' | 'xplane' | 'realflight';

export interface SimulatorInfo {
  name: SimulatorType;
  displayName: string;
  installed: boolean;
  path: string | null;
  version: string | null;
  executable: string | null;
}

// Platform-specific paths for FlightGear
const FLIGHTGEAR_PATHS = {
  darwin: [
    '/Applications/FlightGear.app',
    `${process.env.HOME}/Applications/FlightGear.app`,
  ],
  win32: [
    'C:\\Program Files\\FlightGear 2024\\bin\\fgfs.exe',
    'C:\\Program Files\\FlightGear 2020.3\\bin\\fgfs.exe',
    'C:\\Program Files (x86)\\FlightGear\\bin\\fgfs.exe',
  ],
  linux: [
    '/usr/bin/fgfs',
    '/usr/games/fgfs',
    '/usr/local/bin/fgfs',
  ],
};

// Platform-specific paths for X-Plane
const XPLANE_PATHS = {
  darwin: [
    '/Applications/X-Plane 12',
    '/Applications/X-Plane 11',
    `${process.env.HOME}/Applications/X-Plane 12`,
    `${process.env.HOME}/Applications/X-Plane 11`,
  ],
  win32: [
    'C:\\X-Plane 12\\X-Plane.exe',
    'C:\\X-Plane 11\\X-Plane.exe',
    'D:\\X-Plane 12\\X-Plane.exe',
    'D:\\X-Plane 11\\X-Plane.exe',
  ],
  linux: [
    `${process.env.HOME}/X-Plane 12`,
    `${process.env.HOME}/X-Plane 11`,
    '/opt/X-Plane 12',
    '/opt/X-Plane 11',
  ],
};

/**
 * Get the executable path for FlightGear on macOS
 */
function getFlightGearMacExecutable(appPath: string): string {
  // macOS FlightGear uses 'FlightGear' as the executable name (not 'fgfs')
  return join(appPath, 'Contents', 'MacOS', 'FlightGear');
}

/**
 * Get the executable path for X-Plane on macOS
 */
function getXPlaneMacExecutable(appPath: string): string {
  return join(appPath, 'X-Plane.app', 'Contents', 'MacOS', 'X-Plane');
}

/**
 * Try to get FlightGear version from plist (macOS) or path name
 * NOTE: Do NOT run `fgfs --version` - on macOS it launches the full GUI!
 */
function getFlightGearVersion(appPath: string): string | null {
  const platform = process.platform;

  try {
    if (platform === 'darwin') {
      // Try to read version from Info.plist
      const plistPath = join(appPath, 'Contents', 'Info.plist');
      if (existsSync(plistPath)) {
        const plistContent = require('fs').readFileSync(plistPath, 'utf-8');
        // Look for CFBundleShortVersionString
        const match = plistContent.match(/<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/);
        return match?.[1] ?? null;
      }
    } else if (platform === 'win32') {
      // Extract version from path like "FlightGear 2024" or "FlightGear 2020.3"
      const match = appPath.match(/FlightGear\s*(\d+\.?\d*\.?\d*)/i);
      return match?.[1] ?? null;
    }
    // Linux: Could parse dpkg/rpm but not critical
    return null;
  } catch {
    return null;
  }
}

/**
 * Detect FlightGear installation
 */
export async function detectFlightGear(): Promise<SimulatorInfo> {
  const platform = process.platform as 'darwin' | 'win32' | 'linux';
  const searchPaths = FLIGHTGEAR_PATHS[platform] || [];

  for (const searchPath of searchPaths) {
    if (existsSync(searchPath)) {
      let executable: string;

      if (platform === 'darwin') {
        executable = getFlightGearMacExecutable(searchPath);
      } else {
        executable = searchPath;
      }

      // Verify executable exists
      if (platform === 'darwin' && !existsSync(executable)) {
        continue;
      }

      // Get version from plist or path (NOT by running the executable!)
      const version = getFlightGearVersion(searchPath);

      return {
        name: 'flightgear',
        displayName: 'FlightGear',
        installed: true,
        path: searchPath,
        version,
        executable,
      };
    }
  }

  return {
    name: 'flightgear',
    displayName: 'FlightGear',
    installed: false,
    path: null,
    version: null,
    executable: null,
  };
}

/**
 * Detect X-Plane installation
 */
export async function detectXPlane(): Promise<SimulatorInfo> {
  const platform = process.platform as 'darwin' | 'win32' | 'linux';
  const searchPaths = XPLANE_PATHS[platform] || [];

  for (const searchPath of searchPaths) {
    if (existsSync(searchPath)) {
      let executable: string;

      if (platform === 'darwin') {
        executable = getXPlaneMacExecutable(searchPath);
      } else if (platform === 'win32') {
        executable = searchPath;
      } else {
        executable = join(searchPath, 'X-Plane-x86_64');
      }

      // Determine version from path
      const version = searchPath.includes('12') ? '12' : searchPath.includes('11') ? '11' : null;

      return {
        name: 'xplane',
        displayName: 'X-Plane',
        installed: true,
        path: searchPath,
        version,
        executable,
      };
    }
  }

  return {
    name: 'xplane',
    displayName: 'X-Plane',
    installed: false,
    path: null,
    version: null,
    executable: null,
  };
}

/**
 * Detect all supported simulators
 */
export async function detectSimulators(): Promise<SimulatorInfo[]> {
  const [flightGear, xplane] = await Promise.all([
    detectFlightGear(),
    detectXPlane(),
  ]);

  return [flightGear, xplane];
}

/**
 * Get path to FlightGear's Protocol directory where we need to install our protocol files
 */
export function getFlightGearProtocolDir(fgPath: string): string | null {
  const platform = process.platform;

  if (platform === 'darwin') {
    // macOS: Inside the app bundle
    return join(fgPath, 'Contents', 'Resources', 'data', 'Protocol');
  } else if (platform === 'win32') {
    // Windows: Relative to executable
    const fgDir = fgPath.replace(/\\bin\\fgfs\.exe$/i, '');
    return join(fgDir, 'data', 'Protocol');
  } else {
    // Linux: System data directory
    return '/usr/share/games/flightgear/Protocol';
  }
}

/**
 * Get FlightGear's FG_ROOT environment variable path
 */
export function getFlightGearRoot(fgPath: string): string | null {
  const platform = process.platform;

  if (platform === 'darwin') {
    // macOS FlightGear stores data in ~/Library/Application Support/FlightGear/
    // The fgdata folder has version suffix like fgdata_2024_1
    const supportDir = join(process.env.HOME || '', 'Library', 'Application Support', 'FlightGear');
    try {
      const fs = require('fs');
      const entries = fs.readdirSync(supportDir);
      const fgdata = entries.find((e: string) => e.startsWith('fgdata_'));
      if (fgdata) {
        return join(supportDir, fgdata);
      }
    } catch {
      // Fall back to app bundle path
    }
    return join(fgPath, 'Contents', 'Resources', 'data');
  } else if (platform === 'win32') {
    const fgDir = fgPath.replace(/\\bin\\fgfs\.exe$/i, '');
    return join(fgDir, 'data');
  } else {
    return '/usr/share/games/flightgear';
  }
}
