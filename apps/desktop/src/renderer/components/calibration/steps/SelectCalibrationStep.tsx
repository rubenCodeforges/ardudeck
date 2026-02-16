/**
 * SelectCalibrationStep - Choose which calibration to perform
 *
 * Displays a grid of calibration types with colorful cards and background diagrams.
 * Shows calibration status (green checkmark if calibrated, warning if needed).
 */

import { useCalibrationStore, getAvailableCalibrationTypes, isCalibrationTypeAvailable } from '../../../stores/calibration-store';
import { useTelemetryStore } from '../../../stores/telemetry-store';
import { type CalibrationTypeId } from '../../../../shared/calibration-types';

// Map calibration type IDs to arming flag names that indicate calibration is needed
// iNav flags: 'Accelerometer', 'Compass', 'No Gyro'
// Betaflight flags: 'Acc Calibration', 'No Gyro'
const CALIBRATION_ARMING_FLAGS: Record<CalibrationTypeId, string[]> = {
  'accel-level': ['Accelerometer', 'Acc Calibration'],
  'accel-6point': ['Accelerometer', 'Acc Calibration'],
  compass: ['Compass'],
  gyro: ['No Gyro'],
  opflow: [], // No specific arming flag for optical flow
};

/**
 * Check if a calibration is needed based on arming disabled reasons
 */
function isCalibrationNeeded(calTypeId: CalibrationTypeId, armingDisabledReasons: string[]): boolean {
  const flags = CALIBRATION_ARMING_FLAGS[calTypeId];
  return flags.some(flag => armingDisabledReasons.includes(flag));
}

/**
 * Check if a calibration is OK (calibrated and not causing arming issues)
 */
function isCalibrationOk(calTypeId: CalibrationTypeId, armingDisabledReasons: string[]): boolean {
  // If there are no specific flags for this calibration type, we can't determine status
  const flags = CALIBRATION_ARMING_FLAGS[calTypeId];
  if (flags.length === 0) return false; // Unknown status

  // Calibration is OK if none of its flags are in the arming disabled reasons
  return !flags.some(flag => armingDisabledReasons.includes(flag));
}

// Color themes for each calibration type
const CalibrationThemes: Record<CalibrationTypeId, {
  gradient: string;
  border: string;
  hoverBorder: string;
  iconBg: string;
  iconColor: string;
  bgPattern: string;
}> = {
  'accel-level': {
    gradient: 'from-emerald-500/5 via-transparent to-teal-500/5',
    border: 'border-emerald-500/20',
    hoverBorder: 'hover:border-emerald-400/50',
    iconBg: 'from-emerald-500/20 to-teal-500/20',
    iconColor: 'text-emerald-400',
    bgPattern: 'text-emerald-500/[0.03]',
  },
  'accel-6point': {
    gradient: 'from-blue-500/5 via-transparent to-indigo-500/5',
    border: 'border-blue-500/20',
    hoverBorder: 'hover:border-blue-400/50',
    iconBg: 'from-blue-500/20 to-indigo-500/20',
    iconColor: 'text-blue-400',
    bgPattern: 'text-blue-500/[0.03]',
  },
  compass: {
    gradient: 'from-amber-500/5 via-transparent to-orange-500/5',
    border: 'border-amber-500/20',
    hoverBorder: 'hover:border-amber-400/50',
    iconBg: 'from-amber-500/20 to-orange-500/20',
    iconColor: 'text-amber-400',
    bgPattern: 'text-amber-500/[0.03]',
  },
  gyro: {
    gradient: 'from-violet-500/5 via-transparent to-purple-500/5',
    border: 'border-violet-500/20',
    hoverBorder: 'hover:border-violet-400/50',
    iconBg: 'from-violet-500/20 to-purple-500/20',
    iconColor: 'text-violet-400',
    bgPattern: 'text-violet-500/[0.03]',
  },
  opflow: {
    gradient: 'from-cyan-500/5 via-transparent to-sky-500/5',
    border: 'border-cyan-500/20',
    hoverBorder: 'hover:border-cyan-400/50',
    iconBg: 'from-cyan-500/20 to-sky-500/20',
    iconColor: 'text-cyan-400',
    bgPattern: 'text-cyan-500/[0.03]',
  },
};

// Icon components for each calibration type
const CalibrationIcons: Record<CalibrationTypeId, React.ReactNode> = {
  'accel-level': (
    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10M12 3v18M3 7h4M17 7h4M3 12h4M17 12h4" />
    </svg>
  ),
  'accel-6point': (
    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v8m-4-4h8" />
    </svg>
  ),
  compass: (
    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z" />
    </svg>
  ),
  gyro: (
    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  ),
  opflow: (
    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  ),
};

// Background pattern SVGs for each calibration type - larger size for better visibility
const BackgroundPatterns: Record<CalibrationTypeId, React.ReactNode> = {
  'accel-level': (
    <svg className="absolute -right-6 -bottom-6 w-48 h-48" viewBox="0 0 100 100" fill="currentColor">
      {/* Level/horizon lines */}
      <line x1="10" y1="50" x2="90" y2="50" stroke="currentColor" strokeWidth="2" fill="none" />
      <line x1="50" y1="20" x2="50" y2="80" stroke="currentColor" strokeWidth="2" fill="none" />
      <circle cx="50" cy="50" r="8" fill="currentColor" />
      <circle cx="50" cy="50" r="20" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <circle cx="50" cy="50" r="35" stroke="currentColor" strokeWidth="1" fill="none" />
    </svg>
  ),
  'accel-6point': (
    <svg className="absolute -right-6 -bottom-6 w-48 h-48" viewBox="0 0 100 100" fill="currentColor">
      {/* 3D cube representation */}
      <path d="M50 15 L80 30 L80 70 L50 85 L20 70 L20 30 Z" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <line x1="50" y1="15" x2="50" y2="45" stroke="currentColor" strokeWidth="1.5" />
      <line x1="80" y1="30" x2="50" y2="45" stroke="currentColor" strokeWidth="1.5" />
      <line x1="20" y1="30" x2="50" y2="45" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="50" cy="15" r="4" fill="currentColor" />
      <circle cx="50" cy="85" r="4" fill="currentColor" />
      <circle cx="20" cy="30" r="4" fill="currentColor" />
      <circle cx="80" cy="30" r="4" fill="currentColor" />
      <circle cx="20" cy="70" r="4" fill="currentColor" />
      <circle cx="80" cy="70" r="4" fill="currentColor" />
    </svg>
  ),
  compass: (
    <svg className="absolute -right-6 -bottom-6 w-48 h-48" viewBox="0 0 100 100" fill="currentColor">
      {/* Compass rose */}
      <circle cx="50" cy="50" r="35" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <circle cx="50" cy="50" r="25" stroke="currentColor" strokeWidth="1" fill="none" />
      <path d="M50 15 L55 45 L50 55 L45 45 Z" fill="currentColor" />
      <path d="M85 50 L55 55 L45 50 L55 45 Z" fill="currentColor" opacity="0.5" />
      <path d="M50 85 L45 55 L50 45 L55 55 Z" fill="currentColor" opacity="0.5" />
      <path d="M15 50 L45 45 L55 50 L45 55 Z" fill="currentColor" opacity="0.5" />
      <text x="50" y="12" textAnchor="middle" fontSize="8" fill="currentColor">N</text>
      <text x="90" y="53" textAnchor="middle" fontSize="8" fill="currentColor">E</text>
      <text x="50" y="95" textAnchor="middle" fontSize="8" fill="currentColor">S</text>
      <text x="10" y="53" textAnchor="middle" fontSize="8" fill="currentColor">W</text>
    </svg>
  ),
  gyro: (
    <svg className="absolute -right-6 -bottom-6 w-48 h-48" viewBox="0 0 100 100" fill="currentColor">
      {/* Gyroscope rings */}
      <ellipse cx="50" cy="50" rx="35" ry="15" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <ellipse cx="50" cy="50" rx="15" ry="35" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <ellipse cx="50" cy="50" rx="25" ry="25" stroke="currentColor" strokeWidth="1" fill="none" transform="rotate(45 50 50)" />
      <circle cx="50" cy="50" r="6" fill="currentColor" />
      {/* Rotation arrows */}
      <path d="M75 35 Q85 50 75 65" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <path d="M75 65 L78 60 M75 65 L70 62" stroke="currentColor" strokeWidth="1.5" fill="none" />
    </svg>
  ),
  opflow: (
    <svg className="absolute -right-6 -bottom-6 w-48 h-48" viewBox="0 0 100 100" fill="currentColor">
      {/* Optical flow pattern - grid with flow vectors */}
      <rect x="25" y="25" width="50" height="50" stroke="currentColor" strokeWidth="1" fill="none" />
      <line x1="25" y1="50" x2="75" y2="50" stroke="currentColor" strokeWidth="0.5" />
      <line x1="50" y1="25" x2="50" y2="75" stroke="currentColor" strokeWidth="0.5" />
      {/* Flow arrows */}
      <path d="M30 40 L40 35" stroke="currentColor" strokeWidth="1.5" />
      <path d="M40 35 L37 38 M40 35 L40 40" stroke="currentColor" strokeWidth="1" />
      <path d="M60 40 L70 35" stroke="currentColor" strokeWidth="1.5" />
      <path d="M70 35 L67 38 M70 35 L70 40" stroke="currentColor" strokeWidth="1" />
      <path d="M30 60 L40 65" stroke="currentColor" strokeWidth="1.5" />
      <path d="M40 65 L37 62 M40 65 L40 60" stroke="currentColor" strokeWidth="1" />
      <path d="M60 60 L70 65" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="50" cy="50" r="8" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <circle cx="50" cy="50" r="3" fill="currentColor" />
    </svg>
  ),
};

export function SelectCalibrationStep() {
  const { protocol, sensors, isSensorsLoading, selectCalibrationType, error, completedCalibrations } = useCalibrationStore();
  const { flight } = useTelemetryStore();

  // Get arming disabled reasons from telemetry
  const armingDisabledReasons = flight.armingDisabledReasons || [];

  // Get calibration types for current protocol - filter to only show supported ones
  const availableTypes = getAvailableCalibrationTypes(protocol, null, sensors)
    .filter((calType) => !protocol || calType.protocols.includes(protocol));

  return (
    <div className="space-y-6">
      {/* Introduction */}
      <div className="text-center max-w-2xl mx-auto">
        <h3 className="text-xl font-semibold text-white mb-2">Select Calibration Type</h3>
        <p className="text-gray-400">
          Choose the sensor you want to calibrate. Some calibrations require specific sensors
          to be present on your flight controller.
        </p>
      </div>

      {/* Error message */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-center">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Loading indicator */}
      {isSensorsLoading && (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" />
        </div>
      )}

      {/* Calibration type grid */}
      {!isSensorsLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {availableTypes.map((calType) => {
            const isAvailable = isCalibrationTypeAvailable(calType, sensors);
            const theme = CalibrationThemes[calType.id];
            // If calibration was completed + saved this session, show OK regardless of arming flags
            // (iNav doesn't clear arming flags until reboot)
            // accel-level and accel-6point share the same sensor, so completing either counts
            const completedThisSession = completedCalibrations.has(calType.id)
              || (calType.id === 'accel-level' && completedCalibrations.has('accel-6point'))
              || (calType.id === 'accel-6point' && completedCalibrations.has('accel-level'));
            const calibrationOk = completedThisSession || isCalibrationOk(calType.id, armingDisabledReasons);
            const calibrationNeeded = !completedThisSession && isCalibrationNeeded(calType.id, armingDisabledReasons);
            const hasStatusInfo = CALIBRATION_ARMING_FLAGS[calType.id].length > 0 || completedThisSession;

            return (
              <button
                key={calType.id}
                onClick={() => isAvailable && selectCalibrationType(calType.id)}
                disabled={!isAvailable}
                className={`
                  relative p-6 rounded-xl border text-left transition-all duration-300 overflow-hidden group
                  ${isAvailable
                    ? `bg-gradient-to-br ${theme.gradient} ${theme.border} ${theme.hoverBorder} hover:shadow-lg hover:shadow-black/20 hover:scale-[1.02] cursor-pointer`
                    : 'border-gray-800 bg-gray-800/30 cursor-not-allowed opacity-50'
                  }
                `}
              >
                {/* Background pattern */}
                {isAvailable && (
                  <div className={`${theme.bgPattern} transition-opacity duration-300 group-hover:opacity-150`}>
                    {BackgroundPatterns[calType.id]}
                  </div>
                )}

                {/* Calibration status indicator */}
                {isAvailable && hasStatusInfo && (
                  <div className="absolute top-4 right-4">
                    {calibrationOk ? (
                      <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-green-500/20 text-green-400 text-xs font-medium">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                        OK
                      </div>
                    ) : calibrationNeeded ? (
                      <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-amber-500/20 text-amber-400 text-xs font-medium">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        Needed
                      </div>
                    ) : null}
                  </div>
                )}

                {/* Icon */}
                <div className={`relative w-14 h-14 rounded-xl flex items-center justify-center mb-4 ${
                  isAvailable
                    ? `bg-gradient-to-br ${theme.iconBg} ${theme.iconColor}`
                    : 'bg-gray-800 text-gray-600'
                }`}>
                  {CalibrationIcons[calType.id]}
                </div>

                {/* Title & Description */}
                <h4 className={`relative font-semibold mb-1 ${
                  isAvailable ? 'text-white' : 'text-gray-500'
                }`}>
                  {calType.name}
                </h4>
                <p className={`relative text-sm leading-relaxed ${
                  isAvailable ? 'text-gray-400' : 'text-gray-600'
                }`}>
                  {calType.description}
                </p>

                {/* Duration badge */}
                <div className={`relative mt-4 inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full ${
                  isAvailable
                    ? `bg-gray-800/50 ${theme.iconColor.replace('text-', 'text-').replace('400', '300')}`
                    : 'bg-gray-800/30 text-gray-600'
                }`}>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  ~{calType.estimatedDuration}s
                </div>

                {/* Unavailable indicator */}
                {!isAvailable && (
                  <div className="absolute top-4 right-4 px-2 py-1 rounded-full bg-red-500/20 text-red-400 text-xs font-medium">
                    Sensor Missing
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Help text */}
      <div className="text-center text-xs text-gray-500 mt-6">
        <p>
          Ensure your vehicle is disarmed and in a safe location before calibrating.
          {protocol === 'msp' && ' For best results, disconnect motors.'}
        </p>
      </div>
    </div>
  );
}
