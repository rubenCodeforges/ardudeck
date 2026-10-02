import { Trans, useTranslation } from 'react-i18next';
import { useMissionStore } from '../../stores/mission-store';
import { useSettingsStore } from '../../stores/settings-store';
import { calculateMissionDistance, estimateMissionTime } from '../../../shared/mission-types';
import { formatDistanceFromMeters } from '../../../shared/user-units.js';

export function MissionStatusBar() {
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
  const { t } = useTranslation();

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
              <Trans i18nKey="mission:missionStatusBar.missions" values={{ count: groups.length }} components={{ b: <span className="text-content font-medium" /> }} />
            </span>
            <span className="text-content-tertiary">|</span>
            <span>
              <Trans i18nKey="mission:missionStatusBar.wpsTotal" values={{ count: waypointCount }} components={{ b: <span className="text-content font-medium" /> }} />
            </span>
            <span className="text-content-tertiary">|</span>
            <span>
              <Trans i18nKey="mission:missionStatusBar.distTotal" values={{ value: formatDistanceFromMeters(totalDistanceMeters, distanceUnit) }} components={{ b: <span className="text-content font-medium" /> }} />
            </span>
            {selectedGroup ? (
              <>
                <span className="text-content-tertiary">|</span>
                <span className="truncate max-w-[260px]">
                  <Trans
                    i18nKey="mission:missionStatusBar.groupStats"
                    values={{ name: selectedGroup.name, count: groupItems.length, distance: formatDistanceFromMeters(groupDistanceMeters, distanceUnit), minutes: groupTimeMin }}
                    components={{ b: <span className="text-content font-medium" /> }}
                  />
                </span>
              </>
            ) : (
              <span className="text-content-tertiary">{t('mission:missionStatusBar.selectHint')}</span>
            )}
          </>
        ) : (
          <>
            <span>
              <Trans i18nKey="mission:missionStatusBar.waypoints" values={{ count: waypointCount }} components={{ b: <span className="text-content font-medium" /> }} />
            </span>
            {waypointCount > 0 && (
              <>
                <span className="text-content-tertiary">|</span>
                <span>
                  <span className="text-content font-medium">{formatDistanceFromMeters(totalDistanceMeters, distanceUnit)}</span>
                </span>
                <span className="text-content-tertiary">|</span>
                <span>
                  <Trans i18nKey="mission:missionStatusBar.estimate" values={{ minutes: Math.ceil(estimatedTimeSeconds / 60) }} components={{ b: <span className="text-content font-medium" /> }} />
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
            {t(progress.operation === 'download' ? 'mission:missionStatusBar.downloading' : 'mission:missionStatusBar.uploading', { done: progress.transferred, total: progress.total })}
          </span>
        )}

        {/* Current waypoint during flight */}
        {!isLoading && currentSeq !== null ? (
          <span className="text-emerald-400">
            {t('mission:missionStatusBar.current', { n: currentSeq + 1, total: waypointCount })}
          </span>
        ) : !isLoading && (
          <span className="text-content-secondary">
            {waypointCount > 0 ? t('mission:missionStatusBar.readyToUpload') : t('mission:missionStatusBar.noActiveMission')}
          </span>
        )}
      </div>
    </div>
  );
}
