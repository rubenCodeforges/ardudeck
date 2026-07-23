/**
 * Camera panel — detachable, theme-aware, single- and multi-vehicle aware.
 *
 * View modes (toggleable in the chrome):
 *  - Follow: shows the active vehicle's live feed and auto-switches when the
 *    fleet selection changes. A lock pin freezes the panel to one vehicle, so
 *    you can pop out several windows and lock each = a video wall.
 *  - Grid: tiles every vehicle that has a configured feed; the active one is
 *    highlighted and clicking a tile makes that vehicle active.
 *
 * The detach/pin/dock-back chrome and theme sync come from the existing
 * detached-window system — this component only fills its container.
 */

import { useEffect, useMemo, useState } from 'react';
import { useActiveVehicleStore } from '../../stores/active-vehicle-store';
import { useFleetVehicles, type FleetVehicle } from '../../hooks/useFleet';
import { useCameraStore } from '../../stores/camera-store';
import type { OsdLayers, CameraRenderMode } from '../../../shared/camera-types';
import { CameraView } from './CameraView';
import { SyntheticVisionView } from './SyntheticVisionView';
import { CameraSourceMenu } from './CameraSourceMenu';
import { GimbalPad } from './GimbalPad';

// Partial: the `waypoints` layer intentionally has no OSD toggle — the 3D
// waypoint overlay is toggled from the HUD instruments editor (HudPanel) via the
// `waypoints` HUD widget, so there is one control and no dead duplicate here.
const OSD_LABELS: Partial<Record<keyof OsdLayers, string>> = {
  cornerTelemetry: 'Telemetry',
  crosshair: 'Crosshair',
  northIndicator: 'Compass',
  frameCenterCoords: 'Center coords',
  artificialHorizon: 'Horizon',
  hud: 'Flight HUD',
};

export function CameraPanel() {
  const activeVehicleKey = useActiveVehicleStore((s) => s.activeVehicleKey);
  const setActive = useActiveVehicleStore((s) => s.setActive);
  const fleet = useFleetVehicles();

  const store = useCameraStore();
  const { viewMode, renderMode, syntheticFallback, lockedVehicleKey, osd, gridCols } = store;

  const [showSources, setShowSources] = useState(false);
  const [showOsdMenu, setShowOsdMenu] = useState(false);
  const [recordingSourceId, setRecordingSourceId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installLog, setInstallLog] = useState<string | null>(null);

  const handleInstallEngine = async () => {
    setInstalling(true);
    const off = window.electronAPI.onCameraEngineInstallLog((line) => setInstallLog(line));
    try {
      const status = await window.electronAPI.cameraEngineInstall();
      store.setEngineStatus(status);
    } finally {
      off();
      setInstalling(false);
      setInstallLog(null);
    }
  };

  // Mirror MAVLink camera/gimbal discovery into the store.
  useEffect(() => {
    const offVid = window.electronAPI.onCameraVideoStreamInfo((i) => store.recordVideoStream(i));
    const offAtt = window.electronAPI.onCameraGimbalAttitude((a) => store.recordGimbalAttitude(a));
    const offInfo = window.electronAPI.onCameraGimbalInfo((i) => store.recordGimbalInfo(i));
    void window.electronAPI.cameraEngineStatus().then((s) => store.setEngineStatus(s));
    return () => { offVid(); offAtt(); offInfo(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The vehicle this panel is bound to (lock wins, else the active selection).
  const targetKey = lockedVehicleKey ?? activeVehicleKey;
  const targetVehicle = useMemo(() => fleet.find((v) => v.key === targetKey) ?? null, [fleet, targetKey]);

  const vehiclesWithFeeds = useMemo(
    () => fleet.filter((v) => store.selectedByVehicle[v.key]),
    [fleet, store.selectedByVehicle],
  );
  // Synthetic vision needs no feed — tile every vehicle instead.
  const gridVehicles = renderMode === 'synthetic' ? fleet : vehiclesWithFeeds;

  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2500); };

  const liveSourceId = targetKey ? store.selectedByVehicle[targetKey] : undefined;

  const handleSnapshot = async () => {
    if (!liveSourceId) return;
    const r = await window.electronAPI.cameraSnapshot(liveSourceId);
    flash(r.ok ? `Snapshot saved` : `Snapshot failed: ${r.error ?? ''}`);
  };

  const handleRecord = async () => {
    if (!liveSourceId) return;
    const r = await window.electronAPI.cameraRecordToggle(liveSourceId);
    if (!r.ok) { flash(`Record failed: ${r.error ?? ''}`); return; }
    if (recordingSourceId === liveSourceId) { setRecordingSourceId(null); flash('Recording saved'); }
    else { setRecordingSourceId(liveSourceId); flash('Recording…'); }
  };

  const engine = store.engineStatus;

  return (
    <div className="relative flex h-full flex-col bg-surface">
      {/* Chrome */}
      <div className="flex shrink-0 items-center gap-1.5 border-b border-subtle bg-surface px-2 py-1.5">
        <span className="text-xs font-medium text-content">Vision</span>
        {targetVehicle && <span className="text-[11px] text-content-secondary">· {targetVehicle.label}</span>}

        {/* Live feed / Synthetic vision toggle */}
        <div className="ml-1 flex overflow-hidden rounded-md border border-subtle">
          {(['live', 'synthetic'] as const).map((m) => (
            <button
              key={m}
              onClick={() => store.setRenderMode(m)}
              className={`px-2 py-0.5 text-[11px] transition-colors ${renderMode === m ? 'bg-surface-raised text-content' : 'text-content-secondary hover:bg-surface-raised'}`}
              title={m === 'live' ? 'Live camera feed' : 'Synthetic vision (3D terrain from GPS + attitude)'}
            >{m === 'live' ? 'Live' : 'Synthetic'}</button>
          ))}
        </div>

        {/* Follow / Grid toggle */}
        {fleet.length > 1 && (
          <div className="ml-1 flex overflow-hidden rounded-md border border-subtle">
            {(['follow', 'grid'] as const).map((m) => (
              <button
                key={m}
                onClick={() => store.setViewMode(m)}
                className={`px-2 py-0.5 text-[11px] capitalize transition-colors ${viewMode === m ? 'bg-surface-raised text-content' : 'text-content-secondary hover:bg-surface-raised'}`}
              >{m}</button>
            ))}
          </div>
        )}

        {/* Lock to vehicle (follow mode) */}
        {viewMode === 'follow' && (
          <button
            onClick={() => store.setLockedVehicle(lockedVehicleKey ? null : activeVehicleKey)}
            className={`rounded px-1.5 py-0.5 text-[11px] ${lockedVehicleKey ? 'bg-blue-500/20 text-blue-300' : 'text-content-secondary hover:bg-surface-raised'}`}
            title={lockedVehicleKey ? 'Locked to this vehicle — click to follow active' : 'Lock this panel to the current vehicle'}
          >{lockedVehicleKey ? 'Locked' : 'Follow'}</button>
        )}

        {viewMode === 'grid' && (
          <select
            value={gridCols}
            onChange={(e) => store.setGridCols(Number(e.target.value))}
            className="rounded border border-subtle bg-surface-input px-1 py-0.5 text-[11px] text-content"
            title="Grid columns"
          >
            {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}×</option>)}
          </select>
        )}

        <div className="flex-1" />

        {/* Snapshot / Record — live feed only */}
        {renderMode === 'live' && (
          <>
            <button onClick={handleSnapshot} disabled={!liveSourceId} className="rounded px-1.5 py-0.5 text-[11px] text-content-secondary hover:bg-surface-raised disabled:opacity-40" title="Snapshot">Snap</button>
            <button
              onClick={handleRecord}
              disabled={!liveSourceId}
              className={`rounded px-1.5 py-0.5 text-[11px] disabled:opacity-40 ${recordingSourceId ? 'bg-red-500/20 text-red-300' : 'text-content-secondary hover:bg-surface-raised'}`}
              title="Record"
            >{recordingSourceId === liveSourceId ? '● Rec' : 'Rec'}</button>
          </>
        )}

        {/* OSD layers */}
        <div className="relative">
          <button onClick={() => setShowOsdMenu((v) => !v)} className="rounded px-1.5 py-0.5 text-[11px] text-content-secondary hover:bg-surface-raised" title="OSD layers">OSD</button>
          {showOsdMenu && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setShowOsdMenu(false)} />
              <div className="absolute right-0 top-7 z-40 w-40 rounded-lg border border-default bg-surface-solid p-1.5 shadow-xl">
                {(Object.keys(OSD_LABELS) as (keyof OsdLayers)[]).map((k) => (
                  <label key={k} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[11px] text-content hover:bg-surface-raised">
                    <input type="checkbox" checked={osd[k]} onChange={() => store.toggleOsd(k)} className="accent-blue-500" />
                    {OSD_LABELS[k]}
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        <button onClick={() => setShowSources((v) => !v)} className="rounded px-1.5 py-0.5 text-[11px] text-content-secondary hover:bg-surface-raised" title="Configure feeds">Sources</button>
      </div>

      {engine && !engine.hubReady && engine.detail && (
        <div className="flex shrink-0 items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-300">
          <span className="flex-1">{installing ? (installLog ?? 'Installing video engine…') : engine.detail}</span>
          <button
            onClick={handleInstallEngine}
            disabled={installing}
            className="shrink-0 rounded bg-amber-500/20 px-2 py-0.5 font-medium text-amber-200 hover:bg-amber-500/30 disabled:opacity-50"
          >{installing ? '…' : 'Install'}</button>
        </div>
      )}

      {/* Body */}
      <div className="relative min-h-0 flex-1">
        {viewMode === 'follow' ? (
          <FollowBody renderMode={renderMode} syntheticFallback={syntheticFallback} targetVehicle={targetVehicle} targetKey={targetKey} activeKey={activeVehicleKey} osd={osd} liveSourceId={liveSourceId} onAddSource={() => setShowSources(true)} />
        ) : (
          <GridBody renderMode={renderMode} syntheticFallback={syntheticFallback} vehicles={gridVehicles} activeKey={activeVehicleKey} osd={osd} gridCols={gridCols} onActivate={(v) => setActive(v.transportId, v.key)} />
        )}

        {showSources && <CameraSourceMenu vehicleKey={targetKey} onClose={() => setShowSources(false)} />}
        {toast && <div className="absolute bottom-14 left-1/2 -translate-x-1/2 rounded bg-black/70 px-3 py-1 text-[11px] text-white">{toast}</div>}
      </div>

      {/* Gimbal footer — live feed only (synthetic vision has no physical mount) */}
      {renderMode === 'live' && targetVehicle && (store.gimbalByVehicle[targetVehicle.key]?.mode ?? 'auto') !== 'off' && (
        <div className="flex shrink-0 items-center justify-center gap-3 border-t border-subtle bg-surface px-2 py-1.5">
          <GimbalPad vehicleKey={targetKey} />
        </div>
      )}
    </div>
  );
}

function FollowBody({ renderMode, syntheticFallback, targetVehicle, targetKey, activeKey, osd, liveSourceId, onAddSource }: {
  renderMode: CameraRenderMode;
  syntheticFallback: boolean;
  targetVehicle: FleetVehicle | null;
  targetKey: string | null;
  activeKey: string | null;
  osd: OsdLayers;
  liveSourceId: string | undefined;
  onAddSource: () => void;
}) {
  const source = useCameraStore((s) => (liveSourceId ? s.sources[liveSourceId] : undefined));
  const [erroredId, setErroredId] = useState<string | null>(null);
  // Re-arm the live feed whenever the source or the mode changes.
  useEffect(() => { setErroredId(null); }, [source?.id, renderMode]);

  if (!targetKey) {
    return <Empty>No vehicle selected. Connect or select a vehicle to view its feed.</Empty>;
  }

  const isPrimary = targetKey === activeKey;

  // Live mode with no configured feed → prompt to add one. Do NOT silently show
  // synthetic here; that only happens in Synthetic mode or when a real feed fails.
  if (renderMode === 'live' && !source) {
    return (
      <Empty>
        No feed configured for {targetVehicle?.label ?? 'this vehicle'}.
        <button onClick={onAddSource} className="ml-1 text-blue-400 hover:underline">Add a feed</button>
        <span className="mx-1 text-content-tertiary">or switch to</span>
        <span className="text-content-secondary">Synthetic</span>.
      </Empty>
    );
  }

  // Synthetic mode always; Live mode only falls back to synthetic when the
  // configured feed actually errored AND the vehicle has a position fix -
  // otherwise synthetic just shows a "needs GPS" dead end that hides the real
  // camera error, so keep the CameraView's own error state instead.
  const feedErrored = !!source && erroredId === source.id;
  const showSynthetic =
    renderMode === 'synthetic' || (syntheticFallback && feedErrored && !!targetVehicle?.position);
  if (showSynthetic) {
    return <SyntheticVisionView vehicle={targetVehicle} isPrimary={isPrimary} osd={osd} />;
  }

  return (
    <CameraView
      source={source!}
      vehicle={targetVehicle}
      isPrimary={isPrimary}
      osd={osd}
      onError={() => { if (syntheticFallback) setErroredId(source!.id); }}
    />
  );
}

function GridBody({ renderMode, syntheticFallback, vehicles, activeKey, osd, gridCols, onActivate }: {
  renderMode: CameraRenderMode;
  syntheticFallback: boolean;
  vehicles: FleetVehicle[];
  activeKey: string | null;
  osd: OsdLayers;
  gridCols: number;
  onActivate: (v: FleetVehicle) => void;
}) {
  if (vehicles.length === 0) {
    return (
      <Empty>
        {renderMode === 'synthetic'
          ? 'No vehicles to show.'
          : 'No feeds configured. Open Sources to add one per vehicle.'}
      </Empty>
    );
  }
  return (
    <div className="grid h-full w-full gap-1 p-1" style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}>
      {vehicles.map((v) => (
        <GridTile key={v.key} renderMode={renderMode} syntheticFallback={syntheticFallback} vehicle={v} isActive={v.key === activeKey} osd={osd} onActivate={() => onActivate(v)} />
      ))}
    </div>
  );
}

function GridTile({ renderMode, syntheticFallback, vehicle, isActive, osd, onActivate }: {
  renderMode: CameraRenderMode;
  syntheticFallback: boolean;
  vehicle: FleetVehicle;
  isActive: boolean;
  osd: OsdLayers;
  onActivate: () => void;
}) {
  const sourceId = useCameraStore((s) => s.selectedByVehicle[vehicle.key]);
  const source = useCameraStore((s) => (sourceId ? s.sources[sourceId] : undefined));
  const [errored, setErrored] = useState(false);
  useEffect(() => { setErrored(false); }, [source?.id, renderMode]);

  // Live tile with no feed: render nothing rather than silently swapping to synthetic.
  if (renderMode === 'live' && !source) return null;

  // Same GPS-fix guard as the follow view: don't swap a failed feed for a
  // GPS-less synthetic tile.
  const showSynthetic = renderMode === 'synthetic' || (syntheticFallback && errored && !!vehicle.position);
  return (
    <div className={`relative overflow-hidden rounded ${isActive ? 'ring-2 ring-blue-500' : 'ring-1 ring-white/10'}`}>
      {showSynthetic ? (
        <SyntheticVisionView vehicle={vehicle} isPrimary={isActive} osd={osd} onActivate={onActivate} />
      ) : (
        <CameraView
          source={source!}
          vehicle={vehicle}
          isPrimary={isActive}
          osd={osd}
          onActivate={onActivate}
          onError={() => { if (syntheticFallback) setErrored(true); }}
        />
      )}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full w-full items-center justify-center p-4 text-center text-xs text-content-secondary">
      <div>{children}</div>
    </div>
  );
}
