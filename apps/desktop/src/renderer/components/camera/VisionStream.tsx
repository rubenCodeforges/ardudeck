import { useEffect, useMemo, useState, type RefObject } from 'react';
import { useCanvasStream } from './useCanvasStream';
import { StreamPopover } from './StreamPopover';
import { SyntheticVisionView } from './SyntheticVisionView';
import { useCameraStore } from '../../stores/camera-store';
import { useActiveVehicleStore } from '../../stores/active-vehicle-store';
import { useFleetVehicles } from '../../hooks/useFleet';
import {
  IDLE_STREAM,
  VISION_STREAM_PATH,
  type CanvasStreamSnapshot,
  type OsdLayers,
} from '../../../shared/camera-types';
import { useTranslation } from 'react-i18next';

const NO_OSD: OsdLayers = {
  cornerTelemetry: false,
  crosshair: false,
  northIndicator: false,
  frameCenterCoords: false,
  artificialHorizon: false,
  hud: false,
  waypoints: false,
};

/** The hidden stream window: the followed vehicle's synthetic view, edge to edge, publishing itself. */
export function VisionStreamWindow({ withHud = true }: { withHud?: boolean }) {
  const fleet = useFleetVehicles();
  const activeKey = useActiveVehicleStore((s) => s.activeVehicleKey);
  const lockedKey = useCameraStore((s) => s.lockedVehicleKey);
  const osd = useCameraStore((s) => s.osd);
  const targetKey = lockedKey ?? activeKey;
  const vehicle = useMemo(() => fleet.find((v) => v.key === targetKey) ?? null, [fleet, targetKey]);

  return (
    <div className="h-screen w-screen overflow-hidden bg-black">
      <SyntheticVisionView
        vehicle={vehicle}
        isPrimary
        osd={withHud ? osd : NO_OSD}
        streamSlot={({ canvasRef, containerRef }) => (
          <StreamWindowPublisher canvasRef={canvasRef} regionRef={withHud ? containerRef : null} />
        )}
      />
    </div>
  );
}

export function StreamWindowPublisher({ canvasRef, regionRef }: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  regionRef: RefObject<HTMLElement | null> | null;
}) {
  const stream = useCanvasStream(canvasRef, VISION_STREAM_PATH, regionRef);
  const { start, state, rtspUrl, codec, readers, error, needsInstall, stats } = stream;

  useEffect(() => {
    void start();
  }, [start]);

  useEffect(() => {
    void window.electronAPI.visionStreamReport({ state, rtspUrl, codec, readers, error, needsInstall, stats });
  }, [state, rtspUrl, codec, readers, error, needsInstall, stats]);

  return null;
}

/** Vision header control. The stream runs in its own window, so it is shared by every Vision panel. */
export function VisionStreamControl() {
  const { t } = useTranslation();
  const [snap, setSnap] = useState<CanvasStreamSnapshot>(IDLE_STREAM);
  const [withHud, setWithHud] = useState(true);
  const [open, setOpen] = useState(false);
  const [installing, setInstalling] = useState(false);
  const live = snap.state === 'live';

  useEffect(() => {
    void window.electronAPI.visionStreamGet().then(setSnap);
    const off = window.electronAPI.onVisionStreamChanged(setSnap);
    return () => { off(); };
  }, []);

  const start = (hud = withHud) => {
    void window.electronAPI.visionStreamOpen({ withHud: hud });
  };

  const changeHud = (hud: boolean) => {
    setWithHud(hud);
    if (snap.state === 'live' || snap.state === 'starting') start(hud);
  };

  const install = async () => {
    setInstalling(true);
    try {
      await window.electronAPI.cameraEngineInstall();
      start();
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div className="relative flex items-center" data-tour="vision-stream">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] hover:bg-surface-raised ${
          live ? 'text-emerald-300' : 'text-content-secondary'
        }`}
        data-tip={t('camera:visionStream.tip')}
      >
        {live && <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />}
        {t('common:stream')}
      </button>
      {open && (
        <StreamPopover
          stream={snap}
          path={VISION_STREAM_PATH}
          installing={installing}
          onStart={() => start()}
          onStop={() => void window.electronAPI.visionStreamClose()}
          onInstall={() => void install()}
          onClose={() => setOpen(false)}
          className="top-7"
          hud={{ value: withHud, onChange: changeHud }}
        />
      )}
    </div>
  );
}
