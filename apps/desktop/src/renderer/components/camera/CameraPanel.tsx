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
import { Camera, Circle, Layers, RotateCw, SlidersHorizontal } from 'lucide-react';
import { useActiveVehicleStore } from '../../stores/active-vehicle-store';
import { useFleetVehicles, type FleetVehicle } from '../../hooks/useFleet';
import { useCameraStore } from '../../stores/camera-store';
import type { OsdLayers, CameraRenderMode } from '../../../shared/camera-types';
import { CameraView } from './CameraView';
import { SyntheticVisionView } from './SyntheticVisionView';
import { CameraSourceMenu } from './CameraSourceMenu';
import { CameraSettingsDialog } from './settings/CameraSettingsDialog';
import { GimbalPad } from './GimbalPad';
import { VisionStreamControl } from './VisionStream';
import { CameraSourceSwitch } from './CameraSourceSwitch';
import { VideoLinkBanner } from './VideoLinkBanner';
import { describePeers } from './webrtc-diag';
import { Trans, useTranslation } from 'react-i18next';

// Partial: the `waypoints` layer intentionally has no OSD toggle — the 3D
// waypoint overlay is toggled from the HUD instruments editor (HudPanel) via the
// `waypoints` HUD widget, so there is one control and no dead duplicate here.
const OSD_LABEL_KEYS: Partial<Record<keyof OsdLayers, string>> = {
  cornerTelemetry: 'common:telemetry',
  crosshair: 'camera:panel.osdCrosshair',
  northIndicator: 'common:compass',
  frameCenterCoords: 'camera:panel.osdCenterCoords',
  artificialHorizon: 'camera:panel.osdHorizon',
  hud: 'camera:panel.osdFlightHud',
};

const ICON_BTN =
  'flex h-6 w-6 items-center justify-center rounded text-content-secondary hover:bg-surface-raised disabled:opacity-40';

function MenuItem({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-[11px] text-content hover:bg-surface-raised"
    >
      {children}
    </button>
  );
}

export function CameraPanel() {
  const { t } = useTranslation();
  const activeVehicleKey = useActiveVehicleStore((s) => s.activeVehicleKey);
  const setActive = useActiveVehicleStore((s) => s.setActive);
  const fleet = useFleetVehicles();

  const store = useCameraStore();
  const { viewMode, renderMode, syntheticFallback, lockedVehicleKey, osd, gridCols } = store;

  const [showSources, setShowSources] = useState(false);
  const [settingsSourceId, setSettingsSourceId] = useState<string | null>(null);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showOsdMenu, setShowOsdMenu] = useState(false);
  const [recordingSourceId, setRecordingSourceId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; filePath?: string } | null>(null);
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

  // Transport ids rotate on reconnect, orphaning exact-key lookups.
  const fleetKeys = useMemo(() => fleet.map((v) => v.key).sort().join('|'), [fleet]);
  useEffect(() => {
    if (fleetKeys.length > 0) useCameraStore.getState().adoptLiveVehicles(fleetKeys.split('|'));
  }, [fleetKeys]);

  // The vehicle this panel is bound to (lock wins, else the active selection).
  const targetKey = lockedVehicleKey ?? activeVehicleKey;
  const targetVehicle = useMemo(() => fleet.find((v) => v.key === targetKey) ?? null, [fleet, targetKey]);

  const vehiclesWithFeeds = useMemo(
    () => fleet.filter((v) => store.selectedByVehicle[v.key]),
    [fleet, store.selectedByVehicle],
  );
  // Synthetic vision needs no feed — tile every vehicle instead.
  const gridVehicles = renderMode === 'synthetic' ? fleet : vehiclesWithFeeds;

  const flash = (text: string, filePath?: string) => {
    setToast({ text, filePath });
    setTimeout(() => setToast((t) => (t?.text === text ? null : t)), filePath ? 6000 : 2500);
  };

  const liveSourceId = targetKey ? store.selectedByVehicle[targetKey] : undefined;
  const liveSource = liveSourceId ? store.sources[liveSourceId] : undefined;
  const settingsSource = settingsSourceId ? store.sources[settingsSourceId] : undefined;

  const handleSnapshot = async () => {
    if (!liveSourceId) return;
    const r = await window.electronAPI.cameraSnapshot(liveSourceId);
    if (r.ok) flash(t('camera:panel.snapshotSaved'), r.filePath);
    else flash(t('camera:panel.snapshotFailed', { error: r.error ?? '' }));
  };

  const handleRecord = async () => {
    if (!liveSourceId) return;
    const r = await window.electronAPI.cameraRecordToggle(liveSourceId);
    if (!r.ok) { flash(t('camera:panel.recordFailed', { error: r.error ?? '' })); return; }
    if (recordingSourceId === liveSourceId) { setRecordingSourceId(null); flash(t('camera:panel.recordingSaved', { folder: navigator.userAgent.includes('Macintosh') ? 'Movies' : 'Videos' }), r.filePath); }
    else { setRecordingSourceId(liveSourceId); flash(t('camera:panel.recording')); }
  };

  const engine = store.engineStatus;

  return (
    <div className="relative flex h-full flex-col bg-surface">
      {/* Chrome */}
      <div className="flex shrink-0 items-center gap-1.5 border-b border-subtle bg-surface px-2 py-1.5">
        <span className="text-xs font-medium text-content">{t('common:vision')}</span>
        {targetVehicle && <span className="text-[11px] text-content-secondary">· {targetVehicle.label}</span>}

        {/* Live feed / Synthetic vision toggle */}
        <div className="ml-1 flex overflow-hidden rounded-md border border-subtle">
          {(['live', 'synthetic'] as const).map((m) => (
            <button
              key={m}
              onClick={() => store.setRenderMode(m)}
              className={`px-2 py-0.5 text-[11px] transition-colors ${renderMode === m ? 'bg-surface-raised text-content' : 'text-content-secondary hover:bg-surface-raised'}`}
              title={m === 'live' ? t('camera:panel.liveTip') : t('camera:panel.syntheticTip')}
            >{m === 'live' ? t('common:live') : t('camera:panel.synthetic')}</button>
          ))}
        </div>

        {renderMode === 'live' && viewMode === 'follow' && targetKey && <CameraSourceSwitch vehicleKey={targetKey} />}

        {/* Follow / Grid toggle */}
        {fleet.length > 1 && (
          <div className="ml-1 flex overflow-hidden rounded-md border border-subtle">
            {(['follow', 'grid'] as const).map((m) => (
              <button
                key={m}
                onClick={() => store.setViewMode(m)}
                className={`px-2 py-0.5 text-[11px] capitalize transition-colors ${viewMode === m ? 'bg-surface-raised text-content' : 'text-content-secondary hover:bg-surface-raised'}`}
              >{m === 'follow' ? t('camera:panel.follow') : t('camera:panel.grid')}</button>
            ))}
          </div>
        )}

        {/* Lock to vehicle (follow mode) */}
        {viewMode === 'follow' && (
          <button
            onClick={() => store.setLockedVehicle(lockedVehicleKey ? null : activeVehicleKey)}
            className={`rounded px-1.5 py-0.5 text-[11px] ${lockedVehicleKey ? 'bg-blue-500/20 text-blue-300' : 'text-content-secondary hover:bg-surface-raised'}`}
            title={lockedVehicleKey ? t('camera:panel.lockedTip') : t('camera:panel.lockTip')}
          >{lockedVehicleKey ? t('camera:panel.locked') : t('camera:panel.follow')}</button>
        )}

        {viewMode === 'grid' && (
          <select
            value={gridCols}
            onChange={(e) => store.setGridCols(Number(e.target.value))}
            className="rounded border border-subtle bg-surface-input px-1 py-0.5 text-[11px] text-content"
            title={t('camera:panel.gridColumns')}
          >
            {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}×</option>)}
          </select>
        )}

        <div className="flex-1" />

        {/* Capture — live feed only */}
        {renderMode === 'live' && (
          <>
            <button
              onClick={() => { if (liveSourceId) store.requestReconnect(liveSourceId); }}
              disabled={!liveSourceId}
              className={ICON_BTN}
              data-tip={t('camera:panel.reconnectTip')}
            >
              <RotateCw className="h-3.5 w-3.5" />
            </button>
            <button onClick={handleSnapshot} disabled={!liveSourceId} className={ICON_BTN} data-tip={t('camera:panel.snapshot')}>
              <Camera className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={handleRecord}
              disabled={!liveSourceId}
              className={`${ICON_BTN} ${recordingSourceId ? 'bg-red-500/20 text-red-300' : ''}`}
              data-tip={recordingSourceId === liveSourceId ? t('camera:panel.stopRecording') : t('camera:panel.record')}
            >
              <Circle className={`h-3 w-3 ${recordingSourceId === liveSourceId ? 'fill-current' : ''}`} />
            </button>
          </>
        )}

        {renderMode === 'synthetic' && <VisionStreamControl />}

        {/* What is drawn over the feed */}
        <div className="relative flex items-center">
          <button
            onClick={() => setShowOsdMenu((v) => !v)}
            className={`${ICON_BTN} ${store.showStats ? 'text-emerald-300' : ''}`}
            data-tip={t('camera:panel.overlaysTip')}
          >
            <Layers className="h-3.5 w-3.5" />
          </button>
          {showOsdMenu && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setShowOsdMenu(false)} />
              <div className="absolute right-0 top-7 z-40 w-52 rounded-lg border border-default bg-surface-solid p-1.5 shadow-xl">
                <div className="px-1.5 pb-1 text-[10px] uppercase tracking-wide text-content-tertiary">{t('camera:panel.osdLayers')}</div>
                {(Object.keys(OSD_LABEL_KEYS) as (keyof OsdLayers)[]).map((k) => (
                  <label key={k} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[11px] text-content hover:bg-surface-raised">
                    <input type="checkbox" checked={osd[k]} onChange={() => store.toggleOsd(k)} className="accent-blue-500" />
                    {t(OSD_LABEL_KEYS[k]!)}
                  </label>
                ))}

                <div className="mt-1 border-t border-subtle pt-1">
                  <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[11px] text-content hover:bg-surface-raised">
                    <input
                      type="checkbox"
                      checked={store.showStats}
                      onChange={() => store.setShowStats(!store.showStats)}
                      className="accent-blue-500"
                    />
                    {t('camera:panel.linkStats')}
                  </label>
                  <div className="px-1.5 pb-1 text-[10px] leading-snug text-content-tertiary">
                    {t('camera:panel.linkStatsHint')}
                  </div>
                </div>

                {renderMode === 'synthetic' && (
                  <div className="mt-1 border-t border-subtle pt-1">
                    <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[11px] text-content hover:bg-surface-raised">
                      <input
                        type="checkbox"
                        checked={store.svtSatellite}
                        onChange={(e) => store.setSvtSatellite(e.target.checked)}
                        className="accent-blue-500"
                      />
                      {t('camera:panel.satelliteImagery')}
                    </label>
                    <div className="px-1.5 pb-1 text-[10px] uppercase tracking-wide text-content-tertiary">{t('camera:panel.terrainDetail')}</div>
                    <div className="flex overflow-hidden rounded-md border border-subtle">
                      {(['low', 'medium', 'high'] as const).map((q) => (
                        <button
                          key={q}
                          onClick={() => store.setSvtQuality(q)}
                          className={`flex-1 px-1.5 py-0.5 text-[11px] capitalize transition-colors ${store.svtQuality === q ? 'bg-surface-raised text-content' : 'text-content-secondary hover:bg-surface-raised'}`}
                          title={q === 'low' ? t('camera:panel.qualityLowTip') : q === 'high' ? t('camera:panel.qualityHighTip') : t('camera:panel.qualityMediumTip')}
                        >{t(`camera:panel.quality.${q}`)}</button>
                      ))}
                    </div>
                    <div className="px-1.5 pt-1 text-[10px] leading-snug text-content-tertiary">
                      {t('camera:panel.terrainHint')}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Setup and support */}
        <div className="relative flex items-center">
          <button
            onClick={() => setShowMoreMenu((v) => !v)}
            className={ICON_BTN}
            data-tip={t('camera:panel.feedsDiagTip')}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
          </button>
          {showMoreMenu && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setShowMoreMenu(false)} />
              <div className="absolute right-0 top-7 z-40 w-48 rounded-lg border border-default bg-surface-solid p-1.5 shadow-xl">
                {liveSource?.kind === 'wfbng' && (
                  <MenuItem
                    onClick={() => {
                      setShowMoreMenu(false);
                      setSettingsSourceId(liveSource.id);
                    }}
                  >
                    {t('camera:sourceMenu.cameraSettings')}
                  </MenuItem>
                )}
                <MenuItem
                  onClick={() => {
                    setShowMoreMenu(false);
                    setShowSources(true);
                  }}
                >
                  {t('camera:panel.configureFeeds')}
                </MenuItem>
                <MenuItem
                  onClick={async () => {
                    setShowMoreMenu(false);
                    const text = await window.electronAPI.cameraDiagnostics();
                    await navigator.clipboard.writeText(`${text}\n--- webrtc (this window) ---\n${await describePeers()}`);
                    flash(t('camera:panel.diagCopied'));
                  }}
                >
                  {t('camera:panel.copyDiagnostics')}
                </MenuItem>
                <div className="px-1.5 pt-1 text-[10px] leading-snug text-content-tertiary">
                  {t('camera:panel.copyDiagnosticsHint')}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {engine && !engine.hubReady && engine.detail && (
        <div className="flex shrink-0 items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-300">
          <span className="flex-1">{installing ? (installLog ?? t('camera:panel.installingEngine')) : engine.detail}</span>
          <button
            onClick={handleInstallEngine}
            disabled={installing}
            className="shrink-0 rounded bg-amber-500/20 px-2 py-0.5 font-medium text-amber-200 hover:bg-amber-500/30 disabled:opacity-50"
          >{installing ? '…' : t('common:install')}</button>
        </div>
      )}

      {/* Body */}
      <div className="relative min-h-0 flex-1">
        {viewMode === 'follow' ? (
          <FollowBody renderMode={renderMode} syntheticFallback={syntheticFallback} targetVehicle={targetVehicle} targetKey={targetKey} activeKey={activeVehicleKey} osd={osd} liveSourceId={liveSourceId} onAddSource={() => setShowSources(true)} />
        ) : (
          <GridBody renderMode={renderMode} syntheticFallback={syntheticFallback} vehicles={gridVehicles} activeKey={activeVehicleKey} osd={osd} gridCols={gridCols} onActivate={(v) => setActive(v.transportId, v.key)} />
        )}

        {showSources && (
          <CameraSourceMenu
            vehicleKey={targetKey}
            onClose={() => setShowSources(false)}
            onOpenSettings={(id) => { setShowSources(false); setSettingsSourceId(id); }}
          />
        )}
        {settingsSource && (
          <CameraSettingsDialog key={settingsSource.id} source={settingsSource} onClose={() => setSettingsSourceId(null)} />
        )}
        {toast && (
          <div className="absolute bottom-14 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded bg-black/75 px-3 py-1 text-[11px] text-white">
            {toast.text}
            {toast.filePath && (
              <button
                onClick={() => { void window.electronAPI.cameraRevealMedia(toast.filePath!); setToast(null); }}
                className="font-medium text-blue-300 hover:text-blue-200"
              >{t('common:show')}</button>
            )}
          </div>
        )}
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
  const { t } = useTranslation();
  const source = useCameraStore((s) => (liveSourceId ? s.sources[liveSourceId] : undefined));
  const [erroredId, setErroredId] = useState<string | null>(null);
  const [lostAt, setLostAt] = useState<number | null>(null);
  // Re-arm the live feed whenever the source or the mode changes.
  useEffect(() => { setErroredId(null); setLostAt(null); }, [source?.id, renderMode]);

  if (!targetKey) {
    return <Empty>{t('camera:panel.noVehicle')}</Empty>;
  }

  const isPrimary = targetKey === activeKey;

  // Live mode with no configured feed → prompt to add one. Do NOT silently show
  // synthetic here; that only happens in Synthetic mode or when a real feed fails.
  if (renderMode === 'live' && !source) {
    return (
      <Empty>
        <Trans
          i18nKey="camera:panel.noFeedConfigured"
          values={{ vehicle: targetVehicle?.label ?? t('camera:panel.thisVehicle') }}
          components={{
            add: <button onClick={onAddSource} className="ml-1 text-blue-400 hover:underline" />,
            muted: <span className="mx-1 text-content-tertiary" />,
            mode: <span className="text-content-secondary" />,
          }}
        />
      </Empty>
    );
  }

  // Synthetic mode always; Live mode only falls back to synthetic when the
  // configured feed actually errored AND the vehicle has a position fix -
  // otherwise synthetic just shows a "needs GPS" dead end that hides the real
  // camera error, so keep the CameraView's own error state instead.
  if (renderMode === 'synthetic' || !source) {
    return <SyntheticVisionView vehicle={targetVehicle} isPrimary={isPrimary} osd={osd} />;
  }

  // The feed stays mounted under the fallback so it keeps retrying; its first frame lifts it.
  // A dropout at range shows synthetic vision too: it is what gets the pilot home.
  const feedErrored = erroredId === source.id;
  const showFallback = syntheticFallback && (feedErrored || lostAt !== null) && !!targetVehicle?.position;
  return (
    <div className="relative h-full w-full">
      <CameraView
        source={source}
        vehicle={targetVehicle}
        isPrimary={isPrimary}
        osd={osd}
        onError={() => { if (syntheticFallback) setErroredId(source.id); }}
        onLive={() => { setErroredId(null); setLostAt(null); }}
        onSignalLost={() => setLostAt((t) => t ?? Date.now())}
      />
      {showFallback && (
        <div className="absolute inset-0">
          <SyntheticVisionView vehicle={targetVehicle} isPrimary={isPrimary} osd={osd} />
          <VideoLinkBanner lostAt={lostAt} />
        </div>
      )}
    </div>
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
  const { t } = useTranslation();
  if (vehicles.length === 0) {
    return (
      <Empty>
        {renderMode === 'synthetic'
          ? t('camera:panel.noVehicles')
          : t('camera:panel.noFeeds')}
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
  const [lostAt, setLostAt] = useState<number | null>(null);
  useEffect(() => { setErrored(false); setLostAt(null); }, [source?.id, renderMode]);

  // Live tile with no feed: render nothing rather than silently swapping to synthetic.
  if (renderMode === 'live' && !source) return null;

  // Same GPS-fix guard as the follow view: don't swap a failed feed for a
  // GPS-less synthetic tile.
  const showFallback = syntheticFallback && (errored || lostAt !== null) && !!vehicle.position;
  return (
    <div className={`relative overflow-hidden rounded ${isActive ? 'ring-2 ring-blue-500' : 'ring-1 ring-white/10'}`}>
      {renderMode === 'synthetic' || !source ? (
        <SyntheticVisionView vehicle={vehicle} isPrimary={isActive} osd={osd} onActivate={onActivate} />
      ) : (
        <>
          <CameraView
            source={source}
            vehicle={vehicle}
            isPrimary={isActive}
            osd={osd}
            onActivate={onActivate}
            onError={() => { if (syntheticFallback) setErrored(true); }}
            onLive={() => { setErrored(false); setLostAt(null); }}
            onSignalLost={() => setLostAt((t) => t ?? Date.now())}
          />
          {showFallback && (
            <div className="absolute inset-0">
              <SyntheticVisionView vehicle={vehicle} isPrimary={isActive} osd={osd} onActivate={onActivate} />
              <VideoLinkBanner lostAt={lostAt} compact />
            </div>
          )}
        </>
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
