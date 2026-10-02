/**
 * Shared collapse affordances for the fleet surfaces (strip, sim-world pills, Fleet
 * Ops rows), so many fleets stay one line each: a per-fleet chevron and a count +
 * expand/collapse-all header.
 */

import { useTranslation } from 'react-i18next';
import { useFleetUiStore, isFleetExpanded } from '../../stores/fleet-ui-store';

/** A disclosure chevron: right when collapsed, down when open. */
export function FleetChevron({ open }: { open: boolean }): JSX.Element {
  return (
    <svg
      width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"
      className={`transition-transform ${open ? 'rotate-90' : ''}`}
      aria-hidden="true"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

/** Header row: "Fleets · N" plus a single expand-all / collapse-all toggle. */
export function FleetCountHeader({ leaderKeys, className = '' }: { leaderKeys: string[]; className?: string }): JSX.Element | null {
  const { t } = useTranslation();
  const overrides = useFleetUiStore((s) => s.overrides);
  const setAll = useFleetUiStore((s) => s.setAll);
  if (leaderKeys.length < 2) return null;
  const anyExpanded = leaderKeys.some((k) => isFleetExpanded(overrides, k, leaderKeys.length));
  return (
    <div className={`flex items-center justify-between gap-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-content-secondary ${className}`}>
      <span>{t('fleet:fleetDisclosure.fleets')} <span className="text-content-tertiary">·</span> <span className="font-mono text-content">{leaderKeys.length}</span></span>
      <button
        type="button"
        onClick={() => setAll(leaderKeys, !anyExpanded)}
        className="hover:text-content transition-colors normal-case tracking-normal font-medium"
        data-tip={anyExpanded ? t('fleet:fleetDisclosure.collapseEveryTip') : t('fleet:fleetDisclosure.expandEveryTip')}
      >
        {anyExpanded ? t('fleet:fleetDisclosure.collapseAll') : t('fleet:fleetDisclosure.expandAll')}
      </button>
    </div>
  );
}
