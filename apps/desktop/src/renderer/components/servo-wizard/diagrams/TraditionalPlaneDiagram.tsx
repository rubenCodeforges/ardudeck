/**
 * TraditionalPlaneDiagram
 *
 * Top-down SVG diagram of a traditional 4-servo airplane.
 * Shows aileron, elevator, and rudder positions with labels.
 * Supports live animation of control surfaces based on servo values.
 */

import { ControlSurface } from '../presets/servo-presets';

interface Props {
  highlightSurface?: ControlSurface | null;
  onSurfaceClick?: (surface: ControlSurface) => void;
  servoLabels?: Record<ControlSurface, string>; // e.g., { aileron_left: 'S0' }
  // Deflection values: -1 (full down/left) to +1 (full up/right), 0 = center
  surfaceDeflections?: Partial<Record<ControlSurface, number>>;
}

export default function TraditionalPlaneDiagram({
  highlightSurface,
  onSurfaceClick,
  servoLabels = {},
  surfaceDeflections = {},
}: Props) {
  // Get deflection for a surface (clamped to -1 to 1)
  const getDeflection = (surface: ControlSurface): number => {
    const d = surfaceDeflections[surface] ?? 0;
    return Math.max(-1, Math.min(1, d));
  };

  // Surface style with optional glow for highlighted surfaces
  const surfaceStyle = (surface: ControlSurface) => {
    const isHighlighted = highlightSurface === surface;
    const deflection = getDeflection(surface);
    const hasMovement = Math.abs(deflection) > 0.05;

    return {
      fill: isHighlighted ? '#3B82F6' : hasMovement ? '#4B5563' : '#4B5563',
      stroke: isHighlighted ? '#60A5FA' : hasMovement ? '#60A5FA' : '#6B7280',
      strokeWidth: 2,
      cursor: onSurfaceClick ? 'pointer' : 'default',
      transition: 'fill 0.15s, stroke 0.15s, transform 0.1s',
      filter: isHighlighted ? 'drop-shadow(0 0 4px #3B82F6)' : 'none',
    };
  };

  const handleClick = (surface: ControlSurface) => () => {
    if (onSurfaceClick) onSurfaceClick(surface);
  };

  // Calculate transforms for animated surfaces
  // Ailerons deflect by rotating around their hinge (translate to simulate depth change in top view)
  const leftAileronDeflection = getDeflection('aileron_left');
  const rightAileronDeflection = getDeflection('aileron_right');
  const elevatorDeflection = getDeflection('elevator');
  const rudderDeflection = getDeflection('rudder');

  // In top-down view, aileron deflection appears as a slight vertical shift
  // and a change in the visual width/shape of the control surface
  const aileronTransform = (deflection: number, cx: number) => {
    // Shift up/down to simulate deflection (up to 3px)
    const ty = deflection * 3;
    return `translate(0, ${ty})`;
  };

  // Elevator also appears as vertical shift in top view
  const elevatorTransform = (deflection: number) => {
    const ty = deflection * 3;
    return `translate(0, ${ty})`;
  };

  // Rudder rotates around its hinge point
  const rudderTransform = (deflection: number) => {
    // Rotate around the hinge point (top of rudder)
    const angle = deflection * 15; // Max 15 degrees rotation
    return `rotate(${angle}, 150, 175)`;
  };

  return (
    <svg viewBox="0 0 300 200" className="w-full h-auto max-w-md">
      {/* Fuselage */}
      <ellipse cx="150" cy="100" rx="20" ry="70" fill="#374151" stroke="#4B5563" strokeWidth="2" />

      {/* Nose */}
      <ellipse cx="150" cy="25" rx="12" ry="15" fill="#374151" stroke="#4B5563" strokeWidth="2" />

      {/* Main wings */}
      <path
        d="M130 85 L20 75 L20 85 L130 100 Z"
        fill="#374151"
        stroke="#4B5563"
        strokeWidth="2"
      />
      <path
        d="M170 85 L280 75 L280 85 L170 100 Z"
        fill="#374151"
        stroke="#4B5563"
        strokeWidth="2"
      />

      {/* Left aileron - animated */}
      <g transform={aileronTransform(leftAileronDeflection, 45)}>
        <path
          d="M20 75 L20 85 L70 87 L70 77 Z"
          style={surfaceStyle('aileron_left')}
          onClick={handleClick('aileron_left')}
        />
      </g>
      {/* Left aileron label */}
      <text x="45" y="68" textAnchor="middle" fill="#9CA3AF" fontSize="10" fontWeight="500">
        L Aileron
      </text>
      {servoLabels.aileron_left && (
        <text x="45" y="96" textAnchor="middle" fill="#60A5FA" fontSize="9" fontWeight="bold">
          {servoLabels.aileron_left}
        </text>
      )}

      {/* Right aileron - animated */}
      <g transform={aileronTransform(rightAileronDeflection, 255)}>
        <path
          d="M280 75 L280 85 L230 87 L230 77 Z"
          style={surfaceStyle('aileron_right')}
          onClick={handleClick('aileron_right')}
        />
      </g>
      {/* Right aileron label */}
      <text x="255" y="68" textAnchor="middle" fill="#9CA3AF" fontSize="10" fontWeight="500">
        R Aileron
      </text>
      {servoLabels.aileron_right && (
        <text x="255" y="96" textAnchor="middle" fill="#60A5FA" fontSize="9" fontWeight="bold">
          {servoLabels.aileron_right}
        </text>
      )}

      {/* Horizontal stabilizer */}
      <path
        d="M130 160 L90 155 L90 165 L130 168 Z"
        fill="#374151"
        stroke="#4B5563"
        strokeWidth="2"
      />
      <path
        d="M170 160 L210 155 L210 165 L170 168 Z"
        fill="#374151"
        stroke="#4B5563"
        strokeWidth="2"
      />

      {/* Elevator - animated */}
      <g transform={elevatorTransform(elevatorDeflection)}>
        <path
          d="M90 155 L90 165 L110 166 L110 157 Z"
          style={surfaceStyle('elevator')}
          onClick={handleClick('elevator')}
        />
        <path
          d="M210 155 L210 165 L190 166 L190 157 Z"
          style={surfaceStyle('elevator')}
          onClick={handleClick('elevator')}
        />
      </g>
      {/* Elevator label */}
      <text x="150" y="150" textAnchor="middle" fill="#9CA3AF" fontSize="10" fontWeight="500">
        Elevator
      </text>
      {servoLabels.elevator && (
        <text x="150" y="182" textAnchor="middle" fill="#60A5FA" fontSize="9" fontWeight="bold">
          {servoLabels.elevator}
        </text>
      )}

      {/* Vertical stabilizer (top view - thin line) */}
      <rect x="147" y="160" width="6" height="25" fill="#374151" stroke="#4B5563" strokeWidth="1" />

      {/* Rudder - animated with rotation */}
      <g transform={rudderTransform(rudderDeflection)}>
        <rect
          x="147"
          y="175"
          width="6"
          height="15"
          style={surfaceStyle('rudder')}
          onClick={handleClick('rudder')}
        />
      </g>
      {/* Rudder label */}
      <text x="175" y="185" textAnchor="start" fill="#9CA3AF" fontSize="10" fontWeight="500">
        Rudder
      </text>
      {servoLabels.rudder && (
        <text x="175" y="195" textAnchor="start" fill="#60A5FA" fontSize="9" fontWeight="bold">
          {servoLabels.rudder}
        </text>
      )}

      {/* Direction arrow */}
      <path d="M150 10 L145 20 L155 20 Z" fill="#6B7280" />
      <text x="165" y="18" fill="#6B7280" fontSize="8">
        FRONT
      </text>
    </svg>
  );
}
