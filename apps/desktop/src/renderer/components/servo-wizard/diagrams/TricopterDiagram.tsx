/**
 * TricopterDiagram
 *
 * Top-down SVG diagram of a tricopter with yaw servo.
 */

import { ControlSurface } from '../presets/servo-presets';

interface Props {
  highlightSurface?: ControlSurface | null;
  onSurfaceClick?: (surface: ControlSurface) => void;
  servoLabels?: Record<ControlSurface, string>;
  surfaceDeflections?: Partial<Record<ControlSurface, number>>;
}

export default function TricopterDiagram({
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
      {/* Center body */}
      <circle cx="150" cy="100" r="25" fill="#374151" stroke="#4B5563" strokeWidth="2" />

      {/* Arms */}
      {/* Front left arm */}
      <line x1="130" y1="85" x2="70" y2="45" stroke="#4B5563" strokeWidth="6" />
      {/* Front right arm */}
      <line x1="170" y1="85" x2="230" y2="45" stroke="#4B5563" strokeWidth="6" />
      {/* Rear arm */}
      <line x1="150" y1="125" x2="150" y2="175" stroke="#4B5563" strokeWidth="6" />

      {/* Front left motor */}
      <circle cx="70" cy="45" r="20" fill="#374151" stroke="#6B7280" strokeWidth="2" />
      <circle cx="70" cy="45" r="8" fill="#6B7280" />
      <text x="70" y="75" textAnchor="middle" fill="#9CA3AF" fontSize="9">
        Motor 1
      </text>

      {/* Front right motor */}
      <circle cx="230" cy="45" r="20" fill="#374151" stroke="#6B7280" strokeWidth="2" />
      <circle cx="230" cy="45" r="8" fill="#6B7280" />
      <text x="230" y="75" textAnchor="middle" fill="#9CA3AF" fontSize="9">
        Motor 2
      </text>

      {/* Rear motor with servo */}
      <circle cx="150" cy="175" r="20" fill="#374151" stroke="#6B7280" strokeWidth="2" />
      <circle cx="150" cy="175" r="8" fill="#6B7280" />

      {/* Yaw servo indicator */}
      <rect
        x="138"
        y="155"
        width="24"
        height="12"
        rx="2"
        style={surfaceStyle('yaw_servo')}
        onClick={handleClick('yaw_servo')}
      />
      <text x="150" y="152" textAnchor="middle" fill="#9CA3AF" fontSize="9" fontWeight="500">
        Yaw Servo
      </text>
      {servoLabels.yaw_servo && (
        <text x="185" y="163" textAnchor="start" fill="#60A5FA" fontSize="9" fontWeight="bold">
          {servoLabels.yaw_servo}
        </text>
      )}

      {/* Rotation arrow on yaw servo */}
      <path
        d="M170 161 C175 156, 175 166, 170 161"
        fill="none"
        stroke="#9CA3AF"
        strokeWidth="1"
      />
      <path d="M172 159 L170 161 L172 163" fill="none" stroke="#9CA3AF" strokeWidth="1" />

      {/* Direction arrow */}
      <path d="M150 25 L145 35 L155 35 Z" fill="#6B7280" />
      <text x="165" y="33" fill="#6B7280" fontSize="8">
        FRONT
      </text>

      {/* Info text */}
      <text x="150" y="195" textAnchor="middle" fill="#6B7280" fontSize="9">
        Only yaw servo needs configuration
      </text>
    </svg>
  );
}
