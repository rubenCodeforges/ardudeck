import { useMissionStore } from '../../stores/mission-store';
import { useSettingsStore } from '../../stores/settings-store';
import { formatDistanceFromMeters } from '../../../shared/user-units.js';

export function MissionStatusBar() {
  const {
    missionItems,
    currentSeq,
    progress,
    error,
    isLoading,
    getWaypointCount,
    getTotalDistance,
    getEstimatedTime,
  } = useMissionStore();

  const waypointCount = getWaypointCount();
  const totalDistanceMeters = getTotalDistance();
  const estimatedTimeSeconds = getEstimatedTime();
  const distanceUnit = useSettingsStore((s) => s.unitPreferences.distance);

  return (
    <div className="flex items-center justify-between px-4 py-1.5 bg-surface border-t border-subtle text-xs">
      {/* Left side: stats */}
      <div className="flex items-center gap-4 text-content-secondary">
        <span>
          <span className="text-content font-medium">{waypointCount}</span> waypoints
        </span>
        {waypointCount > 0 && (
          <>
            <span className="text-content-tertiary">|</span>
            <span>
              <span className="text-content font-medium">{formatDistanceFromMeters(totalDistanceMeters, distanceUnit)}</span>
            </span>
            <span className="text-content-tertiary">|</span>
            <span>
              Est. <span className="text-content font-medium">~{Math.ceil(estimatedTimeSeconds / 60)}</span> min
            </span>
          </>
        )}
      </div>

      {/* Right side: status */}
      <div className="flex items-center gap-2">
        {/* Error message */}
        {error && (
          <span className="text-red-400 mr-2">
            {error}
          </span>
        )}

        {/* Loading/progress indicator */}
        {isLoading && progress && (
          <span className="text-blue-400">
            {progress.operation === 'download' ? 'Downloading' : 'Uploading'}: {progress.transferred}/{progress.total}
          </span>
        )}

        {/* Current waypoint during flight */}
        {!isLoading && currentSeq !== null ? (
          <span className="text-emerald-400">
            Current: WP {currentSeq + 1} of {waypointCount}
          </span>
        ) : !isLoading && (
          <span className="text-content-secondary">
            {waypointCount > 0 ? 'Ready to upload' : 'No active mission'}
          </span>
        )}
      </div>
    </div>
  );
}
