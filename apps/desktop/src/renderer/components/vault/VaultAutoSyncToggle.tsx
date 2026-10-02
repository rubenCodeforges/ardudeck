/**
 * Compact vault-backup indicator chip for save/write dialogs and headers.
 *
 * States:
 * - auto-sync on, vehicle identified:      green, "Backs up: <name>"
 * - auto-sync on, vehicle NOT identified:  amber warning; click opens the
 *   vault to pick/link the right vehicle (never silently guess where a
 *   deep-in-params save session is filed)
 * - auto-sync off:                         muted, "Backup off"; click enables
 * - no backup configured:                  muted, "Not backed up"; click opens the vault
 */
import { Github, AlertTriangle } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useFleetRepoStore, useCurrentVaultUnit } from '../../stores/fleet-repo-store';
import { useNavigationStore } from '../../stores/navigation-store';
import { useConnectionStore } from '../../stores/connection-store';
import { useCargoEnabled, VAULT_CARGO_SLUG } from '../../modules/capabilities';

export function VaultAutoSyncToggle({ savesLabel }: { savesLabel?: string }) {
  const { t } = useTranslation();
  const status = useFleetRepoStore((s) => s.status);
  const units = useFleetRepoStore((s) => s.units);
  const refresh = useFleetRepoStore((s) => s.refresh);
  const setView = useNavigationStore((s) => s.setView);
  const isConnected = useConnectionStore((s) => s.connectionState.isConnected);
  const currentUnit = useCurrentVaultUnit();
  const vaultEnabled = useCargoEnabled(VAULT_CARGO_SLUG);

  useEffect(() => {
    if (vaultEnabled && !status) refresh();
  }, [vaultEnabled, status, refresh]);

  if (!vaultEnabled) return null;

  const configured = (status?.github.connected ?? false) && Boolean(status?.github.repo);
  const on = configured && (status?.autoSync ?? false);

  // Identity confidence: only meaningful while connected with auto-sync armed
  const matchedUnit = currentUnit !== null
    && units.some((u) => u.uid === currentUnit.uid || (u.aliases?.includes(currentUnit.uid) ?? false));
  const identityUnknown = on && isConnected && currentUnit === null;
  const identityNew = on && isConnected && currentUnit !== null && !matchedUnit && units.length > 0;

  const openVault = () => {
    setView('vault');
    window.electronAPI?.navOpenView?.('vault');
  };

  const handleClick = async () => {
    if (!configured || identityUnknown || identityNew) {
      openVault();
      return;
    }
    await window.electronAPI?.fleetRepoSetAutoSync(!on);
    await refresh();
  };

  if (identityUnknown || identityNew) {
    return (
      <button
        onClick={handleClick}
        title={identityUnknown
          ? t('vault:vaultAutoSyncToggle.identityUnknownTip')
          : t('vault:vaultAutoSyncToggle.identityNewTip', { name: currentUnit?.name })}
        className="flex items-center gap-1.5 px-2 py-1 rounded-md border text-[10px] font-medium transition-colors border-amber-500/30 bg-amber-500/10 text-amber-500"
      >
        <AlertTriangle className="w-3 h-3" />
        {identityUnknown ? t('vault:vaultAutoSyncToggle.vehicleUnknown') : t('vault:vaultAutoSyncToggle.backsUpAsNew')}
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      title={
        !configured
          ? t('vault:vaultAutoSyncToggle.notConfiguredTip')
          : on
            ? t('vault:vaultAutoSyncToggle.onTip')
            : t('vault:vaultAutoSyncToggle.offTip')
      }
      className={`flex items-center gap-1.5 px-2 py-1 rounded-md border text-[10px] font-medium transition-colors ${
        on
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500'
          : 'border-subtle bg-surface-raised text-content-tertiary hover:text-content'
      }`}
    >
      <Github className="w-3 h-3" />
      {!configured
        ? t('vault:vaultAutoSyncToggle.notBackedUp')
        : on
          ? savesLabel ?? (currentUnit ? t('vault:vaultAutoSyncToggle.backsUpNamed', { name: currentUnit.name }) : t('vault:vaultAutoSyncToggle.backsUpAfterSave'))
          : t('vault:vaultAutoSyncToggle.backupOff')}
    </button>
  );
}
