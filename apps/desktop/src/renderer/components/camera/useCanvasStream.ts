/**
 * Publishes a rendered view to the media hub. Without `region` only the WebGL canvas is sent; with it, the
 * element is cropped out of the window's own capture, so DOM/SVG overlays such as the HUD are included.
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { cropRectFor } from './region-crop';
import { publishWhip, streamDownscale, MAX_STREAM_EDGE, type WhipSession } from './whip-publish';
import { IDLE_STREAM, type CanvasStreamSnapshot } from '../../../shared/camera-types';
import { t } from '../../../shared/i18n/index.js';

export type { CanvasStreamState, CanvasStreamSnapshot } from '../../../shared/camera-types';
export { IDLE_STREAM } from '../../../shared/camera-types';

export interface CanvasStream extends CanvasStreamSnapshot {
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

const STREAM_FPS = 30;
const STATUS_POLL_MS = 2000;

export function useCanvasStream(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  path: string,
  region: RefObject<HTMLElement | null> | null = null,
): CanvasStream {
  const [snap, setSnap] = useState<CanvasStreamSnapshot>(IDLE_STREAM);
  const sessionRef = useRef<WhipSession | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  /** Generation of the start in flight, or null. A cancelled start no longer blocks a new one. */
  const busyGenRef = useRef<number | null>(null);
  // Bumped by every teardown, so a start still in flight knows it was cancelled.
  const genRef = useRef(0);

  const teardown = useCallback(async () => {
    genRef.current += 1;
    const session = sessionRef.current;
    sessionRef.current = null;
    trackRef.current?.stop();
    trackRef.current = null;
    if (session) {
      await session.close();
      await window.electronAPI.canvasStreamStop(path).catch(() => {/* window closing */});
    }
  }, [path]);

  const fail = useCallback((error: string, needsInstall = false) => {
    setSnap({ ...IDLE_STREAM, state: 'error', error, needsInstall });
  }, []);

  const start = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || sessionRef.current || busyGenRef.current === genRef.current) return;
    const gen = genRef.current;
    busyGenRef.current = gen;
    const cancelled = () => genRef.current !== gen;
    setSnap({ ...IDLE_STREAM, state: 'starting' });
    try {
      // Capture before the hub round-trip: getDisplayMedia may need the click's user activation.
      const el = region?.current ?? null;
      const box = (el ?? canvas).getBoundingClientRect();
      if (box.width < 2 || box.height < 2) {
        fail(t('camera:stream.viewHidden'));
        return;
      }
      let track: MediaStreamTrack | undefined;
      try {
        track = el ? await captureRegion(el) : canvas.captureStream(STREAM_FPS).getVideoTracks()[0];
      } catch (err) {
        fail(t('camera:stream.captureFailed', { error: err instanceof Error ? err.message : String(err) }));
        return;
      }
      if (!track) {
        fail(t('camera:stream.capture3dFailed'));
        return;
      }
      if (cancelled()) {
        track.stop();
        return;
      }
      const prep = await window.electronAPI.canvasStreamStart(path);
      if (cancelled()) {
        track.stop();
        if (prep.ok) await window.electronAPI.canvasStreamStop(path);
        return;
      }
      if (!prep.ok || !prep.whipUrl) {
        track.stop();
        fail(prep.error ?? t('camera:stream.hubUnavailable'), prep.needsInstall === true);
        return;
      }
      trackRef.current = track;
      const rect = el?.getBoundingClientRect();
      try {
        const session = await publishWhip(track, prep.whipUrl, {
          scaleDown: rect && el
            ? streamDownscale(rect.width * regionCaptureScale(el), rect.height * regionCaptureScale(el))
            : streamDownscale(canvas.width, canvas.height),
          maxFramerate: STREAM_FPS,
        });
        if (cancelled()) {
          track.stop();
          trackRef.current = null;
          await session.close();
          await window.electronAPI.canvasStreamStop(path);
          return;
        }
        sessionRef.current = session;
        session.pc.addEventListener('connectionstatechange', () => {
          if (sessionRef.current !== session || session.pc.connectionState !== 'failed') return;
          void session.describe().then((why) => {
            console.error(`[stream] connection to the media hub failed: ${why}`);
            return teardown().then(() => fail(`Stream connection to the media hub failed (${why})`));
          });
        });
        setSnap({ ...IDLE_STREAM, state: 'live', rtspUrl: prep.rtspUrl ?? null, codec: session.codec });
      } catch (err) {
        await window.electronAPI.canvasStreamStop(path);
        trackRef.current?.stop();
        trackRef.current = null;
        fail(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (busyGenRef.current === gen) busyGenRef.current = null;
    }
  }, [canvasRef, path, region, fail, teardown]);

  // An error stays on screen until the next start; stopping only clears a stream that ran.
  const stop = useCallback(async () => {
    await teardown();
    setSnap((prev) => (prev.state === 'error' ? prev : IDLE_STREAM));
  }, [teardown]);

  useEffect(() => {
    if (snap.state !== 'live') return;
    let cancelled = false;
    const poll = async () => {
      const [s, stats] = await Promise.all([
        window.electronAPI.canvasStreamStatus(path).catch(() => null),
        sessionRef.current?.stats().catch(() => null) ?? null,
      ]);
      if (cancelled) return;
      setSnap((prev) => ({ ...prev, readers: s?.readers ?? prev.readers, stats: stats ?? prev.stats }));
    };
    void poll();
    const t = setInterval(poll, STATUS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [snap.state, path]);

  useEffect(() => () => { void teardown(); }, [teardown]);

  return { ...snap, start, stop };
}

/** Window capture scale so the cropped panel lands at or under MAX_STREAM_EDGE, never above device pixels. */
function regionCaptureScale(el: HTMLElement): number {
  const rect = el.getBoundingClientRect();
  const edge = Math.max(rect.width, rect.height, 1);
  return Math.min(window.devicePixelRatio, MAX_STREAM_EDGE / edge);
}

interface BreakoutWindow {
  MediaStreamTrackProcessor?: new (init: { track: MediaStreamTrack }) => { readable: ReadableStream<VideoFrame> };
  MediaStreamTrackGenerator?: new (init: { kind: 'video' }) => MediaStreamTrack & { writable: WritableStream<VideoFrame> };
}

/**
 * Captures the window and cuts each frame down to the element. Frames are re-wrapped
 * with a visibleRect, not copied. Chromium's own cropTo is not implemented in this build.
 */
async function captureRegion(el: HTMLElement): Promise<MediaStreamTrack> {
  const { MediaStreamTrackProcessor: Processor, MediaStreamTrackGenerator: Generator } = window as unknown as BreakoutWindow;
  if (!Processor || !Generator) throw new Error('frame cropping is not supported by this build'); // i18n-exempt: technical detail inside captureFailed
  // Unbounded, tab capture copies the whole window at device resolution every frame.
  const scale = regionCaptureScale(el);
  const video = {
    frameRate: STREAM_FPS,
    width: { max: Math.round(window.innerWidth * scale) },
    height: { max: Math.round(window.innerHeight * scale) },
  };
  const rect = el.getBoundingClientRect();
  const context = `window ${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio}x, panel ${Math.round(rect.width)}x${Math.round(rect.height)}, max ${video.width.max}x${video.height.max}`;
  let media: MediaStream;
  try {
    media = await withTimeout(
      navigator.mediaDevices.getDisplayMedia({ video, audio: false }),
      10_000,
      (late) => late.getTracks().forEach((t) => t.stop()),
    );
  } catch (err) {
    throw captureError('getDisplayMedia', err, context);
  }
  const source = media.getVideoTracks()[0];
  if (!source) throw new Error('no video track'); // i18n-exempt: technical detail inside captureFailed

  const reader = new Processor({ track: source }).readable.getReader();
  const out = new Generator({ kind: 'video' });
  const writer = out.writable.getWriter();
  let running = true;
  const stopOut = out.stop.bind(out);
  out.stop = () => {
    running = false;
    stopOut();
    source.stop();
    void reader.cancel().catch(() => {/* already closed */});
  };

  const counts = { read: 0, sent: 0, hidden: 0, rejected: 0, lastError: '', first: '' };
  let firstSent: () => void = () => {};
  const firstFrame = new Promise<void>((resolve) => { firstSent = resolve; });

  void (async () => {
    while (running) {
      const { value: frame, done } = await reader.read().catch(() => ({ value: undefined, done: true }));
      if (done || !frame) break;
      counts.read += 1;
      const box = el.getBoundingClientRect();
      const crop = cropRectFor(box, { width: window.innerWidth, height: window.innerHeight }, { width: frame.displayWidth, height: frame.displayHeight });
      if (!counts.first) {
        counts.first = `frame ${frame.format ?? '?'} ${frame.displayWidth}x${frame.displayHeight}, crop ${crop ? `${crop.x},${crop.y} ${crop.width}x${crop.height}` : 'none'}`;
      }
      if (!crop) {
        counts.hidden += 1;
        frame.close();
        continue;
      }
      let cropped: VideoFrame;
      try {
        cropped = new VideoFrame(frame, { visibleRect: crop });
      } catch (err) {
        counts.rejected += 1;
        counts.lastError = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        continue; // a crop the frame rejects (mid-resize); skip it rather than end the stream
      } finally {
        frame.close();
      }
      try {
        await writer.write(cropped);
        counts.sent += 1;
        if (counts.sent === 1) firstSent();
      } catch (err) {
        counts.lastError = err instanceof Error ? `write ${err.name}: ${err.message}` : String(err);
        cropped.close();
        break;
      }
    }
  })();

  // Without a frame the hub drops the publish ~2s after connecting, which only reads as a connection failure.
  const gotFrame = await Promise.race([firstFrame.then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), 3000))]);
  if (!gotFrame) {
    out.stop();
    const detail = `read ${counts.read}, sent ${counts.sent}, hidden ${counts.hidden}, rejected ${counts.rejected}${counts.first ? `, ${counts.first}` : ''}${counts.lastError ? `, last error ${counts.lastError}` : ''}`;
    throw captureError('crop', new Error(`no frames in 3s (${detail})`), context); // i18n-exempt: technical detail
  }

  return out;
}

function captureError(step: string, err: unknown, context: string): Error {
  const name = err instanceof Error ? err.name : 'Error';
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[stream] ${step} failed: ${name}: ${message} (${context})`, err);
  return new Error(`${step} ${name}: ${message} (${context})`);
}

/** Rejects after `ms`; a result that arrives later is handed to `discard` so nothing leaks. */
function withTimeout<T>(p: Promise<T>, ms: number, discard: (late: T) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      done = true;
      reject(new Error(`timed out after ${ms / 1000}s`)); // i18n-exempt: technical detail
    }, ms);
    p.then(
      (v) => {
        if (done) discard(v);
        else { done = true; clearTimeout(timer); resolve(v); }
      },
      (e) => {
        if (!done) { done = true; clearTimeout(timer); reject(e); }
      },
    );
  });
}
