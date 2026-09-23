/**
 * Live link numbers over the feed, so a degrading picture can be named.
 *
 * Kept to one corner and one line per figure: this sits on top of video the
 * pilot is trying to watch, and the point is to answer one question fast, is
 * the link dropping frames, or is this machine failing to keep up.
 */

import type { StreamHealth } from './stream-health';
import { verdictFor, healthReason } from './stream-health';

const TONE: Record<ReturnType<typeof verdictFor>, string> = {
  good: 'text-emerald-300',
  warn: 'text-amber-300',
  bad: 'text-red-300',
};

export function StreamHealthReadout({ health }: { health: StreamHealth }) {
  const verdict = verdictFor(health);
  const reason = healthReason(health);

  return (
    <div className="pointer-events-none absolute right-2 top-2 rounded bg-black/70 px-2 py-1 font-mono text-[10px] leading-tight text-white/90">
      <div className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-full ${verdict === 'good' ? 'bg-emerald-400' : verdict === 'warn' ? 'bg-amber-400' : 'bg-red-400'}`} />
        <span className="tabular-nums">
          {health.bitrateKbps} kbps · {health.fps} fps
          {health.width ? ` · ${health.width}x${health.height}` : ''}
        </span>
      </div>
      <div className="tabular-nums text-white/60">
        loss {health.lossPct}% · jitter {health.jitterMs} ms
        {health.droppedFrames > 0 ? ` · dropped ${health.droppedFrames}` : ''}
        {health.keyframeRequests > 0 ? ` · keyframe req ${health.keyframeRequests}` : ''}
      </div>
      {reason && <div className={TONE[verdict]}>{reason}</div>}
    </div>
  );
}
