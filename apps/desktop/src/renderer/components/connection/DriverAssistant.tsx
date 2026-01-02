import { useState } from 'react';

interface DriverInfo {
  name: string;
  description: string;
  url: string;
  bundledFile?: string; // If set, we have this driver bundled
  chips: string[];
}

const DRIVER_INFO: Record<string, DriverInfo[]> = {
  darwin: [
    {
      name: 'CH340/CH341 Driver (if needed)',
      description: 'macOS 10.14+ has built-in support. Only install if device not detected.',
      url: 'https://www.wch-ic.com/downloads/CH341SER_MAC_ZIP.html',
      bundledFile: 'CH34xVCPDriver.dmg',
      chips: ['CH340', 'CH341', 'QinHeng', 'WCH'],
    },
  ],
  win32: [
    {
      name: 'CH340/CH341 Driver',
      description: 'Required for budget flight controllers and Arduino clones',
      url: 'https://www.wch-ic.com/downloads/CH341SER_EXE.html',
      // No bundled file for Windows yet - download required JavaScript
      chips: ['CH340', 'CH341', 'QinHeng', 'WCH'],
    },
    {
      name: 'CP210x Driver',
      description: 'For Silicon Labs USB-UART bridges (most Pixhawk boards)',
      url: 'https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers',
      chips: ['CP210x', 'Silicon Labs'],
    },
  ],
  linux: [], // Linux has built-in drivers
};

const TROUBLESHOOTING_TIPS = [
  'Try a different USB cable (some are charge-only)',
  'Try a different USB port (avoid USB hubs)',
  'Unplug and replug the device',
  'Restart the application after installing drivers',
];

function getOS(): 'darwin' | 'win32' | 'linux' {
  const platform = navigator.platform.toLowerCase();
  if (platform.includes('mac')) return 'darwin';
  if (platform.includes('win')) return 'win32';
  return 'linux';
}

function getOSName(): string {
  const os = getOS();
  if (os === 'darwin') return 'macOS';
  if (os === 'win32') return 'Windows';
  return 'Linux';
}

export function DriverAssistant() {
  const [expanded, setExpanded] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);
  const os = getOS();
  const drivers = DRIVER_INFO[os] || [];

  const handleDriverClick = async (driver: DriverInfo) => {
    if (driver.bundledFile) {
      // Use bundled driver
      setInstalling(driver.name);
      try {
        const result = await window.electronAPI.openBundledDriver(driver.bundledFile);
        if (!result.success) {
          console.error('Failed to open driver:', result.error);
          // Fallback to URL
          window.open(driver.url, '_blank');
        }
      } catch (err) {
        console.error('Error opening bundled driver:', err);
        window.open(driver.url, '_blank');
      } finally {
        setInstalling(null);
      }
    } else {
      // Open external URL
      window.open(driver.url, '_blank');
    }
  };

  return (
    <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-amber-500/10 transition-colors"
      >
        <svg className="w-5 h-5 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <div className="flex-1 text-left">
          <p className="text-sm font-medium text-amber-300">Connection failed</p>
          <p className="text-xs text-gray-400">You may need to install USB drivers</p>
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-amber-500/20 pt-3">
          {drivers.length > 0 ? (
            <div>
              <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
                Recommended Drivers for {getOSName()}
              </h4>
              <div className="space-y-2">
                {drivers.map((driver) => (
                  <button
                    key={driver.name}
                    onClick={() => handleDriverClick(driver)}
                    disabled={installing === driver.name}
                    className="w-full text-left p-3 bg-gray-800/50 hover:bg-gray-800 rounded-lg transition-colors group disabled:opacity-50"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-white group-hover:text-blue-400">
                          {driver.name}
                          {driver.bundledFile && (
                            <span className="ml-2 text-xs px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded">
                              Bundled
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-gray-500">{driver.description}</p>
                      </div>
                      {installing === driver.name ? (
                        <svg className="w-4 h-4 text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : driver.bundledFile ? (
                        <svg className="w-4 h-4 text-gray-500 group-hover:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4 text-gray-500 group-hover:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400">
              Linux includes built-in drivers for most USB-serial chips. If your device isn't detected,
              check that you have permission to access serial ports (add your user to the <code className="text-amber-400">dialout</code> group).
            </p>
          )}

          <div>
            <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
              Troubleshooting
            </h4>
            <ul className="space-y-1">
              {TROUBLESHOOTING_TIPS.map((tip, i) => (
                <li key={i} className="text-xs text-gray-500 flex items-start gap-2">
                  <span className="text-amber-500 mt-0.5">•</span>
                  {tip}
                </li>
              ))}
              {os === 'darwin' && (
                <li className="text-xs text-gray-500 flex items-start gap-2">
                  <span className="text-amber-500 mt-0.5">•</span>
                  After installing, allow the extension in System Settings → Privacy & Security
                </li>
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
