/**
 * PositionDiagram - SVG diagram showing vehicle position for 6-point calibration
 */

import { ACCEL_6POINT_POSITIONS, type AccelPosition } from '../../../../shared/calibration-types';

interface PositionDiagramProps {
  position: AccelPosition;
  isActive?: boolean;
}

export function PositionDiagram({ position, isActive = false }: PositionDiagramProps) {
  const size = 200;

  // Different SVG paths for each position
  const renderDiagram = () => {
    const baseClass = isActive ? 'text-cyan-400' : 'text-gray-400';
    const fillClass = isActive ? 'fill-cyan-500/20' : 'fill-gray-700/50';
    const strokeWidth = isActive ? 2 : 1.5;

    switch (position) {
      case 0: // Level (Top Up)
        return (
          <g className={baseClass}>
            {/* Drone body - top view */}
            <rect x="60" y="80" width="80" height="40" rx="4" className={fillClass} stroke="currentColor" strokeWidth={strokeWidth} />
            {/* Arms */}
            <line x1="40" y1="70" x2="70" y2="90" stroke="currentColor" strokeWidth={strokeWidth} />
            <line x1="160" y1="70" x2="130" y2="90" stroke="currentColor" strokeWidth={strokeWidth} />
            <line x1="40" y1="130" x2="70" y2="110" stroke="currentColor" strokeWidth={strokeWidth} />
            <line x1="160" y1="130" x2="130" y2="110" stroke="currentColor" strokeWidth={strokeWidth} />
            {/* Motors */}
            <circle cx="40" cy="70" r="12" className={fillClass} stroke="currentColor" strokeWidth={strokeWidth} />
            <circle cx="160" cy="70" r="12" className={fillClass} stroke="currentColor" strokeWidth={strokeWidth} />
            <circle cx="40" cy="130" r="12" className={fillClass} stroke="currentColor" strokeWidth={strokeWidth} />
            <circle cx="160" cy="130" r="12" className={fillClass} stroke="currentColor" strokeWidth={strokeWidth} />
            {/* Arrow indicating up */}
            <path d="M100 40 L110 55 L105 55 L105 70 L95 70 L95 55 L90 55 Z" fill="currentColor" />
            {/* Level surface line */}
            <line x1="30" y1="160" x2="170" y2="160" stroke="currentColor" strokeWidth={1} strokeDasharray="4" />
            <text x="100" y="180" textAnchor="middle" className="text-xs" fill="currentColor">Level Surface</text>
          </g>
        );

      case 1: // Inverted (Top Down)
        return (
          <g className={baseClass}>
            {/* Drone body - inverted */}
            <rect x="60" y="80" width="80" height="40" rx="4" className={fillClass} stroke="currentColor" strokeWidth={strokeWidth} />
            {/* Arms - inverted */}
            <line x1="40" y1="130" x2="70" y2="110" stroke="currentColor" strokeWidth={strokeWidth} />
            <line x1="160" y1="130" x2="130" y2="110" stroke="currentColor" strokeWidth={strokeWidth} />
            <line x1="40" y1="70" x2="70" y2="90" stroke="currentColor" strokeWidth={strokeWidth} />
            <line x1="160" y1="70" x2="130" y2="90" stroke="currentColor" strokeWidth={strokeWidth} />
            {/* Motors */}
            <circle cx="40" cy="130" r="12" className={fillClass} stroke="currentColor" strokeWidth={strokeWidth} />
            <circle cx="160" cy="130" r="12" className={fillClass} stroke="currentColor" strokeWidth={strokeWidth} />
            <circle cx="40" cy="70" r="12" className={fillClass} stroke="currentColor" strokeWidth={strokeWidth} />
            <circle cx="160" cy="70" r="12" className={fillClass} stroke="currentColor" strokeWidth={strokeWidth} />
            {/* Arrow indicating down */}
            <path d="M100 160 L110 145 L105 145 L105 130 L95 130 L95 145 L90 145 Z" fill="currentColor" />
            {/* Level surface line */}
            <line x1="30" y1="40" x2="170" y2="40" stroke="currentColor" strokeWidth={1} strokeDasharray="4" />
            <text x="100" y="30" textAnchor="middle" className="text-xs" fill="currentColor">Supporting Surface</text>
          </g>
        );

      case 2: // Left Side Down
        return (
          <g className={baseClass}>
            {/* Side view - left wing down */}
            <rect x="60" y="70" width="80" height="60" rx="4" className={fillClass} stroke="currentColor" strokeWidth={strokeWidth} transform="rotate(90 100 100)" />
            {/* Arrow indicating left */}
            <path d="M35 100 L50 90 L50 95 L70 95 L70 105 L50 105 L50 110 Z" fill="currentColor" />
            {/* Surface line */}
            <line x1="30" y1="160" x2="30" y2="40" stroke="currentColor" strokeWidth={1} strokeDasharray="4" />
            <text x="15" y="100" textAnchor="middle" className="text-xs" fill="currentColor" transform="rotate(-90 15 100)">Surface</text>
          </g>
        );

      case 3: // Right Side Down
        return (
          <g className={baseClass}>
            {/* Side view - right wing down */}
            <rect x="60" y="70" width="80" height="60" rx="4" className={fillClass} stroke="currentColor" strokeWidth={strokeWidth} transform="rotate(-90 100 100)" />
            {/* Arrow indicating right */}
            <path d="M165 100 L150 90 L150 95 L130 95 L130 105 L150 105 L150 110 Z" fill="currentColor" />
            {/* Surface line */}
            <line x1="170" y1="160" x2="170" y2="40" stroke="currentColor" strokeWidth={1} strokeDasharray="4" />
            <text x="185" y="100" textAnchor="middle" className="text-xs" fill="currentColor" transform="rotate(90 185 100)">Surface</text>
          </g>
        );

      case 4: // Nose Down
        return (
          <g className={baseClass}>
            {/* Side view - nose down */}
            <rect x="70" y="50" width="60" height="80" rx="4" className={fillClass} stroke="currentColor" strokeWidth={strokeWidth} />
            {/* Nose indicator */}
            <polygon points="100,50 80,70 120,70" fill="currentColor" opacity="0.5" />
            {/* Arrow indicating down */}
            <path d="M100 170 L90 155 L95 155 L95 140 L105 140 L105 155 L110 155 Z" fill="currentColor" />
            {/* Surface line */}
            <line x1="30" y1="175" x2="170" y2="175" stroke="currentColor" strokeWidth={1} strokeDasharray="4" />
            <text x="100" y="190" textAnchor="middle" className="text-xs" fill="currentColor">Surface</text>
          </g>
        );

      case 5: // Nose Up
        return (
          <g className={baseClass}>
            {/* Side view - nose up */}
            <rect x="70" y="70" width="60" height="80" rx="4" className={fillClass} stroke="currentColor" strokeWidth={strokeWidth} />
            {/* Nose indicator */}
            <polygon points="100,70 80,90 120,90" fill="currentColor" opacity="0.5" />
            {/* Arrow indicating up */}
            <path d="M100 30 L90 45 L95 45 L95 60 L105 60 L105 45 L110 45 Z" fill="currentColor" />
            {/* Surface line */}
            <line x1="30" y1="175" x2="170" y2="175" stroke="currentColor" strokeWidth={1} strokeDasharray="4" />
            <text x="100" y="190" textAnchor="middle" className="text-xs" fill="currentColor">Surface</text>
          </g>
        );

      default:
        return null;
    }
  };

  return (
    <div className={`rounded-xl p-4 ${isActive ? 'bg-cyan-500/10 border border-cyan-500/30' : 'bg-gray-800/50 border border-gray-700/50'}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 200 200"
        className="mx-auto"
      >
        {renderDiagram()}
      </svg>
      <p className={`text-center text-sm mt-2 font-medium ${isActive ? 'text-cyan-400' : 'text-gray-400'}`}>
        {ACCEL_6POINT_POSITIONS[position]}
      </p>
    </div>
  );
}
