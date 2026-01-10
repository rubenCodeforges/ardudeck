/**
 * AircraftDiagram
 *
 * Dynamic component that renders the correct aircraft diagram
 * based on the selected preset ID.
 * Supports live animation via surfaceDeflections prop.
 */

import { ControlSurface } from '../presets/servo-presets';
import TraditionalPlaneDiagram from './TraditionalPlaneDiagram';
import FlyingWingDiagram from './FlyingWingDiagram';
import VTailDiagram from './VTailDiagram';
import DeltaDiagram from './DeltaDiagram';
import TricopterDiagram from './TricopterDiagram';
import GimbalDiagram from './GimbalDiagram';

interface Props {
  presetId: string;
  highlightSurface?: ControlSurface | null;
  onSurfaceClick?: (surface: ControlSurface) => void;
  servoLabels?: Record<ControlSurface, string>;
  // Deflection values for animation: -1 (full down/left) to +1 (full up/right), 0 = center
  surfaceDeflections?: Partial<Record<ControlSurface, number>>;
}

export default function AircraftDiagram({
  presetId,
  highlightSurface,
  onSurfaceClick,
  servoLabels = {},
  surfaceDeflections = {},
}: Props) {
  const commonProps = {
    highlightSurface,
    onSurfaceClick,
    servoLabels,
    surfaceDeflections,
  };

  switch (presetId) {
    case 'traditional':
      return <TraditionalPlaneDiagram {...commonProps} />;

    case 'flying_wing':
      return <FlyingWingDiagram {...commonProps} />;

    case 'vtail':
      return <VTailDiagram {...commonProps} />;

    case 'delta':
      return <DeltaDiagram {...commonProps} />;

    case 'tricopter':
      return <TricopterDiagram {...commonProps} />;

    case 'gimbal':
      return <GimbalDiagram {...commonProps} />;

    default:
      // Fallback to traditional if unknown
      return <TraditionalPlaneDiagram {...commonProps} />;
  }
}

// Export individual diagrams for direct use
export {
  TraditionalPlaneDiagram,
  FlyingWingDiagram,
  VTailDiagram,
  DeltaDiagram,
  TricopterDiagram,
  GimbalDiagram,
};
