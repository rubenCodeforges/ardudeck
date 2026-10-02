import { useCallback, useEffect, useState } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { useNavigationStore } from '../../stores/navigation-store';
import { BwGuide } from '../radio-hud/BwGuide';
import type { EdgeTxScanResult, EdgeTxSdCard, EdgeTxPackageInfo, InstallProgress, InstalledPackageRecord, TelemetryScreenSummary } from '../../../shared/edgetx-types';

/**
 * Radio (EdgeTX) tab: installs curated SD-card packages (Yaapu telemetry,
 * etc.) onto an EdgeTX radio mounted in USB Storage mode. Pure file
 * management - no MAVLink connection involved.
 */
export function RadioSdView() {
  const { t } = useTranslation();
  const [scan, setScan] = useState<EdgeTxScanResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [selectedVolume, setSelectedVolume] = useState<string | null>(null);
  const [variantId, setVariantId] = useState('c480x320');
  const [variantTouched, setVariantTouched] = useState(false);
  const [busyPackageId, setBusyPackageId] = useState<string | null>(null);
  const [progress, setProgress] = useState<(InstallProgress & { packageId: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [screens, setScreens] = useState<TelemetryScreenSummary | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);

  const rescan = useCallback(async () => {
    setIsScanning(true);
    setError(null);
    try {
      const result = await window.electronAPI.edgetxScan();
      setScan(result);
      setSelectedVolume((prev) => {
        if (prev && result.cards.some((c) => c.volumePath === prev)) return prev;
        return result.cards[0]?.volumePath ?? null;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsScanning(false);
    }
  }, []);

  useEffect(() => {
    rescan();
    const cleanup = window.electronAPI.onEdgetxProgress?.((p) => setProgress(p));
    return cleanup;
  }, [rescan]);

  const card: EdgeTxSdCard | null = scan?.cards.find((c) => c.volumePath === selectedVolume) ?? null;
  const installed: Record<string, InstalledPackageRecord> = (card && scan?.installed[card.volumePath]) || {};
  const isBw = variantId.startsWith('bw');

  // The card's RADIO/radio.yml names the radio, so the screen variant is a
  // detection, not a question - until the user overrides it by hand.
  const suggestedVariantId = card?.suggestedVariantId ?? null;
  useEffect(() => {
    if (variantTouched || !suggestedVariantId) return;
    setVariantId(suggestedVariantId);
  }, [suggestedVariantId, variantTouched]);

  const handleInstall = async (pkg: EdgeTxPackageInfo) => {
    if (!card) return;
    setBusyPackageId(pkg.id);
    setProgress(null);
    setError(null);
    const result = await window.electronAPI.edgetxInstall(card.volumePath, pkg.id, variantId);
    if (!result.success) setError(result.error ?? t('firmware:radioSdView.installFailed'));
    setScreens(result.screens ?? null);
    setBusyPackageId(null);
    setProgress(null);
    await rescan();
  };

  const handleRemove = async (pkg: EdgeTxPackageInfo) => {
    if (!card) return;
    setBusyPackageId(pkg.id);
    setError(null);
    const result = await window.electronAPI.edgetxRemove(card.volumePath, pkg.id);
    if (!result.success) setError(result.error ?? t('firmware:radioSdView.removeFailed'));
    setBusyPackageId(null);
    await rescan();
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        {/* Detected radio card */}
        <div className="bg-surface-raised border border-subtle rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-content">{t('firmware:radioSdView.title')}</h3>
            <button
              onClick={rescan}
              disabled={isScanning}
              className="px-2.5 py-1 text-xs text-content-secondary hover:text-content bg-surface-input hover:bg-surface-raised border border-subtle rounded transition-colors disabled:opacity-50"
            >
              {isScanning ? t('common:scanning') : t('common:rescan')}
            </button>
          </div>

          {!card && (
            <div className="text-sm text-content-secondary space-y-2">
              <p>{t('firmware:radioSdView.noCard')}</p>
              <ol className="list-decimal list-inside space-y-1 text-xs">
                <li>{t('firmware:radioSdView.noCardStep1')}</li>
                <li><Trans i18nKey="firmware:radioSdView.noCardStep2" components={{ b: <span className="text-content" /> }} /></li>
                <li>{t('firmware:radioSdView.noCardStep3')}</li>
              </ol>
            </div>
          )}

          {card && (
            <div className="space-y-3">
              {scan!.cards.length > 1 && (
                <select
                  value={card.volumePath}
                  onChange={(e) => setSelectedVolume(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm bg-surface-input border border-subtle rounded text-content"
                >
                  {scan!.cards.map((c) => (
                    <option key={c.volumePath} value={c.volumePath}>{c.volumeName}</option>
                  ))}
                </select>
              )}
              <div className="flex items-center justify-between text-sm">
                <span className="text-content font-medium">
                  {card.radioLabel ?? card.volumeName}
                  {card.radioLabel && <span className="ml-2 text-xs text-content-secondary">{card.volumeName}</span>}
                </span>
                <span className="text-content-secondary text-xs">
                  {card.firmwareVersion ? `EdgeTX ${card.firmwareVersion}` : card.sdCardVersion ? `EdgeTX SD ${card.sdCardVersion}` : t('firmware:radioSdView.versionUnknown')}
                  {' · '}
                  {t('firmware:radioSdView.mbFree', { mb: (card.freeBytes / 1e6).toFixed(0) })}
                </span>
              </div>
              {card.firmwareVersion && card.sdCardVersion
                && card.firmwareVersion.slice(0, 4) !== card.sdCardVersion.slice(0, 4) && (
                <p className="text-[11px] text-amber-400">
                  {t('firmware:radioSdView.sdVersionMismatch', { sdVersion: card.sdCardVersion, fwVersion: card.firmwareVersion })}
                </p>
              )}
              <label className="block">
                <span className="text-xs text-content-secondary">
                  {t('firmware:radioSdView.radioScreen')}
                  {suggestedVariantId && !variantTouched && t('firmware:radioSdView.detectedFromCard')}
                </span>
                <select
                  value={variantId}
                  onChange={(e) => { setVariantTouched(true); setVariantId(e.target.value); }}
                  className="mt-1 w-full px-2 py-1.5 text-sm bg-surface-input border border-subtle rounded text-content"
                >
                  {(scan?.catalog[0]?.variants ?? []).map((v) => (
                    <option key={v.id} value={v.id}>{v.label} — {v.radios}</option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-sm text-red-400 flex items-start justify-between gap-3">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-300 hover:text-red-200 leading-none">×</button>
          </div>
        )}

        {/* Package catalog */}
        <div className="space-y-3">
          {(scan?.catalog ?? []).map((pkg) => {
            const record = installed[pkg.id];
            const busy = busyPackageId === pkg.id;
            const variantSupported = pkg.variants.some((v) => v.id === variantId);
            return (
              <div key={pkg.id} className="bg-surface-raised border border-subtle rounded-xl p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-medium text-content">{pkg.name}</h4>
                      {record && (
                        <span className="px-1.5 py-0.5 text-[10px] rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          {record.version} · {record.variantId}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-content-secondary">{pkg.description}</p>
                    <p className="mt-1 text-[10px] text-content-secondary">
                      <a href={pkg.homepage} target="_blank" rel="noreferrer" className="hover:text-content underline">{pkg.homepage.replace('https://github.com/', '')}</a>
                      {' · '}{pkg.license}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <button
                      onClick={() => handleInstall(pkg)}
                      disabled={!card || busy || !variantSupported}
                      data-tip={!variantSupported
                        ? t('firmware:radioSdView.notAvailableForScreen')
                        : record ? t('firmware:radioSdView.reinstallTip') : t('firmware:radioSdView.installTip')}
                      className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-surface-input disabled:text-content-secondary text-white rounded transition-colors"
                    >
                      {busy ? t('firmware:radioSdView.working') : record ? t('firmware:radioSdView.update') : t('common:install')}
                    </button>
                    {record && !busy && (
                      <button
                        onClick={() => handleRemove(pkg)}
                        data-tip={t('firmware:radioSdView.removeTip')}
                        className="px-3 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors"
                      >
                        {t('common:remove')}
                      </button>
                    )}
                  </div>
                </div>

                {pkg.id === 'ardudeck-hud' && record && (
                  <p className="mt-2 text-[11px] text-content-secondary">
                    <Trans
                      i18nKey="firmware:radioSdView.configureInHud"
                      components={{
                        link: (
                          <button
                            onClick={() => useNavigationStore.getState().setView('radio-hud')}
                            className="text-teal-400 hover:text-teal-300 underline"
                          />
                        ),
                      }}
                    />
                  </p>
                )}

                {busy && progress?.packageId === pkg.id && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-[10px] text-content-secondary mb-1">
                      <span>
                        {progress.phase === 'resolve' && t('firmware:radioSdView.phaseResolve')}
                        {progress.phase === 'download' && t('firmware:radioSdView.phaseDownload', { detail: progress.detail ?? '' })}
                        {progress.phase === 'extract' && t('firmware:radioSdView.phaseExtract')}
                        {progress.phase === 'copy' && t('firmware:radioSdView.phaseCopy')}
                        {progress.phase === 'done' && t('common:done')}
                      </span>
                      {progress.percent >= 0 && <span>{progress.percent}%</span>}
                    </div>
                    <div className="h-1.5 bg-surface-input rounded overflow-hidden">
                      <div
                        className={`h-full bg-blue-500 transition-all ${progress.percent < 0 ? 'w-1/3 animate-pulse' : ''}`}
                        style={progress.percent >= 0 ? { width: `${progress.percent}%` } : undefined}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {card && (
          isBw ? (
            <div className="text-[11px] text-content-secondary space-y-1">
              {screens ? (
                <>
                  <p className="text-content">
                    {t('firmware:radioSdView.screensSetUp', { count: screens.added + screens.already })}
                  </p>
                  <p><Trans i18nKey="firmware:radioSdView.ejectPressPage" components={{ b: <span className="text-content" /> }} /></p>
                  {screens.full.length > 0 && (
                    <p className="text-amber-400">
                      {t('firmware:radioSdView.noFreeScreen', { models: screens.full.join(', ') })}
                    </p>
                  )}
                </>
              ) : (
                <p>
                  <Trans i18nKey="firmware:radioSdView.bwInstallNote" components={{ b: <span className="text-content" /> }} />
                </p>
              )}
              <button
                onClick={() => setGuideOpen(true)}
                className="mt-1 text-teal-400 hover:text-teal-300 underline"
              >
                {t('firmware:radioSdView.readBwGuide')}
              </button>
            </div>
          ) : (
            <p className="text-[11px] text-content-secondary">
              {t('firmware:radioSdView.afterInstallNote')}
            </p>
          )
        )}
      </div>
      {guideOpen && <BwGuide onClose={() => setGuideOpen(false)} />}
    </div>
  );
}
