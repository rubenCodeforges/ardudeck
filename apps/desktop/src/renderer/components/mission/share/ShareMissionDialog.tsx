import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Share2, X } from 'lucide-react';
import { useMissionStore } from '../../../stores/mission-store';
import { useFenceStore } from '../../../stores/fence-store';
import { useRallyStore } from '../../../stores/rally-store';
import { useSettingsStore } from '../../../stores/settings-store';
import { useMissionLibraryStore } from '../../../stores/mission-library-store';
import { useCargoEnabled, VAULT_CARGO_SLUG } from '../../../modules/capabilities';
import { buildMissionPackage, type ShareContents } from '../../../utils/mission-share';
import { ui } from '../../ui/ui-hooks';

type Destination = 'site' | 'file';

const INPUT = 'w-full px-3 py-2 bg-surface-input border border-subtle rounded-lg text-content placeholder-content-tertiary text-sm focus:outline-none focus:border-blue-500/50';

/** Sends the plan to a Fleet Vault team site, or saves it as one package file to pass on by hand. */
export function ShareMissionDialog({ onClose, onShared }: { onClose: () => void; onShared: (message: string) => void }): JSX.Element {
  const { t } = useTranslation();
  const items = useMissionStore((s) => s.missionItems);
  const groups = useMissionStore((s) => s.groups);
  const polygons = useFenceStore((s) => s.polygons);
  const circles = useFenceStore((s) => s.circles);
  const rallyPoints = useRallyStore((s) => s.rallyPoints);
  const vehicle = useSettingsStore((s) => s.getActiveVehicle());
  const libraryName = useMissionLibraryStore((s) => s.selectedMission?.name);
  const vaultEnabled = useCargoEnabled(VAULT_CARGO_SLUG);

  const fenceCount = polygons.length + circles.length;
  const hasSurvey = groups.some((g) => g.kind === 'survey');
  const [name, setName] = useState(libraryName ?? t('mission:missionShare.defaultName'));
  const [contents, setContents] = useState<ShareContents>({ fence: fenceCount > 0, rally: rallyPoints.length > 0, survey: hasSurvey, vehicleProfile: false });
  const [destination, setDestination] = useState<Destination>(vaultEnabled ? 'site' : 'file');
  const [site, setSite] = useState('');
  const [sites, setSites] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!vaultEnabled) return;
    void window.electronAPI?.fleetRepoListSites?.().then((list) => {
      const names = (list ?? []).map((s) => s.site);
      setSites(names);
      setSite((cur) => cur || names[0] || '');
    });
    void window.electronAPI?.fleetRepoStatus?.().then((st) => setLastSyncAt(st?.github.lastSyncAt ?? null));
  }, [vaultEnabled]);

  const exclusions = polygons.filter((p) => p.type === 'exclusion').length + circles.filter((c) => c.type === 'exclusion').length;
  const rows = useMemo(() => [
    { key: 'mission', checked: true, disabled: true, label: t('mission:missionShare.includeMission', { count: items.length }) },
    { key: 'fence', checked: contents.fence, disabled: fenceCount === 0, label: t('mission:missionShare.includeFence', { inclusion: fenceCount - exclusions, exclusion: exclusions }) },
    { key: 'rally', checked: contents.rally, disabled: rallyPoints.length === 0, label: t('mission:missionShare.includeRally', { count: rallyPoints.length }) },
    { key: 'survey', checked: contents.survey, disabled: !hasSurvey, label: t('mission:missionShare.includeSurvey') },
    { key: 'vehicleProfile', checked: contents.vehicleProfile, disabled: !vehicle, label: t('mission:missionShare.includeVehicle', { name: vehicle?.name ?? '-' }) },
  ] as const, [t, items.length, contents, fenceCount, exclusions, rallyPoints.length, hasSurvey, vehicle]);

  const share = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const identity = await window.electronAPI.fleetRepoShareIdentity();
      const pkg = buildMissionPackage(name, contents, note, identity);
      if (destination === 'site') {
        const result = await window.electronAPI.fleetRepoShareMission(site.trim(), pkg);
        if (!result.success) { setError(result.error ?? t('mission:missionShare.failed')); return; }
        onShared(t('mission:missionShare.sharedToSite', { site: site.trim() }));
      } else {
        const result = await window.electronAPI.missionPackageSave(pkg);
        if (!result.success) {
          if (result.error !== 'Cancelled') setError(result.error ?? t('mission:missionShare.failed'));
          return;
        }
        onShared(t('mission:missionShare.savedFile'));
      }
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const toggle = (key: keyof ShareContents) => setContents((c) => ({ ...c, [key]: !c[key] }));
  const canShare = !busy && name.trim().length > 0 && items.length > 0 && (destination === 'file' || site.trim().length > 0);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-surface-solid rounded-xl border border-subtle w-full max-w-xl mx-4 overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-subtle flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
            <Share2 className="w-4 h-4 text-blue-400" />
          </div>
          <h2 className="text-base font-semibold text-content">{t('mission:missionShare.title')}</h2>
          <button {...ui('icon-button')} type="button" onClick={onClose} aria-label={t('common:close')} className="ml-auto w-8 h-8 rounded-lg flex items-center justify-center text-content-secondary hover:text-content hover:bg-surface-raised">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <label className="block">
            <span className="block text-sm font-medium text-content mb-1">{t('mission:missionShare.name')}</span>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={INPUT} />
          </label>

          <div>
            <div className="text-[11px] uppercase tracking-wider text-content-tertiary mb-2">{t('mission:missionShare.include')}</div>
            <div className="space-y-1.5">
              {rows.map((r) => (
                <label key={r.key} className={`flex items-center gap-2.5 text-sm ${r.disabled ? 'text-content-tertiary' : 'text-content'}`}>
                  <input type="checkbox" checked={r.checked} disabled={r.disabled} onChange={() => r.key !== 'mission' && toggle(r.key)} />
                  {r.label}
                </label>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[11px] uppercase tracking-wider text-content-tertiary mb-2">{t('mission:missionShare.sendTo')}</div>
            <div className="grid grid-cols-2 gap-2.5">
              <label className={`flex flex-col gap-1 p-3 rounded-lg border ${destination === 'site' ? 'border-blue-500 bg-blue-500/10' : 'border-subtle'} ${vaultEnabled ? '' : 'opacity-50'}`}>
                <span className="flex items-center gap-2 text-sm font-medium text-content">
                  <input type="radio" name="share-destination" checked={destination === 'site'} disabled={!vaultEnabled} onChange={() => setDestination('site')} />
                  {t('mission:missionShare.toSite')}
                </span>
                <span className="text-xs text-content-secondary">{vaultEnabled ? t('mission:missionShare.toSiteDetail') : t('mission:missionShare.vaultOff')}</span>
              </label>
              <label className={`flex flex-col gap-1 p-3 rounded-lg border ${destination === 'file' ? 'border-blue-500 bg-blue-500/10' : 'border-subtle'}`}>
                <span className="flex items-center gap-2 text-sm font-medium text-content">
                  <input type="radio" name="share-destination" checked={destination === 'file'} onChange={() => setDestination('file')} />
                  {t('mission:missionShare.toFile')}
                </span>
                <span className="text-xs text-content-secondary">{t('mission:missionShare.toFileDetail')}</span>
              </label>
            </div>
          </div>

          {destination === 'site' && (
            <label className="block">
              <span className="block text-sm font-medium text-content mb-1">{t('mission:missionShare.site')}</span>
              <input type="text" value={site} onChange={(e) => setSite(e.target.value)} list="ardudeck-share-sites" placeholder={t('mission:missionShare.sitePlaceholder')} className={INPUT} />
              <datalist id="ardudeck-share-sites">{sites.map((s) => <option key={s} value={s} />)}</datalist>
            </label>
          )}

          <label className="block">
            <span className="block text-sm font-medium text-content mb-1">{t('mission:missionShare.note')}</span>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('mission:missionShare.notePlaceholder')} className={INPUT} />
          </label>

          {error && <div className="text-xs text-red-400">{error}</div>}
        </div>

        <div className="px-5 py-3 border-t border-subtle flex items-center gap-2.5">
          {destination === 'site' && lastSyncAt && (
            <span className="text-xs text-content-tertiary">{t('mission:missionShare.lastSynced', { time: new Date(lastSyncAt).toLocaleString() })}</span>
          )}
          <button {...ui('button', { variant: 'secondary' })} type="button" onClick={onClose} className="ml-auto h-9 px-3.5 rounded-lg border border-subtle text-sm text-content-secondary hover:text-content hover:bg-surface-raised">
            {t('common:cancel')}
          </button>
          <button {...ui('button', { variant: 'primary' })} type="button" disabled={!canShare} onClick={() => void share()} className="h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium disabled:opacity-40">
            {destination === 'site' ? t('mission:missionShare.shareToSite') : t('mission:missionShare.saveFile')}
          </button>
        </div>
      </div>
    </div>
  );
}
