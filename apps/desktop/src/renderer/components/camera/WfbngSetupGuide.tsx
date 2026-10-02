/**
 * Guided setup for OpenIPC / RunCam WiFiLink (wfb-ng) video.
 *
 * Dongle-first: the end state is "plug the kit's WiFi dongle into this
 * computer, add the feed, done". The card shows the three things that make
 * that work (dongle, receiver component, pairing key) as live status chips
 * with one action each. A collapsed section covers the alternative - a
 * separate ground station forwarding video over the network.
 */

import { useCallback, useEffect, useState } from 'react';
import type { StreamDiagnosis } from '../../../shared/link-doctor-types';
import type { WfbngStatus } from '../../../shared/camera-types';
import { Trans, useTranslation } from 'react-i18next';

const CHANNELS = [36, 40, 44, 48, 52, 56, 60, 64, 100, 104, 108, 112, 116, 120, 124, 128, 132, 136, 140, 144, 149, 153, 157, 161, 165, 169, 173, 177];

export function WfbngSetupGuide({ port }: { port: number }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<WfbngStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [showNetwork, setShowNetwork] = useState(false);
  const [localIps, setLocalIps] = useState<string[]>([]);
  useEffect(() => {
    if (showNetwork && localIps.length === 0) {
      void window.electronAPI.wfbngLocalIps().then(setLocalIps);
    }
  }, [showNetwork, localIps.length]);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ diagnosis: StreamDiagnosis; sender: string | null } | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setChecking(true);
    try {
      setStatus(await window.electronAPI.wfbngStatus());
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const importKey = async () => {
    const r = await window.electronAPI.wfbngImportKey();
    if (r.imported) void refresh();
  };

  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);
  const installReceiver = async () => {
    setInstalling(true);
    setInstallError(null);
    try {
      const r = await window.electronAPI.wfbngInstall();
      if (!r.ok) setInstallError(r.error ?? t('camera:wfbng.downloadFailed'));
      void refresh();
    } finally {
      setInstalling(false);
    }
  };

  const setOption = async (opts: { channel?: number; bandwidth?: 20 | 40 }) => {
    await window.electronAPI.wfbngSetOptions(opts);
    void refresh();
  };

  const testPort = async () => {
    setTesting(true);
    setTestResult(null);
    setTestError(null);
    try {
      setTestResult(await window.electronAPI.linkDoctorProbeUdp(port));
    } catch (e) {
      setTestError(
        e instanceof Error && e.message.includes('EADDRINUSE')
          ? t('camera:wfbng.portBusy', { port })
          : e instanceof Error ? e.message : t('camera:wfbng.cannotListen'),
      );
    } finally {
      setTesting(false);
    }
  };

  const chip = (ok: boolean, okText: string, missingText: string, action?: React.ReactNode) => (
    <div className="flex items-center gap-1.5 text-[10px] leading-tight">
      <span className={`h-2 w-2 shrink-0 rounded-full ${ok ? 'bg-emerald-400' : 'bg-amber-400'}`} />
      <span className={ok ? 'text-content-secondary' : 'text-content'}>{ok ? okText : missingText}</span>
      {!ok && action}
    </div>
  );

  const ready = status?.dongleName && status.receiverInstalled && status.gsKeyImported;

  return (
    <div className="mt-1.5 space-y-1.5">
      <div className="rounded-lg border border-subtle bg-surface p-2 space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-medium text-content">{t('camera:wfbng.directReception')}</p>
          <button
            onClick={() => void refresh()}
            disabled={checking}
            className="text-[10px] text-content-secondary hover:text-content disabled:opacity-50"
            data-tip={t('camera:wfbng.recheckTip')}
          >
            {checking ? '...' : t('camera:wfbng.recheck')}
          </button>
        </div>

        {status && (
          <>
            {chip(
              status.dongleName !== null,
              t('camera:wfbng.dongleConnected', { name: status.dongleName }),
              t('camera:wfbng.plugDongle'),
            )}
            {status.driverNote && (
              <p className="pl-3.5 text-[9px] leading-tight text-content-tertiary">{status.driverNote}</p>
            )}
            {chip(
              status.receiverInstalled,
              t('camera:wfbng.receiverInstalled'),
              t('camera:wfbng.receiverMissing'),
              <button
                onClick={() => void installReceiver()}
                disabled={installing}
                className="rounded bg-surface-raised px-1.5 py-0.5 text-[10px] text-content hover:bg-surface-raised disabled:opacity-50"
              >
                {installing ? t('camera:wfbng.downloading') : t('common:install')}
              </button>,
            )}
            {installError && <p className="text-[10px] leading-tight text-red-400">{installError}</p>}
            {chip(
              status.gsKeyImported,
              t('camera:wfbng.keyImported'),
              t('camera:wfbng.keyMissing'),
              <button onClick={() => void importKey()} className="rounded bg-surface-raised px-1.5 py-0.5 text-[10px] text-content hover:bg-surface-raised">
                {t('camera:wfbng.importKey')}
              </button>,
            )}
            <div className="flex items-center gap-2 pt-0.5 text-[10px] text-content-secondary">
              <label className="flex items-center gap-1" data-tip={t('camera:wfbng.channelTip')}>
                {t('common:channel')}
                <select
                  value={status.channel}
                  onChange={(e) => void setOption({ channel: Number(e.target.value) })}
                  className="rounded bg-surface-input px-1 py-0.5 text-content"
                >
                  {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-1" data-tip={t('camera:wfbng.bwTip')}>
                {t('camera:wfbng.bw')}
                <select
                  value={status.bandwidth}
                  onChange={(e) => void setOption({ bandwidth: Number(e.target.value) as 20 | 40 })}
                  className="rounded bg-surface-input px-1 py-0.5 text-content"
                >
                  {/* i18n-exempt: units */}
                  <option value={20}>20 MHz</option>
                  {/* i18n-exempt: units */}
                  <option value={40}>40 MHz</option>
                </select>
              </label>
            </div>
            {ready && !status.running && (
              <p className="text-[10px] leading-tight text-emerald-400">
                {t('camera:wfbng.ready')}
              </p>
            )}
            {status.running && (
              <p className="text-[10px] leading-tight text-emerald-400">
                {status.stats ? t('camera:wfbng.receivingStats', { wifi: status.stats.wifi, rtp: status.stats.rtp }) : t('camera:wfbng.receiving')}
              </p>
            )}
          </>
        )}
        <p className="text-[9px] leading-tight text-content-tertiary" data-tip={t('camera:wfbng.keyTip')}>
          {t('camera:wfbng.keyNote')}
        </p>
      </div>

      <button
        onClick={() => setShowNetwork((v) => !v)}
        className="flex w-full items-center gap-1 text-[10px] text-content-secondary hover:text-content"
      >
        <span className={`transition-transform ${showNetwork ? 'rotate-90' : ''}`}>▸</span>
        {t('camera:wfbng.separateGs')}
      </button>
      {showNetwork && (
        <div className="space-y-1.5 pl-1">
          <p className="text-[10px] leading-tight text-content-secondary">
            <Trans i18nKey="camera:wfbng.separateGsHint" components={{ b: <span className="text-content" /> }} />
          </p>
          <div className="rounded bg-surface-raised p-1.5">
            <p className="text-[9px] font-medium uppercase tracking-wide text-content-tertiary">{t('camera:wfbng.otherMachine')}</p>
            <code className="mt-0.5 block whitespace-pre-wrap break-all text-[10px] text-content">
              {/* i18n-exempt: shell command */}
              {`ardudeck-wfb-rx --key gs.key --channel ${status?.channel ?? 161} --bandwidth ${status?.bandwidth ?? 20} --host ${localIps[0] ?? '<this-computer-ip>'}`}
            </code>
            {localIps.length > 0 ? (
              <p className="mt-0.5 text-[9px] text-content-tertiary">
                {t('camera:wfbng.localAddresses', { count: localIps.length, ips: localIps.join(', ') })}
              </p>
            ) : (
              <p className="mt-0.5 text-[9px] text-content-tertiary">{t('camera:wfbng.findingAddress')}</p>
            )}
          </div>
          <p className="text-[9px] leading-tight text-content-tertiary">
            {t('camera:wfbng.binaryNote')}
          </p>
          <button
            onClick={() => void testPort()}
            disabled={testing}
            className="w-full rounded bg-surface-raised px-2 py-1 text-[11px] text-content hover:bg-surface-raised disabled:opacity-50"
            data-tip={t('camera:wfbng.testTip')}
          >
            {testing ? t('camera:wfbng.listening') : t('camera:wfbng.testPort', { port })}
          </button>
          {testError && <p className="text-[10px] leading-tight text-red-400">{testError}</p>}
          {testResult && (testResult.diagnosis.protocol === 'rtp' || testResult.diagnosis.protocol === 'mpegts' ? (
            <p className="text-[10px] leading-tight text-emerald-400">
              {testResult.sender
                ? t('camera:wfbng.videoDetectedFrom', { sender: testResult.sender.split(':')[0] })
                : t('camera:wfbng.videoDetected')}
            </p>
          ) : testResult.diagnosis.protocol === 'silence' ? (
            <p className="text-[10px] leading-tight text-amber-300">
              {t('camera:wfbng.nothingOnPort', { port })}
            </p>
          ) : (
            <p className="text-[10px] leading-tight text-amber-300">{t('camera:wfbng.notVideo', { summary: testResult.diagnosis.summary })}</p>
          ))}
        </div>
      )}
    </div>
  );
}
