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
import { createStallTracker, nextRetryDelayMs, FIRST_FRAME_TIMEOUT_MS, RECONNECT_MS, RECHECK_SESSION_EVERY } from './stream-stall';
import { sampleFromReport, healthBetween, type StreamHealth, type StreamSample } from './stream-health';
import { t } from '../../../shared/i18n/index.js';

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
  onLive?: () => void,
  onSignalLost?: () => void,
): { status: CameraStreamStatus; error: string | null; health: StreamHealth | null } {
  const [status, setStatus] = useState<CameraStreamStatus>('starting');
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<StreamHealth | null>(null);
  const [restartNonce, setRestartNonce] = useState(0);
  const retryAttemptRef = useRef(0);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const onLiveRef = useRef(onLive);
  onLiveRef.current = onLive;
  const onSignalLostRef = useRef(onSignalLost);
  onSignalLostRef.current = onSignalLost;
  const advertisedUri = useCameraStore((s) => s.videoStreams[source.vehicleKey]?.uri);
  const reconnectRequest = useCameraStore((s) => s.reconnectRequests[source.id] ?? 0);
  // A manual reconnect starts fresh: no inherited backoff.
  useEffect(() => { retryAttemptRef.current = 0; }, [reconnectRequest]);

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
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let firstFrameTimer: ReturnType<typeof setTimeout> | null = null;
    let tracker = createStallTracker();
    let whepUrl: string | null = null;
    let reconnectAttempts = 0;
    const resolved = resolveStreamUrl(source, advertisedUri);

    const scheduleRestart = (immediate = false) => {
      if (cancelled || retryTimer) return;
      const delay = immediate ? 0 : nextRetryDelayMs(retryAttemptRef.current++);
      retryTimer = setTimeout(() => {
        if (!cancelled) setRestartNonce((n) => n + 1);
      }, delay);
    };

    // Errors retry on the same backoff as stalls: a camera powered on later, or a URL
    // that only now resolves, must come up without the user toggling anything.
    const fail = (msg: string) => {
      if (cancelled) return;
      setStatus('error');
      setError(msg);
      onErrorRef.current?.(msg);
      scheduleRestart();
    };

    /** Stop playing without touching the hub session, so a returning signal is picked up where it was. */
    const dropPlayback = () => {
      const video = videoRef.current;
      if (rvfcHandle !== null && video) video.cancelVideoFrameCallback(rvfcHandle);
      rvfcHandle = null;
      if (stallInterval) clearInterval(stallInterval);
      if (statsInterval) clearInterval(statsInterval);
      if (firstFrameTimer) clearTimeout(firstFrameTimer);
      stallInterval = statsInterval = firstFrameTimer = null;
      lastSample = null;
      if (pc) pc.close();
      pc = null;
      tracker = createStallTracker();
    };

    const scheduleReconnect = () => {
      if (cancelled || reconnectTimer) return;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        void reconnect();
      }, RECONNECT_MS);
    };

    const onDeviceChange = () => {
      // Dongle re-enumerated: skip the backoff, try right now.
      if (stalled) {
        if (retryTimer) clearTimeout(retryTimer);
        retryTimer = null;
        scheduleRestart(true);
      }
    };

    // A digital link dropping out at range is flight information, not a failure: say so,
    // keep the hub pipeline up, and reconnect only the playback until frames return.
    const enterStalled = () => {
      if (cancelled || stalled) return;
      stalled = true;
      setStatus('stalled');
      setError(null);
      onSignalLostRef.current?.();
      if (source.kind === 'uvc') {
        scheduleRestart();
        return;
      }
      dropPlayback();
      reconnectAttempts = 0;
      scheduleReconnect();
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

    // Live means a frame was shown, not that signalling succeeded: a connection that
    // never carries video used to sit on a black "live" view with no error.
    const watchFrames = (video: HTMLVideoElement) => {
      const frames = tracker;
      firstFrameTimer = setTimeout(() => {
        if (cancelled || frames.hasFrames()) return;
        if (stalled) {
          dropPlayback();
          scheduleReconnect();
        } else {
          fail(t('camera:stream.noVideoArrived'));
        }
      }, FIRST_FRAME_TIMEOUT_MS);
      const loop = (): void => {
        rvfcHandle = video.requestVideoFrameCallback(() => {
          if (cancelled || frames !== tracker) return;
          if (!frames.hasFrames()) {
            if (firstFrameTimer) clearTimeout(firstFrameTimer);
            stalled = false;
            setStatus('live');
            onLiveRef.current?.();
          }
          frames.onFrame(Date.now());
          retryAttemptRef.current = 0;
          loop();
        });
      };
      loop();
      stallInterval = setInterval(() => {
        if (tracker.isStalled(Date.now())) enterStalled();
      }, 1000);
    };

    const startPlayback = async (video: HTMLVideoElement, url: string) => {
      const connection = await playWhep(video, url);
      if (cancelled) { connection.close(); return; }
      pc = connection;
      // The hub ends the session when its publisher goes away; that is a dropout, not 3 s of waiting.
      connection.addEventListener('connectionstatechange', () => {
        if (pc === connection && connection.connectionState === 'failed') enterStalled();
      });
      watchFrames(video);
      watchHealth(connection);
    };

    async function reconnect() {
      const video = videoRef.current;
      if (cancelled || !stalled || !video) return;
      reconnectAttempts += 1;
      try {
        if (!whepUrl || reconnectAttempts % RECHECK_SESSION_EVERY === 0) {
          const result = await window.electronAPI.cameraStart(source, resolved);
          if (cancelled) return;
          if (result.ok && result.session?.playback.kind === 'webrtc') whepUrl = result.session.playback.whepUrl;
        }
        if (!whepUrl) throw new Error('no playback url yet'); // i18n-exempt: internal, caught by the retry loop
        await startPlayback(video, whepUrl);
      } catch {
        if (!cancelled) scheduleReconnect();
      }
    }

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
          watchFrames(video);
          return;
        }

        const result = await window.electronAPI.cameraStart(source, resolved);
        if (cancelled) return;
        if (!result.ok || !result.session) {
          fail(result.error ?? t('camera:stream.failed'));
          return;
        }
        const playback = result.session.playback;
        if (playback.kind === 'webrtc') {
          whepUrl = playback.whepUrl;
          await startPlayback(video, playback.whepUrl);
        } else if (playback.kind === 'uvc') {
          fail(t('camera:stream.unexpectedDescriptor'));
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
        fail(e instanceof Error ? e.message : t('camera:stream.playbackError'));
      }
    }
    navigator.mediaDevices?.addEventListener?.('devicechange', onDeviceChange);
    void go();

    return () => {
      cancelled = true;
      navigator.mediaDevices?.removeEventListener?.('devicechange', onDeviceChange);
      if (retryTimer) clearTimeout(retryTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      dropPlayback();
      if (uvcStream) uvcStream.getTracks().forEach((t) => t.stop());
      if (source.kind !== 'uvc') void window.electronAPI.cameraStop(source.id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source.id, source.kind, source.url, source.deviceId, source.rtspTransport, advertisedUri, restartNonce, reconnectRequest]);

  return { status, error, health };
}
