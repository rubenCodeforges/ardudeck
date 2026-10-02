import { useEffect, useState } from 'react';
import { Rocket, Plug, X, AlertTriangle, Download } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import { useArduPilotSitlStore } from '../../stores/ardupilot-sitl-store';
import { useSitlStore } from '../../stores/sitl-store';
import { useConnectionStore } from '../../stores/connection-store';
import type { FeatureTour } from '../../feature-tours';

interface TourLaunchGateProps {
  tour: FeatureTour;
  onLaunched: () => void;
  onUseOwnFc: () => void;
  onInstallSitl: () => void;
  onCancel: () => void;
}

type LaunchStatus = 'idle' | 'starting-sitl' | 'connecting' | 'error';

export function TourLaunchGate({ tour, onLaunched, onUseOwnFc, onInstallSitl, onCancel }: TourLaunchGateProps) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<LaunchStatus>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const sitlKind = tour.demo?.sitl ?? 'ardupilot';
  const sitlLabel = sitlKind === 'ardupilot' ? 'ArduPilot SITL' : 'iNav SITL';

  // For ArduPilot, check whether the binary has been downloaded yet.
  // iNav SITL ships bundled so it's always available.
  const apBinaryInfo = useArduPilotSitlStore((s) => s.binaryInfo);
  const apCheckBinary = useArduPilotSitlStore((s) => s.checkBinary);
  const apPlatformSupported = useArduPilotSitlStore((s) => s.platformSupported);
  const apPlatformError = useArduPilotSitlStore((s) => s.platformError);
  const apCheckPlatform = useArduPilotSitlStore((s) => s.checkPlatform);

  useEffect(() => {
    if (sitlKind !== 'ardupilot') return;
    apCheckPlatform();
    apCheckBinary();
  }, [sitlKind, apCheckPlatform, apCheckBinary]);

  const needsApInstall = sitlKind === 'ardupilot' && apBinaryInfo !== null && apBinaryInfo.exists === false;
  const apUnsupportedPlatform = sitlKind === 'ardupilot' && apPlatformSupported === false;

  const handleLaunchSitl = async () => {
    setErrorMsg(null);
    setStatus('starting-sitl');

    try {
      const started =
        sitlKind === 'ardupilot'
          ? await useArduPilotSitlStore.getState().start()
          : await useSitlStore.getState().startSitl();
      if (!started) {
        const err =
          sitlKind === 'ardupilot'
            ? useArduPilotSitlStore.getState().lastError
            : useSitlStore.getState().lastError;
        throw new Error(err ?? t('tours:tourLaunchGate.failedToStartSitl'));
      }

      setStatus('connecting');
      await new Promise((r) => setTimeout(r, 1200));

      const connectOk = await useConnectionStore.getState().connect({
        type: 'tcp',
        host: '127.0.0.1',
        tcpPort: 5760,
        protocol: 'mavlink',
      });
      if (!connectOk) {
        throw new Error(t('tours:tourLaunchGate.tcpConnectionFailed'));
      }

      onLaunched();
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('common:unknownError');
      setErrorMsg(msg);
      setStatus('error');
    }
  };

  const busy = status === 'starting-sitl' || status === 'connecting';
  const canLaunch = !needsApInstall && !apUnsupportedPlatform;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70">
      <div
        className="w-full max-w-md mx-4 rounded-xl overflow-hidden shadow-2xl"
        style={{
          background: 'var(--bg-tooltip)',
          border: '1px solid var(--border-default)',
        }}
      >
        <div className="h-0.5 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
        <div className="px-6 py-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'rgb(37 99 235)' }}>
                {t('tours:tourLaunchGate.needsVehicle')}
              </div>
              <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                {t(tour.titleKey)}
              </h2>
            </div>
            <button
              onClick={onCancel}
              disabled={busy}
              className="p-1 rounded-md transition-colors disabled:opacity-40"
              style={{ color: 'var(--text-tertiary)' }}
              aria-label={t('common:cancel')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-xs leading-relaxed mb-4" style={{ color: 'var(--text-secondary)' }}>
            <Trans
              i18nKey="tours:tourLaunchGate.intro"
              values={{ sitl: sitlLabel }}
              components={{ b: <span className="font-semibold" style={{ color: 'var(--text-primary)' }} /> }}
            />
          </p>

          {errorMsg && (
            <div
              className="mb-4 px-3 py-2 rounded-md flex items-start gap-2 text-xs"
              style={{
                background: 'rgb(239 68 68 / 0.1)',
                border: '1px solid rgb(239 68 68 / 0.35)',
                color: 'rgb(248 113 113)',
              }}
            >
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {apUnsupportedPlatform && (
            <div
              className="mb-4 px-3 py-2 rounded-md flex items-start gap-2 text-xs"
              style={{
                background: 'rgb(234 179 8 / 0.1)',
                border: '1px solid rgb(234 179 8 / 0.35)',
                color: 'rgb(250 204 21)',
              }}
            >
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                {apPlatformError ?? t('tours:tourLaunchGate.apNotSupported')}{' '}
                {t('tours:tourLaunchGate.connectOwnToContinue')}
              </span>
            </div>
          )}

          {needsApInstall && !apUnsupportedPlatform && (
            <div
              className="mb-4 px-3 py-2 rounded-md flex items-start gap-2 text-xs"
              style={{
                background: 'rgb(37 99 235 / 0.1)',
                border: '1px solid rgb(37 99 235 / 0.35)',
                color: 'rgb(96 165 250)',
              }}
            >
              <Download className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                {t('tours:tourLaunchGate.apNotInstalled')}
              </span>
            </div>
          )}

          <div className="flex flex-col gap-2">
            {needsApInstall && !apUnsupportedPlatform ? (
              <button
                onClick={onInstallSitl}
                className="w-full px-4 py-2.5 rounded-md text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
                style={{ background: 'rgb(37 99 235)', color: '#fff' }}
              >
                <Download className="w-4 h-4" />
                {t('tours:tourLaunchGate.goToSitlInstall')}
              </button>
            ) : (
              <button
                onClick={handleLaunchSitl}
                disabled={busy || !canLaunch}
                className="w-full px-4 py-2.5 rounded-md text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ background: 'rgb(37 99 235)', color: '#fff' }}
              >
                <Rocket className="w-4 h-4" />
                {status === 'starting-sitl'
                  ? t('tours:tourLaunchGate.startingSitl')
                  : status === 'connecting'
                    ? t('common:connecting')
                    : t('tours:tourLaunchGate.launch', { sitl: sitlLabel })}
              </button>
            )}
            <button
              onClick={onUseOwnFc}
              disabled={busy}
              className="w-full px-4 py-2.5 rounded-md text-xs font-medium inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              style={{
                background: 'transparent',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-default)',
              }}
            >
              <Plug className="w-3.5 h-3.5" />
              {t('tours:tourLaunchGate.connectOwnFc')}
            </button>
            <button
              onClick={onCancel}
              disabled={busy}
              className="w-full px-4 py-1.5 text-xs transition-colors disabled:opacity-50"
              style={{ color: 'var(--text-tertiary)' }}
            >
              {t('tours:tourLaunchGate.notNow')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
