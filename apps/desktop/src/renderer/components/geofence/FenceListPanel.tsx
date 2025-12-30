/**
 * FenceListPanel - List and manage geofence items
 *
 * Sections:
 * - Return Point
 * - Inclusion Zones (polygons and circles)
 * - Exclusion Zones (polygons and circles)
 */

import { useFenceStore } from '../../stores/fence-store';
import { FENCE_BREACH } from '../../../shared/fence-types';

interface FenceListPanelProps {
  readOnly?: boolean;
}

/**
 * FenceListPanel - List view for geofence items
 * Note: Download/Upload/Clear buttons are now in MissionToolbar (mode-aware)
 * Note: Draw tools are now floating buttons on the map (MissionMapPanel)
 */
export function FenceListPanel({ readOnly = false }: FenceListPanelProps) {
  const {
    polygons,
    circles,
    returnPoint,
    fenceStatus,
    selectedFenceId,
    error,
    isDirty,
    setSelectedFenceId,
    removePolygon,
    removeCircle,
    clearReturnPoint,
  } = useFenceStore();

  const inclusionPolygons = polygons.filter((p) => p.type === 'inclusion');
  const exclusionPolygons = polygons.filter((p) => p.type === 'exclusion');
  const inclusionCircles = circles.filter((c) => c.type === 'inclusion');
  const exclusionCircles = circles.filter((c) => c.type === 'exclusion');

  const getBreachStatusText = () => {
    if (!fenceStatus) return null;
    if (fenceStatus.breachStatus === 0) return null;

    const breachTypes: Record<number, string> = {
      [FENCE_BREACH.MINALT]: 'Below minimum altitude',
      [FENCE_BREACH.MAXALT]: 'Above maximum altitude',
      [FENCE_BREACH.BOUNDARY]: 'Outside boundary',
    };

    return breachTypes[fenceStatus.breachType] || 'Fence breached';
  };

  const breachText = getBreachStatusText();

  return (
    <div className="h-full flex flex-col bg-gray-900/50 text-gray-200">
      {/* Header */}
      <div className="p-3 border-b border-gray-700/50">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Geofence</h3>
          {isDirty && (
            <span className="px-2 py-0.5 text-xs bg-amber-500/20 text-amber-400 rounded">Modified</span>
          )}
        </div>
        {breachText && (
          <div className="mt-2 px-2 py-1 bg-red-500/20 border border-red-500/50 rounded text-red-400 text-xs flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{breachText}</span>
          </div>
        )}
      </div>

      {/* Error display */}
      {error && (
        <div className="m-2 p-2 bg-red-500/20 border border-red-500/50 rounded text-red-400 text-xs">
          {error}
        </div>
      )}

      {/* Fence List */}
      <div className="flex-1 overflow-y-auto">
        {/* Return Point */}
        <div className="p-2 border-b border-gray-700/50">
          <div className="text-xs font-medium text-amber-400 mb-1">Return Point</div>
          {returnPoint ? (
            <div
              className="flex items-center justify-between p-2 bg-gray-800/50 rounded cursor-pointer hover:bg-gray-700/50"
              onClick={() => setSelectedFenceId(null)}
            >
              <div className="text-xs">
                <div>{returnPoint.lat.toFixed(6)}, {returnPoint.lon.toFixed(6)}</div>
                <div className="text-gray-400">Alt: {returnPoint.altitude}m</div>
              </div>
              {!readOnly && (
                <button
                  onClick={(e) => { e.stopPropagation(); clearReturnPoint(); }}
                  className="p-1 text-gray-400 hover:text-red-400"
                  title="Remove"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          ) : (
            <div className="text-xs text-gray-500">No return point set</div>
          )}
        </div>

        {/* Inclusion Zones */}
        <div className="p-2 border-b border-gray-700/50">
          <div className="text-xs font-medium text-green-400 mb-1">
            Inclusion Zones ({inclusionPolygons.length + inclusionCircles.length})
          </div>
          {inclusionPolygons.length === 0 && inclusionCircles.length === 0 ? (
            <div className="text-xs text-gray-500">No inclusion zones</div>
          ) : (
            <div className="space-y-1">
              {inclusionPolygons.map((polygon) => (
                <FenceListItem
                  key={polygon.id}
                  id={polygon.id}
                  type="polygon"
                  label={`Polygon (${polygon.vertices.length} pts)`}
                  isSelected={selectedFenceId === polygon.id}
                  color="green"
                  readOnly={readOnly}
                  onSelect={() => setSelectedFenceId(polygon.id)}
                  onRemove={() => removePolygon(polygon.id)}
                />
              ))}
              {inclusionCircles.map((circle) => (
                <FenceListItem
                  key={circle.id}
                  id={circle.id}
                  type="circle"
                  label={`Circle (${Math.round(circle.radius)}m)`}
                  isSelected={selectedFenceId === circle.id}
                  color="green"
                  readOnly={readOnly}
                  onSelect={() => setSelectedFenceId(circle.id)}
                  onRemove={() => removeCircle(circle.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Exclusion Zones */}
        <div className="p-2">
          <div className="text-xs font-medium text-red-400 mb-1">
            Exclusion Zones ({exclusionPolygons.length + exclusionCircles.length})
          </div>
          {exclusionPolygons.length === 0 && exclusionCircles.length === 0 ? (
            <div className="text-xs text-gray-500">No exclusion zones</div>
          ) : (
            <div className="space-y-1">
              {exclusionPolygons.map((polygon) => (
                <FenceListItem
                  key={polygon.id}
                  id={polygon.id}
                  type="polygon"
                  label={`Polygon (${polygon.vertices.length} pts)`}
                  isSelected={selectedFenceId === polygon.id}
                  color="red"
                  readOnly={readOnly}
                  onSelect={() => setSelectedFenceId(polygon.id)}
                  onRemove={() => removePolygon(polygon.id)}
                />
              ))}
              {exclusionCircles.map((circle) => (
                <FenceListItem
                  key={circle.id}
                  id={circle.id}
                  type="circle"
                  label={`Circle (${Math.round(circle.radius)}m)`}
                  isSelected={selectedFenceId === circle.id}
                  color="red"
                  readOnly={readOnly}
                  onSelect={() => setSelectedFenceId(circle.id)}
                  onRemove={() => removeCircle(circle.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Status Bar */}
      <div className="p-2 border-t border-gray-700/50 text-xs text-gray-400 flex items-center justify-between">
        <span>
          {polygons.length} polygon{polygons.length !== 1 ? 's' : ''}, {circles.length} circle{circles.length !== 1 ? 's' : ''}
        </span>
        {fenceStatus && fenceStatus.breachCount > 0 && (
          <span className="text-red-400">
            {fenceStatus.breachCount} breach{fenceStatus.breachCount !== 1 ? 'es' : ''}
          </span>
        )}
      </div>
    </div>
  );
}

// Individual fence list item
interface FenceListItemProps {
  id: string;
  type: 'polygon' | 'circle';
  label: string;
  isSelected: boolean;
  color: 'green' | 'red';
  readOnly: boolean;
  onSelect: () => void;
  onRemove: () => void;
}

function FenceListItem({ id, type, label, isSelected, color, readOnly, onSelect, onRemove }: FenceListItemProps) {
  const bgColor = isSelected
    ? color === 'green'
      ? 'bg-green-500/20 ring-1 ring-green-500'
      : 'bg-red-500/20 ring-1 ring-red-500'
    : 'bg-gray-800/50 hover:bg-gray-700/50';

  const iconColor = color === 'green' ? 'text-green-400' : 'text-red-400';

  return (
    <div
      className={`flex items-center justify-between p-2 rounded cursor-pointer ${bgColor}`}
      onClick={onSelect}
    >
      <div className="flex items-center gap-2">
        <span className={iconColor}>
          {type === 'polygon' ? (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <circle cx="12" cy="12" r="9" strokeWidth={2} />
            </svg>
          )}
        </span>
        <span className="text-xs">{label}</span>
      </div>
      {!readOnly && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="p-1 text-gray-400 hover:text-red-400"
          title="Remove"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
