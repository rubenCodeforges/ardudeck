/**
 * Flight Preview panel - the mission playback timeline, docked like the
 * Altitude Profile. The map shows the gizmo + camera cone (FlightPreviewGizmo);
 * this panel owns transport controls and a scrubbable timeline where flight
 * legs, holds, and camera-yaw changes are laid out over mission time.
 */
import { useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useMissionStore } from '../../stores/mission-store';
import { useFlightPreviewStore } from '../../stores/flight-preview-store';
import { useFlightPreviewTimeline } from './FlightPreviewOverlay';

function fmtTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function FlightPreviewPanel() {
  const { t } = useTranslation('mission');
  const missionItems = useMissionStore((s) => s.missionItems);
  const groups = useMissionStore((s) => s.groups);
  const playing = useFlightPreviewStore((s) => s.playing);
  const timeMs = useFlightPreviewStore((s) => s.timeMs);
  const rate = useFlightPreviewStore((s) => s.rate);
  const groupId = useFlightPreviewStore((s) => s.groupId);
  const { togglePlay, seek, setRate, setGroupId } = useFlightPreviewStore.getState();

  // Groups with flyable waypoints, for the scope selector.
  const groupOptions = useMemo(
    () =>
      groups
        .map((g) => ({ id: g.id, name: g.name, count: missionItems.filter((it) => it.groupId === g.id).length }))
        .filter((g) => g.count > 0),
    [groups, missionItems],
  );

  const timeline = useFlightPreviewTimeline();
  const dur = Math.max(1, timeline.durationMs);

  // Camera command markers: a tick where the commanded yaw or ROI target
  // changes. Continuous ROI panning is NOT ticked - it's smooth by design.
  const yawTicks = useMemo(() => {
    const ticks: number[] = [];
    let last: string | null = null;
    for (const seg of timeline.segments) {
      const key = seg.roi
        ? `roi:${seg.roi.lat.toFixed(6)},${seg.roi.lng.toFixed(6)}`
        : `yaw:${seg.camHeading.toFixed(0)}`;
      if (last !== null && key !== last) ticks.push(seg.t0);
      last = key;
    }
    return ticks;
  }, [timeline]);

  const trackRef = useRef<HTMLDivElement>(null);
  const seekFromEvent = useCallback((clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    seek(f * dur);
  }, [dur, seek]);

  const onTrackMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    seekFromEvent(e.clientX);
    const move = (ev: MouseEvent) => seekFromEvent(ev.clientX);
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }, [seekFromEvent]);

  if (timeline.segments.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-surface text-xs text-content-tertiary">
        No flyable waypoints in the mission yet.
      </div>
    );
  }

  const playheadPct = (Math.min(timeMs, dur) / dur) * 100;

  return (
    <div className="h-full flex flex-col bg-surface px-3 py-2 gap-2 select-none">
      {/* Transport row */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Scope: which WP group flies in the preview. */}
        <select
          value={groupId ?? ''}
          onChange={(e) => setGroupId(e.target.value === '' ? null : e.target.value)}
          className="h-8 px-2 rounded-md bg-surface-input border border-subtle text-xs text-content focus:outline-none focus:border-cyan-500"
          data-tip={t('preview.group-tip')}
        >
          <option value="">{t('preview.entireMission')}</option>
          {groupOptions.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name} ({g.count} WPs)
            </option>
          ))}
        </select>
        <button
          onClick={togglePlay}
          className="w-8 h-8 rounded-full bg-cyan-600 hover:bg-cyan-500 text-white flex items-center justify-center transition-colors"
          data-tip={playing ? 'Pause' : 'Play'}
        >
          {playing ? (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h4v14H7zM13 5h4v14h-4z" /></svg>
          ) : (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
          )}
        </button>
        <span className="text-xs tabular-nums text-content">
          {fmtTime(timeMs)} <span className="text-content-tertiary">/ {fmtTime(dur)}</span>
        </span>
        <div className="flex gap-0.5">
          {[1, 4, 10].map((r) => (
            <button
              key={r}
              onClick={() => setRate(r)}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                rate === r ? 'bg-cyan-600 text-white' : 'bg-surface-raised text-content-secondary hover:text-content'
              }`}
            >
              {r}x
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3 text-[10px] text-content-tertiary">
          <span className="flex items-center gap-1"><span className="w-3 h-1.5 rounded-sm bg-cyan-500/70" /> {t('preview.flightLeg')}</span>
          <span className="flex items-center gap-1"><span className="w-3 h-1.5 rounded-sm bg-amber-500/80" /> {t('preview.hold')}</span>
          <span className="flex items-center gap-1"><span className="w-px h-3 bg-purple-400" /> {t('preview.cameraTurns')}</span>
        </div>
      </div>

      {/* Timeline track */}
      <div
        ref={trackRef}
        onMouseDown={onTrackMouseDown}
        className="relative flex-1 min-h-[44px] rounded-md bg-surface-inset border border-subtle cursor-pointer overflow-hidden"
        data-tip="Click or drag to scrub the flight"
      >
        {timeline.segments.map((seg, i) => (
          <div
            key={i}
            className={`absolute top-[30%] h-[40%] ${seg.hold ? 'bg-amber-500/80' : 'bg-cyan-500/70'}`}
            style={{
              left: `${(seg.t0 / dur) * 100}%`,
              width: `${Math.max(0.15, ((seg.t1 - seg.t0) / dur) * 100)}%`,
            }}
          />
        ))}
        {yawTicks.map((t, i) => (
          <div
            key={`yaw-${i}`}
            className="absolute top-[18%] h-[64%] w-px bg-purple-400/80"
            style={{ left: `${(t / dur) * 100}%` }}
          />
        ))}
        {/* Playhead */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-cyan-300 shadow-[0_0_4px_rgba(34,211,238,0.8)]"
          style={{ left: `${playheadPct}%` }}
        />
      </div>

      {/* Time axis */}
      <div className="flex justify-between text-[10px] text-content-tertiary shrink-0">
        <span>0:00</span>
        <span>{fmtTime(dur / 2)}</span>
        <span>{fmtTime(dur)}</span>
      </div>
    </div>
  );
}
