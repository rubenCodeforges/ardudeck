import { useState } from 'react';
import { useConnectionStore } from '../../stores/connection-store';
import { useMissionStore } from '../../stores/mission-store';
import { useFenceStore } from '../../stores/fence-store';
import { useRallyStore } from '../../stores/rally-store';
import { useEditModeStore, type EditMode } from '../../stores/edit-mode-store';

type ToastType = 'success' | 'error' | 'info';

interface MissionToolbarProps {
  onResetLayout: () => void;
  showToast?: (message: string, type: ToastType) => void;
}

// Segmented control button component
function ModeButton({
  mode,
  label,
  activeMode,
  onClick,
  color,
  hasModified,
}: {
  mode: EditMode;
  label: string;
  activeMode: EditMode;
  onClick: () => void;
  color: 'blue' | 'green' | 'orange';
  hasModified?: boolean;
}) {
  const isActive = activeMode === mode;
  const colorClasses = {
    blue: isActive ? 'bg-blue-600 text-white' : 'text-blue-400 hover:bg-blue-600/20',
    green: isActive ? 'bg-green-600 text-white' : 'text-green-400 hover:bg-green-600/20',
    orange: isActive ? 'bg-orange-600 text-white' : 'text-orange-400 hover:bg-orange-600/20',
  };

  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-medium transition-colors relative ${colorClasses[color]}`}
    >
      {label}
      {hasModified && (
        <span className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${
          color === 'blue' ? 'bg-blue-400' : color === 'green' ? 'bg-green-400' : 'bg-orange-400'
        }`} />
      )}
    </button>
  );
}

export function MissionToolbar({ onResetLayout, showToast }: MissionToolbarProps) {
  const { connectionState } = useConnectionStore();
  const isConnected = connectionState.isConnected;

  // Edit mode state
  const { activeMode, setActiveMode } = useEditModeStore();

  // Mission store
  const missionStore = useMissionStore();
  const missionHasItems = missionStore.missionItems.length > 0;
  const missionIsLoading = missionStore.isLoading;
  const missionIsDirty = missionStore.isDirty;
  const missionIsDownloading = missionIsLoading && missionStore.progress?.operation === 'download';
  const missionIsUploading = missionIsLoading && missionStore.progress?.operation === 'upload';

  // Fence store
  const fenceStore = useFenceStore();
  const fenceHasItems = fenceStore.polygons.length > 0 || fenceStore.circles.length > 0;
  const fenceIsLoading = fenceStore.isLoading;
  const fenceIsDirty = fenceStore.isDirty;
  const fenceIsDownloading = fenceIsLoading && fenceStore.progress?.operation === 'download';
  const fenceIsUploading = fenceIsLoading && fenceStore.progress?.operation === 'upload';

  // Rally store
  const rallyStore = useRallyStore();
  const rallyHasItems = rallyStore.rallyPoints.length > 0;
  const rallyIsLoading = rallyStore.isLoading;
  const rallyIsDirty = rallyStore.isDirty;
  const rallyIsDownloading = rallyIsLoading && rallyStore.progress?.operation === 'download';
  const rallyIsUploading = rallyIsLoading && rallyStore.progress?.operation === 'upload';

  // Computed state based on active mode
  const isLoading = activeMode === 'mission' ? missionIsLoading :
                    activeMode === 'geofence' ? fenceIsLoading :
                    rallyIsLoading;

  const isDownloading = activeMode === 'mission' ? missionIsDownloading :
                        activeMode === 'geofence' ? fenceIsDownloading :
                        rallyIsDownloading;

  const isUploading = activeMode === 'mission' ? missionIsUploading :
                      activeMode === 'geofence' ? fenceIsUploading :
                      rallyIsUploading;

  const hasItems = activeMode === 'mission' ? missionHasItems :
                   activeMode === 'geofence' ? fenceHasItems :
                   rallyHasItems;

  // Collision warning dialog state (mission only)
  const [showCollisionWarning, setShowCollisionWarning] = useState(false);

  // Mode-aware handlers
  const handleDownload = async () => {
    if (activeMode === 'mission') {
      await missionStore.fetchMission();
    } else if (activeMode === 'geofence') {
      await fenceStore.fetchFence();
    } else {
      await rallyStore.fetchRally();
    }
  };

  const handleUpload = async () => {
    if (activeMode === 'mission') {
      // Check for terrain collisions before upload
      if (missionStore.hasTerrainCollisions) {
        setShowCollisionWarning(true);
        return;
      }
      await missionStore.uploadMission();
    } else if (activeMode === 'geofence') {
      await fenceStore.uploadFence();
    } else {
      await rallyStore.uploadRally();
    }
  };

  const handleConfirmUpload = async () => {
    setShowCollisionWarning(false);
    await missionStore.uploadMission();
  };

  const handleClearFC = async () => {
    if (!isConnected) return;

    if (activeMode === 'mission') {
      await missionStore.clearMissionFromFC();
      missionStore.clearMission();
    } else if (activeMode === 'geofence') {
      await fenceStore.clearFenceFromFC();
    } else {
      await rallyStore.clearRallyFromFC();
    }
  };

  const handleNew = () => {
    if (activeMode === 'mission') {
      missionStore.clearMission();
    } else if (activeMode === 'geofence') {
      fenceStore.clearFence();
    } else {
      rallyStore.clearRally();
    }
  };

  const handleSaveFile = async () => {
    if (!hasItems) return;

    if (activeMode === 'mission') {
      const result = await window.electronAPI?.saveMissionToFile(missionStore.missionItems);
      if (result?.success) {
        showToast?.(`Saved ${missionStore.missionItems.length} waypoints to file`, 'success');
      } else if (result?.error && result.error !== 'Cancelled') {
        showToast?.(result.error, 'error');
      }
    } else if (activeMode === 'geofence') {
      // TODO: Implement fence file save
      showToast?.('Fence file save not implemented yet', 'info');
    } else {
      // TODO: Implement rally file save
      showToast?.('Rally file save not implemented yet', 'info');
    }
  };

  const handleLoadFile = async () => {
    if (activeMode === 'mission') {
      const result = await window.electronAPI?.loadMissionFromFile();
      if (result?.success && result.items) {
        missionStore.setMissionItemsFromFile(result.items);
        showToast?.(`Loaded ${result.items.length} waypoints from file`, 'success');
      } else if (result?.error && result.error !== 'Cancelled') {
        showToast?.(result.error, 'error');
      }
    } else if (activeMode === 'geofence') {
      // TODO: Implement fence file load
      showToast?.('Fence file load not implemented yet', 'info');
    } else {
      // TODO: Implement rally file load
      showToast?.('Rally file load not implemented yet', 'info');
    }
  };

  // Get button label based on mode
  const getModeLabel = () => {
    switch (activeMode) {
      case 'mission': return 'mission';
      case 'geofence': return 'geofence';
      case 'rally': return 'rally points';
    }
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-gray-800/60 border-b border-gray-700/50">
      {/* Mode Selector - Segmented Control */}
      <div className="flex items-center rounded-lg overflow-hidden border border-gray-600/50">
        <ModeButton
          mode="mission"
          label="Mission"
          activeMode={activeMode}
          onClick={() => setActiveMode('mission')}
          color="blue"
          hasModified={missionIsDirty}
        />
        <div className="w-px h-5 bg-gray-600/50" />
        <ModeButton
          mode="geofence"
          label="Geofence"
          activeMode={activeMode}
          onClick={() => setActiveMode('geofence')}
          color="green"
          hasModified={fenceIsDirty}
        />
        <div className="w-px h-5 bg-gray-600/50" />
        <ModeButton
          mode="rally"
          label="Rally"
          activeMode={activeMode}
          onClick={() => setActiveMode('rally')}
          color="orange"
          hasModified={rallyIsDirty}
        />
      </div>

      {/* Separator */}
      <div className="w-px h-6 bg-gray-700/50" />

      {/* FC Operations */}
      <div className="flex items-center gap-1">
        <button
          onClick={handleDownload}
          disabled={!isConnected || isLoading}
          className={`px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1.5 ${
            isConnected && !isLoading
              ? 'bg-blue-600/80 hover:bg-blue-500/80 text-white'
              : 'bg-gray-700/50 text-gray-500 cursor-not-allowed'
          }`}
          title={isConnected ? `Download ${getModeLabel()} from flight controller` : 'Connect to download'}
        >
          {isDownloading ? (
            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          )}
          Download
        </button>

        <button
          onClick={handleUpload}
          disabled={!isConnected || isLoading || !hasItems}
          className={`px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1.5 ${
            isConnected && !isLoading && hasItems
              ? 'bg-emerald-600/80 hover:bg-emerald-500/80 text-white'
              : 'bg-gray-700/50 text-gray-500 cursor-not-allowed'
          }`}
          title={!isConnected ? 'Connect to upload' : !hasItems ? `Add ${getModeLabel()} first` : `Upload ${getModeLabel()} to flight controller`}
        >
          {isUploading ? (
            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
          )}
          Upload
        </button>

        <button
          onClick={handleClearFC}
          disabled={!isConnected || isLoading}
          className={`px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1.5 ${
            isConnected && !isLoading
              ? 'bg-red-600/80 hover:bg-red-500/80 text-white'
              : 'bg-gray-700/50 text-gray-500 cursor-not-allowed'
          }`}
          title={isConnected ? `Clear ${getModeLabel()} from flight controller` : 'Connect to clear from FC'}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          Clear FC
        </button>
      </div>

      {/* Separator */}
      <div className="w-px h-6 bg-gray-700/50" />

      {/* New */}
      <button
        onClick={handleNew}
        disabled={isLoading || !hasItems}
        className={`px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1.5 ${
          !isLoading && hasItems
            ? 'bg-gray-700/50 hover:bg-gray-600/50 text-gray-300'
            : 'bg-gray-700/30 text-gray-500 cursor-not-allowed'
        }`}
        title={`Clear current ${getModeLabel()} locally`}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        New
      </button>

      {/* Separator */}
      <div className="w-px h-6 bg-gray-700/50" />

      {/* File Operations */}
      <div className="flex items-center gap-1">
        <button
          onClick={handleSaveFile}
          disabled={!hasItems}
          className={`px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1.5 ${
            hasItems
              ? 'bg-gray-700/50 hover:bg-gray-600/50 text-gray-300'
              : 'bg-gray-700/30 text-gray-500 cursor-not-allowed'
          }`}
          title={hasItems ? `Save ${getModeLabel()} to file` : 'Nothing to save'}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
          </svg>
          Save
        </button>

        <button
          onClick={handleLoadFile}
          className="px-3 py-1.5 rounded text-xs font-medium bg-gray-700/50 hover:bg-gray-600/50 text-gray-300 transition-colors flex items-center gap-1.5"
          title={`Load ${getModeLabel()} from file`}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          Load
        </button>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Collision warning indicator (mission mode only) */}
      {activeMode === 'mission' && missionStore.hasTerrainCollisions && (
        <div className="px-2 py-1 rounded text-xs bg-red-500/20 border border-red-500/30 text-red-400 flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          Terrain collision
        </div>
      )}

      {/* Layout controls */}
      <button
        onClick={onResetLayout}
        className="px-2 py-1 bg-gray-700/50 hover:bg-gray-600/50 text-gray-400 text-xs rounded transition-colors"
        title="Reset panel layout"
      >
        Reset Layout
      </button>

      {/* Collision warning modal */}
      {showCollisionWarning && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg shadow-xl border border-gray-700 p-6 max-w-md mx-4">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">Terrain Collision Warning</h3>
                <p className="text-gray-400 text-sm mb-4">
                  The flight path goes below the safe altitude (terrain + 30m buffer) at one or more points.
                  This could result in a collision with terrain.
                </p>
                <p className="text-amber-400 text-sm mb-4">
                  Are you sure you want to upload this mission?
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => setShowCollisionWarning(false)}
                className="px-4 py-2 rounded text-sm font-medium bg-gray-700/50 hover:bg-gray-600/50 text-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmUpload}
                className="px-4 py-2 rounded text-sm font-medium bg-red-600/80 hover:bg-red-500/80 text-white transition-colors"
              >
                Upload Anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
