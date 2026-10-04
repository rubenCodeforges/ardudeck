/**
 * How the hardware is mounted and wired: board orientation, the compasses it
 * found, and which socket the GPS is on. Kept apart from the Health page,
 * which is live telemetry and answers a different question.
 */
import { BoardOrientationCard } from './BoardOrientationCard';
import { CompassCard } from './CompassCard';
import { GpsSetupCard } from './GpsSetupCard';
import { ModuleConfigCards } from '../../modules/ModuleConfigCards';

export default function SensorConfigTab(): JSX.Element {
  return (
    <div className="p-6 space-y-4">
      <BoardOrientationCard />
      <CompassCard />
      <GpsSetupCard />
      <ModuleConfigCards slot="gps" />
    </div>
  );
}
