/**
 * The layer behind an OSD preview. Priority:
 *  1. An explicit solid preview colour (BG picker) — user override.
 *  2. The live video feed, when one is configured for the target vehicle. This
 *     is the SAME source config the telemetry Vision panel uses (shared via the
 *     `ardudeck-camera` store), so configuring here shows up there and vice
 *     versa — the OSD is previewed over exactly what will be under it in flight.
 *  3. The synthetic FPV scene gradient + a "Configure video feed" affordance
 *     when nothing is set up.
 *
 * A default (unset) OSD background is the sentinel `rgba…` string; any other
 * value is a colour the user explicitly picked and wins over the feed.
 */

import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Video } from 'lucide-react';
import type { CameraSourceConfig } from '../../../shared/camera-types';
import { useActiveVehicleStore } from '../../stores/active-vehicle-store';
import { useCameraStore, osdBackdropSource } from '../../stores/camera-store';
import { useCameraStream } from '../camera/useCameraStream';
import { CameraSourceMenu } from '../camera/CameraSourceMenu';
import { FPV_SCENE_BG } from '../../utils/osd/osd-scene';

interface OsdVideoBackdropProps {
  /** OSD-store background value; `rgba…` = default/unset, anything else = picked colour. */
  backgroundColor: string;
  className?: string;
}

export function OsdVideoBackdrop({ backgroundColor, className = '' }: OsdVideoBackdropProps) {
  const { t } = useTranslation();
  const activeVehicleKey = useActiveVehicleStore((s) => s.activeVehicleKey);
  const lockedVehicleKey = useCameraStore((s) => s.lockedVehicleKey);
  const targetKey = lockedVehicleKey ?? activeVehicleKey;
  const source = useCameraStore((s) => osdBackdropSource(s, targetKey));
  const [showConfig, setShowConfig] = useState(false);

  // A picked colour overrides scene/video (matches the analog-feed mental model).
  if (!backgroundColor.startsWith('rgba')) {
    return <div className={className} style={{ background: backgroundColor }} />;
  }

  if (source) {
    return (
      <div className={`${className} bg-black`}>
        <OsdFeedVideo source={source} />
      </div>
    );
  }

  return (
    <div className={className} style={{ background: FPV_SCENE_BG }}>
      {/* z-30 floats the button above the OSD editor layers (which are z-10/z-20);
          pointer-events-none on the wrapper keeps the rest of the stage editable. */}
      <div className="pointer-events-none absolute inset-0 z-30 flex items-end justify-center pb-3">
        <button
          onClick={() => setShowConfig(true)}
          className="pointer-events-auto flex items-center gap-1.5 rounded-md border border-white/25 bg-black/40 px-3 py-1.5 text-[11px] font-medium text-white/90 backdrop-blur-sm transition-colors hover:bg-black/60"
          data-tip={t('osd:osdVideoBackdrop.configureTip')}
        >
          <Video className="h-3.5 w-3.5" />
          {t('osd:osdVideoBackdrop.configure')}
        </button>
      </div>
      {showConfig && <CameraSourceMenu vehicleKey={targetKey} onClose={() => setShowConfig(false)} />}
    </div>
  );
}

/** Bare live-feed video (no camera-panel overlays — the OSD draws its own). */
function OsdFeedVideo({ source }: { source: CameraSourceConfig }) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const { status, error } = useCameraStream(source, videoRef);
  return (
    <>
      <video ref={videoRef} className="h-full w-full object-cover" muted playsInline autoPlay />
      {status !== 'live' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50 text-center">
          {status === 'starting' ? (
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white/90" />
          ) : status === 'stalled' ? (
            <div className="max-w-[80%] text-[11px] text-amber-300">{t('osd:osdVideoBackdrop.stalled')}</div>
          ) : (
            <div className="max-w-[80%] text-[11px] text-red-300">{t('osd:osdVideoBackdrop.noVideo', { error })}</div>
          )}
        </div>
      )}
    </>
  );
}
