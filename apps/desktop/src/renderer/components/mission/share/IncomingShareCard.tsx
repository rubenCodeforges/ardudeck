import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download } from 'lucide-react';
import { useMissionStore } from '../../../stores/mission-store';
import { useSettingsStore } from '../../../stores/settings-store';
import { useMissionLibraryStore } from '../../../stores/mission-library-store';
import { useMissionShareStore } from '../../../stores/mission-share-store';
import { useCargoEnabled, MISSION_LIBRARY_CARGO_SLUG } from '../../../modules/capabilities';
import { commandHasLocation, hasValidCoordinates, type MissionItem } from '../../../../shared/mission-types';
import { diffMissionItems, type MissionPackage } from '../../../../shared/mission-share-types';
import { parseFenceItems } from '../../../../shared/fence-types';
import { applyMissionPackage, packageFlightTimeSec } from '../../../utils/mission-share';
import { formatDurationSec } from '../../../utils/flight-briefing';
import { ui } from '../../ui/ui-hooks';

const W = 560;
const H = 150;

function located(items: readonly MissionItem[]): Array<{ seq: number; lat: number; lng: number }> {
  return items
    .filter((it) => commandHasLocation(it.command) && hasValidCoordinates(it.latitude, it.longitude))
    .map((it) => ({ seq: it.seq, lat: it.latitude, lng: it.longitude }));
}

/** Both routes in one box: the pilot's own dashed, the shared one solid, moved points marked. */
function RoutePreview({ mine, theirs }: { mine: readonly MissionItem[]; theirs: readonly MissionItem[] }): JSX.Element {
  const { t } = useTranslation();
  const a = located(mine);
  const b = located(theirs);
  const all = [...a, ...b];
  if (all.length === 0) return <div className="h-[150px] rounded-lg border border-subtle bg-surface" />;
  const minLat = Math.min(...all.map((p) => p.lat));
  const maxLat = Math.max(...all.map((p) => p.lat));
  const minLng = Math.min(...all.map((p) => p.lng));
  const maxLng = Math.max(...all.map((p) => p.lng));
  const pad = 14;
  const kx = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180);
  const spanX = Math.max((maxLng - minLng) * kx, 1e-9);
  const spanY = Math.max(maxLat - minLat, 1e-9);
  const s = Math.min((W - 2 * pad) / spanX, (H - 2 * pad) / spanY);
  const xy = (p: { lat: number; lng: number }) => [pad + (p.lng - minLng) * kx * s, H - pad - (p.lat - minLat) * s] as const;
  const line = (pts: typeof a) => pts.map((p) => xy(p).map((v) => v.toFixed(1)).join(',')).join(' ');
  const moved = b.filter((p, i) => {
    const q = a[i];
    return !q || Math.hypot((q.lat - p.lat) * 111_320, (q.lng - p.lng) * 111_320 * kx) > 0.5;
  });
  return (
    <div className="relative rounded-lg border border-subtle bg-surface overflow-hidden">
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('mission:missionShare.previewLabel')}>
        <polyline points={line(a)} fill="none" stroke="currentColor" className="text-content-tertiary" strokeWidth={2} strokeDasharray="5 5" />
        <polyline points={line(b)} fill="none" stroke="#3b82f6" strokeWidth={2.5} />
        {moved.map((p) => {
          const [x, y] = xy(p);
          return <circle key={p.seq} cx={x} cy={y} r={4.5} fill="#f59e0b" />;
        })}
      </svg>
      <div className="absolute left-2.5 top-2 text-[11px] text-content-secondary">{t('mission:missionShare.previewLegend')}</div>
    </div>
  );
}

/** Review card for a teammate's shared version, or a package opened from a file. */
export function IncomingShareCard(): JSX.Element | null {
  const { t } = useTranslation();
  const incoming = useMissionShareStore((s) => s.incoming[0] ?? null);
  const opened = useMissionShareStore((s) => s.opened);
  const dismiss = useMissionShareStore((s) => s.dismiss);
  const closeOpened = useMissionShareStore((s) => s.closeOpened);
  const mine = useMissionStore((s) => s.missionItems);
  const libraryEnabled = useCargoEnabled(MISSION_LIBRARY_CARGO_SLUG);
  const [busy, setBusy] = useState(false);

  const pkg: MissionPackage | null = opened ?? incoming?.pkg ?? null;
  const diff = useMemo(() => (pkg ? diffMissionItems(mine, pkg.mission.items) : null), [mine, pkg]);
  const cruise = pkg?.vehicleProfile?.cruiseSpeedMs ?? useSettingsStore.getState().getCruiseSpeed();
  const times = useMemo(
    () => (pkg ? { theirs: packageFlightTimeSec(pkg.mission.items, cruise), mine: packageFlightTimeSec(mine, cruise) } : null),
    [pkg, mine, cruise],
  );
  if (!pkg || !diff || !times) return null;

  const finish = async () => {
    if (opened) closeOpened();
    else if (incoming) await dismiss(incoming);
  };
  const run = (fn: () => Promise<void> | void) => async () => {
    setBusy(true);
    try {
      await fn();
      await finish();
    } finally {
      setBusy(false);
    }
  };
  const openAsCopy = run(async () => {
    await useMissionLibraryStore.getState().saveMission({
      name: t('mission:missionShare.copyName', { name: pkg.name, who: pkg.sharedBy.name }),
      description: pkg.note ?? '',
      ...(incoming ? { site: incoming.site } : {}),
      vehicleProfileId: null,
      tags: ['shared'],
      groups: pkg.mission.groups,
      items: pkg.mission.items,
      homePosition: pkg.mission.home,
    });
  });
  const loadShared = run(() => applyMissionPackage(pkg));

  const fenceParsed = pkg.fence ? parseFenceItems(pkg.fence) : null;
  const fenceZones = fenceParsed ? fenceParsed.polygons.length + fenceParsed.circles.length : 0;
  const changeText = diff.unchanged
    ? t('mission:missionShare.noChange')
    : [
        diff.moved > 0 ? t('mission:missionShare.moved', { count: diff.moved }) : null,
        diff.added > 0 ? t('mission:missionShare.added', { count: diff.added }) : null,
        diff.removed > 0 ? t('mission:missionShare.removed', { count: diff.removed }) : null,
      ].filter(Boolean).join(', ');
  const initials = pkg.sharedBy.name.split(/[\s._-]+/).map((w) => w[0] ?? '').join('').slice(0, 2).toUpperCase();

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-surface-solid rounded-xl border border-subtle w-full max-w-xl mx-4 overflow-hidden shadow-2xl">
        <div className="px-5 py-4 border-b border-subtle flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
            <Download className="w-4 h-4 text-emerald-400" />
          </div>
          <h2 className="text-base font-semibold text-content truncate">
            {opened ? t('mission:missionShare.openedTitle', { name: pkg.name }) : t('mission:missionShare.incomingTitle', { name: pkg.name })}
          </h2>
          {incoming && !opened && <span className="ml-auto text-xs text-content-secondary shrink-0">{t('mission:missionShare.siteLabel', { site: incoming.site })}</span>}
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-blue-500/15 text-blue-400 flex items-center justify-center text-sm font-semibold">{initials}</div>
            <div className="min-w-0">
              <div className="text-sm text-content">{t('mission:missionShare.sharedBy', { name: pkg.sharedBy.name, time: new Date(pkg.sharedAt).toLocaleString() })}</div>
              {pkg.note && <div className="text-xs text-content-secondary truncate">{pkg.note}</div>}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <div className="p-3 rounded-lg border border-subtle">
              <div className="text-[11px] text-content-tertiary">{t('mission:missionShare.waypoints')}</div>
              <div className="text-lg font-semibold text-content">{pkg.mission.items.length}</div>
              <div className={`text-xs ${diff.unchanged ? 'text-content-secondary' : 'text-amber-500'}`}>{changeText}</div>
            </div>
            <div className="p-3 rounded-lg border border-subtle">
              <div className="text-[11px] text-content-tertiary">{t('mission:missionShare.fence')}</div>
              <div className="text-lg font-semibold text-content">{pkg.fence ? t('mission:missionShare.zones', { count: fenceZones }) : '-'}</div>
              <div className="text-xs text-content-secondary">{pkg.fence ? t('mission:missionShare.replacesYours') : t('mission:missionShare.notIncluded')}</div>
            </div>
            <div className="p-3 rounded-lg border border-subtle">
              <div className="text-[11px] text-content-tertiary">{t('mission:missionShare.flightTime')}</div>
              <div className="text-lg font-semibold text-content">{formatDurationSec(times.theirs)}</div>
              <div className="text-xs text-content-secondary">{t('mission:missionShare.wasTime', { time: formatDurationSec(times.mine) })}</div>
            </div>
          </div>

          <RoutePreview mine={mine} theirs={pkg.mission.items} />
        </div>

        <div className="px-5 py-3 border-t border-subtle flex items-center gap-2.5">
          <button {...ui('button', { variant: 'secondary' })} type="button" disabled={busy} onClick={() => void finish()} className="h-9 px-3.5 rounded-lg border border-subtle text-sm text-content-secondary hover:text-content hover:bg-surface-raised">
            {t('mission:missionShare.keepMine')}
          </button>
          {libraryEnabled && (
            <button {...ui('button', { variant: 'secondary' })} type="button" disabled={busy} onClick={() => void openAsCopy()} className="h-9 px-3.5 rounded-lg border border-subtle text-sm text-content-secondary hover:text-content hover:bg-surface-raised">
              {t('mission:missionShare.openAsCopy')}
            </button>
          )}
          <button {...ui('button', { variant: 'primary' })} type="button" disabled={busy} onClick={() => void loadShared()} className="ml-auto h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium disabled:opacity-40">
            {t('mission:missionShare.loadShared')}
          </button>
        </div>
      </div>
    </div>
  );
}
