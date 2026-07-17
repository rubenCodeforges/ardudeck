/**
 * HUD destination bar - the HUD-mode counterpart to the OSD sync bar.
 *
 * A text OSD lives in the flight controller, so the sync bar gives it
 * Load/Upload-to-FC actions. A HUD does not: ArduDeck draws it on the ground,
 * over your video feed, and it never touches the FC. This bar makes that
 * destination visible at a glance (a small video -> overlay -> display flow,
 * with the flight controller shown explicitly bypassed) instead of relying on
 * a line of fine print, and it stands in for the FC upload buttons - which
 * would be misleading - while the editor is in HUD mode.
 */

import { MonitorPlay, Video, Layers, Monitor, Cpu, ChevronRight, type LucideIcon } from 'lucide-react';

export function HudDestinationBar() {
  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-subtle bg-gradient-to-r from-indigo-500/10 via-indigo-500/[0.04] to-transparent shrink-0 flex-wrap" data-tour="osd-destination-bar">
      {/* Identity pill - a live overlay, so a live dot, but plainly a screen target */}
      <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-indigo-500/15 border border-indigo-400/30">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" aria-hidden />
        <MonitorPlay className="h-3.5 w-3.5 text-indigo-300" />
        <span className="text-xs font-medium text-content">ArduDeck screen overlay</span>
      </div>

      {/* Where it actually renders, drawn as a pipeline */}
      <div className="flex items-center gap-1.5">
        <FlowNode icon={Video} label="Video feed" />
        <ChevronRight className="h-3.5 w-3.5 text-content-tertiary" aria-hidden />
        <FlowNode icon={Layers} label="HUD overlay" active />
        <ChevronRight className="h-3.5 w-3.5 text-content-tertiary" aria-hidden />
        <FlowNode icon={Monitor} label="Your display" />
      </div>

      <div className="flex-1" />

      {/* The flight controller, shown explicitly bypassed */}
      <div
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-dashed border-strong bg-surface-raised/40"
        data-tip="A HUD is drawn on the ground, over your video. Unlike a text OSD it is not written to the flight controller, so there is nothing to upload."
      >
        <span className="relative inline-flex items-center justify-center">
          <Cpu className="h-3.5 w-3.5 text-content-tertiary" />
          <span
            className="pointer-events-none absolute left-1/2 top-1/2 h-px w-[130%] -translate-x-1/2 -translate-y-1/2 -rotate-[20deg] bg-content-tertiary"
            aria-hidden
          />
        </span>
        <span className="text-[11px] text-content-tertiary line-through decoration-content-tertiary/60">
          Flight controller
        </span>
        <span className="text-[11px] font-medium text-content-secondary">not uploaded</span>
      </div>
    </div>
  );
}

function FlowNode({ icon: Icon, label, active }: { icon: LucideIcon; label: string; active?: boolean }) {
  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-1 rounded-md ${
        active ? 'bg-indigo-500/15 text-content' : 'bg-surface-raised text-content-secondary'
      }`}
    >
      <Icon className={`h-3.5 w-3.5 ${active ? 'text-indigo-300' : 'text-content-tertiary'}`} />
      <span className="text-[11px]">{label}</span>
    </div>
  );
}
