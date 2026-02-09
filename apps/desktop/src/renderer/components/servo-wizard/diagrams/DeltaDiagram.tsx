/**
 * DeltaDiagram
 *
 * Top-down SVG diagram of a delta wing with elevons and rudder.
 */

import { ControlSurface } from '../presets/servo-presets';

interface Props {
  highlightSurface?: ControlSurface | null;
  onSurfaceClick?: (surface: ControlSurface) => void;
  servoLabels?: Record<ControlSurface, string>;
  surfaceDeflections?: Partial<Record<ControlSurface, number>>;
}

export default function DeltaDiagram({
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
      {/* Main delta wing body */}
      <path
        d="M150 25 L35 155 L90 165 L150 130 L210 165 L265 155 Z"
        fill="#374151"
        stroke="#4B5563"
        strokeWidth="2"
      />

      {/* Center body (canopy area) */}
      <ellipse cx="150" cy="75" rx="12" ry="25" fill="#4B5563" stroke="#6B7280" strokeWidth="1" />

      {/* Left elevon */}
      <path
        d="M35 155 L90 165 L105 160 L55 148 Z"
        style={surfaceStyle('elevon_left')}
        onClick={handleClick('elevon_left')}
      />
      <text x="55" y="138" textAnchor="middle" fill="#9CA3AF" fontSize="9" fontWeight="500">
        L Elevon
      </text>
      {servoLabels.elevon_left && (
        <text x="70" y="175" textAnchor="middle" fill="#60A5FA" fontSize="9" fontWeight="bold">
          {servoLabels.elevon_left}
        </text>
      )}

      {/* Right elevon */}
      <path
        d="M265 155 L210 165 L195 160 L245 148 Z"
        style={surfaceStyle('elevon_right')}
        onClick={handleClick('elevon_right')}
      />
      <text x="245" y="138" textAnchor="middle" fill="#9CA3AF" fontSize="9" fontWeight="500">
        R Elevon
      </text>
      {servoLabels.elevon_right && (
        <text x="230" y="175" textAnchor="middle" fill="#60A5FA" fontSize="9" fontWeight="bold">
          {servoLabels.elevon_right}
        </text>
      )}

      {/* Vertical stabilizer */}
      <rect x="147" y="130" width="6" height="35" fill="#374151" stroke="#4B5563" strokeWidth="1" />

      {/* Rudder */}
      <rect
        x="147"
        y="150"
        width="6"
        height="18"
        style={surfaceStyle('rudder')}
        onClick={handleClick('rudder')}
      />
      <text x="175" y="160" textAnchor="start" fill="#9CA3AF" fontSize="9" fontWeight="500">
        Rudder
      </text>
      {servoLabels.rudder && (
        <text x="175" y="172" textAnchor="start" fill="#60A5FA" fontSize="9" fontWeight="bold">
          {servoLabels.rudder}
        </text>
      )}

      {/* Direction arrow */}
      <path d="M150 10 L145 20 L155 20 Z" fill="#6B7280" />
      <text x="165" y="18" fill="#6B7280" fontSize="8">
        FRONT
      </text>

      {/* Info text */}
      <text x="150" y="192" textAnchor="middle" fill="#6B7280" fontSize="9">
        Delta with vertical tail
      </text>
    </svg>
  );
}
