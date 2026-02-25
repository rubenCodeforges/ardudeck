import type { MissionSummary, FlightStatus } from '../../../shared/mission-library-types';
import { useSettingsStore } from '../../stores/settings-store';

const STATUS_DOT_COLORS: Record<FlightStatus, string> = {
  planned: 'bg-blue-400',
  in_progress: 'bg-amber-400',
  completed: 'bg-emerald-400',
  aborted: 'bg-red-400',
};

const STATUS_LABELS: Record<FlightStatus, string> = {
  planned: 'Planned',
  in_progress: 'In Progress',
  completed: 'Completed',
  aborted: 'Aborted',
};

const STATUS_BADGE_STYLES: Record<FlightStatus, string> = {
  planned: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  in_progress: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  completed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  aborted: 'bg-red-500/10 text-red-400 border-red-500/20',
};

// Left accent border color per status
const STATUS_LEFT_BORDER: Record<FlightStatus, string> = {
  planned: 'border-l-blue-400/60',
  in_progress: 'border-l-amber-400/60',
  completed: 'border-l-emerald-400/60',
  aborted: 'border-l-red-400/60',
};

function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

interface MissionCardProps {
  mission: MissionSummary;
  isSelected: boolean;
  onClick: () => void;
  onLoad: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

export function MissionCard({ mission, isSelected, onClick, onLoad, onDuplicate, onDelete }: MissionCardProps) {
  const { vehicles } = useSettingsStore();
  const vehicle = vehicles.find(v => v.id === mission.vehicleProfileId);
  const status = mission.lastFlightStatus;

  // Left accent: colored if has status, transparent if never flown
  const leftBorder = status
    ? `border-l-[3px] ${STATUS_LEFT_BORDER[status]}`
    : 'border-l-[3px] border-l-gray-700/40';

  return (
    <div
      onClick={onClick}
      className={`group relative bg-gray-800/30 rounded-xl border p-4 cursor-pointer transition-all hover:bg-gray-800/50 ${leftBorder} ${
        isSelected
          ? 'border-blue-500/50 ring-1 ring-blue-500/20'
          : 'border-gray-700/30 hover:border-gray-600/50'
      }`}
    >
      {/* Top row: name + badge + date */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-sm font-medium text-white truncate">{mission.name}</h3>
          {status ? (
            <span className={`shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded border ${STATUS_BADGE_STYLES[status]}`}>
              {STATUS_LABELS[status]}
            </span>
          ) : (
            <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded border bg-gray-700/30 text-gray-500 border-gray-600/30">
              New
            </span>
          )}
        </div>
        <span className="text-[10px] text-gray-500 shrink-0">{formatRelativeDate(mission.updatedAt)}</span>
      </div>

      {/* Description (truncated) */}
      {mission.description && (
        <p className="text-xs text-gray-400 mb-3 line-clamp-2">{mission.description}</p>
      )}

      {/* Stats row */}
      <div className="flex items-center gap-3 text-[11px] text-gray-500 mb-3">
        <span className="flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          </svg>
          {mission.waypointCount} WP
        </span>
        <span>{formatDistance(mission.totalDistanceMeters)}</span>
        {mission.flightCount > 0 && (
          <span className="flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {mission.flightCount} flights
          </span>
        )}
        {vehicle && (
          <span className="text-gray-600">{vehicle.name}</span>
        )}
      </div>

      {/* Tags */}
      {mission.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {mission.tags.map(tag => (
            <span
              key={tag}
              className="px-1.5 py-0.5 text-[10px] bg-gray-700/50 text-gray-400 rounded"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Hover actions */}
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
        <button
          onClick={(e) => { e.stopPropagation(); onLoad(); }}
          className="p-1.5 rounded-md bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 transition-colors"
          title="Load into Editor"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
          className="p-1.5 rounded-md bg-gray-700/50 hover:bg-gray-600/50 text-gray-400 transition-colors"
          title="Duplicate"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="p-1.5 rounded-md bg-red-600/20 hover:bg-red-600/40 text-red-400 transition-colors"
          title="Delete"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  );
}
