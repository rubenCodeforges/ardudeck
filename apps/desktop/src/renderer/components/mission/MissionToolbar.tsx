import { useState } from 'react';
import { useConnectionStore } from '../../stores/connection-store';
import { useMissionStore } from '../../stores/mission-store';

type ToastType = 'success' | 'error' | 'info';

interface MissionToolbarProps {
  onResetLayout: () => void;
  showToast?: (message: string, type: ToastType) => void;
}

export function MissionToolbar({ onResetLayout, showToast }: MissionToolbarProps) {
  const { connectionState } = useConnectionStore();
  const { missionItems, isLoading, progress, hasTerrainCollisions, fetchMission, uploadMission, clearMissionFromFC, clearMission, setMissionItemsFromFile } = useMissionStore();
  const isConnected = connectionState.isConnected;
  const hasItems = missionItems.length > 0;
  const isDownloading = isLoading && progress?.operation === 'download';
  const isUploading = isLoading && progress?.operation === 'upload';

  // Collision warning dialog state
  const [showCollisionWarning, setShowCollisionWarning] = useState(false);

  const handleDownload = async () => {
    await fetchMission();
  };

  const handleUpload = async () => {
    // Check for terrain collisions before upload
    if (hasTerrainCollisions) {
      setShowCollisionWarning(true);
      return;
    }
    await uploadMission();
  };

  const handleConfirmUpload = async () => {
    setShowCollisionWarning(false);
    await uploadMission();
  };

  const handleClear = async () => {
    if (isConnected) {
      await clearMissionFromFC();
    }
    clearMission();
  };

  const handleSaveFile = async () => {
    if (missionItems.length === 0) return;
    const result = await window.electronAPI?.saveMissionToFile(missionItems);
    if (result?.success) {
      showToast?.(`Saved ${missionItems.length} waypoints to file`, 'success');
    } else if (result?.error && result.error !== 'Cancelled') {
      showToast?.(result.error, 'error');
    }
  };

  const handleLoadFile = async () => {
    const result = await window.electronAPI?.loadMissionFromFile();
    if (result?.success && result.items) {
      setMissionItemsFromFile(result.items);
      showToast?.(`Loaded ${result.items.length} waypoints from file`, 'success');
    } else if (result?.error && result.error !== 'Cancelled') {
      showToast?.(result.error, 'error');
    }
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-gray-800/60 border-b border-gray-700/50">
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
          title={isConnected ? 'Download mission from flight controller' : 'Connect to download mission'}
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
          title={!isConnected ? 'Connect to upload mission' : !hasItems ? 'Add waypoints first' : 'Upload mission to flight controller'}
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
          onClick={handleClear}
          disabled={isLoading}
          className={`px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1.5 ${
            !isLoading
              ? 'bg-red-600/80 hover:bg-red-500/80 text-white'
              : 'bg-gray-700/50 text-gray-500 cursor-not-allowed'
          }`}
          title="Clear mission"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          Clear
        </button>
      </div>

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
          title={hasItems ? 'Save mission to file' : 'No waypoints to save'}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
          </svg>
          Save
        </button>

        <button
          onClick={handleLoadFile}
          className="px-3 py-1.5 rounded text-xs font-medium bg-gray-700/50 hover:bg-gray-600/50 text-gray-300 transition-colors flex items-center gap-1.5"
          title="Load mission from file (.waypoints, .plan)"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          Load
        </button>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Collision warning indicator */}
      {hasTerrainCollisions && (
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
