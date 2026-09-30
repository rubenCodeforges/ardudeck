import { useTranslation } from 'react-i18next';
import { useMissionStore } from '../../stores/mission-store';
import { useSettingsStore } from '../../stores/settings-store';
import { calculateMissionDistance, estimateMissionTime } from '../../../shared/mission-types';
import { formatDistanceFromMeters } from '../../../shared/user-units.js';

export function MissionStatusBar() {
  const { t } = useTranslation('mission');
  const {
    missionItems,
    groups,
    selectedGroupId,
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

  // In a fleet / multi-mission plan, an aggregate "421 waypoints, 10.41 km" is
  // misleading - no single vehicle flies that. Show the per-mission breakdown:
  // the count of missions, and the SELECTED group's own stats (each group is one
  // vehicle's mission). A single mission keeps the classic aggregate readout.
  const multiMission = groups.length > 1;
  const selectedGroup = multiMission ? groups.find((g) => g.id === selectedGroupId) : undefined;
  const groupItems = selectedGroup ? missionItems.filter((it) => it.groupId === selectedGroup.id) : [];
  const groupDistanceMeters = calculateMissionDistance(groupItems);
  const groupTimeMin = Math.ceil(estimateMissionTime(groupDistanceMeters) / 60);

  return (
    <div className="flex items-center justify-between px-4 py-1.5 bg-surface border-t border-subtle text-xs">
      {/* Left side: stats */}
      <div className="flex items-center gap-4 text-content-secondary">
        {multiMission ? (
          <>
            <span>
              <span className="text-content font-medium">{groups.length}</span> missions
            </span>
            <span className="text-content-tertiary">|</span>
            <span>
              <span className="text-content font-medium">{waypointCount}</span> WPs total
            </span>
            <span className="text-content-tertiary">|</span>
            <span>
              <span className="text-content font-medium">{formatDistanceFromMeters(totalDistanceMeters, distanceUnit)}</span> total
            </span>
            {selectedGroup ? (
              <>
                <span className="text-content-tertiary">|</span>
                <span className="truncate max-w-[260px]">
                  <span className="text-content font-medium">{selectedGroup.name}</span>: {groupItems.length} WPs
                  {' · '}{formatDistanceFromMeters(groupDistanceMeters, distanceUnit)}{' · '}~{groupTimeMin} min
                </span>
              </>
            ) : (
              <span className="text-content-tertiary">{t('statusBar.selectMission')}</span>
            )}
          </>
        ) : (
          <>
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
