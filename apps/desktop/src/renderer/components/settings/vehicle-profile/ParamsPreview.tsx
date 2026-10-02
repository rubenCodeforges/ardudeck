import { useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { t as i18nT } from '../../../../shared/i18n/index.js';
import { Eye, EyeOff, CheckCircle2, AlertTriangle, Circle } from 'lucide-react';
import type { VehicleProfile } from '../../../stores/settings-store.js';
import { getTemplate, defaultTemplateForType } from '../../../lib/vehicle-templates/registry.js';
import { useConnectionStore } from '../../../stores/connection-store.js';
import { useParameterStore } from '../../../stores/parameter-store.js';
import { ApplyProfileButton } from './ApplyProfileButton.js';

interface ParamsPreviewProps {
  vehicle: VehicleProfile;
  /** Called when Apply starts — typically closes the parent modal. */
  onBeforeApply?: () => void;
}

type ParamStatus = 'match' | 'drift' | 'offline';

/**
 * Opt-in preview of the ArduPilot params a profile would write on Apply.
 * Collapsed by default — a single button reveals the chip list.
 *
 * When the vehicle is connected AND params are loaded, each chip is tinted
 * by its live status:
 *   - green check  → current value already matches target
 *   - amber warn   → current value diverges (drift)
 *   - grey circle  → vehicle not connected / param not loaded
 *
 * A header summary shows "Last applied <ago>" + the overall match/drift count.
 */
export function ParamsPreview({ vehicle, onBeforeApply }: ParamsPreviewProps) {
  const { t } = useTranslation();
  const [shown, setShown] = useState(false);
  const isConnected = useConnectionStore(s => s.connectionState.isConnected);
  const parameters = useParameterStore(s => s.parameters);

  const template = getTemplate(vehicle.templateSlug) ?? defaultTemplateForType(vehicle.type);
  const core = template.toParams(vehicle);
  const sim = template.toSimParams(vehicle);
  const total = core.length + sim.length;

  const statusByName = useMemo(() => {
    const map = new Map<string, ParamStatus>();
    const all = [...core, ...sim];
    for (const s of all) {
      if (!isConnected) { map.set(s.name, 'offline'); continue; }
      const current = parameters.get(s.name);
      if (!current) { map.set(s.name, 'offline'); continue; }
      // Integer-typed params get the target rounded before comparing, or we'd
      // show phantom drift (template emits 10.4, FC stored 10).
      const expected = current.type >= 1 && current.type <= 8 ? Math.round(s.value) : s.value;
      map.set(s.name, Math.abs(current.value - expected) < 1e-4 ? 'match' : 'drift');
    }
    return map;
  }, [core, sim, parameters, isConnected]);

  const matchCount = [...statusByName.values()].filter(v => v === 'match').length;
  const driftCount = [...statusByName.values()].filter(v => v === 'drift').length;
  const offlineCount = [...statusByName.values()].filter(v => v === 'offline').length;

  if (total === 0) return null;

  // Collapsed button: show a state-aware summary so the user can see apply
  // status without expanding.
  if (!shown) {
    const buttonStatus = pickCollapsedStatus({
      lastApplied: vehicle.lastAppliedAt,
      matchCount, driftCount, offlineCount, total,
    });
    return (
      <button
        type="button"
        onClick={() => setShown(true)}
        className={`w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-dashed text-xs font-medium transition-colors ${buttonStatus.containerClass}`}
      >
        <Eye className="w-3.5 h-3.5" />
        {t('settings:paramsPreview.generate')}
        <span className="text-content-tertiary font-normal">
          {sim.length > 0
            ? t('settings:paramsPreview.countsCoreSim', { core: core.length, sim: sim.length })
            : t('settings:paramsPreview.countsCore', { core: core.length })}
        </span>
        {buttonStatus.badge && (
          <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${buttonStatus.badgeClass}`}>
            {buttonStatus.badgeIcon}
            {buttonStatus.badge}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="rounded-lg bg-blue-500/5 border border-blue-500/20 px-3 py-2.5">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] text-content-secondary leading-tight min-w-0">
          <Trans
            i18nKey={sim.length > 0 ? 'settings:paramsPreview.headerCoreSim' : 'settings:paramsPreview.headerCore'}
            values={{ core: core.length, sim: sim.length, template: template.name }}
            components={{
              b: <span className="text-content font-semibold" />,
              dot: <span className="text-content-tertiary" />,
              tpl: <span className="text-blue-400 font-medium" />,
            }}
          />
        </div>
        <button
          type="button"
          onClick={() => setShown(false)}
          className="inline-flex items-center gap-1 text-[10px] text-content-tertiary hover:text-content-secondary shrink-0"
        >
          <EyeOff className="w-3 h-3" />
          {t('common:hide')}
        </button>
      </div>

      {/* Status banner */}
      <StatusBanner
        lastApplied={vehicle.lastAppliedAt}
        lastAppliedTo={vehicle.lastAppliedTo}
        matchCount={matchCount}
        driftCount={driftCount}
        offlineCount={offlineCount}
        total={total}
        isConnected={isConnected}
      />

      {/* Chip list */}
      <div className="mt-2 flex flex-wrap gap-1">
        {core.map(s => <Chip key={s.name} name={s.name} reason={s.reason} status={statusByName.get(s.name) ?? 'offline'} variant="core" />)}
        {sim.map(s => <Chip key={s.name} name={s.name} reason={s.reason} status={statusByName.get(s.name) ?? 'offline'} variant="sim" />)}
      </div>

      <div className="mt-3 pt-3 border-t border-blue-500/15">
        <ApplyProfileButton profile={vehicle} size="full" onBeforeStart={onBeforeApply} />
      </div>
    </div>
  );
}

function pickCollapsedStatus(args: {
  lastApplied: string | undefined;
  matchCount: number;
  driftCount: number;
  offlineCount: number;
  total: number;
}): {
  containerClass: string;
  badge: string | null;
  badgeClass: string;
  badgeIcon: React.ReactNode;
} {
  const { lastApplied, matchCount, driftCount, offlineCount, total } = args;
  const base = 'border-blue-500/30 text-blue-400 hover:bg-blue-500/5 hover:border-blue-500/50';

  // Never applied.
  if (!lastApplied) {
    return { containerClass: base, badge: i18nT('settings:paramsPreview.notAppliedYet'), badgeClass: 'text-content-tertiary', badgeIcon: <Circle className="w-2.5 h-2.5" /> };
  }

  // Applied but everything offline.
  if (offlineCount === total) {
    return {
      containerClass: base,
      badge: i18nT('settings:paramsPreview.lastApplied', { when: timeAgo(lastApplied) }),
      badgeClass: 'text-content-tertiary',
      badgeIcon: <Circle className="w-2.5 h-2.5" />,
    };
  }

  // Drift detected.
  if (driftCount > 0) {
    return {
      containerClass: 'border-amber-500/40 text-amber-400 hover:bg-amber-500/5 hover:border-amber-500/60',
      badge: i18nT('settings:paramsPreview.drifted', { count: driftCount }),
      badgeClass: 'text-amber-400',
      badgeIcon: <AlertTriangle className="w-2.5 h-2.5" />,
    };
  }

  // All match.
  return {
    containerClass: 'border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/5 hover:border-emerald-500/60',
    badge: i18nT('settings:paramsPreview.allMatch', { count: matchCount }),
    badgeClass: 'text-emerald-400',
    badgeIcon: <CheckCircle2 className="w-2.5 h-2.5" />,
  };
}

interface StatusBannerProps {
  lastApplied: string | undefined;
  lastAppliedTo: VehicleProfile['lastAppliedTo'];
  matchCount: number;
  driftCount: number;
  offlineCount: number;
  total: number;
  isConnected: boolean;
}

function StatusBanner({ lastApplied, lastAppliedTo, matchCount, driftCount, offlineCount, total, isConnected }: StatusBannerProps) {
  const { t } = useTranslation();
  if (!lastApplied && !isConnected) {
    return (
      <div className="mt-2 flex items-center gap-2 text-[11px] text-content-tertiary">
        <Circle className="w-3 h-3" />
        {t('settings:paramsPreview.neverAppliedConnect')}
      </div>
    );
  }
  if (!lastApplied) {
    return (
      <div className="mt-2 flex items-center gap-2 text-[11px] text-content-tertiary">
        <Circle className="w-3 h-3" />
        {t('settings:paramsPreview.neverApplied')}
        {matchCount > 0 && (
          <span className="text-emerald-400">
            {t('settings:paramsPreview.alreadyMatch', { count: matchCount })}
          </span>
        )}
      </div>
    );
  }
  const target = lastAppliedTo?.isSitl ? 'SITL' : t('settings:paramsPreview.targetVehicle');
  const when = timeAgo(lastApplied);
  if (driftCount > 0) {
    return (
      <div className="mt-2 flex items-center gap-2 text-[11px] text-amber-400">
        <AlertTriangle className="w-3 h-3" />
        <Trans
          i18nKey="settings:paramsPreview.appliedDrift"
          count={driftCount}
          values={{ target, when, count: driftCount }}
          components={{ b: <span className="font-semibold" /> }}
        />
      </div>
    );
  }
  if (offlineCount > 0 && matchCount === 0) {
    return (
      <div className="mt-2 flex items-center gap-2 text-[11px] text-content-tertiary">
        <Circle className="w-3 h-3" />
        {t('settings:paramsPreview.lastAppliedReconnect', { target, when })}
      </div>
    );
  }
  return (
    <div className="mt-2 flex items-center gap-2 text-[11px] text-emerald-400">
      <CheckCircle2 className="w-3 h-3" />
      {t('settings:paramsPreview.appliedAllMatch', { target, when })}
    </div>
  );
}

interface ChipProps {
  name: string;
  reason: string;
  status: ParamStatus;
  variant: 'core' | 'sim';
}

function Chip({ name, reason, status, variant }: ChipProps) {
  const baseColor = variant === 'core' ? 'blue' : 'amber';
  const classes =
    status === 'match'
      ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
      : status === 'drift'
      ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
      : variant === 'core'
      ? 'bg-surface-raised border-blue-500/15 text-blue-400'
      : 'bg-surface-raised border-amber-500/20 text-amber-400';

  const icon =
    status === 'match' ? <CheckCircle2 className="w-2.5 h-2.5" />
    : status === 'drift' ? <AlertTriangle className="w-2.5 h-2.5" />
    : null;

  const statusLabel =
    status === 'match' ? i18nT('settings:paramsPreview.liveMatches')
    : status === 'drift' ? i18nT('settings:paramsPreview.driftedState')
    : '';

  void baseColor;
  return (
    <span
      title={`${reason}${statusLabel}`}
      className={`inline-flex items-center gap-1 font-mono text-[10px] leading-none px-1.5 py-1 rounded border ${classes}`}
    >
      {icon}
      {name}
    </span>
  );
}

/** Human-readable relative time. */
function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return i18nT('settings:paramsPreview.justNow');
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return i18nT('settings:paramsPreview.minutesAgo', { n: mins });
  const hours = Math.round(mins / 60);
  if (hours < 24) return i18nT('settings:paramsPreview.hoursAgo', { n: hours });
  const days = Math.round(hours / 24);
  return i18nT('settings:paramsPreview.daysAgo', { n: days });
}
