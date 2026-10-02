import { useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { useCanvasStream } from '../camera/useCanvasStream';
import { StreamPopover } from '../camera/StreamPopover';
import { SIM_STREAM_PATH } from '../../../shared/camera-types';

export function SimStreamControl({ canvasRef }: { canvasRef: RefObject<HTMLCanvasElement | null> }) {
  const { t } = useTranslation();
  const stream = useCanvasStream(canvasRef, SIM_STREAM_PATH);
  const [open, setOpen] = useState(false);
  const [installing, setInstalling] = useState(false);
  const live = stream.state === 'live';

  const install = async () => {
    setInstalling(true);
    try {
      await window.electronAPI.cameraEngineInstall();
      await stream.start();
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        data-tip={t('sim:streamControl.tip')}
        className={`flex items-center gap-1.5 rounded-lg border border-subtle px-3 py-1.5 text-xs font-medium shadow-lg transition-colors ${
          live ? 'bg-blue-600 text-white' : 'bg-surface-raised text-content-secondary hover:text-content'
        }`}
      >
        {live && <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />}
        {t('common:stream')}
      </button>
      {open && (
        <StreamPopover
          stream={stream}
          path={SIM_STREAM_PATH}
          installing={installing}
          onStart={() => void stream.start()}
          onStop={() => void stream.stop()}
          onInstall={() => void install()}
          onClose={() => setOpen(false)}
          className="top-9"
        />
      )}
    </div>
  );
}
