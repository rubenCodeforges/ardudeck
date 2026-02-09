/**
 * VTailDiagram
 *
 * Top-down SVG diagram of a V-tail airplane.
 * Standard ailerons with V-tail ruddervators.
 */

import { ControlSurface } from '../presets/servo-presets';

interface Props {
  highlightSurface?: ControlSurface | null;
  onSurfaceClick?: (surface: ControlSurface) => void;
  servoLabels?: Record<ControlSurface, string>;
  surfaceDeflections?: Partial<Record<ControlSurface, number>>;
}

export default function VTailDiagram({
  highlightSurface,
  onSurfaceClick,
  servoLabels = {} as Record<ControlSurface, string>,
  surfaceDeflections = {},
}: Props) {
  const getDeflection = (surface: ControlSurface): number => {
    const d = surfaceDeflections[surface] ?? 0;
    return Math.max(-1, Math.min(1, d));
  };

  const surfaceStyle = (surface: ControlSurface) => {
    const isHighlighted = highlightSurface === surface;
    const deflection = getDeflection(surface);
    const hasMovement = Math.abs(deflection) > 0.05;

    return {
      fill: isHighlighted ? '#3B82F6' : '#4B5563',
      stroke: isHighlighted ? '#60A5FA' : hasMovement ? '#60A5FA' : '#6B7280',
      strokeWidth: 2,
      cursor: onSurfaceClick ? 'pointer' : 'default',
      transition: 'fill 0.15s, stroke 0.15s',
      filter: isHighlighted ? 'drop-shadow(0 0 4px #3B82F6)' : 'none',
    };
  };

  const handleClick = (surface: ControlSurface) => () => {
    if (onSurfaceClick) onSurfaceClick(surface);
  };

  return (
    <svg viewBox="0 0 300 200" className="w-full h-auto max-w-md">
      {/* Fuselage */}
      <ellipse cx="150" cy="100" rx="18" ry="65" fill="#374151" stroke="#4B5563" strokeWidth="2" />

      {/* Nose */}
      <ellipse cx="150" cy="30" rx="10" ry="12" fill="#374151" stroke="#4B5563" strokeWidth="2" />

      {/* Main wings */}
      <path
        d="M132 85 L25 75 L25 85 L132 100 Z"
        fill="#374151"
        stroke="#4B5563"
        strokeWidth="2"
      />
      <path
        d="M168 85 L275 75 L275 85 L168 100 Z"
        fill="#374151"
        stroke="#4B5563"
        strokeWidth="2"
      />

      {/* Left aileron */}
      <path
        d="M25 75 L25 85 L75 87 L75 77 Z"
        style={surfaceStyle('aileron_left')}
        onClick={handleClick('aileron_left')}
      />
      <text x="50" y="68" textAnchor="middle" fill="#9CA3AF" fontSize="9" fontWeight="500">
        L Aileron
      </text>
      {servoLabels.aileron_left && (
        <text x="50" y="96" textAnchor="middle" fill="#60A5FA" fontSize="9" fontWeight="bold">
          {servoLabels.aileron_left}
        </text>
      )}

      {/* Right aileron */}
      <path
        d="M275 75 L275 85 L225 87 L225 77 Z"
        style={surfaceStyle('aileron_right')}
        onClick={handleClick('aileron_right')}
      />
      <text x="250" y="68" textAnchor="middle" fill="#9CA3AF" fontSize="9" fontWeight="500">
        R Aileron
      </text>
      {servoLabels.aileron_right && (
        <text x="250" y="96" textAnchor="middle" fill="#60A5FA" fontSize="9" fontWeight="bold">
          {servoLabels.aileron_right}
        </text>
      )}

      {/* V-tail left */}
      <path
        d="M135 155 L90 180 L95 185 L140 162 Z"
        fill="#374151"
        stroke="#4B5563"
        strokeWidth="2"
      />
      <path
        d="M90 180 L95 185 L105 183 L100 178 Z"
        style={surfaceStyle('vtail_left')}
        onClick={handleClick('vtail_left')}
      />
      <text x="80" y="175" textAnchor="middle" fill="#9CA3AF" fontSize="9" fontWeight="500">
        L V-Tail
      </text>
      {servoLabels.vtail_left && (
        <text x="97" y="195" textAnchor="middle" fill="#60A5FA" fontSize="9" fontWeight="bold">
          {servoLabels.vtail_left}
        </text>
      )}

      {/* V-tail right */}
      <path
        d="M165 155 L210 180 L205 185 L160 162 Z"
        fill="#374151"
        stroke="#4B5563"
        strokeWidth="2"
      />
      <path
        d="M210 180 L205 185 L195 183 L200 178 Z"
        style={surfaceStyle('vtail_right')}
        onClick={handleClick('vtail_right')}
      />
      <text x="220" y="175" textAnchor="middle" fill="#9CA3AF" fontSize="9" fontWeight="500">
        R V-Tail
      </text>
      {servoLabels.vtail_right && (
        <text x="203" y="195" textAnchor="middle" fill="#60A5FA" fontSize="9" fontWeight="bold">
          {servoLabels.vtail_right}
        </text>
      )}

      {/* Direction arrow */}
      <path d="M150 15 L145 25 L155 25 Z" fill="#6B7280" />
      <text x="165" y="23" fill="#6B7280" fontSize="8">
        FRONT
      </text>
    </svg>
  );
}
