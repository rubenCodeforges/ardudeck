/**
 * Survey Stats Panel - Compact stats bar showing GSD, flight time, photo count, etc.
 */
import type { SurveyStats } from './survey-types';

interface SurveyStatsPanelProps {
  stats: SurveyStats;
}

function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const remainMins = mins % 60;
    return `${hrs}h ${remainMins}m`;
  }
  return `${mins}m ${secs}s`;
}

function formatArea(sqMeters: number): string {
  if (sqMeters >= 10000) return `${(sqMeters / 10000).toFixed(2)} ha`;
  return `${Math.round(sqMeters)} m\u00B2`;
}

export function SurveyStatsPanel({ stats }: SurveyStatsPanelProps) {
  // Hide stats only when there's nothing to show. Manual/ground-vehicle mode
  // has photoCount=0 but real lineCount/distance/area — still useful.
  if (stats.photoCount === 0 && stats.lineCount === 0) return null;

  // Manual mode has no camera, so GSD and Photos are meaningless. We detect
  // it heuristically (photoCount=0 with lines > 0 only happens in that mode).
  const isManualMode = stats.photoCount === 0 && stats.lineCount > 0;

  return (
    <div className="grid grid-cols-3 gap-x-3 gap-y-1.5 text-xs">
      {!isManualMode && <StatItem label="GSD" value={`${stats.gsd.toFixed(1)} cm/px`} />}
      {!isManualMode && <StatItem label="Photos" value={stats.photoCount.toLocaleString()} />}
      <StatItem label="Lines" value={stats.lineCount.toString()} />
      <StatItem label="Distance" value={formatDistance(stats.flightDistance)} />
      <StatItem label="Time" value={formatTime(stats.flightTime)} />
      <StatItem label="Area" value={formatArea(stats.areaCovered)} />
    </div>
  );
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-content-secondary text-[10px]">{label}</div>
      <div className="text-content font-medium tabular-nums">{value}</div>
    </div>
  );
}
