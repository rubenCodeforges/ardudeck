/**
 * PrepareCalibrationStep - Instructions before starting calibration
 *
 * Shows specific instructions for the selected calibration type with
 * colorful themed design and compact layout.
 */

import { useCalibrationStore } from '../../../stores/calibration-store';
import { CALIBRATION_TYPES, ACCEL_6POINT_POSITIONS, type CalibrationTypeId } from '../../../../shared/calibration-types';
import { PositionDiagram } from '../shared/PositionDiagram';

// Color themes matching SelectCalibrationStep
const CalibrationThemes: Record<CalibrationTypeId, {
  gradient: string;
  border: string;
  iconBg: string;
  iconColor: string;
  accentColor: string;
  bgPattern: string;
}> = {
  'accel-level': {
    gradient: 'from-emerald-500/10 via-transparent to-teal-500/10',
    border: 'border-emerald-500/30',
    iconBg: 'from-emerald-500/20 to-teal-500/20',
    iconColor: 'text-emerald-400',
    accentColor: 'bg-emerald-500/20 text-emerald-400',
    bgPattern: 'text-emerald-500/[0.05]',
  },
  'accel-6point': {
    gradient: 'from-blue-500/10 via-transparent to-indigo-500/10',
    border: 'border-blue-500/30',
    iconBg: 'from-blue-500/20 to-indigo-500/20',
    iconColor: 'text-blue-400',
    accentColor: 'bg-blue-500/20 text-blue-400',
    bgPattern: 'text-blue-500/[0.05]',
  },
  compass: {
    gradient: 'from-amber-500/10 via-transparent to-orange-500/10',
    border: 'border-amber-500/30',
    iconBg: 'from-amber-500/20 to-orange-500/20',
    iconColor: 'text-amber-400',
    accentColor: 'bg-amber-500/20 text-amber-400',
    bgPattern: 'text-amber-500/[0.05]',
  },
  gyro: {
    gradient: 'from-violet-500/10 via-transparent to-purple-500/10',
    border: 'border-violet-500/30',
    iconBg: 'from-violet-500/20 to-purple-500/20',
    iconColor: 'text-violet-400',
    accentColor: 'bg-violet-500/20 text-violet-400',
    bgPattern: 'text-violet-500/[0.05]',
  },
  opflow: {
    gradient: 'from-cyan-500/10 via-transparent to-sky-500/10',
    border: 'border-cyan-500/30',
    iconBg: 'from-cyan-500/20 to-sky-500/20',
    iconColor: 'text-cyan-400',
    accentColor: 'bg-cyan-500/20 text-cyan-400',
    bgPattern: 'text-cyan-500/[0.05]',
  },
};

// Background patterns for each calibration type
const BackgroundPatterns: Record<CalibrationTypeId, React.ReactNode> = {
  'accel-level': (
    <svg className="absolute -right-8 -bottom-8 w-56 h-56 opacity-50" viewBox="0 0 100 100" fill="currentColor">
      <line x1="10" y1="50" x2="90" y2="50" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <line x1="50" y1="20" x2="50" y2="80" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <circle cx="50" cy="50" r="6" fill="currentColor" />
      <circle cx="50" cy="50" r="18" stroke="currentColor" strokeWidth="1" fill="none" />
      <circle cx="50" cy="50" r="32" stroke="currentColor" strokeWidth="0.5" fill="none" />
    </svg>
  ),
  'accel-6point': (
    <svg className="absolute -right-8 -bottom-8 w-56 h-56 opacity-50" viewBox="0 0 100 100" fill="currentColor">
      <path d="M50 15 L80 30 L80 70 L50 85 L20 70 L20 30 Z" stroke="currentColor" strokeWidth="1" fill="none" />
      <line x1="50" y1="15" x2="50" y2="45" stroke="currentColor" strokeWidth="1" />
      <line x1="80" y1="30" x2="50" y2="45" stroke="currentColor" strokeWidth="1" />
      <line x1="20" y1="30" x2="50" y2="45" stroke="currentColor" strokeWidth="1" />
      <circle cx="50" cy="15" r="3" fill="currentColor" />
      <circle cx="50" cy="85" r="3" fill="currentColor" />
      <circle cx="20" cy="30" r="3" fill="currentColor" />
      <circle cx="80" cy="30" r="3" fill="currentColor" />
      <circle cx="20" cy="70" r="3" fill="currentColor" />
      <circle cx="80" cy="70" r="3" fill="currentColor" />
    </svg>
  ),
  compass: (
    <svg className="absolute -right-8 -bottom-8 w-56 h-56 opacity-50" viewBox="0 0 100 100" fill="currentColor">
      <circle cx="50" cy="50" r="32" stroke="currentColor" strokeWidth="1" fill="none" />
      <circle cx="50" cy="50" r="22" stroke="currentColor" strokeWidth="0.5" fill="none" />
      <path d="M50 18 L54 45 L50 52 L46 45 Z" fill="currentColor" />
      <path d="M82 50 L55 54 L48 50 L55 46 Z" fill="currentColor" opacity="0.4" />
      <path d="M50 82 L46 55 L50 48 L54 55 Z" fill="currentColor" opacity="0.4" />
      <path d="M18 50 L45 46 L52 50 L45 54 Z" fill="currentColor" opacity="0.4" />
      <text x="50" y="12" textAnchor="middle" fontSize="6" fill="currentColor">N</text>
    </svg>
  ),
  gyro: (
    <svg className="absolute -right-8 -bottom-8 w-56 h-56 opacity-50" viewBox="0 0 100 100" fill="currentColor">
      <ellipse cx="50" cy="50" rx="32" ry="12" stroke="currentColor" strokeWidth="1" fill="none" />
      <ellipse cx="50" cy="50" rx="12" ry="32" stroke="currentColor" strokeWidth="1" fill="none" />
      <ellipse cx="50" cy="50" rx="22" ry="22" stroke="currentColor" strokeWidth="0.5" fill="none" transform="rotate(45 50 50)" />
      <circle cx="50" cy="50" r="5" fill="currentColor" />
      <path d="M72 38 Q80 50 72 62" stroke="currentColor" strokeWidth="1" fill="none" />
      <path d="M72 62 L74 58 M72 62 L68 60" stroke="currentColor" strokeWidth="1" fill="none" />
    </svg>
  ),
  opflow: (
    <svg className="absolute -right-8 -bottom-8 w-56 h-56 opacity-50" viewBox="0 0 100 100" fill="currentColor">
      <rect x="25" y="25" width="50" height="50" stroke="currentColor" strokeWidth="0.5" fill="none" />
      <line x1="25" y1="50" x2="75" y2="50" stroke="currentColor" strokeWidth="0.3" />
      <line x1="50" y1="25" x2="50" y2="75" stroke="currentColor" strokeWidth="0.3" />
      <path d="M32 42 L42 37" stroke="currentColor" strokeWidth="1" />
      <path d="M58 42 L68 37" stroke="currentColor" strokeWidth="1" />
      <path d="M32 58 L42 63" stroke="currentColor" strokeWidth="1" />
      <path d="M58 58 L68 63" stroke="currentColor" strokeWidth="1" />
      <circle cx="50" cy="50" r="6" stroke="currentColor" strokeWidth="1" fill="none" />
      <circle cx="50" cy="50" r="2" fill="currentColor" />
    </svg>
  ),
};

// Icon components for each calibration type
const CalibrationIcons: Record<CalibrationTypeId, React.ReactNode> = {
  'accel-level': (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10M12 3v18M3 7h4M17 7h4M3 12h4M17 12h4" />
    </svg>
  ),
  'accel-6point': (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v8m-4-4h8" />
    </svg>
  ),
  compass: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z" />
    </svg>
  ),
  gyro: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  ),
  opflow: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  ),
};

export function PrepareCalibrationStep() {
  const {
    calibrationType,
    countdown,
    error,
    setStep,
    startCalibration,
  } = useCalibrationStore();

  const calTypeInfo = calibrationType
    ? CALIBRATION_TYPES.find((t) => t.id === calibrationType)
    : null;

  if (!calibrationType || !calTypeInfo) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-400">No calibration type selected.</p>
        <button
          onClick={() => setStep('select')}
          className="mt-3 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white transition-colors"
        >
          Go Back
        </button>
      </div>
    );
  }

  const theme = CalibrationThemes[calibrationType];

  return (
    <div className="max-w-3xl mx-auto">
      {/* Main card with background pattern */}
      <div className={`relative overflow-hidden rounded-2xl border ${theme.border} bg-gradient-to-br ${theme.gradient}`}>
        {/* Background pattern */}
        <div className={theme.bgPattern}>
          {BackgroundPatterns[calibrationType]}
        </div>

        <div className="relative p-5 sm:p-6">
          {/* Header row - icon, title, start button */}
          <div className="flex items-center justify-between gap-4 mb-5">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${theme.iconBg} ${theme.iconColor} flex items-center justify-center`}>
                {CalibrationIcons[calibrationType]}
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">{calTypeInfo.name}</h3>
                <p className="text-xs text-gray-400">~{calTypeInfo.estimatedDuration}s duration</p>
              </div>
            </div>

            <button
              onClick={startCalibration}
              className={`px-5 py-2.5 rounded-lg font-medium transition-all flex items-center gap-2 ${
                theme.iconColor.replace('text-', 'bg-').replace('400', '500')
              } hover:brightness-110 text-white shadow-lg`}
            >
              Start
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          </div>

          {/* Instructions - compact grid layout */}
          <div className="space-y-3">
            {calibrationType === 'accel-level' && (
              <div className="flex flex-col sm:flex-row gap-4">
                {/* Instructions */}
                <div className="flex-1 space-y-2">
                  <InstructionItem theme={theme} num={1}>
                    Place vehicle on a <strong className="text-white">level surface</strong>
                  </InstructionItem>
                  <InstructionItem theme={theme} num={2}>
                    Keep <strong className="text-white">completely still</strong> during calibration
                  </InstructionItem>
                  <InstructionItem theme={theme} num={3}>
                    Click Start when ready
                  </InstructionItem>
                </div>
                {/* Diagram */}
                <div className="flex-shrink-0 flex justify-center sm:justify-end">
                  <div className="transform scale-75 origin-center sm:origin-right">
                    <PositionDiagram position={0} />
                  </div>
                </div>
              </div>
            )}

            {calibrationType === 'accel-6point' && (
              <>
                <p className="text-gray-300 text-sm">
                  Place vehicle in <strong className="text-white">6 positions</strong> - you'll be guided step by step.
                </p>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {ACCEL_6POINT_POSITIONS.map((pos, index) => (
                    <div key={index} className="bg-gray-900/50 rounded-lg p-2 text-center">
                      <div className={`w-5 h-5 mx-auto mb-1 ${theme.iconColor}`}>
                        <PositionIcon position={index as 0 | 1 | 2 | 3 | 4 | 5} />
                      </div>
                      <p className="text-[10px] text-gray-500 truncate">{pos.split(' ')[0]}</p>
                    </div>
                  ))}
                </div>
                <WarningBox>
                  Hold each position <strong className="text-white">steady</strong> until confirmed.
                </WarningBox>
              </>
            )}

            {calibrationType === 'compass' && (
              <>
                <div className="grid sm:grid-cols-3 gap-2">
                  <InstructionItem theme={theme} num={1}>
                    Move away from <strong className="text-white">metal/electronics</strong>
                  </InstructionItem>
                  <InstructionItem theme={theme} num={2}>
                    <strong className="text-white">Rotate continuously</strong> in all directions
                  </InstructionItem>
                  <InstructionItem theme={theme} num={3}>
                    Continue for ~{countdown}s
                  </InstructionItem>
                </div>
                <WarningBox>
                  External compass must be firmly mounted.
                </WarningBox>
              </>
            )}

            {calibrationType === 'gyro' && (
              <>
                <div className="grid sm:grid-cols-3 gap-2">
                  <InstructionItem theme={theme} num={1}>
                    Place on <strong className="text-white">stable surface</strong>
                  </InstructionItem>
                  <InstructionItem theme={theme} num={2}>
                    Keep <strong className="text-white">completely still</strong>
                  </InstructionItem>
                  <InstructionItem theme={theme} num={3}>
                    Auto-completes in seconds
                  </InstructionItem>
                </div>
                <InfoBox theme={theme}>
                  Gyro calibration runs automatically on boot. Manual calibration only needed for drift issues.
                </InfoBox>
              </>
            )}

            {calibrationType === 'opflow' && (
              <div className="grid sm:grid-cols-3 gap-2">
                <InstructionItem theme={theme} num={1}>
                  Hold <strong className="text-white">1-2m above textured surface</strong>
                </InstructionItem>
                <InstructionItem theme={theme} num={2}>
                  Surface needs <strong className="text-white">visible patterns</strong>
                </InstructionItem>
                <InstructionItem theme={theme} num={3}>
                  Keep still for ~{countdown}s
                </InstructionItem>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="mt-4 bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-center">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Back button - subtle */}
      <div className="mt-4 flex justify-start">
        <button
          onClick={() => setStep('select')}
          className="px-3 py-2 text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1.5 text-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Change calibration type
        </button>
      </div>
    </div>
  );
}

// Helper components
function InstructionItem({
  theme,
  num,
  children
}: {
  theme: typeof CalibrationThemes['accel-level'];
  num: number;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <div className={`w-5 h-5 rounded-full ${theme.accentColor} flex items-center justify-center text-xs font-medium flex-shrink-0`}>
        {num}
      </div>
      <p className="text-gray-300 text-sm leading-snug">{children}</p>
    </div>
  );
}

function WarningBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2">
      <svg className="w-4 h-4 text-yellow-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <p className="text-yellow-400/90 text-sm">{children}</p>
    </div>
  );
}

function InfoBox({
  theme,
  children
}: {
  theme: typeof CalibrationThemes['accel-level'];
  children: React.ReactNode;
}) {
  return (
    <div className={`flex items-center gap-2 bg-gray-800/50 border ${theme.border} rounded-lg px-3 py-2`}>
      <svg className={`w-4 h-4 flex-shrink-0 ${theme.iconColor}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <p className={`${theme.iconColor} text-sm opacity-80`}>{children}</p>
    </div>
  );
}

// SVG icons for 6-point calibration positions
function PositionIcon({ position }: { position: 0 | 1 | 2 | 3 | 4 | 5 }) {
  const icons = [
    // 0: Level (Top Up) - arrow pointing up
    <svg key={0} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>,
    // 1: Inverted (Top Down) - arrow pointing down
    <svg key={1} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12l7 7 7-7" />
    </svg>,
    // 2: Left Side Down - arrow pointing left
    <svg key={2} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M12 5l-7 7 7 7" />
    </svg>,
    // 3: Right Side Down - arrow pointing right
    <svg key={3} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>,
    // 4: Nose Down - diagonal arrow down-left
    <svg key={4} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6L6 18M6 10v8h8" />
    </svg>,
    // 5: Nose Up - diagonal arrow up-right
    <svg key={5} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 18L18 6M18 14V6h-8" />
    </svg>,
  ];
  return icons[position];
}
