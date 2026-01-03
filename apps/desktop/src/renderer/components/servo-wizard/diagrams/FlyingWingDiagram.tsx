/**
 * FlyingWingDiagram
 *
 * Top-down SVG diagram of a flying wing with 2 elevons.
 */

import { ControlSurface } from '../presets/servo-presets';

interface Props {
  highlightSurface?: ControlSurface | null;
  onSurfaceClick?: (surface: ControlSurface) => void;
  servoLabels?: Record<ControlSurface, string>;
  surfaceDeflections?: Partial<Record<ControlSurface, number>>;
}

export default function FlyingWingDiagram({
  highlightSurface,
  onSurfaceClick,
  servoLabels = {},
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
      transition: 'fill 0.15s, stroke 0.15s, transform 0.1s',
      filter: isHighlighted ? 'drop-shadow(0 0 4px #3B82F6)' : 'none',
    };
  };

  // Elevon transforms (shift to simulate deflection in top view)
  const leftElevonDeflection = getDeflection('elevon_left');
  const rightElevonDeflection = getDeflection('elevon_right');
  const elevonTransform = (deflection: number) => `translate(0, ${deflection * 4})`;

  const handleClick = (surface: ControlSurface) => () => {
    if (onSurfaceClick) onSurfaceClick(surface);
  };

  return (
    <svg viewBox="0 0 300 180" className="w-full h-auto max-w-md">
      {/* Main wing body - curved bat-wing shape (true flying wing) */}
      <path
        d="M150 40
           Q 120 50, 40 100
           Q 30 115, 50 130
           Q 100 140, 150 110
           Q 200 140, 250 130
           Q 270 115, 260 100
           Q 180 50, 150 40 Z"
        fill="#374151"
        stroke="#4B5563"
        strokeWidth="2"
      />

      {/* Center body bulge */}
      <ellipse cx="150" cy="70" rx="20" ry="15" fill="#4B5563" stroke="#6B7280" strokeWidth="1" />

      {/* Left elevon - along curved trailing edge */}
      <g transform={elevonTransform(leftElevonDeflection)}>
        <path
          d="M50 130 Q 80 138, 120 125 L 100 115 Q 70 122, 50 118 Z"
          style={surfaceStyle('elevon_left')}
          onClick={handleClick('elevon_left')}
        />
      </g>
      {/* Left elevon label */}
      <text x="70" y="108" textAnchor="middle" fill="#9CA3AF" fontSize="10" fontWeight="500">
        L Elevon
      </text>
      {servoLabels.elevon_left && (
        <text x="85" y="150" textAnchor="middle" fill="#60A5FA" fontSize="9" fontWeight="bold">
          {servoLabels.elevon_left}
        </text>
      )}

      {/* Right elevon - along curved trailing edge */}
      <g transform={elevonTransform(rightElevonDeflection)}>
        <path
          d="M250 130 Q 220 138, 180 125 L 200 115 Q 230 122, 250 118 Z"
          style={surfaceStyle('elevon_right')}
          onClick={handleClick('elevon_right')}
        />
      </g>
      {/* Right elevon label */}
      <text x="230" y="108" textAnchor="middle" fill="#9CA3AF" fontSize="10" fontWeight="500">
        R Elevon
      </text>
      {servoLabels.elevon_right && (
        <text x="215" y="150" textAnchor="middle" fill="#60A5FA" fontSize="9" fontWeight="bold">
          {servoLabels.elevon_right}
        </text>
      )}

      {/* Direction arrow */}
      <path d="M150 25 L145 35 L155 35 Z" fill="#6B7280" />
      <text x="165" y="33" fill="#6B7280" fontSize="8">
        FRONT
      </text>

      {/* Info text */}
      <text x="150" y="170" textAnchor="middle" fill="#6B7280" fontSize="9">
        Elevons = Aileron + Elevator combined
      </text>
    </svg>
  );
}
