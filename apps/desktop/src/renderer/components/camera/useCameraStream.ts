/**
 * Owns the playback lifecycle for one camera source and drives a <video>.
 *
 * Playback paths (identical to what the telemetry camera panel uses, so the OSD
 * tool and the panel render the exact same feed):
 *  - uvc      -> getUserMedia(deviceId), played locally (no engine)
 *  - webrtc/* -> main media engine returns a WHEP url; played over WebRTC
 * The engine normalizes rtsp/rtp/srt/rubyfpv into WHEP, so the renderer only
 * ever speaks getUserMedia or WHEP.
 */

import { useEffect, useRef, useState, type RefObject } from 'react';
import type { CameraSourceConfig } from '../../../shared/camera-types';
import { useCameraStore } from '../../stores/camera-store';
import { playWhep } from './whep';
import { createStallTracker, nextRetryDelayMs } from './stream-stall';
import { sampleFromReport, healthBetween, type StreamHealth, type StreamSample } from './stream-health';

export type CameraStreamStatus = 'starting' | 'live' | 'stalled' | 'error';

/** The scheme each engine-backed source kind speaks, for a bare host:port URL. */
const DEFAULT_SCHEME: Partial<Record<CameraSourceConfig['kind'], string>> = {
  rtsp: 'rtsp://',
  // A vehicle advertising a bare address means RTSP in practice.
  mavlink: 'rtsp://',
  srt: 'srt://',
  'rtp-udp': 'udp://',
  rubyfpv: 'udp://',
  wfbng: 'udp://',
};

/**
 * Add the scheme when the operator typed a bare `host:port/path`.
 *
 * Every other GCS accepts that, and the hub does not: it answers with a flat
 * "Hub rejected the source path", which reads as a broken camera rather than a
 * missing six characters.
 */
export function withScheme(kind: CameraSourceConfig['kind'], url: string): string {
  const trimmed = url.trim();
  if (trimmed === '' || /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
  const scheme = DEFAULT_SCHEME[kind];
  return scheme ? `${scheme}${trimmed}` : trimmed;
}

/** The stream URL to hand the engine: mavlink resolves to the advertised URI. */
export function resolveStreamUrl(
  source: CameraSourceConfig,
  advertisedUri: string | undefined,
): string | undefined {
  const raw = source.kind === 'mavlink' ? advertisedUri : source.url;
  return raw === undefined ? undefined : withScheme(source.kind, raw);
}

/**
 * Starts/stops the feed for `source` against `videoRef` and reports status.
 * Restarts only when a stream-relevant field changes — editing the label, HFOV
 * or low-latency flag must NOT tear down a live feed. Stalled feeds (frames
 * stopped) reacquire themselves on a backoff; 'stalled' status means the view
 * must stop presenting the frozen last frame as live.
 */
export function useCameraStream(
  source: CameraSourceConfig,
  videoRef: RefObject<HTMLVideoElement>,
  onError?: (error: string) => void,
): { status: CameraStreamStatus; error: string | null; health: StreamHealth | null } {
  const [status, setStatus] = useState<CameraStreamStatus>('starting');
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<StreamHealth | null>(null);
  const [restartNonce, setRestartNonce] = useState(0);
  const retryAttemptRef = useRef(0);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const advertisedUri = useCameraStore((s) => s.videoStreams[source.vehicleKey]?.uri);

  useEffect(() => {
    let pc: RTCPeerConnection | null = null;
    let uvcStream: MediaStream | null = null;
    let cancelled = false;
    let stalled = false;
    let rvfcHandle: number | null = null;
    let stallInterval: ReturnType<typeof setInterval> | null = null;
    let statsInterval: ReturnType<typeof setInterval> | null = null;
    let lastSample: StreamSample | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const tracker = createStallTracker();

    const fail = (msg: string) => {
      setStatus('error');
      setError(msg);
      onErrorRef.current?.(msg);
    };

    const scheduleRestart = (immediate = false) => {
      if (cancelled || retryTimer) return;
      const delay = immediate ? 0 : nextRetryDelayMs(retryAttemptRef.current++);
      retryTimer = setTimeout(() => {
        if (!cancelled) setRestartNonce((n) => n + 1);
      }, delay);
    };

    const onDeviceChange = () => {
      // Dongle re-enumerated: skip the backoff, try right now.
      if (stalled) {
        if (retryTimer) clearTimeout(retryTimer);
        retryTimer = null;
        scheduleRestart(true);
      }
    };

    const enterStalled = () => {
      if (cancelled || stalled) return;
      stalled = true;
      setStatus('stalled');
      setError(null);
      scheduleRestart();
    };

    // The receiver counts loss, freezes and decode drops already. Sampling it
    // once a second is what turns "it looks like it is degrading" into a number.
    const watchHealth = (connection: RTCPeerConnection) => {
      statsInterval = setInterval(() => {
        void connection.getStats().then((report) => {
          if (cancelled) return;
          const sample = sampleFromReport(report, Date.now());
          if (!sample) return;
          if (lastSample) {
            const next = healthBetween(lastSample, sample);
            if (next) setHealth(next);
          }
          lastSample = sample;
        }).catch(() => { /* connection closing: the interval is about to go */ });
      }, 1000);
    };

    const watchFrames = (video: HTMLVideoElement) => {
      const loop = (): void => {
        rvfcHandle = video.requestVideoFrameCallback(() => {
          tracker.onFrame(Date.now());
          if (!cancelled && !stalled) {
            retryAttemptRef.current = 0;
            loop();
          }
        });
      };
      loop();
      stallInterval = setInterval(() => {
        if (tracker.isStalled(Date.now())) enterStalled();
      }, 1000);
    };

    async function go() {
      setStatus('starting');
      setError(null);
      const video = videoRef.current;
      if (!video) return;
      try {
        if (source.kind === 'uvc') {
          uvcStream = await navigator.mediaDevices.getUserMedia({
            video: source.deviceId ? { deviceId: { exact: source.deviceId } } : true,
            audio: false,
          });
          if (cancelled) { uvcStream.getTracks().forEach((t) => t.stop()); return; }
          const track = uvcStream.getVideoTracks()[0];
          if (track) {
            track.addEventListener('ended', enterStalled);
            track.addEventListener('mute', enterStalled);
          }
          video.srcObject = uvcStream;
          await video.play().catch(() => {});
          if (cancelled) return;
          setStatus('live');
          watchFrames(video);
          return;
        }

        const resolved = resolveStreamUrl(source, advertisedUri);
        const result = await window.electronAPI.cameraStart(source, resolved);
        if (cancelled) return;
        if (!result.ok || !result.session) {
          fail(result.error ?? 'Stream failed');
          return;
        }
        const playback = result.session.playback;
        if (playback.kind === 'webrtc') {
          pc = await playWhep(video, playback.whepUrl);
          if (cancelled) { pc.close(); return; }
          setStatus('live');
          watchFrames(video);
          watchHealth(pc);
        } else if (playback.kind === 'uvc') {
          fail('Unexpected playback descriptor');
        }
      } catch (e) {
        if (cancelled) return;
        // Acquisition failed while recovering from a stall (device still gone):
        // stay in 'stalled' and keep retrying rather than parking on an error.
        if (retryAttemptRef.current > 0 && source.kind === 'uvc') {
          setStatus('stalled');
          scheduleRestart();
          return;
        }
        fail(e instanceof Error ? e.message : 'Playback error');
      }
    }
    navigator.mediaDevices?.addEventListener?.('devicechange', onDeviceChange);
    void go();

    return () => {
      cancelled = true;
      navigator.mediaDevices?.removeEventListener?.('devicechange', onDeviceChange);
      if (retryTimer) clearTimeout(retryTimer);
      if (stallInterval) clearInterval(stallInterval);
      if (statsInterval) clearInterval(statsInterval);
      const video = videoRef.current;
      if (rvfcHandle !== null && video) video.cancelVideoFrameCallback(rvfcHandle);
      if (pc) pc.close();
      if (uvcStream) uvcStream.getTracks().forEach((t) => t.stop());
      if (source.kind !== 'uvc') void window.electronAPI.cameraStop(source.id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source.id, source.kind, source.url, source.deviceId, source.rtspTransport, advertisedUri, restartNonce]);

  return { status, error, health };
}
