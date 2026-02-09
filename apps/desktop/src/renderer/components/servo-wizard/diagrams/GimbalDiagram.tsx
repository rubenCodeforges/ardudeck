/**
 * GimbalDiagram
 *
 * SVG diagram of a 2-axis camera gimbal (pan/tilt).
 */

import { ControlSurface } from '../presets/servo-presets';

interface Props {
  highlightSurface?: ControlSurface | null;
  onSurfaceClick?: (surface: ControlSurface) => void;
  servoLabels?: Record<ControlSurface, string>;
  surfaceDeflections?: Partial<Record<ControlSurface, number>>;
}

export default function GimbalDiagram({
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
      {/* Mount base */}
      <rect x="120" y="160" width="60" height="15" rx="3" fill="#374151" stroke="#4B5563" strokeWidth="2" />

      {/* Pan servo (base rotation) */}
      <rect
        x="135"
        y="140"
        width="30"
        height="20"
        rx="3"
        style={surfaceStyle('gimbal_pan')}
        onClick={handleClick('gimbal_pan')}
      />
      <text x="100" y="155" textAnchor="end" fill="#9CA3AF" fontSize="10" fontWeight="500">
        Pan Servo
      </text>
      {servoLabels.gimbal_pan && (
        <text x="100" y="167" textAnchor="end" fill="#60A5FA" fontSize="9" fontWeight="bold">
          {servoLabels.gimbal_pan}
        </text>
      )}
      {/* Pan rotation arrow */}
      <path
        d="M110 150 A20 20 0 0 1 110 130"
        fill="none"
        stroke="#9CA3AF"
        strokeWidth="1"
        strokeDasharray="3 2"
      />
      <path d="M108 132 L110 130 L112 132" fill="none" stroke="#9CA3AF" strokeWidth="1" />

      {/* Vertical arm */}
      <rect x="145" y="90" width="10" height="50" fill="#374151" stroke="#4B5563" strokeWidth="2" />

      {/* Tilt servo */}
      <rect
        x="135"
        y="70"
        width="30"
        height="20"
        rx="3"
        style={surfaceStyle('gimbal_tilt')}
        onClick={handleClick('gimbal_tilt')}
      />
      <text x="200" y="85" textAnchor="start" fill="#9CA3AF" fontSize="10" fontWeight="500">
        Tilt Servo
      </text>
      {servoLabels.gimbal_tilt && (
        <text x="200" y="97" textAnchor="start" fill="#60A5FA" fontSize="9" fontWeight="bold">
          {servoLabels.gimbal_tilt}
        </text>
      )}
      {/* Tilt rotation arrow */}
      <path
        d="M185 65 A15 15 0 0 1 185 95"
        fill="none"
        stroke="#9CA3AF"
        strokeWidth="1"
        strokeDasharray="3 2"
      />
      <path d="M183 93 L185 95 L187 93" fill="none" stroke="#9CA3AF" strokeWidth="1" />

      {/* Camera */}
      <rect x="130" y="40" width="40" height="30" rx="5" fill="#4B5563" stroke="#6B7280" strokeWidth="2" />
      {/* Lens */}
      <circle cx="150" cy="55" r="10" fill="#374151" stroke="#6B7280" strokeWidth="2" />
      <circle cx="150" cy="55" r="5" fill="#1F2937" />

      {/* Camera label */}
      <text x="150" y="25" textAnchor="middle" fill="#9CA3AF" fontSize="10">
        Camera
      </text>

      {/* Info text */}
      <text x="150" y="190" textAnchor="middle" fill="#6B7280" fontSize="9">
        Pan = horizontal, Tilt = vertical
      </text>
    </svg>
  );
}
