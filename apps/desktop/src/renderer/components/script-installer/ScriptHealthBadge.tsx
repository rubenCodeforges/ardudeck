/**
 * Persistent indicator that the FC-side ArduDeck Lua script is alive.
 *
 * Always visible when the advanced-commands feature flag is on - including
 * when no heartbeat has been seen. "No badge" used to be ambiguous
 * ("feature off? no FC? script crashed?"); now every state has its own
 * explicit pill so the operator always knows.
 *
 * States:
 *   - present: green pulsing - "Lua vN" - tooltip: version + age
 *   - stale:   amber - "Lua silent Ns" - script may have crashed
 *   - missing: gray - "Lua not detected" - either not installed or not running
 *
 * Click → diagnostic popover with details + a button to open the installer.
 */

import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useScriptHealth } from './useScriptHealth';
import { useSettingsStore } from '../../stores/settings-store';
import { useConnectionStore } from '../../stores/connection-store';
import { ScriptInstallModal } from './ScriptInstallModal';

export function ScriptHealthBadge() {
  const { t } = useTranslation();
  const advancedUnlocked = useSettingsStore(s => s.advancedCommandsUnlocked);
  const health = useScriptHealth();
  const isConnected = useConnectionStore(s => s.connectionState.isConnected);
  const isMavlink = useConnectionStore(s => s.connectionState.protocol === 'mavlink');
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [installerOpen, setInstallerOpen] = useState(false);

  if (!advancedUnlocked) return null;

  // Style + label per state
  let style: { pill: string; dot: string; label: string; pulse: boolean };
  if (health.status === 'present') {
    style = {
      pill: 'bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/15',
      dot: 'bg-emerald-400',
      label: t('script-installer:scriptHealthBadge.present', { version: Number(health.version).toFixed(1) }),
      pulse: true,
    };
  } else if (health.status === 'stale') {
    const ageSec = Math.round(health.ageMs / 1000);
    style = {
      pill: 'bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/15',
      dot: 'bg-amber-400',
      label: t('script-installer:scriptHealthBadge.silent', { seconds: ageSec }),
      pulse: false,
    };
  } else {
    style = {
      pill: 'bg-surface border-subtle hover:bg-surface-raised',
      dot: 'bg-content-tertiary',
      label: t('script-installer:scriptHealthBadge.notDetected'),
      pulse: false,
    };
  }

  return (
    <>
      <div className="relative">
        <button
          onClick={() => setPopoverOpen(o => !o)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-colors ${style.pill}`}
          title={t('script-installer:scriptHealthBadge.badgeTip')}
        >
          <span className="relative flex w-2 h-2">
            {style.pulse && (
              <span className={`absolute inline-flex w-full h-full rounded-full ${style.dot} opacity-75 animate-ping`} />
            )}
            <span className={`relative inline-flex rounded-full w-2 h-2 ${style.dot}`} />
          </span>
          <span className={`text-xs font-medium ${
            health.status === 'present' ? 'text-emerald-300'
            : health.status === 'stale' ? 'text-amber-300'
            : 'text-content-tertiary'
          }`}>
            {style.label}
          </span>
        </button>

        {popoverOpen && (
          <>
            {/* Backdrop to dismiss */}
            <div className="fixed inset-0 z-[1100]" onClick={() => setPopoverOpen(false)} />
            <div className="absolute top-full right-0 mt-2 w-80 z-[1200] bg-surface-solid border border-default rounded-xl shadow-2xl p-4 text-xs">
              <DiagnosticContent
                health={health}
                isConnected={isConnected}
                isMavlink={isMavlink}
                onOpenInstaller={() => { setPopoverOpen(false); setInstallerOpen(true); }}
              />
            </div>
          </>
        )}
      </div>

      <ScriptInstallModal open={installerOpen} onClose={() => setInstallerOpen(false)} />
    </>
  );
}

function DiagnosticContent({ health, isConnected, isMavlink, onOpenInstaller }: {
  health: ReturnType<typeof useScriptHealth>;
  isConnected: boolean;
  isMavlink: boolean;
  onOpenInstaller: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-content">{t('script-installer:scriptHealthBadge.title')}</div>
        <span className="px-1.5 py-0 text-[9px] font-bold tracking-wider rounded bg-rose-600/20 text-rose-400 border border-rose-600/40">
          {t('script-installer:scriptHealthBadge.experimental')}
        </span>
      </div>

      <Row label={t('common:connection')} value={isConnected ? (isMavlink ? 'MAVLink ✓' : t('script-installer:scriptHealthBadge.connectedNonMavlink')) : t('script-installer:scriptHealthBadge.notConnected')} />
      <Row label={t('script-installer:scriptHealthBadge.heartbeat')} value={
        health.status === 'present' ? t('script-installer:scriptHealthBadge.heartbeatPresent', { seconds: (health.ageMs / 1000).toFixed(1) })
        : health.status === 'stale' ? t('script-installer:scriptHealthBadge.heartbeatStale', { seconds: Math.round(health.ageMs / 1000) })
        : t('script-installer:scriptHealthBadge.heartbeatNever')
      } />
      {health.status !== 'missing' && (
        <Row label={t('common:version')} value={`v${Number(health.version).toFixed(1)}`} />
      )}

      <div className="border-t border-subtle pt-2 text-[11px] text-content-secondary leading-snug">
        {health.status === 'present' && (
          <p><span className="text-emerald-400">●</span> {t('script-installer:scriptHealthBadge.runningBody')}</p>
        )}
        {health.status === 'stale' && (
          <p><span className="text-amber-400">●</span> {t('script-installer:scriptHealthBadge.staleBody')}</p>
        )}
        {health.status === 'missing' && (
          <div className="space-y-2">
            <p><span className="text-content-tertiary">●</span> {t('script-installer:scriptHealthBadge.missingBody')}</p>
            <ul className="list-disc list-inside space-y-0.5 ml-1">
              <li>{t('script-installer:scriptHealthBadge.reasonNotInstalled')}</li>
              <li><Trans i18nKey="script-installer:scriptHealthBadge.reasonScrEnable" components={{ code: <code className="font-mono text-content" /> }} /></li>
              <li>{t('script-installer:scriptHealthBadge.reasonNoReboot')}</li>
              <li>{t('script-installer:scriptHealthBadge.reasonCrashed')}</li>
            </ul>
          </div>
        )}
      </div>

      {isConnected && isMavlink && (
        <button
          onClick={onOpenInstaller}
          className="w-full px-3 py-1.5 text-xs font-medium bg-purple-600/80 hover:bg-purple-600 text-white rounded transition-colors"
        >
          {t('script-installer:scriptHealthBadge.openInstaller')}
        </button>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-content-secondary">{label}</span>
      <span className="text-content font-mono text-[11px] truncate text-right">{value}</span>
    </div>
  );
}
