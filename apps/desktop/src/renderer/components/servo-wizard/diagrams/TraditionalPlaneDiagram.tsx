/**
 * TraditionalPlaneDiagram
 *
 * Top-down SVG diagram of a traditional 4-servo airplane.
 * Clean geometric shapes that actually look like a plane.
 */

import { ControlSurface } from '../presets/servo-presets';

interface Props {
  highlightSurface?: ControlSurface | null;
  onSurfaceClick?: (surface: ControlSurface) => void;
  servoLabels?: Record<ControlSurface, string>;
  surfaceDeflections?: Partial<Record<ControlSurface, number>>;
}

export default function TraditionalPlaneDiagram({
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
    return {
      fill: isHighlighted ? '#3B82F6' : '#4B5563',
      stroke: isHighlighted ? '#60A5FA' : '#6B7280',
      strokeWidth: 1.5,
      cursor: onSurfaceClick ? 'pointer' : 'default',
      filter: isHighlighted ? 'drop-shadow(0 0 6px #3B82F6)' : 'none',
    };
  };

  const handleClick = (surface: ControlSurface) => () => {
    if (onSurfaceClick) onSurfaceClick(surface);
  };

  const leftAileronD = getDeflection('aileron_left');
  const rightAileronD = getDeflection('aileron_right');
  const elevatorD = getDeflection('elevator');
  const rudderD = getDeflection('rudder');

  return (
    <svg viewBox="0 0 300 220" className="w-full h-auto max-w-md">
      {/* === FUSELAGE - rounded rectangle body === */}
      <rect
        x="138"
        y="30"
        width="24"
        height="140"
        rx="12"
        ry="12"
        fill="#374151"
        stroke="#4B5563"
        strokeWidth="1.5"
      />
      {/* Nose - semicircle */}
      <ellipse cx="150" cy="30" rx="12" ry="10" fill="#374151" stroke="#4B5563" strokeWidth="1.5" />
      {/* Canopy */}
      <ellipse cx="150" cy="50" rx="6" ry="10" fill="#1F2937" stroke="#4B5563" strokeWidth="1" />

      {/* === LEFT WING - swept back === */}
      <polygon
        points="138,75 138,100 30,95 40,80"
        fill="#374151"
        stroke="#4B5563"
        strokeWidth="1.5"
      />
      {/* Left aileron - on trailing edge */}
      <g transform={`translate(0, ${leftAileronD * 2})`}>
        <polygon
          points="30,90 30,95 75,97 75,92"
          style={surfaceStyle('aileron_left')}
          onClick={handleClick('aileron_left')}
        />
      </g>
      <text x="55" y="75" textAnchor="middle" fill="#9CA3AF" fontSize="10">L Aileron</text>
      {servoLabels.aileron_left && (
        <text x="55" y="110" textAnchor="middle" fill="#60A5FA" fontSize="9" fontWeight="bold">
          {servoLabels.aileron_left}
        </text>
      )}

      {/* === RIGHT WING - swept back === */}
      <polygon
        points="162,75 162,100 270,95 260,80"
        fill="#374151"
        stroke="#4B5563"
        strokeWidth="1.5"
      />
      {/* Right aileron - on trailing edge */}
      <g transform={`translate(0, ${rightAileronD * 2})`}>
        <polygon
          points="270,90 270,95 225,97 225,92"
          style={surfaceStyle('aileron_right')}
          onClick={handleClick('aileron_right')}
        />
      </g>
      <text x="245" y="75" textAnchor="middle" fill="#9CA3AF" fontSize="10">R Aileron</text>
      {servoLabels.aileron_right && (
        <text x="245" y="110" textAnchor="middle" fill="#60A5FA" fontSize="9" fontWeight="bold">
          {servoLabels.aileron_right}
        </text>
      )}

      {/* === HORIZONTAL STABILIZER === */}
      {/* Left stabilizer */}
      <polygon
        points="138,160 138,172 80,170 85,162"
        fill="#374151"
        stroke="#4B5563"
        strokeWidth="1.5"
      />
      {/* Right stabilizer */}
      <polygon
        points="162,160 162,172 220,170 215,162"
        fill="#374151"
        stroke="#4B5563"
        strokeWidth="1.5"
      />

      {/* Elevator surfaces */}
      <g transform={`translate(0, ${elevatorD * 2})`}>
        <polygon
          points="80,167 80,170 115,171 115,168"
          style={surfaceStyle('elevator')}
          onClick={handleClick('elevator')}
        />
        <polygon
          points="220,167 220,170 185,171 185,168"
          style={surfaceStyle('elevator')}
          onClick={handleClick('elevator')}
        />
      </g>
      <text x="150" y="155" textAnchor="middle" fill="#9CA3AF" fontSize="10">Elevator</text>
      {servoLabels.elevator && (
        <text x="150" y="185" textAnchor="middle" fill="#60A5FA" fontSize="9" fontWeight="bold">
          {servoLabels.elevator}
        </text>
      )}

      {/* === VERTICAL STABILIZER === */}
      <rect x="146" y="155" width="8" height="25" fill="#374151" stroke="#4B5563" strokeWidth="1.5" />

      {/* Rudder */}
      <g transform={`rotate(${rudderD * 12}, 150, 170)`}>
        <rect
          x="146"
          y="170"
          width="8"
          height="14"
          style={surfaceStyle('rudder')}
          onClick={handleClick('rudder')}
        />
      </g>
      <text x="168" y="190" textAnchor="start" fill="#9CA3AF" fontSize="10">Rudder</text>
      {servoLabels.rudder && (
        <text x="168" y="200" textAnchor="start" fill="#60A5FA" fontSize="9" fontWeight="bold">
          {servoLabels.rudder}
        </text>
      )}

      {/* Direction indicator */}
      <polygon points="150,8 146,16 154,16" fill="#6B7280" />
      <text x="162" y="14" fill="#6B7280" fontSize="8">FRONT</text>
    </svg>
  );
}
