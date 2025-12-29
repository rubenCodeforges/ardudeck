import { useMissionStore } from '../../stores/mission-store';

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
  const totalDistanceKm = totalDistanceMeters / 1000;
  const estimatedTimeSeconds = getEstimatedTime();

  return (
    <div className="flex items-center justify-between px-4 py-1.5 bg-gray-800/60 border-t border-gray-700/50 text-xs">
      {/* Left side: stats */}
      <div className="flex items-center gap-4 text-gray-400">
        <span>
          <span className="text-gray-300 font-medium">{waypointCount}</span> waypoints
        </span>
        {waypointCount > 0 && (
          <>
            <span className="text-gray-600">|</span>
            <span>
              <span className="text-gray-300 font-medium">{totalDistanceKm.toFixed(2)}</span> km
            </span>
            <span className="text-gray-600">|</span>
            <span>
              Est. <span className="text-gray-300 font-medium">~{Math.ceil(estimatedTimeSeconds / 60)}</span> min
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
          <span className="text-gray-500">
            {waypointCount > 0 ? 'Ready to upload' : 'No active mission'}
          </span>
        )}
      </div>
    </div>
  );
}
