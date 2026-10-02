/**
 * A single camera feed: owns the playback lifecycle for one source, draws the
 * OSD over it, and (for the active vehicle) turns a click into a gimbal
 * point-at-target via FOV geolocation.
 *
 * Playback paths:
 *  - uvc        -> getUserMedia(deviceId), played locally (no engine)
 *  - webrtc/*   -> main media engine returns a WHEP url; played over WebRTC
 *  The engine normalizes rtsp/rtp/srt/rubyfpv into WHEP, so the renderer only
 *  ever speaks getUserMedia or WHEP.
 */

import { useRef, useCallback, useEffect, useState } from 'react';
import type { CameraSourceConfig, CameraStartPhase, OsdLayers } from '../../../shared/camera-types';
import type { FleetVehicle } from '../../hooks/useFleet';
import { useCameraStore } from '../../stores/camera-store';
import { useTelemetryStore } from '../../stores/telemetry-store';
import { CameraOverlays } from './CameraOverlays';
import { StreamHealthReadout } from './StreamHealthReadout';
import { useCameraStream } from './useCameraStream';
import { projectPixelToGround, projectFrameCenter, type CameraPose } from './geolocation';
import { useTranslation } from 'react-i18next';

interface CameraViewProps {
  source: CameraSourceConfig;
  vehicle: FleetVehicle | null;
  /** True when this view's vehicle is the active selection (enables click-to-point + attitude). */
  isPrimary: boolean;
  osd: OsdLayers;
  /** Grid mode: clicking the tile (not point-to-target) activates the vehicle. */
  onActivate?: () => void;
  /** Fired when the feed fails to start (used to fall back to synthetic vision). */
  onError?: (error: string) => void;
  /** Fired when the first frame is shown (used to leave the synthetic fallback). */
  onLive?: () => void;
  /** Fired when a playing feed stops delivering frames (link dropout). */
  onSignalLost?: () => void;
}

export function CameraView({ source, vehicle, isPrimary, osd, onActivate, onError, onLive, onSignalLost }: CameraViewProps) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const { status, error, health } = useCameraStream(source, videoRef, onError, onLive, onSignalLost);
  const startup = useStartupProgress(source.id, status === 'starting');
  const showStats = useCameraStore((s) => s.showStats);
  const gimbal = useCameraStore((s) => s.gimbalAttitude[source.vehicleKey]);
  const gimbalCfg = useCameraStore((s) => s.gimbalByVehicle[source.vehicleKey]);
  const attitude = useTelemetryStore((s) => s.attitude);
  const gps = useTelemetryStore((s) => s.gps);
  const position = useTelemetryStore((s) => s.position);

  // ---- Pose for geolocation ----------------------------------------------
  const buildPose = useCallback((): CameraPose | null => {
    if (!vehicle || !vehicle.position) return null;
    const hfov = source.hfovDeg ?? 60;
    const vfov = source.vfovDeg ?? hfov * 0.5625; // assume 16:9 if unset
    // Camera bearing = vehicle heading + gimbal yaw; depression = -gimbal pitch.
    const bearingDeg = vehicle.heading + (gimbal?.yawDeg ?? 0);
    const pitchDownDeg = gimbal ? -gimbal.pitchDeg : 30; // 30° default when gimbal attitude unknown
    return {
      lat: vehicle.position[0],
      lon: vehicle.position[1],
      altMslM: vehicle.altitudeAgl, // flat-earth: treat AGL as height above ground
      bearingDeg,
      pitchDownDeg,
      hfovDeg: hfov,
      vfovDeg: vfov,
    };
  }, [vehicle, gimbal, source.hfovDeg, source.vfovDeg]);

  // Frame-center ground coordinate for the OSD readout.
  const frameCenter = osd.frameCenterCoords ? (() => {
    const pose = buildPose();
    if (!pose) return null;
    const p = projectFrameCenter(pose);
    return p ? { lat: p.lat, lon: p.lon } : null;
  })() : null;

  // ---- Click to point gimbal at target -----------------------------------
  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Grid tiles activate their vehicle on click; only the primary view points.
    if (!isPrimary) { onActivate?.(); return; }
    // Don't fire ROI when there's no commandable gimbal (RC-driven or off).
    if (gimbalCfg && (gimbalCfg.mode === 'rc' || gimbalCfg.mode === 'off')) return;
    const pose = buildPose();
    if (!pose || !vehicle) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const u = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const v = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    // Ground AMSL under the vehicle = its AMSL minus AGL.
    const groundAmsl = gps.alt - position.relativeAlt;
    const hit = projectPixelToGround(pose, u, v, 0);
    if (!hit) return;
    void window.electronAPI.cameraGimbalCommand(vehicle.key, {
      kind: 'point-roi', lat: hit.lat, lon: hit.lon, alt: groundAmsl, deviceId: gimbalCfg?.deviceId ?? 0,
    });
  }, [isPrimary, onActivate, buildPose, vehicle, gps.alt, position.relativeAlt, gimbalCfg]);

  return (
    <div
      className="relative h-full w-full overflow-hidden bg-black"
      onClick={handleClick}
      title={isPrimary ? t('camera:view.clickToPoint') : t('camera:view.clickToActivate')}
    >
      <video ref={videoRef} className="h-full w-full object-contain" muted playsInline autoPlay />

      <CameraOverlays
        vehicle={vehicle}
        isPrimary={isPrimary}
        osd={osd}
        attitude={{ roll: attitude.roll, pitch: attitude.pitch }}
        frameCenter={frameCenter}
      />

      {showStats && health && status === 'live' && (
        <StreamHealthReadout health={health} />
      )}

      {status !== 'live' && (
        <div
          className={`absolute inset-0 flex flex-col items-center justify-center gap-2 text-center ${
            status === 'stalled' ? 'bg-black/75 backdrop-blur-sm' : 'bg-black/60'
          }`}
        >
          {status === 'starting' ? (
            <>
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/30 border-t-white/90" />
              <div className="text-xs text-white/80">{startup.phase ? t(PHASE_TEXT_KEY[startup.phase]) : t('camera:view.connectingTo', { label: source.label })}</div>
              {startup.seconds >= 3 && (
                <div className="max-w-[80%] text-[11px] tabular-nums text-white/50">
                  {startup.seconds} s{startup.phase === 'converting' ? ` · ${t('camera:view.h265Keyframe')}` : ''}
                </div>
              )}
            </>
          ) : status === 'stalled' ? (
            <>
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-500/30 border-t-amber-400" />
              <div className="text-sm font-semibold text-amber-300">{t('camera:view.stalled')}</div>
              <div className="max-w-[80%] text-[11px] text-white/60">
                {t('camera:view.stalledHint')}
              </div>
              <ReconnectButton sourceId={source.id} />
            </>
          ) : (
            <>
              <div className="text-sm text-red-300">{t('camera:view.noVideo')}</div>
              <ReconnectButton sourceId={source.id} />
              {/* The reason is the only diagnostic a field user can report, and
                  they report it by screenshot. Small grey text did not survive
                  that trip, so it is readable and selectable here. */}
              {error && (
                <div className="max-w-[90%] select-text rounded-md bg-black/60 px-3 py-2 text-center text-xs leading-snug text-white/90">
                  {error}
                </div>
              )}
              <div className="max-w-[80%] text-[11px] text-white/45">
                {source.kind === 'rtsp' || source.kind === 'mavlink'
                  ? `${source.url ?? t('camera:view.noUrl')} · ${source.rtspTransport ?? 'tcp'}`
                  : source.kind}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ReconnectButton({ sourceId }: { sourceId: string }) {
  const { t } = useTranslation();
  const requestReconnect = useCameraStore((s) => s.requestReconnect);
  return (
    <button
      onClick={() => requestReconnect(sourceId)}
      className="rounded-md border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium text-white hover:bg-white/20"
    >
      {t('camera:view.reconnectNow')}
    </button>
  );
}

const PHASE_TEXT_KEY: Record<CameraStartPhase, string> = {
  connecting: 'camera:view.phaseConnecting',
  'checking-video': 'camera:view.phaseChecking',
  converting: 'camera:view.phaseConverting',
  opening: 'camera:view.phaseOpening',
};

/** The main process's startup phase for this source, and seconds spent starting. */
function useStartupProgress(sourceId: string, starting: boolean): { phase: CameraStartPhase | null; seconds: number } {
  const [phase, setPhase] = useState<CameraStartPhase | null>(null);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const off = window.electronAPI?.onCameraStartPhase?.((e) => {
      if (e.sourceId === sourceId) setPhase(e.phase);
    });
    return () => { off?.(); };
  }, [sourceId]);

  useEffect(() => {
    setSeconds(0);
    if (!starting) {
      setPhase(null);
      return;
    }
    const t0 = Date.now();
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [starting]);

  return { phase, seconds };
}
